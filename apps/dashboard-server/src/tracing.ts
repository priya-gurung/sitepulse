import { initTelemetry } from "@sitepulse/shared";

// Side-effect only: must be imported before anything else in server.ts so
// auto-instrumentation (Express, http, pg) can patch those modules before
// they're first required elsewhere.
initTelemetry(process.env.OTEL_SERVICE_NAME ?? "dashboard-server");
