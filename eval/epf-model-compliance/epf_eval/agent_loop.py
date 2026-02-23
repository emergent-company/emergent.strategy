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
import time
from collections import Counter
from typing import Any, Callable

from .providers import ModelProvider, VERTEX_PROVIDERS
from .tools import ToolDef, get_all_tool_defs, get_fixture
from .types import Conversation, ToolCall, Turn

# Providers that use Anthropic's message format (tool_use blocks, combined tool results)
ANTHROPIC_FORMAT_PROVIDERS = {"anthropic", "vertex-claude", "vertex-claude-sonnet"}

logger = logging.getLogger(__name__)

# Maximum turns to prevent infinite loops
MAX_TURNS = 10

# Loop detection threshold — matches Go server's loopThreshold in tool_suggestions.go
_LOOP_THRESHOLD = 2

# Maps tool → suggested next tool when looping.
# NOTE: This differs slightly from the Go server's suggestNextToolForLoop() (L385-400)
# which maps wizard_for_task → get_wizard. In the eval, wizard_for_task responses
# include wizard_content_preview inline, so get_wizard is redundant. We skip ahead
# to epf_validate_file — the step the model actually misses.
# The Go server's params-based loop detection wouldn't even fire here (model varies
# the task arg text), so this eval-specific chain is justified.
_LOOP_NEXT_TOOL: dict[str, str] = {
    "epf_health_check": "epf_get_wizard_for_task",
    "epf_validate_file": "epf_get_wizard_for_task",
    "epf_get_wizard_for_task": "epf_validate_file",
    "epf_get_wizard": "epf_get_template",
    "epf_get_template": "epf_validate_file",
}


def _find_next_non_looping_tool(tool_name: str, looping_tools: set[str]) -> str:
    """Walk the suggestion chain to find the first tool that isn't also looping.

    When multiple tools loop simultaneously (e.g., epf_health_check and
    epf_get_wizard_for_task both called 3+ times), we must avoid suggesting
    a tool that is itself looping. Walk the chain:
      health_check → wizard_for_task → get_wizard → get_template → validate_file
    and return the first one NOT in looping_tools.
    """
    current = tool_name
    visited: set[str] = set()
    while current in _LOOP_NEXT_TOOL:
        next_tool = _LOOP_NEXT_TOOL[current]
        if next_tool in visited:
            break  # cycle guard
        if next_tool not in looping_tools:
            return next_tool
        visited.add(next_tool)
        current = next_tool
    return ""


def _build_loop_warning(tool_name: str, count: int, looping_tools: set[str] | None = None) -> str:
    """Build a loop warning preamble matching the Go server's buildCallCountWarning().

    The Go server (tool_suggestions.go L366-374) produces warnings when the same tool
    is called repeatedly. We use tool-name-only counting because eval fixtures are
    stateless — the result is always the same regardless of arguments.

    When looping_tools is provided, the suggestion walks the chain to skip tools
    that are also looping — avoiding contradictory directives.

    IMPORTANT: The wording must redirect the model to the next tool WITHOUT making
    it stop all tool calls entirely. "STOP" caused Gemini to halt completely.
    Instead, we focus on the positive action: "proceed to call X".
    """
    if looping_tools:
        suggested = _find_next_non_looping_tool(tool_name, looping_tools)
    else:
        suggested = _LOOP_NEXT_TOOL.get(tool_name, "")

    msg = (
        f"LOOP DETECTED: {tool_name} has been called {count} times and the result will not change. "
        f"Do not call {tool_name} again."
    )
    if suggested:
        msg += f" Instead, proceed by calling {suggested} now."
    msg += "\n\n"
    return msg


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

    # Call counting for loop detection — mirrors Go server's checkToolCallLoop()
    call_counts: Counter[str] = Counter()

    # Build initial messages
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_message}]

    for turn_num in range(max_turns):
        logger.info(f"Turn {turn_num + 1}/{max_turns} — sending to {provider.provider.value}/{provider.model}")

        # Retry with exponential backoff on 429 rate limiting
        max_retries = 3
        turn = None
        for attempt in range(max_retries + 1):
            try:
                turn = provider.send(system_prompt, messages, tools)
                break
            except Exception as e:
                err_str = str(e)
                is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "rate" in err_str.lower()
                if is_rate_limit and attempt < max_retries:
                    wait = 3 * (attempt + 1)  # 3s, 6s, 9s
                    logger.warning(f"Rate limited (attempt {attempt + 1}/{max_retries + 1}), retrying in {wait}s...")
                    time.sleep(wait)
                    continue
                logger.error(f"Provider error: {e}")
                turn = Turn(content=f"[ERROR: {e}]", tool_calls=[])
                conversation.turns.append(turn)
                break
        if turn and turn.content and turn.content.startswith("[ERROR:"):
            break
        assert turn is not None  # guaranteed by the retry loop above

        # Track token usage
        if turn.raw and "usage" in turn.raw:
            usage = turn.raw["usage"]
            conversation.total_input_tokens += (usage.get("input_tokens") or usage.get("prompt_tokens")) or 0
            conversation.total_output_tokens += (usage.get("output_tokens") or usage.get("completion_tokens")) or 0

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
        # Two-pass approach for loop detection:
        #   Pass 1: Count all tool calls in this turn to identify which will loop
        #   Pass 2: Build warnings with knowledge of ALL looping tools
        # This prevents contradictory warnings (e.g., health_check suggesting
        # wizard_for_task while wizard_for_task is also looping).

        # Pass 1: pre-count to identify all tools that will be looping after this turn
        pending_counts: dict[str, int] = {}
        for tc in turn.tool_calls:
            call_counts[tc.tool_name] += 1
            pending_counts[tc.tool_name] = call_counts[tc.tool_name]

        # Identify all tools that are looping (count > threshold)
        looping_tools = {
            name for name, count in call_counts.items()
            if count > _LOOP_THRESHOLD
        }

        # Pass 2: build results with loop-aware warnings
        tool_results = []
        for i, tc in enumerate(turn.tool_calls):
            result_json = fixture_resolver(tc.tool_name, tc.arguments)

            count = pending_counts[tc.tool_name]
            if count > _LOOP_THRESHOLD:
                warning = _build_loop_warning(tc.tool_name, count, looping_tools)
                logger.warning(
                    f"Loop detected: {tc.tool_name} called {count} times — injecting warning"
                )
                # Return ONLY the warning — omit the repeated JSON payload.
                # The model already has this data from the previous call, and the
                # large JSON response drowns out the directive text.
                result_json = warning

            tc.result = result_json  # store for scoring

            tool_call_id = _get_tool_call_id(turn, i, provider)
            tool_results.append(
                provider.format_tool_result(tool_call_id, tc.tool_name, result_json)
            )

        # Add tool results to messages
        # For Anthropic-format providers, all tool results go in one user message
        if provider.provider.value in ANTHROPIC_FORMAT_PROVIDERS:
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
    if provider.provider.value in ANTHROPIC_FORMAT_PROVIDERS:
        # Anthropic-format providers: tool_use blocks have IDs in the raw response
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
