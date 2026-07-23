import { randomUUID } from "node:crypto";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import {
  prisma,
  ingestEventsBatch, // <--- 1. Swapped ingestEvent for ingestEventsBatch
  eventProcessingDuration,
  type QueuedEvent,
  type RawAnalyticsEvent, // <--- 2. Imported RawAnalyticsEvent type
} from "@sitepulse/shared";
import { parseDevice } from "../lib/device-parser";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const tracer = trace.getTracer("sitepulse-worker");

/**
 * Processes a batch of analytics events consumed from Kafka:
 *   1. Upsert the Visitor row in Postgres for each event (operational truth).
 *   2. Find-or-create the current Session for each event, respecting a 30-min idle window.
 *   3. Push all enriched events to Tinybird in a single NDJSON batch request (analytical truth).
 *
 * Runs entirely off the ingestion request path. Throwing here signals the
 * consumer loop to route the message to the dead-letter topic rather than
 * committing its offset — see index.ts.
 */
export async function processAnalyticsEventsBatch(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) return;

  await tracer.startActiveSpan("worker.process_batch", async (span) => {
    const start = performance.now();
    span.setAttribute("sitepulse.batch_size", events.length);

    try {
      // Array to accumulate payloads for our single Tinybird HTTP request
      const tinybirdEvents: RawAnalyticsEvent[] = [];

      for (const event of events) {
        const { deviceType, browser, os } = parseDevice(event.userAgent);
        const country =
          typeof event.props?._country === "string"
            ? (event.props._country as string)
            : null;

        const now = new Date(event.receivedAt ?? Date.now());

        // --- 1 & 2: Postgres (visitor + session), done in a single transaction
        // so we never leave a session without its parent visitor upserted.
        const { session, isNewSession } = await prisma.$transaction(
          async (tx) => {
            const visitor = await tx.visitor.upsert({
              where: {
                siteId_visitorHash: {
                  siteId: event.siteId,
                  visitorHash: event.visitorHash,
                },
              },
              update: { lastSeenAt: now },
              create: {
                siteId: event.siteId,
                visitorHash: event.visitorHash,
                firstSeenAt: now,
                lastSeenAt: now,
              },
            });

            const activeSession = await tx.session.findFirst({
              where: {
                visitorId: visitor.id,
                siteId: event.siteId,
                endedAt: null,
                lastActiveAt: {
                  gte: new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS),
                },
              },
              orderBy: { lastActiveAt: "desc" },
            });

            if (activeSession) {
              const updated = await tx.session.update({
                where: { id: activeSession.id },
                data: {
                  lastActiveAt: now,
                  pageViews:
                    event.type === "pageview" ? { increment: 1 } : undefined,
                },
              });
              return { visitor, session: updated, isNewSession: false };
            }

            const created = await tx.session.create({
              data: {
                siteId: event.siteId,
                visitorId: visitor.id,
                startedAt: now,
                lastActiveAt: now,
                entryPage: event.url,
                referrer: event.referrer || null,
                deviceType,
                browser,
                os,
                country,
                pageViews: event.type === "pageview" ? 1 : 0,
              },
            });

            await tx.visitor.update({
              where: { id: visitor.id },
              data: { totalSessions: { increment: 1 } },
            });

            return { visitor, session: created, isNewSession: true };
          },
        );

        // Combine flat props and clickData into a single object for Tinybird's JSON string column
        const combinedProps = {
          ...(event.props ?? {}),
          ...(event.clickData ? { clickData: event.clickData } : {}),
        };

        // --- 3a: Push formatted item into our local array instead of making a network call
        tinybirdEvents.push({
          event_id: randomUUID(),
          site_id: event.siteId,
          visitor_hash: event.visitorHash,
          session_id: session.id,
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

        if (isNewSession) {
          // Placeholder hook for future work: scheduled jobs / alert triggers
          // (e.g. "new session from a new country" alerting) get wired in here.
        }
      }

      // --- 3b: Tinybird (raw analytical event batch)
      // Execute ONE batch request over NDJSON after the loop finishes
      await ingestEventsBatch(tinybirdEvents);

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
        batch_size: events.length,
      });
      span.end();
    }
  });
}