import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("sitepulse");

// ---- Ingestion server ----
export const eventsReceivedCounter = meter.createCounter("sitepulse_events_received_total", {
  description: "Events accepted by the ingestion server, before bot filtering",
});

export const eventsRejectedCounter = meter.createCounter("sitepulse_events_rejected_total", {
  description: "Events rejected at ingestion (invalid payload, unknown site, bot traffic)",
});

export const kafkaProduceDuration = meter.createHistogram("sitepulse_kafka_produce_duration_ms", {
  description: "Time to publish an event onto the analytics-events topic",
  unit: "ms",
});

// ---- Worker ----
export const eventsProcessedCounter = meter.createCounter("sitepulse_events_processed_total", {
  description: "Events successfully processed by the worker (Postgres + Tinybird write complete)",
});

export const eventsFailedCounter = meter.createCounter("sitepulse_events_failed_total", {
  description: "Events that failed processing and were routed to the dead-letter topic",
});

export const eventProcessingDuration = meter.createHistogram(
  "sitepulse_event_processing_duration_ms",
  { description: "End-to-end time to process a single queued event", unit: "ms" }
);

export const tinybirdIngestDuration = meter.createHistogram(
  "sitepulse_tinybird_ingest_duration_ms",
  { description: "Time to push an event to Tinybird's Events API", unit: "ms" }
);

// ---- Dashboard server ----
export const tinybirdQueryDuration = meter.createHistogram("sitepulse_tinybird_query_duration_ms", {
  description: "Time to query a Tinybird pipe",
  unit: "ms",
});

export const dashboardCacheHitCounter = meter.createCounter("sitepulse_dashboard_cache_hits_total", {
  description: "In-process cache hits for dashboard analytics queries",
});

export const dashboardCacheMissCounter = meter.createCounter(
  "sitepulse_dashboard_cache_misses_total",
  { description: "In-process cache misses for dashboard analytics queries" }
);

export const aiAgentDuration = meter.createHistogram("sitepulse_ai_agent_duration_ms", {
  description: "Time for the FastAPI/LangGraph agent to answer an /ask request",
  unit: "ms",
});

export const aiAgentRequestCounter = meter.createCounter("sitepulse_ai_agent_requests_total", {
  description: "Requests sent to the AI agent, labeled by outcome",
});
