import rateLimit from "express-rate-limit";

/**
 * Per-IP rate limit on /collect. Generous, since this is meant to absorb
 * real traffic from many end-users behind the same NAT/proxy — this is a
 * safety net against abuse/DoS, not a general throttle.
 */
export const collectRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600, // 10 events/sec sustained per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited" },
});
