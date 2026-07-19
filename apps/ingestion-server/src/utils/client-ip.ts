import type { Request } from "express";

/**
 * Resolves the real client IP behind NGINX/CDN. Requires `app.set('trust
 * proxy', ...)` to be configured correctly in server.ts to whatever hop
 * count matches the deployment (NGINX in front == 1 hop).
 */
export function getClientIp(req: Request): string {
  // req.ip already respects Express's trust proxy setting.
  return req.ip ?? req.socket.remoteAddress ?? "0.0.0.0";
}

/**
 * Coarse country lookup from CDN-provided geo headers (e.g. Cloudflare's
 * CF-IPCountry, or Fastly/NGINX geoip module output). No IP geolocation
 * database is queried here — that would be an expensive computation on
 * the hot path, which the ingestion server must avoid.
 */
export function getCountryFromHeaders(req: Request): string | null {
  const cfCountry = req.headers["cf-ipcountry"];
  if (typeof cfCountry === "string" && cfCountry !== "XX") return cfCountry;

  const geoCountry = req.headers["x-geo-country"];
  if (typeof geoCountry === "string") return geoCountry;

  return null;
}
