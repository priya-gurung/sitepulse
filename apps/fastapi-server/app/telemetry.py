from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.metrics import get_meter_provider, set_meter_provider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import start_http_server

from .config import Settings


def init_telemetry(settings: Settings) -> None:
    """
    Same shape as the Node services' initTelemetry: traces via OTLP/HTTP
    (pointed at the same Jaeger instance in docker-compose), metrics via
    a Prometheus scrape endpoint. Safe to call with no OTLP endpoint
    configured — spans just won't be exported anywhere.
    """
    resource = Resource(attributes={SERVICE_NAME: settings.OTEL_SERVICE_NAME})

    tracer_provider = TracerProvider(resource=resource)
    if settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        exporter = OTLPSpanExporter(
            endpoint=f"{settings.OTEL_EXPORTER_OTLP_ENDPOINT.rstrip('/')}/v1/traces"
        )
        tracer_provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(tracer_provider)

    reader = PrometheusMetricReader()
    set_meter_provider(MeterProvider(resource=resource, metric_readers=[reader]))
    start_http_server(port=settings.OTEL_PROMETHEUS_PORT)

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
