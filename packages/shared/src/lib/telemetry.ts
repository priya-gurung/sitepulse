import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

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

  const logExporter = new OTLPLogExporter({
    url: otlpEndpoint ? `${otlpEndpoint.replace(/\/$/, '')}/v1/logs` : undefined,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: otlpEndpoint ? `${otlpEndpoint.replace(/\/$/, '')}/v1/traces` : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    }),
    logRecordProcessor: new BatchLogRecordProcessor(logExporter),
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

export function getLogger(name = "sitepulse-logger") {
  const otelLogger = logs.getLogger(name);

  return {
    info: (message: string, attributes?: Record<string, any>) => {
      otelLogger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
        body: message,
        attributes,
      });
    },
    warn: (message: string, attributes?: Record<string, any>) => {
      otelLogger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
        body: message,
        attributes,
      });
    },
    error: (message: string, attributes?: Record<string, any>) => {
      otelLogger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: message,
        attributes,
      });
    },
  };
}
