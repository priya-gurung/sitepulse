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

collectRouter.post(
  "/collect",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userAgent = req.headers["user-agent"] ?? "";

      // 1. Fast bot rejection
      if (isLikelyBot(userAgent)) {
        eventsRejectedCounter.add(1, { reason: "bot" });
        res.status(202).end();
        return;
      }

      let rawEvents = req.body;
      if (typeof rawEvents === "string") {
        try {
          rawEvents = JSON.parse(rawEvents);
        } catch (parseError) {
          res.status(400).json({ error: "invalid_json_payload" });
          return;
        }
      }

      // 2. Reject non-array payloads outright
      if (!Array.isArray(rawEvents)) {
        eventsRejectedCounter.add(1, { reason: "expected_batch_array" });
        res.status(400).json({ error: "payload_must_be_an_array" });
        return;
      }

      if (rawEvents.length === 0) {
        res.status(202).end();
        return;
      }

      const ip = getClientIp(req);
      const country = getCountryFromHeaders(req);
      const dailySalt = getDailySalt();

      const eventsToProduce: { queuedEvent: QueuedEvent; eventType: string }[] = [];

      // 3. Process & validate batch array
      for (const rawItem of rawEvents) {
        const parseResult = CollectEventSchema.safeParse(rawItem);
        if (!parseResult.success) {
          eventsRejectedCounter.add(1, { reason: "schema_validation_failed" });
          continue;
        }

        const parsed = parseResult.data;

        const site = lookupSite(parsed.publicKey);
        if (!site || !site.isActive) {
          eventsRejectedCounter.add(1, { reason: "invalid_site" });
          continue;
        }

        const visitorHash = generateVisitorHash({
          ip,
          userAgent,
          siteId: site.siteId,
          salt: dailySalt,
        });

        const queuedEvent: QueuedEvent = {
          ...parsed,
          siteId: site.siteId,
          visitorHash,
          ip,
          userAgent,
          receivedAt: Date.now(),
          clickData: parsed.clickData,
          props: {
            ...(parsed.props ?? {}),
            ...(country ? { _country: country } : {}),
          },
        };

        // Push event into batch array!
        eventsToProduce.push({ queuedEvent, eventType: parsed.type });
      } // <--- Added missing closing brace for the for-loop here!

      // If all items in the batch were malformed or for inactive sites
      if (eventsToProduce.length === 0) {
        res.status(400).json({ error: "no_valid_events_in_batch" });
        return;
      }

      // 4. Produce valid batch events to Kafka
      await tracer.startActiveSpan("ingestion.produce_batch", async (span) => {
        const start = performance.now();
        span.setAttribute("sitepulse.batch_size", eventsToProduce.length);

        try {
          await Promise.all(
            eventsToProduce.map(({ queuedEvent }) => produceEvent(queuedEvent))
          );

          span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          throw err;
        } finally {
          eventsToProduce.forEach(({ eventType }) => {
            kafkaProduceDuration.record(performance.now() - start, {
              event_type: eventType,
            });
            eventsReceivedCounter.add(1, { event_type: eventType });
          });
          span.end();
        }
      });

      // 5. Respond 202 Accepted immediately
      res.status(202).end();
    } catch (err) {
      console.error("[Ingestion Core Error]:", err);
      next(err);
    }
  }
);