import { dashboardCacheHitCounter, dashboardCacheMissCounter } from "@sitepulse/shared";

/**
 * Small in-process TTL cache for dashboard query results.
 *
 * Dashboards are read-heavy and often reloaded/polled; caching short-lived
 * Tinybird pipe responses meaningfully cuts query volume without adding
 * infra. For multi-instance deployments, swap this for a Redis-backed
 * cache (the interface below would not need to change).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs = 30_000): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) {
    dashboardCacheHitCounter.add(1);
    return cached;
  }
  dashboardCacheMissCounter.add(1);
  const fresh = await fn();
  setCached(key, fresh, ttlMs);
  return fresh;
}
