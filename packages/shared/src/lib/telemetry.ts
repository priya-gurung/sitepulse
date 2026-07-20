import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

/**
 * Initializes tracing + metrics for a service. Must be called (via a
 * side-effect-only import) BEFORE any other module that should be
 * auto-instrumented — Express, http, pg, etc. all get patched at
 * require-time, so this has to run first. See each service's
 * `tracing.ts` for the enforced import order.
 */
export function initTelemetry(serviceName: string): NodeSDK {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const prometheusPort = Number(process.env.OTEL_PROMETHEUS_PORT ?? 9464);

  const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  const headers: Record<string, string> = {};
  if (rawHeaders) {
    rawHeaders.split(',').forEach(header => {
      const [key, value] = header.split('=');
      if (key && value) {
        headers[key.trim()] = value.trim();
      }
    });
  }

  const prometheusExporter = new PrometheusExporter({ port: prometheusPort }, () => {
    console.log(
      `[otel:${serviceName}] Prometheus metrics exposed on :${prometheusPort}/metrics`
    );
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: otlpEndpoint ? `${otlpEndpoint}/v1/traces` : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    }),
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    console.log(`[otel:${serviceName}] tracing initialized (OTLP -> ${otlpEndpoint ?? "console"})`);
  } catch (err) {
    console.error(`[otel:${serviceName}] failed to initialize:`, err);
  }

  const shutdown = () => {
    sdk
      .shutdown()
      .catch((err) => console.error(`[otel:${serviceName}] shutdown error:`, err))
      .finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return sdk;
}
