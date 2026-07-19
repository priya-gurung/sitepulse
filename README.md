# SitePulse

A production-ready, privacy-first website analytics platform built on a
hybrid **OLTP + OLAP** architecture: Neon PostgreSQL for operational data,
Tinybird (ClickHouse) for analytical data, Kafka for event streaming
between the ingestion layer and the workers, and OpenTelemetry for
tracing and metrics across every service.

## Why hybrid OLTP + OLAP

- **Postgres (Neon)** is the source of truth for *operational* data: users,
  sites, visitors, sessions, auth. Small, relational, transactional.
- **Tinybird (ClickHouse)** is the source of truth for *analytical* data:
  raw events, aggregates, time-series dashboards. Optimized for
  append-heavy writes and fast group-by queries over millions/billions of rows.
- Mixing these workloads in one database is exactly what causes analytics
  platforms to fall over at scale — this project keeps them strictly separate.

## Architecture

```
                    Website
                       |
                analytics.js SDK
                       |
                       v
                    NGINX
         +-------------+-------------+
         |                           |
    POST /collect        Dashboard/API Requests (/api/*)
         |                           |
         v                           v
 Ingestion Service          Dashboard Service
     (Express :4001)           (Express :4002)
         |                           |
         v                           v
      Kafka topic              Tinybird Pipes
   "analytics-events"
         |
         v
     Worker Pool
   (Kafka consumer group)
     +---------+----------------+
     |                          |
     v                          v
Neon PostgreSQL            Tinybird

Every service also exports:
  traces  -> OTLP -> Jaeger (or any OTLP collector)
  metrics -> Prometheus scrape endpoint (:9464/metrics by default)
```

### Hard boundaries (enforced in code, not just docs)

| Service | Can talk to | MUST NEVER |
|---|---|---|
| **Ingestion Server** | Kafka (producer only), Postgres (site-key cache refresh only) | Tinybird, dashboard routes, AI services, expensive computation |
| **Worker** | Postgres, Tinybird (ingest only), Kafka (consumer only, plus DLQ producer) | Serve HTTP traffic |
| **Dashboard Server** | Postgres (auth/sites), Tinybird (`queryPipe` reads only) | Kafka, `/collect`, ingestion pipeline |

`packages/shared/src/lib/tinybird.ts` physically separates `ingestEvent`
(worker-only) from `queryPipe` (dashboard-only) so the read/write split is
structural, not just a convention. Likewise `packages/shared/src/lib/kafka.ts`
exposes `produceEvent` (ingestion-only) and `createConsumer` (worker-only)
as separate functions.

### Why Kafka instead of a job queue

- **Ordering per site**: events are keyed by `siteId`, so all events for
  one site land on the same partition and the worker processes them in
  order — this matters for session/visitor state, which is built
  incrementally.
- **Horizontal worker scaling**: partition count is the real ceiling on
  parallelism. Run `scripts/create-kafka-topics.sh` to create the topic
  with enough partitions for your worker replica count (see below).
- **Replay**: unlike a job queue, a Kafka topic retains messages for its
  configured retention window (7 days by default here), so you can rewind
  a worker's consumer group and reprocess history — useful after a bug
  fix or a schema change in the processor.
- **Retry model**: Kafka doesn't give BullMQ's automatic per-job
  backoff/retry, so the worker implements a small bounded in-process
  retry (`WORKER_MAX_ATTEMPTS`, default 3) before routing a message to
  the `analytics-events-dlq` topic instead of blocking the partition.

### Observability

- **Tracing**: every service calls `initTelemetry(serviceName)` as the
  very first thing it does (see each `src/tracing.ts`), before any other
  module is imported — this matters because OpenTelemetry's
  auto-instrumentation patches modules like `express` and `http` at
  `require` time. Spans are exported via OTLP/HTTP; `docker-compose.yml`
  points them at a bundled Jaeger instance (`http://localhost:16686`).
