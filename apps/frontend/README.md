# SitePulse Web

Next.js (App Router) dashboard for SitePulse. Talks only to the
**Dashboard API Server** (`apps/dashboard-server` in the main repo) — never
to the ingestion server or the queue directly, matching the platform's
read/write split.

## Design

- **Palette**: cool paper background (`#F4F6F5`), near-black ink
  (`#10151A`), single signal accent — pulse teal (`#00B8A0`).
- **Type**: Space Grotesk (display/numbers), Inter (UI text), IBM Plex Mono
  (data — table numbers, timestamps, the tracking snippet).
- **Signature element**: an animated EKG-style pulse line, echoing the
  product name. It's the logo mark, the ambient texture on auth screens,
  and the line style in the pageviews chart — not generic decoration.

## Setup

```bash
npm install
cp .env.local.example .env.local
# point DASHBOARD_API_URL at your running dashboard-server (default :4002)
npm run dev
```

Open `http://localhost:3000`. Requests to `/api/backend/*` are rewritten
by Next.js to `DASHBOARD_API_URL`, so the browser never talks to the API
directly and there's no CORS configuration needed for local dev.

## Structure

```
app/
├── login/, register/        Auth screens
├── dashboard/
│   ├── layout.tsx            Auth guard + sidebar shell
│   ├── page.tsx               Redirects to first site or shows empty state
│   ├── new/                  Create-a-site form
│   └── [siteId]/
│       ├── page.tsx           Overview: stat cards, chart, top lists
│       ├── pages/             Full top-pages table
│       ├── geography/         Full country table
│       └── settings/          Tracking snippet, site info, delete
components/                   UI building blocks (all presentational)
lib/
├── api.ts                    Fetch wrapper, attaches JWT
├── auth-context.tsx          Login/register/logout, session persistence
├── sites-context.tsx         Site list, create/delete
├── use-analytics.ts           Fetches overview/pageviews/top-pages/referrers/geo
├── format.ts                  Number/date/URL/country formatting
└── types.ts                   Mirrors the dashboard-server API shapes
```

## Auth

JWT is stored in `localStorage` and sent as `Authorization: Bearer <token>`
on every request. This is a standard SPA pattern — for stricter security
(XSS-resistant sessions), swap this for an httpOnly cookie set by the
dashboard server and adjust `lib/api.ts` accordingly.

## Embedding the tracking snippet

The Settings page for each site generates:

```html
<script
  src="https://cdn.sitepulse.io/analytics.js"
  data-site-key="pk_xxx"
  data-endpoint="https://collect.sitepulse.io/collect"
  async
></script>
```

Update the `src` and `data-endpoint` hosts in
`app/dashboard/[siteId]/settings/page.tsx` to match wherever you deploy
`sdk/analytics.js` and the ingestion server/NGINX in the main repo.
