import { prisma } from "@sitepulse/shared";

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

let cache = new Map<string, CachedSite>();
let refreshing = false;
let lastRefreshError: Error | null = null;

async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
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
  } catch (err) {
    lastRefreshError = err as Error;
    // Keep serving the stale cache rather than failing all requests.
    console.error("[site-cache] refresh failed, serving stale cache:", err);
  } finally {
    refreshing = false;
  }
}

export function startSiteCache(): NodeJS.Timeout {
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
