from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """
    site_id/start_date/end_date are injected into tool calls via
    InjectedState (see tools.py) — the LLM never sees or controls them,
    it only sees the `messages` list. This is what makes it impossible
    for a prompt-injected or manipulated question to make a tool query a
    different site than the one the dashboard server already authorized.
    """

    messages: Annotated[list[BaseMessage], add_messages]
    site_id: str
    start_date: str  # ISO8601
    end_date: str  # ISO8601
