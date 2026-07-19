import "./tracing"; // MUST be first — initializes OTel before other imports are patched

import {
  createConsumer,
  produceToDeadLetter,
  TOPICS,
  QueuedEventSchema,
  eventsProcessedCounter,
  eventsFailedCounter,
} from "@sitepulse/shared";
import { processAnalyticsEvent } from "./processors/analytics-event.processor";

const CONSUMER_GROUP = process.env.KAFKA_CONSUMER_GROUP ?? "sitepulse-worker";
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);

const consumer = createConsumer(CONSUMER_GROUP);

/**
 * Kafka doesn't give us BullMQ-style automatic retry/backoff, so we
 * implement a small bounded retry loop here: on failure, retry a few
 * times with a short delay before giving up and routing to the DLQ
 * topic. This trades perfect exactly-once semantics for simplicity —
 * acceptable for analytics data where an occasional dropped event isn't
 * fatal, and nothing is lost since it lands in the DLQ topic for replay.
 */
async function processWithRetry(rawValue: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const parsed = QueuedEventSchema.parse(JSON.parse(rawValue));
      await processAnalyticsEvent(parsed);
      eventsProcessedCounter.add(1, { event_type: parsed.type });
      return;
    } catch (err) {
      lastError = err;
      console.error(
        `[worker] attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        err instanceof Error ? err.message : err
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  eventsFailedCounter.add(1);
  await produceToDeadLetter(
    rawValue,
    lastError instanceof Error ? lastError.message : "unknown_error"
  );
}

async function main() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.ANALYTICS_EVENTS, fromBeginning: false });

  console.log(
    `[worker] consuming "${TOPICS.ANALYTICS_EVENTS}" as group "${CONSUMER_GROUP}" (max ${MAX_ATTEMPTS} attempts before DLQ)`
  );

  await consumer.run({
    // Kafka delivers messages within a partition in order; we process
    // them sequentially here to preserve per-site ordering (events are
    // keyed by siteId at produce time). Different partitions still run
    // concurrently across the consumer group / other worker replicas.
    eachMessage: async ({ message, partition }) => {
      if (!message.value) return;
      const rawValue = message.value.toString();

      try {
        await processWithRetry(rawValue);
      } catch (err) {
        // processWithRetry already routes to the DLQ; this catch is a
        // last-resort safety net so a single bad message can never crash
        // the consumer loop.
        console.error(`[worker] unrecoverable error on partition ${partition}:`, err);
      }
    },
  });
}

main().catch((err) => {
  console.error("[worker] fatal startup error:", err);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down gracefully...`);
  try {
    await consumer.disconnect();
  } catch (err) {
    console.error("[worker] error disconnecting consumer:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
