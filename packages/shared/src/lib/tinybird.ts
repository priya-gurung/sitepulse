/**
 * Minimal Tinybird client.
 *
 * - `ingestEvent` is used ONLY by workers (never by the ingestion server
 *   directly, and never by the dashboard server).
 * - `queryPipe` is used ONLY by the dashboard server (never by ingestion
 *   or workers). This keeps the read/write split enforced in code, not
 *   just in docs.
 *
 * Every call is wrapped in a span (visible in your tracing backend as
 * `tinybird.*`) and records a duration histogram, since Tinybird latency
 * is usually the thing worth watching here.
 */

import { trace, SpanStatusCode } from "@opentelemetry/api";
import { tinybirdIngestDuration, tinybirdQueryDuration } from "./metrics";

const TINYBIRD_HOST = process.env.TINYBIRD_HOST ?? "https://api.tinybird.co";

interface TinybirdConfig {
  ingestToken: string; // token scoped to APPEND on the events datasource
  readToken: string; // token scoped to READ on pipes
}

function getConfig(): TinybirdConfig {
  const ingestToken = process.env.TINYBIRD_INGEST_TOKEN;
  const readToken = process.env.TINYBIRD_READ_TOKEN;
  if (!ingestToken || !readToken) {
    throw new Error("Tinybird tokens are not configured (TINYBIRD_INGEST_TOKEN / TINYBIRD_READ_TOKEN)");
  }
  return { ingestToken, readToken };
}

export interface RawAnalyticsEvent {
  event_id: string;
  site_id: string;
  visitor_hash: string;
  session_id: string;
  type: string;
  event_name: string | null;
  url: string;
  referrer: string | null;
  title: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  timestamp: string; // ISO8601
  props: string; // JSON-stringified custom props
}

/**
 * Appends a single event to the `analytics_events` Tinybird datasource
 * via the Events API (NDJSON over HTTP).
 */
export async function ingestEvent(event: RawAnalyticsEvent): Promise<void> {
  const tracer = trace.getTracer("sitepulse-tinybird");
  const { ingestToken } = getConfig();

  await tracer.startActiveSpan("tinybird.ingest_event", async (span) => {
    const start = performance.now();
    span.setAttribute("sitepulse.site_id", event.site_id);
    try {
      const res = await fetch(`${TINYBIRD_HOST}/v0/events?name=analytics_events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ingestToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Tinybird ingest failed (${res.status}): ${body}`);
      }
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      tinybirdIngestDuration.record(performance.now() - start, { operation: "single" });
      span.end();
    }
  });
}

/**
 * Batched variant — Tinybird's Events API accepts NDJSON, one event per line.
 * Workers should prefer this when flushing a batch pulled off the queue.
 */
export async function ingestEventsBatch(events: RawAnalyticsEvent[]): Promise<void> {
  if (events.length === 0) return;
  const tracer = trace.getTracer("sitepulse-tinybird");
  const { ingestToken } = getConfig();

  await tracer.startActiveSpan("tinybird.ingest_events_batch", async (span) => {
    const start = performance.now();
    span.setAttribute("sitepulse.batch_size", events.length);
    try {
      const ndjson = events.map((e) => JSON.stringify(e)).join("\n");

      const res = await fetch(`${TINYBIRD_HOST}/v0/events?name=analytics_events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ingestToken}`,
          "Content-Type": "application/x-ndjson",
        },
        body: ndjson,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Tinybird batch ingest failed (${res.status}): ${body}`);
      }
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      tinybirdIngestDuration.record(performance.now() - start, { operation: "batch" });
      span.end();
    }
  });
}

/**
 * Queries a published Tinybird Pipe (e.g. `pageviews_by_day.json`) with
 * query-string parameters. Used exclusively by the dashboard server.
 */
export async function queryPipe<T = unknown>(
  pipeName: string,
  params: Record<string, string | number | undefined>
): Promise<T[]> {
  const tracer = trace.getTracer("sitepulse-tinybird");
  const { readToken } = getConfig();

  return tracer.startActiveSpan(`tinybird.query_pipe:${pipeName}`, async (span) => {
    const start = performance.now();
    span.setAttribute("sitepulse.pipe", pipeName);
    try {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) qs.set(key, String(value));
      }

      const res = await fetch(`${TINYBIRD_HOST}/v0/pipes/${pipeName}.json?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${readToken}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Tinybird pipe query failed (${res.status}): ${body}`);
      }

      const json = (await res.json()) as { data: T[] };
      span.setStatus({ code: SpanStatusCode.OK });
      return json.data;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      tinybirdQueryDuration.record(performance.now() - start, { pipe: pipeName });
      span.end();
    }
  });
}
