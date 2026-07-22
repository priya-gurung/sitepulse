from langchain_core.messages import AIMessage
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode
from datetime import datetime, timezone

from ..config import Settings
from ..tinybird_client import TinybirdClient
from .llm import build_chat_model
from .prompts import SYSTEM_PROMPT
from .state import AgentState
from .tools import build_tools


def build_agent_graph(settings: Settings, tinybird: TinybirdClient):
    """
    Standard LangGraph ReAct loop, built explicitly rather than via the
    create_react_agent shortcut, so the tool-calling boundary is visible
    and controllable (recursion limit, injected state, etc.):

        START -> agent -> (has tool_calls?) -> tools -> agent -> ... -> END

    "agent" calls the LLM with tools bound; if the response requests
    tool calls, "tools" executes them (with InjectedState filled in) and
    loops back to "agent" with the results appended as ToolMessages.
    Once the LLM responds without requesting a tool call, the graph ends.
    """
    tools = build_tools(tinybird)
    model = build_chat_model(settings).bind_tools(tools)

    async def agent_node(state: AgentState) -> dict:
        messages = state["messages"]
        start_date = state.get("start_date")
        end_date = state.get("end_date")
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        formatted_system_prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"DATE CONTEXT:\n"
            f"- Today's Date is explicitly: {today_str}\n"
            f"- Query Filter Date Range: {start_date} to {end_date}\n"
            f"Use Today's Date ({today_str}) as your baseline when the user mentions relative terms like "
            f"'today', 'yesterday', 'this week', or 'last month'."
        )
        # Prepend the system prompt fresh each turn rather than storing it
        # in state — keeps it out of the persisted message history.
        response = await model.ainvoke([("system", formatted_system_prompt), *messages])
        return {"messages": [response]}

    def should_continue(state: AgentState) -> str:
        last_message = state["messages"][-1]
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            return "tools"
        return END

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(tools))

    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")

    return graph.compile()
