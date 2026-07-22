import logging
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.metrics import get_meter_provider, set_meter_provider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry._logs import set_logger_provider
from prometheus_client import start_http_server

from .config import Settings


def init_telemetry(settings: Settings) -> None:
    resource = Resource(attributes={SERVICE_NAME: settings.OTEL_SERVICE_NAME})

    tracer_provider = TracerProvider(resource=resource)
    headers = {}
    if getattr(settings, "HONEYCOMB_API_KEY", None):
        headers["x-honeycomb-team"] = settings.HONEYCOMB_API_KEY

    # TRACES SETUP
    if settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        trace_endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT.rstrip('/')
        if not trace_endpoint.endswith("/v1/traces"):
            trace_endpoint = f"{trace_endpoint}/v1/traces"

        trace_exporter = OTLPSpanExporter(
            endpoint=trace_endpoint,
            headers=headers if headers else None,
        )
        tracer_provider.add_span_processor(BatchSpanProcessor(trace_exporter))
    trace.set_tracer_provider(tracer_provider)

    # LOGS SETUP
    if settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        logger_provider = LoggerProvider(resource=resource)
        set_logger_provider(logger_provider)

        log_endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT.rstrip('/')
        if not log_endpoint.endswith("/v1/logs"):
            log_endpoint = f"{log_endpoint}/v1/logs"

        log_exporter = OTLPLogExporter(
            endpoint=log_endpoint,
            headers=headers if headers else None,
        )
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))

        # Attach OpenTelemetry handler to Python root logger
        handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
        logging.getLogger().addHandler(handler)
        logging.getLogger().setLevel(logging.INFO)

    # Metrics Setup
    reader = PrometheusMetricReader()
    set_meter_provider(MeterProvider(resource=resource, metric_readers=[reader]))
    try:
        start_http_server(port=settings.OTEL_PROMETHEUS_PORT)
    except OSError as e:
        if e.errno == 98:  # Errno 98: Address already in use
            print(
                f"[otel:{settings.OTEL_SERVICE_NAME}] Prometheus server "
                f"already running on port {settings.OTEL_PROMETHEUS_PORT}"
            )
        else:
            raise e

    print(
        f"[otel:{settings.OTEL_SERVICE_NAME}] tracing -> "
        f"{settings.OTEL_EXPORTER_OTLP_ENDPOINT or 'disabled'}, "
        f"metrics on :{settings.OTEL_PROMETHEUS_PORT}/metrics"
    )


def instrument_app(app) -> None:
    FastAPIInstrumentor.instrument_app(app)


def get_tracer():
    return trace.get_tracer("sitepulse-ai-agent")


# Custom metrics, mirroring packages/shared/src/lib/metrics.ts on the Node side.
_meter = get_meter_provider().get_meter("sitepulse-ai-agent")

ask_requests_counter = _meter.create_counter(
    "sitepulse_ai_agent_asks_total",
    description="Requests received on /ask, labeled by outcome",
)
agent_duration_histogram = _meter.create_histogram(
    "sitepulse_ai_agent_graph_duration_ms",
    description="Time for the LangGraph agent to produce a final answer",
    unit="ms",
)
tool_call_counter = _meter.create_counter(
    "sitepulse_ai_agent_tool_calls_total",
    description="Tool invocations made by the agent, labeled by tool name",
)