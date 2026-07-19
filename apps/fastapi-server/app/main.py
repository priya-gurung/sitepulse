import os
import asyncio
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from langchain_core.messages import HumanMessage, ToolMessage
from dotenv import load_dotenv
from .agent.graph import build_agent_graph
from .config import Settings, get_settings
from .schemas import AskRequest, AskResponse
from .telemetry import (
    agent_duration_histogram,
    ask_requests_counter,
    get_tracer,
    init_telemetry,
    instrument_app,
    tool_call_counter,
)
from .tinybird_client import TinybirdClient, TinybirdError
load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_telemetry(settings)

    if not settings.INTERNAL_AI_API_KEY:
        print(
            "[ai-agent] WARNING: INTERNAL_AI_API_KEY is not set — /ask is reachable "
            "by anyone who can route to this service. Set it in production and have "
            "the dashboard server send the matching X-Internal-Api-Key header."
        )

    async with httpx.AsyncClient(timeout=15.0) as http_client:
        tinybird = TinybirdClient(settings, http_client)
        app.state.agent_graph = build_agent_graph(settings, tinybird)
        app.state.settings = settings
        yield


app = FastAPI(
    title="SitePulse AI Agent",
    description="LangGraph agent answering questions about a site's analytics.",
    lifespan=lifespan,
)
instrument_app(app)


async def verify_internal_token(x_internal_api_key: str | None = Header(None,alias="X-Internal-Api-Key")):
    """
    Validates the shared secret the dashboard server sends. Only checked
    when INTERNAL_AI_API_KEY is configured, so local dev without it set
    still works — but production deployments should always set it.
    """
    load_dotenv(override=True)
    raw_token = os.getenv("TINYBIRD_READ_TOKEN")
    raw_host = os.getenv("TINYBIRD_HOST")
    expected_ai_key = os.getenv("INTERNAL_AI_API_KEY")
    
    # 3. Print the diagnostic output
    # print(f"[Tinybird Auth Debug] Raw token length via getenv: {len(raw_token) if raw_token else 'None/Undefined'}")
    # print(f"[Tinybird Auth Debug] Raw host string value: {raw_host}")
    # print(f"[FastAPI Env Check] Expected: {os.getenv('INTERNAL_AI_API_KEY')}")
    # print(f"[FastAPI Env Check] Received: {x_internal_api_key}")

    settings = get_settings()
    if settings.INTERNAL_AI_API_KEY and x_internal_api_key != expected_ai_key:
        raise HTTPException(status_code=401, detail="invalid_internal_token")


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "ai-agent"}


@app.post("/ask", response_model=AskResponse, dependencies=[Depends(verify_internal_token)])
async def ask(request: AskRequest) -> AskResponse:
    """
    Expects exactly the AskRequest shape the dashboard server sends:
        { site_id, question, date_range: { start_date, end_date } }

    By the time a request reaches here, the dashboard server has already
    authenticated the user's JWT and confirmed they own `site_id` — this
    service trusts that and does not re-derive ownership itself. It DOES
    still scope every analytics tool call to exactly this site_id via
    InjectedState, so the LLM has no path to query a different site even
    if the question tries to ask about one.
    """
    settings: Settings = app.state.settings
    tracer = get_tracer()
    start = time.perf_counter()

    with tracer.start_as_current_span("agent.ask") as span:
        span.set_attribute("sitepulse.site_id", request.site_id)

        initial_state = {
            "messages": [HumanMessage(content=request.question)],
            "site_id": request.site_id,
            "start_date": request.date_range.start_date.isoformat(),
            "end_date": request.date_range.end_date.isoformat(),
        }

        try:
            result = await asyncio.wait_for(
                app.state.agent_graph.ainvoke(
                    initial_state,
                    config={"recursion_limit": settings.AGENT_RECURSION_LIMIT},
                ),
                timeout=settings.REQUEST_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            ask_requests_counter.add(1, {"outcome": "timeout"})
            span.set_attribute("sitepulse.outcome", "timeout")
            raise HTTPException(status_code=504, detail="agent_timeout")
        except TinybirdError as err:
            # print(f"\n[Tinybird Pipeline Error Details]: STATUS: {err.status_code} | MSG: {str(err)}\n")
            ask_requests_counter.add(1, {"outcome": "tinybird_error"})
            span.set_attribute("sitepulse.outcome", "tinybird_error")
            raise HTTPException(status_code=502, detail="analytics_backend_unavailable") from err
        except Exception as err:  # noqa: BLE001 — deliberately broad: any agent failure -> 500
            ask_requests_counter.add(1, {"outcome": "error"})
            span.set_attribute("sitepulse.outcome", "error")
            raise HTTPException(status_code=500, detail="agent_failed") from err

        final_message = result["messages"][-1]
        answer = (
            final_message.content
            if isinstance(final_message.content, str)
            else str(final_message.content)
        )

        tools_used = sorted(
            {m.name for m in result["messages"] if isinstance(m, ToolMessage) and m.name}
        )
        for tool_name in tools_used:
            tool_call_counter.add(1, {"tool": tool_name})

        agent_duration_histogram.record((time.perf_counter() - start) * 1000)
        ask_requests_counter.add(1, {"outcome": "success"})
        span.set_attribute("sitepulse.outcome", "success")
        span.set_attribute("sitepulse.tools_used", ",".join(tools_used))

        return AskResponse(
            answer=answer,
            site_id=request.site_id,
            generated_at=datetime.now(timezone.utc),
            tools_used=tools_used,
        )
