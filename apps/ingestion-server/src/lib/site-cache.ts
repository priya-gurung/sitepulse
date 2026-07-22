import { prisma, getLogger } from "@sitepulse/shared";
import { trace } from "@opentelemetry/api";

/**
 * The ingestion server must stay extremely fast on the hot path, so we
 * never hit Postgres synchronously inside a request handler. Instead we
 * keep an in-memory map of publicKey -> { siteId, isActive } and refresh
 * it on an interval. Worst case, a brand-new site takes up to
 * REFRESH_INTERVAL_MS to start accepting traffic.
 */

interface CachedSite {
  siteId: string;
  isActive: boolean;
}

const REFRESH_INTERVAL_MS = 30_000;

const logger = getLogger("ingestion-server");
const tracer = trace.getTracer("ingestion-server");

let cache = new Map<string, CachedSite>();
let refreshing = false;
let lastRefreshError: Error | null = null;

async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;

  return tracer.startActiveSpan("site_cache.refresh", async (span) => {
    try {
      const sites = await prisma.site.findMany({
        select: { publicKey: true, id: true, isActive: true },
      });

      const next = new Map<string, CachedSite>();
      for (const s of sites) {
        next.set(s.publicKey, { siteId: s.id, isActive: s.isActive });
      }

      cache = next;
      lastRefreshError = null;

      span.setAttribute("site_cache.size", cache.size);
      logger.info("Site cache refreshed successfully", { entries: cache.size });
    } catch (err) {
      lastRefreshError = err as Error;
      span.recordException(lastRefreshError);
      // Keep serving the stale cache rather than failing all requests.
      logger.error("[site-cache] refresh failed, serving stale cache", {
        error: err,
        staleEntries: cache.size,
      });
    } finally {
      refreshing = false;
      span.end();
    }
  });
}

export function startSiteCache(): NodeJS.Timeout {
  logger.info("Starting background site cache refresher", { intervalMs: REFRESH_INTERVAL_MS });
  void refresh();
  return setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
}

export function lookupSite(publicKey: string): CachedSite | undefined {
  return cache.get(publicKey);
}

export function siteCacheHealth() {
  return {
    entries: cache.size,
    lastRefreshError: lastRefreshError?.message ?? null,
  };
}