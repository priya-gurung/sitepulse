import "./tracing"; // MUST be first — initializes OTel before other imports are patched

import {
  createConsumer,
  produceToDeadLetter,
  TOPICS,
  QueuedEventSchema,
  eventsProcessedCounter,
  eventsFailedCounter,
  getLogger,
} from "@sitepulse/shared";
import { trace } from "@opentelemetry/api";
import { processAnalyticsEvent } from "./processors/analytics-event.processor";

const logger = getLogger("sitepulse-worker");
const tracer = trace.getTracer("sitepulse-worker");

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
      await tracer.startActiveSpan("worker.process_event", async (span) => {
        try {
          span.setAttribute("worker.retry_attempt", attempt);
          
          const parsed = QueuedEventSchema.parse(JSON.parse(rawValue));
          span.setAttribute("site.id", parsed.siteId);
          span.setAttribute("event.type", parsed.type);

          await processAnalyticsEvent(parsed);
          eventsProcessedCounter.add(1, { event_type: parsed.type });
          
          logger.info("Successfully processed analytics event", {
            siteId: parsed.siteId,
            eventType: parsed.type,
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
      
      logger.warn(`Worker processing attempt ${attempt}/${MAX_ATTEMPTS} failed`, {
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        error: errorMessage,
      });

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  eventsFailedCounter.add(1);

  const failureReason = lastError instanceof Error ? lastError.message : "unknown_error";
  logger.error("Event failed after max attempts. Routing to Dead Letter Queue (DLQ)", {
    maxAttempts: MAX_ATTEMPTS,
    error: failureReason,
  });

  await tracer.startActiveSpan("worker.produce_to_dlq", async (span) => {
    try {
      span.setAttribute("dlq.reason", failureReason);
      await produceToDeadLetter(rawValue, failureReason);
    } finally {
      span.end();
    }
  });
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
    // Kafka delivers messages within a partition in order; we process
    // them sequentially here to preserve per-site ordering (events are
    // keyed by siteId at produce time). Different partitions still run
    // concurrently across the consumer group / other worker replicas.
    eachMessage: async ({ message, partition, topic }) => {
      if (!message.value) return;
      const rawValue = message.value.toString();

      await tracer.startActiveSpan("worker.consume_kafka_message", async (span) => {
        span.setAttribute("kafka.topic", topic);
        span.setAttribute("kafka.partition", partition);
        span.setAttribute("kafka.offset", message.offset);

        try {
          await processWithRetry(rawValue);
        } catch (err) {
          // processWithRetry already routes to the DLQ; this catch is a
          // last-resort safety net so a single bad message can never crash
          // the consumer loop.
          logger.error(`Unrecoverable error processing message on partition ${partition}`, {
            partition,
            offset: message.offset,
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