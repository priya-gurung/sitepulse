import { randomUUID } from "node:crypto";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import {
  prisma,
  ingestEvent,
  eventProcessingDuration,
  type QueuedEvent,
} from "@sitepulse/shared";
import { parseDevice } from "../lib/device-parser";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const tracer = trace.getTracer("sitepulse-worker");

/**
 * Processes a single analytics event consumed from Kafka:
 *   1. Upsert the Visitor row in Postgres (operational truth).
 *   2. Find-or-create the current Session, respecting a 30-min idle window.
 *   3. Push the raw, enriched event to Tinybird (analytical truth).
 *
 * Runs entirely off the ingestion request path. Throwing here signals the
 * consumer loop to route the message to the dead-letter topic rather than
 * committing its offset — see index.ts.
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

      // --- 3: Tinybird (raw analytical event)
      // Combine flat props and clickData into a single object for Tinybird's JSON string column
      const combinedProps = {
        ...(event.props ?? {}),
        ...(event.clickData ? { clickData: event.clickData } : {}),
      };

      await ingestEvent({
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
        props: JSON.stringify(combinedProps), // <--- Tinybird gets clickData inside props without TS errors in ingestion
      });

      if (isNewSession) {
        // Placeholder hook for future work: scheduled jobs / alert triggers
        // (e.g. "new session from a new country" alerting) get wired in here.
      }

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
