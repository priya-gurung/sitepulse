import { Router, type Request, type Response, type NextFunction } from "express";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import {
  CollectEventSchema,
  generateVisitorHash,
  getDailySalt,
  isLikelyBot,
  produceEvent,
  eventsReceivedCounter,
  eventsRejectedCounter,
  kafkaProduceDuration,
  type QueuedEvent,
} from "@sitepulse/shared";
import { lookupSite } from "../lib/site-cache";
import { getClientIp, getCountryFromHeaders } from "../utils/client-ip";

const tracer = trace.getTracer("sitepulse-ingestion");

export const collectRouter = Router();

/**
 * POST /collect
 *
 * This is the ONLY endpoint on this server that touches SDK traffic.
 * It must:
 *   1. Validate the payload shape (Zod).
 *   2. Validate the public site key (in-memory cache, no DB round-trip).
 *   3. Filter obvious bots.
 *   4. Compute an anonymous visitor hash (no PII stored).
 *   5. Publish onto the Kafka analytics-events topic.
 *   6. Return 202 Accepted immediately — never wait on downstream work.
 *
 * It must NEVER query Tinybird, generate reports, or do anything else
 * that could add latency to this response.
 */
collectRouter.post(
  "/collect",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userAgent = req.headers["user-agent"] ?? "";

      // Fast bot rejection before we even touch Zod/JSON validation cost.
      if (isLikelyBot(userAgent)) {
        // Still 202 — we don't want SDKs retrying or bots learning they
        // were detected via a different status code.
        eventsRejectedCounter.add(1, { reason: "bot" });
        res.status(202).end();
        return;
      }
      let payload = req.body;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (parseError) {
          res.status(400).json({ error: "invalid_json_payload" });
          return;
        }
      }
      console.log(payload);
      const parsed = CollectEventSchema.parse(payload);
      console.log(parsed.publicKey);
      const site = lookupSite(parsed.publicKey);
      console.log("site",site);
      if (!site || !site.isActive) {
        eventsRejectedCounter.add(1, { reason: "invalid_site" });
        res.status(403).json({ error: "invalid_or_inactive_site" });
        return;
      }

      const ip = getClientIp(req);
      const visitorHash = generateVisitorHash({
        ip,
        userAgent,
        siteId: site.siteId,
        salt: getDailySalt(),
      });

      const country = getCountryFromHeaders(req);

      const queuedEvent: QueuedEvent = {
        ...parsed,
        siteId: site.siteId,
        visitorHash,
        ip, // transient — worker uses this only for device/geo enrichment,
        // never persists the raw IP itself.
        userAgent,
        receivedAt: Date.now(),
        // country travels alongside via props merge in the worker if needed
        props: { ...(parsed.props ?? {}), ...(country ? { _country: country } : {}) },
      };

      // Publish and return immediately. Do not await anything else.
      await tracer.startActiveSpan("ingestion.produce_event", async (span) => {
        const start = performance.now();
        span.setAttribute("sitepulse.site_id", site.siteId);
        span.setAttribute("sitepulse.event_type", parsed.type);
        try {
          await produceEvent(queuedEvent);
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          throw err;
        } finally {
          kafkaProduceDuration.record(performance.now() - start, {
            event_type: parsed.type,
          });
          span.end();
        }
      });

      eventsReceivedCounter.add(1, { event_type: parsed.type });
      res.status(202).end();
    } catch (err) {
      console.error("[Ingestion Core Error]:", err);
      next(err);
    }
  }
);
