import { createHash } from "node:crypto";

/**
 * Generates an anonymous, irreversible visitor identifier.
 *
 * Privacy design:
 * - IP address is NEVER stored, only used transiently as hash input.
 * - Salt rotates daily, so the same visitor gets a different hash each
 *   day — this prevents long-term cross-site or cross-day tracking while
 *   still allowing same-day session correlation.
 * - Output is a one-way SHA-256 digest; the original IP/UA cannot be
 *   recovered from it.
 */
export function generateVisitorHash(params: {
  ip: string;
  userAgent: string;
  siteId: string;
  salt: string;
}): string {
  const { ip, userAgent, siteId, salt } = params;
  const dayBucket = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const raw = `${ip}|${userAgent}|${siteId}|${dayBucket}|${salt}`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Returns the server-side daily rotation salt. In production this should
 * be pulled from a secret store / env var and rotated via a scheduled job;
 * kept simple here as an env-driven value.
 */
export function getDailySalt(): string {
  const salt = process.env.VISITOR_HASH_SALT;
  if (!salt) {
    throw new Error("VISITOR_HASH_SALT is not configured");
  }
  return salt;
}
