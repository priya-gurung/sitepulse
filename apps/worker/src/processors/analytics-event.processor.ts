import { randomUUID } from "node:crypto";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import {
  ingestEvent,
  eventProcessingDuration,
  type QueuedEvent,
} from "@sitepulse/shared";
import { parseDevice } from "../lib/device-parser";

const tracer = trace.getTracer("sitepulse-worker");

/**
 * Processes a single analytics event consumed from Kafka:
 *   1. Parse device info from User-Agent.
 *   2. Push the enriched event to Tinybird.
 *
 * Visitor identity comes from the ingestion server (visitorHash).
 * Session identity comes from the SDK (sessionStorage-persisted sessionId).
 * No Postgres writes — all analytics are served from Tinybird.
 */
export async function processAnalyticsEvent(event: QueuedEvent): Promise<void> {
  await tracer.startActiveSpan("worker.process_event", async (span) => {
    const start = performance.now();
    span.setAttribute("sitepulse.site_id", event.siteId);
    span.setAttribute("sitepulse.event_type", event.type);

    try {
      const { deviceType, browser, os } = parseDevice(event.userAgent);
      const country =
        typeof event.props?._country === "string"
          ? (event.props._country as string)
          : null;

      const now = new Date(event.receivedAt ?? Date.now());

      // Combine flat props and clickData into a single object for Tinybird
      const combinedProps = {
        ...(event.props ?? {}),
        ...(event.clickData ? { clickData: event.clickData } : {}),
      };

      await ingestEvent({
        event_id: randomUUID(),
        site_id: event.siteId,
        visitor_hash: event.visitorHash,
        session_id: event.sessionId ?? crypto.randomUUID(),
        type: event.type,
        event_name: event.eventName ?? null,
        url: event.url,
        referrer: event.referrer || null,
        title: event.title ?? null,
        device_type: deviceType,
        browser,
        os,
        country,
        timestamp: now.toISOString(),
        props: JSON.stringify(combinedProps),
      });

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (err as Error).message,
      });
      throw err;
    } finally {
      eventProcessingDuration.record(performance.now() - start, {
        event_type: event.type,
      });
      span.end();
    }
  });
}