- **Metrics**: each service exposes a Prometheus-format endpoint on
  `:9464/metrics` (configurable via `OTEL_PROMETHEUS_PORT`), covering
  both Node/HTTP auto-instrumentation and custom counters/histograms in
  `packages/shared/src/lib/metrics.ts` — e.g.
  `sitepulse_events_received_total`, `sitepulse_event_processing_duration_ms`,
  `sitepulse_tinybird_query_duration_ms`, `sitepulse_dashboard_cache_hits_total`.
- **Manual spans**: the `/collect` handler, the worker's event processor,
  and every Tinybird call are wrapped in explicit spans (`ingestion.*`,
  `worker.*`, `tinybird.*`) on top of what auto-instrumentation gives you
  for free, so a trace for one event shows the full path: HTTP request →
  Kafka produce → Kafka consume → Postgres transaction → Tinybird ingest.

## Repo layout

```
sitepulse/
├── apps/
│   ├── ingestion-server/   # POST /collect — high-throughput, minimal logic
│   │   └── src/tracing.ts   # OTel bootstrap, imported first in server.ts
│   ├── worker/             # Kafka consumer — Postgres + Tinybird writes
│   │   └── src/tracing.ts   # OTel bootstrap, imported first in index.ts
│   └── dashboard-server/   # JWT auth, sites CRUD, Tinybird-backed analytics APIs
│       └── src/tracing.ts   # OTel bootstrap, imported first in server.ts
├── packages/
│   └── shared/             # Zod schemas, Prisma client, Tinybird client,
│                            # Kafka client, OTel init, metrics, auth helpers
├── prisma/schema.prisma    # Postgres schema (users, sites, visitors, sessions)
├── tinybird/
│   ├── datasources/        # analytics_events.datasource
│   └── pipes/              # overview, pageviews, top pages, referrers, geo
├── scripts/create-kafka-topics.sh  # Provisions topics with real partition counts
├── sdk/analytics.js        # Embeddable tracking script
├── nginx/nginx.conf        # Routes /collect -> ingestion, /api -> dashboard
└── docker-compose.yml      # Kafka, Jaeger, and all app services
```

## Local setup

### 1. Prerequisites
- Node.js 20+
- A Neon Postgres database (or any Postgres for local dev)
- A Tinybird workspace with an ingest token (APPEND scope) and read token (READ scope)
- Docker (for Kafka/Jaeger/NGINX, or run a Kafka broker locally)

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# fill in DATABASE_URL, TINYBIRD_*, JWT_SECRET, VISITOR_HASH_SALT
```

### 4. Set up the database
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Start Kafka + Jaeger and create topics
```bash
docker compose up -d kafka jaeger
./scripts/create-kafka-topics.sh localhost:9092 6   # 6 partitions by default
```

### 6. Deploy Tinybird resources
Using the [Tinybird CLI](https://www.tinybird.co/docs/cli):
```bash
cd tinybird
tb login
tb push datasources/analytics_events.datasource
tb push pipes/overview_metrics.pipe
tb push pipes/pageviews_by_granularity.pipe
tb push pipes/top_pages.pipe
tb push pipes/top_referrers.pipe
tb push pipes/visitors_by_country.pipe
```

### 7. Run everything
```bash
# Terminal 1
npm run dev:ingestion
# Terminal 2
npm run dev:worker
# Terminal 3
npm run dev:dashboard
```

If you run these outside Docker on one machine, give each a distinct
`OTEL_PROMETHEUS_PORT` (e.g. 9464/9465/9466) — otherwise they'll fight
over the same metrics port.

Or via Docker Compose (builds all services + Kafka + Jaeger + NGINX):
```bash
docker compose up --build
./scripts/create-kafka-topics.sh localhost:9092 6
```

### 7. Embed the SDK on a test site
```html
<script src="http://localhost/analytics.js"
        data-site-key="pk_your_site_public_key"
        data-endpoint="http://localhost/collect"
        async></script>
