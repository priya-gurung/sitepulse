import { initTelemetry } from "@sitepulse/shared";

// Side-effect only: initializes the OTel SDK before anything else in this
// process imports express/http/pg. This file must be the FIRST import in
// server.ts — reordering it will silently disable auto-instrumentation
// for whatever got imported earlier.
initTelemetry(process.env.OTEL_SERVICE_NAME ?? "ingestion-server");
