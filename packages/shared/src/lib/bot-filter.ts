/**
 * Lightweight, allocation-cheap bot detection for the ingestion hot path.
 * This is intentionally NOT a full user-agent parsing library — those are
 * too slow to run on every single request at high throughput. It's a
 * fast first-pass filter; more thorough bot scoring can happen async in
 * the worker if ever needed.
 */

const BOT_PATTERNS: RegExp[] = [
  /bot/i,
  /spider/i,
  /crawl/i,
  /slurp/i,
  /bingpreview/i,
  /facebookexternalhit/i,
  /headlesschrome/i,
  /phantomjs/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /axios\//i,
  /go-http-client/i,
  /postmanruntime/i,
];

export function isLikelyBot(userAgent: string | undefined | null): boolean {
  if (!userAgent || userAgent.trim().length === 0) return true;
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}
