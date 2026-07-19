import rateLimit from "express-rate-limit";

/**
 * LLM calls are slow and expensive relative to normal dashboard reads, so
 * /ask gets its own, tighter limit rather than sharing the general
 * dashboard rate limiter.
 */
export const askRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", detail: "Too many questions — try again in a minute." },
});
