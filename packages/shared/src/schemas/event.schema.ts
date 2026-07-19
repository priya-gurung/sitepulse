import { z } from "zod";

/**
 * Payload sent by the analytics.js SDK to POST /collect
 * Kept intentionally small — this is the hot path.
 */
export const CollectEventSchema = z.object({
  publicKey: z.string().min(10, "invalid site key"),
  type: z.enum(["pageview", "custom"]).default("pageview"),
  eventName: z.string().max(120).optional(), // used when type === "custom"
  url: z.string().url(),
  referrer: z.string().url().optional().or(z.literal("")),
  title: z.string().max(300).optional(),
  screenWidth: z.number().int().positive().max(20000).optional(),
  screenHeight: z.number().int().positive().max(20000).optional(),
  timezone: z.string().max(64).optional(),
  language: z.string().max(20).optional(),
  sessionId: z.string().max(64).optional(), // client-generated, rotated per SDK session
  timestamp: z.number().int().positive().optional(), // client-side epoch ms
  props: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type CollectEventInput = z.infer<typeof CollectEventSchema>;

/**
 * Enriched event shape after the ingestion server has validated the
 * request, resolved the site, and computed the visitor hash.
 * This is what gets published onto the Kafka analytics-events topic.
 */
export const QueuedEventSchema = CollectEventSchema.extend({
  siteId: z.string(),
  visitorHash: z.string(),
  ip: z.string(),
  userAgent: z.string(),
  receivedAt: z.number().int().positive(),
});

export type QueuedEvent = z.infer<typeof QueuedEventSchema>;
