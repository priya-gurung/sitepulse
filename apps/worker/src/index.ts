import "./tracing"; // MUST be first — initializes OTel before other imports are patched

import {
  createConsumer,
  produceToDeadLetter,
  TOPICS,
  QueuedEventSchema,
  eventsProcessedCounter,
  eventsFailedCounter,
  getLogger,
  type QueuedEvent,
} from "@sitepulse/shared";
import { trace } from "@opentelemetry/api";
import { processAnalyticsEventsBatch } from "./processors/analytics-event.processor";

const logger = getLogger("sitepulse-worker");
const tracer = trace.getTracer("sitepulse-worker");

const CONSUMER_GROUP = process.env.KAFKA_CONSUMER_GROUP ?? "sitepulse-worker";
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);

const consumer = createConsumer(CONSUMER_GROUP);

interface ValidatedItem {
  rawValue: string;
  parsed: QueuedEvent;
}

/**
 * Executes batch processing with a retry loop.
 * If the whole batch fails max attempts (e.g. database or network issue),
 * it falls back to routing every message in the batch to DLQ so offset progression continues.
 */
async function processBatchWithRetry(items: ValidatedItem[]): Promise<void> {
  if (items.length === 0) return;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await tracer.startActiveSpan("worker.process_batch", async (span) => {
        try {
          span.setAttribute("worker.retry_attempt", attempt);
          span.setAttribute("worker.batch_size", items.length);

          // Pass the batch of parsed QueuedEvent objects directly
          await processAnalyticsEventsBatch(items.map((i) => i.parsed));

          // Increment metrics for successfully processed events in this batch
          items.forEach(({ parsed }) => {
            eventsProcessedCounter.add(1, { event_type: parsed.type });
          });

          logger.info("Successfully processed analytics event batch", {
            batchSize: items.length,
            attempt,
          });
        } finally {
          span.end();
        }
      });
      return;
    } catch (err) {
      lastError = err;
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.warn(`Worker batch processing attempt ${attempt}/${MAX_ATTEMPTS} failed`, {
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        batchSize: items.length,
        error: errorMessage,
      });

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  // If all retry attempts fail, record metrics and push items to DLQ
  eventsFailedCounter.add(items.length);
  const failureReason = lastError instanceof Error ? lastError.message : "batch_processing_error";

  logger.error("Event batch failed after max attempts. Routing all items to DLQ", {
    batchSize: items.length,
    maxAttempts: MAX_ATTEMPTS,
    error: failureReason,
  });

  for (const item of items) {
    await tracer.startActiveSpan("worker.produce_to_dlq", async (span) => {
      try {
        span.setAttribute("dlq.reason", failureReason);
        await produceToDeadLetter(item.rawValue, failureReason);
      } catch (dlqErr) {
        logger.error("Failed to produce message to DLQ", { error: dlqErr });
      } finally {
        span.end();
      }
    });
  }
}

async function main() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.ANALYTICS_EVENTS, fromBeginning: false });

  logger.info(`Worker consuming Kafka topic`, {
    topic: TOPICS.ANALYTICS_EVENTS,
    consumerGroup: CONSUMER_GROUP,
    maxAttempts: MAX_ATTEMPTS,
  });

  await consumer.run({
    // Using eachBatch instead of eachMessage for high-throughput batching
    eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
      const { topic, partition, messages } = batch;

      if (messages.length === 0) return;

      await tracer.startActiveSpan("worker.consume_kafka_batch", async (span) => {
        span.setAttribute("kafka.topic", topic);
        span.setAttribute("kafka.partition", partition);
        span.setAttribute("kafka.batch_size", messages.length);

        try {
          const validItems: ValidatedItem[] = [];

          for (const message of messages) {
            if (!isRunning() || isStale()) break;
            if (!message.value) {
              resolveOffset(message.offset);
              continue;
            }

            const rawValue = message.value.toString();

            try {
              const parsed = QueuedEventSchema.parse(JSON.parse(rawValue));
              validItems.push({ rawValue, parsed });
            } catch (schemaErr) {
              // Schema validation failures go straight to DLQ (no retries needed)
              const reason = schemaErr instanceof Error ? schemaErr.message : "schema_parse_error";
              logger.warn("Invalid event schema encountered. Routing to DLQ", {
                partition,
                offset: message.offset,
                error: reason,
              });

              eventsFailedCounter.add(1);
              await produceToDeadLetter(rawValue, `schema_error: ${reason}`);
            }

            resolveOffset(message.offset);
          }

          // Process all valid events in a single operation
          if (validItems.length > 0) {
            await processBatchWithRetry(validItems);
          }

          // Send heartbeat to Kafka to keep consumer group lease alive
          await heartbeat();
        } catch (err) {
          logger.error(`Unrecoverable batch error on partition ${partition}`, {
            partition,
            error: err,
          });
        } finally {
          span.end();
        }
      });
    },
  });
}

main().catch((err) => {
  logger.error("Fatal startup error in worker process", { error: err });
  process.exit(1);
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down worker gracefully...`, { signal });
  try {
    await consumer.disconnect();
  } catch (err) {
    logger.error("Error disconnecting Kafka consumer during shutdown", { error: err });
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));