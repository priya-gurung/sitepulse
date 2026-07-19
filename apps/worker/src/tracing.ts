import { initTelemetry } from "@sitepulse/shared";

// Side-effect only: must be imported before anything else in index.ts so
// auto-instrumentation (pg, http/fetch, etc.) can patch those modules
// before they're first required elsewhere.
initTelemetry(process.env.OTEL_SERVICE_NAME ?? "worker");
