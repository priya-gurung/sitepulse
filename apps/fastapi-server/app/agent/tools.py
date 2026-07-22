from datetime import datetime
from typing import Annotated, Literal

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from ..tinybird_client import TinybirdClient
from .state import AgentState


def normalize_datetime(date_str: str | None, is_end_of_day: bool = False) -> str:
    """
    Ensures dates are formatted as 'YYYY-MM-DD HH:MM:SS' for Tinybird pipes.
    If the input is just 'YYYY-MM-DD', appends '00:00:00' (or '23:59:59' for end_date).
    """
    if not date_str:
        return ""

    target = date_str.strip()

    # If already formatted with space or T, normalize T to space
    if " " in target:
        return target
    if "T" in target:
        return target.replace("T", " ")

    # If formatted as YYYY-MM-DD, append appropriate time component
    try:
        parsed_date = datetime.strptime(target, "%Y-%m-%d")
        time_part = "23:59:59" if is_end_of_day else "00:00:00"
        return f"{parsed_date.strftime('%Y-%m-%d')} {time_part}"
    except ValueError:
        return target


def build_tools(tinybird: TinybirdClient) -> list:
    """
    Returns the tool list bound to a concrete TinybirdClient instance.
    Every tool takes `state: Annotated[AgentState, InjectedState]` as its
    only "site scoping" input — LangGraph injects the current graph state
    automatically and excludes that parameter from the schema the LLM
    sees, so the model can never pass a different site_id or date range
    than what this request was authorized for.
    """

    @tool
    async def get_overview_metrics(
        state: Annotated[AgentState, InjectedState],
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> dict:
        """Get total pageviews, unique visitors, and sessions for the site
        over the requested date range. Good first call for any traffic
        question — gives you the headline numbers before drilling in.
        If date_from and date_to (YYYY-MM-DD) are not provided, it defaults to the user's active UI date range."""

        query_start = normalize_datetime(date_from or state["start_date"], is_end_of_day=False)
        query_end = normalize_datetime(date_to or state["end_date"], is_end_of_day=True)

        rows = await tinybird.query_pipe(
            "overview_metrics",
            {
                "site_id": state["site_id"],
                "date_from": query_start,
                "date_to": query_end,
            },
        )
        return rows[0] if rows else {"pageviews": 0, "unique_visitors": 0, "sessions": 0}

    @tool
    async def get_pageviews_trend(
        state: Annotated[AgentState, InjectedState],
        granularity: Literal["hour", "day", "week", "month"] = "day",
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict]:
        """Get pageviews and unique visitors bucketed over time for the
        requested date range. Use this to answer questions about trends,
        spikes, drops, or how traffic changed day-to-day or week-to-week.
        Choose granularity based on the date range: "hour" for ranges
        under 2 days, "day" for up to ~2 months, "week" or "month" for
        longer ranges."""

        query_start = normalize_datetime(date_from or state["start_date"], is_end_of_day=False)
        query_end = normalize_datetime(date_to or state["end_date"], is_end_of_day=True)

        return await tinybird.query_pipe(
            "pageviews_by_granularity",
            {
                "site_id": state["site_id"],
                "date_from": query_start,
                "date_to": query_end,
                "granularity": granularity,
            },
        )

    @tool
    async def get_top_pages(
        state: Annotated[AgentState, InjectedState],
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict]:
        """Get the site's top pages by pageview count over the requested
        date range, each with its view count and unique visitor count.
        Use this for questions about which pages/content perform best."""

        query_start = normalize_datetime(date_from or state["start_date"], is_end_of_day=False)
        query_end = normalize_datetime(date_to or state["end_date"], is_end_of_day=True)

        return await tinybird.query_pipe(
            "top_pages",
            {
                "site_id": state["site_id"],
                "date_from": query_start,
                "date_to": query_end,
            },
        )

    @tool
    async def get_top_referrers(
        state: Annotated[AgentState, InjectedState],
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict]:
        """Get the site's top referring domains over the requested date
        range, each with visit count and unique visitor count. Use this
        for questions about where traffic is coming from, or which
        marketing/referral channels are driving visits."""

        query_start = normalize_datetime(date_from or state["start_date"], is_end_of_day=False)
        query_end = normalize_datetime(date_to or state["end_date"], is_end_of_day=True)

        return await tinybird.query_pipe(
            "top_referrers",
            {
                "site_id": state["site_id"],
                "date_from": query_start,
                "date_to": query_end,
            },
        )

    @tool
    async def get_visitor_geography(
        state: Annotated[AgentState, InjectedState],
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict]:
        """Get unique visitor counts broken down by country over the
        requested date range. Use this for questions about where
        visitors are located or international/regional traffic mix."""

        query_start = normalize_datetime(date_from or state["start_date"], is_end_of_day=False)
        query_end = normalize_datetime(date_to or state["end_date"], is_end_of_day=True)

        return await tinybird.query_pipe(
            "visitors_by_country",
            {
                "site_id": state["site_id"],
                "date_from": query_start,
                "date_to": query_end,
            },
        )

    return [
        get_overview_metrics,
        get_pageviews_trend,
        get_top_pages,
        get_top_referrers,
        get_visitor_geography,
    ]