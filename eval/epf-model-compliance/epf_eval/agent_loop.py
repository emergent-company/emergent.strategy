"""Multi-turn agent loop that drives model conversations with simulated MCP tools.

The loop:
1. Sends the system prompt + user message to the model
2. If the model makes tool calls, looks up fixture responses and feeds them back
3. Repeats until the model stops making tool calls or we hit max turns
4. Returns the full conversation trace for scoring
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable

from .providers import ModelProvider
from .tools import ToolDef, get_all_tool_defs, get_fixture
from .types import Conversation, ToolCall, Turn

logger = logging.getLogger(__name__)

# Maximum turns to prevent infinite loops
MAX_TURNS = 10


def run_agent_loop(
    provider: ModelProvider,
    system_prompt: str,
    user_message: str,
    tools: list[ToolDef] | None = None,
    fixture_resolver: Callable[[str, dict[str, Any]], str] | None = None,
    max_turns: int = MAX_TURNS,
) -> Conversation:
    """Run a multi-turn agent conversation until the model stops calling tools.

    Args:
        provider: The model provider to use.
        system_prompt: System-level instructions (includes EPF agent instructions).
        user_message: The initial user task prompt.
        tools: Tool definitions to provide. Defaults to all EPF tools.
        fixture_resolver: Optional custom function (tool_name, args) -> response_json.
            Defaults to the standard fixture lookup.
        max_turns: Maximum number of assistant turns before stopping.

    Returns:
        Complete Conversation trace with all turns.
    """
    if tools is None:
        tools = get_all_tool_defs()

    if fixture_resolver is None:
        fixture_resolver = _default_fixture_resolver

    conversation = Conversation(
        system_prompt=system_prompt,
        user_messages=[user_message],
    )

    # Build initial messages
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_message}]

    for turn_num in range(max_turns):
        logger.info(f"Turn {turn_num + 1}/{max_turns} — sending to {provider.provider.value}/{provider.model}")

        try:
            turn = provider.send(system_prompt, messages, tools)
        except Exception as e:
            logger.error(f"Provider error: {e}")
            turn = Turn(content=f"[ERROR: {e}]", tool_calls=[])
            conversation.turns.append(turn)
            break

        # Track token usage
        if turn.raw and "usage" in turn.raw:
            usage = turn.raw["usage"]
            conversation.total_input_tokens += usage.get("input_tokens", 0) or usage.get("prompt_tokens", 0)
            conversation.total_output_tokens += usage.get("output_tokens", 0) or usage.get("completion_tokens", 0)

        conversation.turns.append(turn)

        # If no tool calls, we're done
        if not turn.tool_calls:
            logger.info(f"Turn {turn_num + 1}: model responded with text only — conversation complete")
            break

        logger.info(
            f"Turn {turn_num + 1}: model called {len(turn.tool_calls)} tool(s): "
            f"{[tc.tool_name for tc in turn.tool_calls]}"
        )

        # Add assistant turn to messages
        messages.append(provider.format_assistant_turn(turn))

        # Process each tool call and add results
        tool_results = []
        for i, tc in enumerate(turn.tool_calls):
            result_json = fixture_resolver(tc.tool_name, tc.arguments)
            tc.result = result_json  # store for scoring

            tool_call_id = _get_tool_call_id(turn, i, provider)
            tool_results.append(
                provider.format_tool_result(tool_call_id, tc.tool_name, result_json)
            )

        # Add tool results to messages
        # For Anthropic, all tool results go in one user message
        if provider.provider.value == "anthropic":
            combined_content = []
            for tr in tool_results:
                combined_content.extend(tr["content"])
            messages.append({"role": "user", "content": combined_content})
        else:
            # OpenAI and Google: each tool result is a separate message
            messages.extend(tool_results)

    return conversation


def _default_fixture_resolver(tool_name: str, args: dict[str, Any]) -> str:
    """Default fixture resolver — looks up pre-crafted responses."""
    return get_fixture(tool_name)


def _get_tool_call_id(turn: Turn, index: int, provider: ModelProvider) -> str:
    """Extract or generate a tool call ID for a given tool call."""
    if provider.provider.value == "anthropic":
        # Anthropic: tool_use blocks have IDs in the raw response
        return f"toolu_{index:04d}"
    elif provider.provider.value == "openai":
        return f"call_{index:04d}"
    else:
        return f"fc_{index:04d}"


def extract_all_tool_calls(conversation: Conversation) -> list[ToolCall]:
    """Extract all tool calls from a conversation in order."""
    calls = []
    for turn in conversation.turns:
        calls.extend(turn.tool_calls)
    return calls


def extract_tool_call_sequence(conversation: Conversation) -> list[str]:
    """Extract just the tool names called in order."""
    return [tc.tool_name for tc in extract_all_tool_calls(conversation)]


def get_first_tool_call(conversation: Conversation) -> ToolCall | None:
    """Get the very first tool call in the conversation."""
    for turn in conversation.turns:
        if turn.tool_calls:
            return turn.tool_calls[0]
    return None


def tool_was_called(conversation: Conversation, tool_name: str) -> bool:
    """Check if a specific tool was called at any point."""
    return tool_name in extract_tool_call_sequence(conversation)


def tool_called_before(conversation: Conversation, first: str, second: str) -> bool:
    """Check if `first` tool was called before `second` tool."""
    seq = extract_tool_call_sequence(conversation)
    try:
        return seq.index(first) < seq.index(second)
    except ValueError:
        return False
