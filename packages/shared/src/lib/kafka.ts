import { Kafka, logLevel, type Producer, type Consumer } from "kafkajs";
import type { QueuedEvent } from "../schemas/event.schema";
import fs from "fs";
import path from "path";

export const TOPICS = {
  ANALYTICS_EVENTS: "analytics-events",
  ANALYTICS_EVENTS_DLQ: "analytics-events-dlq",
} as const;

function getBrokers(): string[] {
  const brokers = process.env.KAFKA_BROKERS;
  if (!brokers) throw new Error("KAFKA_BROKERS is not configured");
  return brokers.split(",").map((b) => b.trim());
}

let kafkaClient: Kafka | null = null;

/**
 * Single Kafka client per process, shared by whichever producer/consumer
 * a given service needs. Client IDs matter for broker-side logging/ACLs,
 * so callers pass one in (e.g. "ingestion-server", "worker").
 */
export function getKafkaClient(clientId: string): Kafka {
  if (!kafkaClient) {
    // 1. Locate and read the ca.pem file
    // Assumes ca.pem is placed in your project root or accessible directory
    let caCertPath = path.resolve(process.cwd(), "ca.pem");
    if (!fs.existsSync(caCertPath)) {
      // If running inside a workspace app, jump up one level to look in the monorepo root
      caCertPath = path.resolve(process.cwd(), "..", "..", "ca.pem");
    }

    // Fallback checking if it's nested just one level deep depending on your folder architecture
    if (!fs.existsSync(caCertPath)) {
      caCertPath = path.resolve(process.cwd(), "..", "ca.pem");
    }

    let caCert: string;

    try {
      caCert = fs.readFileSync(caCertPath, "utf-8");
    } catch (err) {
      throw new Error(
        `Failed to read Aiven CA Certificate. Searched at: ${path.resolve(process.cwd(), "ca.pem")} and ${caCertPath}. Ensure ca.pem is placed in your project root.`
      );
    }

    // 2. Initialize KafkaJS client with security configurations
    kafkaClient = new Kafka({
      clientId,
      brokers: getBrokers(),
      logLevel: logLevel.ERROR,
      connectionTimeout: 10000, // Give it up to 10 seconds to connect over the internet
      authenticationTimeout: 10000,
      retry: { 
        initialRetryTime: 1000,     // Wait 1 second before the first retry (was 300ms)
        factor: 2,                  // Exponential backoff factor
        retries: 10,                 // Try up to 10 times to give the coordinator time to boot
        maxRetryTime: 30000         // Cap the max retry time at 30 seconds
      },
      ssl: {
        rejectUnauthorized: true,
        ca: [caCert],
      },
      sasl: {
        mechanism: "scram-sha-256", // Aiven default authentication mechanism
        username: process.env.KAFKA_USERNAME || "avnadmin",
        password: process.env.KAFKA_PASSWORD || "",
      },
    });
  }
  return kafkaClient;
}

let producer: Producer | null = null;
let producerConnecting: Promise<void> | null = null;

/**
 * Lazily-connected singleton producer for the ingestion server. Kafka
 * producers are safe to share across concurrent requests.
 */
export async function getProducer(): Promise<Producer> {
  if (producer) return producer;
  if (!producerConnecting) {
    producer = getKafkaClient("ingestion-server").producer({
      allowAutoTopicCreation: false, // Turned OFF because Aiven doesn't support auto-creation
      idempotent: true,
    });
    producerConnecting = producer.connect();
  }
  await producerConnecting;
  return producer!;
}

/**
 * Publishes a single analytics event onto the analytics-events topic.
 * Keyed by siteId so all events for a site land on the same partition —
 * this preserves per-site event ordering for the worker.
 */
export async function produceEvent(event: QueuedEvent): Promise<void> {
  const p = await getProducer();
  await p.send({
    topic: TOPICS.ANALYTICS_EVENTS,
    messages: [{ key: event.siteId, value: JSON.stringify(event) }],
  });
}

export async function produceEventBatch(events: QueuedEvent[]): Promise<void> {
  if (!events.length) return;

  const p = await getProducer();

  await p.sendBatch({
    topicMessages: [
      {
        topic: TOPICS.ANALYTICS_EVENTS,
        messages: events.map((event) => ({
          key: event.siteId,
          value: JSON.stringify(event),
        })),
      },
    ],
  });
}

export async function produceToDeadLetter(rawValue: string, reason: string): Promise<void> {
  const p = await getProducer();
  await p.send({
    topic: TOPICS.ANALYTICS_EVENTS_DLQ,
    messages: [
      {
        value: rawValue,
        headers: { failure_reason: reason, failed_at: new Date().toISOString() },
      },
    ],
  });
}

/**
 * Creates (but does not connect) a consumer for the given consumer group.
 * The worker is the only service that should call this.
 */
export function createConsumer(groupId: string): Consumer {
  return getKafkaClient(groupId).consumer({
    groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
  });
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    producerConnecting = null;
  }
}