```

## API surface (Dashboard Server, behind `/api`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Get JWT |
| GET | `/api/sites` | JWT | List your sites |
| POST | `/api/sites` | JWT | Create a tracked site (returns `publicKey`) |
| DELETE | `/api/sites/:siteId` | JWT | Remove a site |
| GET | `/api/analytics/overview?siteId=&from=&to=` | JWT | Pageviews, uniques, sessions |
| GET | `/api/analytics/pageviews?siteId=&granularity=` | JWT | Time-series pageviews |
| GET | `/api/analytics/top-pages?siteId=` | JWT | Top URLs by views |
| GET | `/api/analytics/referrers?siteId=` | JWT | Top referring domains |
| GET | `/api/analytics/geo?siteId=` | JWT | Unique visitors by country |
| POST | `/api/ask` | JWT | Ask the AI agent a question about a site's traffic |

Every analytics route verifies site ownership against Postgres *before*
querying Tinybird, so a JWT for one account can never read another
account's site data.

## AI insights (`/ask`)

The frontend's search bar sends `{ siteId, question, from, to }` to
`POST /api/ask` on the dashboard server. That handler:

1. Requires a valid JWT (`requireAuth`) — 401 if missing/invalid.
2. Confirms the JWT's user owns `siteId` (`assertSiteOwnership`) — 403
   otherwise. This is the important part: it means a question can never
   leak another account's analytics through the agent.
3. Only then forwards the request to your FastAPI/LangGraph microservice
   at `${AI_SERVICE_URL}/ask`, translating the payload into the shape
   your `AskRequest` schema expects:
   ```json
   {
     "site_id": "...",
     "question": "...",
     "date_range": { "start_date": "...", "end_date": "..." }
   }
   ```
4. Returns the agent's JSON response straight through to the frontend.

The FastAPI service is called exclusively from the dashboard server
(`packages/shared/src/lib/ai-agent.ts`) — ingestion and the worker never
touch it, same boundary discipline as Tinybird and Kafka. It also has its
own rate limiter (12 requests/min per caller) separate from the general
dashboard limiter, since LLM calls are slower and more expensive than a
typical analytics read, and a 45s timeout since LangGraph agents can take
a while to finish tool calls.

## Privacy design

- No cookies, no localStorage required by the SDK.
- Visitor identity is a SHA-256 hash of `IP + User-Agent + siteId + daily
  salt` — the raw IP is never persisted, and the hash rotates daily so
  visitors can't be correlated across days or sites.
- Bot/crawler traffic is filtered at the edge (ingestion server) before
  it ever reaches the queue or the database.

## Scaling notes

- **Ingestion server**: stateless, horizontally scalable behind NGINX
  `least_conn`. Site-key validation is served from an in-memory cache
  refreshed every 30s — no DB round-trip per request.
- **Workers**: independent from API servers. Real parallelism is capped
  by the `analytics-events` topic's partition count, not a per-process
  concurrency knob — add worker replicas up to that partition count (see
  `scripts/create-kafka-topics.sh`), and repartition (create a new topic
  with more partitions) if you outgrow it.
- **Dashboard server**: read-heavy responses are cached in-process for
  30s per query signature to absorb dashboard polling; swap for a
  Redis-backed cache if you run multiple dashboard replicas and want a
  shared cache instead of one per instance.
- **Tinybird**: engine is `MergeTree` partitioned by month, sorted by
  `(site_id, timestamp, event_id)` for fast per-site time-range scans.

## What's intentionally out of scope / marked "future"

- Scheduled jobs and alerting (hooks are stubbed in
  `apps/worker/src/processors/analytics-event.processor.ts`).
- AI microservice integration (dashboard server is the designated caller
  per the architecture, but no AI service is wired up here).
- Multi-tenant billing/plan limits.
- Automated replay/reprocessing tooling for the `analytics-events-dlq`
  topic — messages land there with a `failure_reason` header, but
  consuming and retrying them back onto the main topic is a manual step
  for now (e.g. a small script using `kafkajs` to read the DLQ and
  re-`produceEvent` after a fix ships).
