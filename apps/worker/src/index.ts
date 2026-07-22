import "./tracing"; // MUST be first — initializes OTel before other imports are patched

import {
  createConsumer,
  produceToDeadLetter,
  TOPICS,
  QueuedEventSchema,
  eventsProcessedCounter,
  eventsFailedCounter,
  type QueuedEvent,
} from "@sitepulse/shared";
import { processAnalyticsEventsBatch } from "./processors/analytics-event.processor";

const CONSUMER_GROUP = process.env.KAFKA_CONSUMER_GROUP ?? "sitepulse-worker";
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);

const consumer = createConsumer(CONSUMER_GROUP);

async function main() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.ANALYTICS_EVENTS, fromBeginning: false });

  console.log(
    `[worker] consuming "${TOPICS.ANALYTICS_EVENTS}" as group "${CONSUMER_GROUP}" using batching`
  );

  await consumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat, isStale }) => {
      const validEvents: QueuedEvent[] = [];

      for (const message of batch.messages) {
        if (isStale()) break;
        if (!message.value) continue;

        const rawValue = message.value.toString();

        try {
          const parsed = QueuedEventSchema.parse(JSON.parse(rawValue));
          validEvents.push(parsed);
        } catch (err) {
          // If parsing fails outright, immediately push message to DLQ
          eventsFailedCounter.add(1);
          await produceToDeadLetter(rawValue, "schema_validation_failed");
        }
      }

      if (validEvents.length === 0) return;

      // Retry batch execution if database or network throws
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await processAnalyticsEventsBatch(validEvents);

          // Update metrics per processed event type inside the batch
          for (const event of validEvents) {
            eventsProcessedCounter.add(1, { event_type: event.type });
          }

          // Mark offsets as committed in Kafka
          for (const message of batch.messages) {
            resolveOffset(message.offset);
          }
          await heartbeat();
          return;
        } catch (err) {
          lastError = err;
          console.error(
            `[worker] batch attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
            err instanceof Error ? err.message : err
          );
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 500));
          }
        }
      }

      // If batch fails after MAX_ATTEMPTS, route all events to DLQ
      eventsFailedCounter.add(validEvents.length);
      for (const message of batch.messages) {
        if (message.value) {
          await produceToDeadLetter(
            message.value.toString(),
            lastError instanceof Error ? lastError.message : "unknown_batch_error"
          );
          resolveOffset(message.offset);
        }
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