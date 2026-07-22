import { randomUUID } from "node:crypto";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import {
  prisma,
  ingestEventsBatch, // <--- Replaced ingestEvent with ingestEventsBatch
  eventProcessingDuration,
  type QueuedEvent,
  type RawAnalyticsEvent,
} from "@sitepulse/shared";
import { parseDevice } from "../lib/device-parser";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const tracer = trace.getTracer("sitepulse-worker");

/**
 * Processes a single event against Postgres for Visitor and Session state.
 */
async function processPostgresState(event: QueuedEvent) {
  const { deviceType, browser, os } = parseDevice(event.userAgent);
  const country =
    typeof event.props?._country === "string"
      ? (event.props._country as string)
      : null;

  const now = new Date(event.receivedAt ?? Date.now());

  const { session, isNewSession } = await prisma.$transaction(async (tx) => {
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
  });

  return { session, isNewSession, deviceType, browser, os, country, now };
}

/**
 * Batch processor function that processes a list of queued events
 * and ingests them to Tinybird in a single NDJSON HTTP payload.
 */
export async function processAnalyticsEventsBatch(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) return;

  await tracer.startActiveSpan("worker.process_batch", async (span) => {
    const start = performance.now();
    span.setAttribute("sitepulse.batch_size", events.length);

    try {
      const rawEvents: RawAnalyticsEvent[] = [];

      for (const event of events) {
        const { session, deviceType, browser, os, country, now } =
          await processPostgresState(event);

        const combinedProps = {
          ...(event.props ?? {}),
          ...(event.clickData ? { clickData: event.clickData } : {}),
        };

        rawEvents.push({
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
      }

      // Single HTTP POST request to Tinybird
      await ingestEventsBatch(rawEvents);

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