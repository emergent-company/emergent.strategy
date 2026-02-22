"""Langfuse tracing integration for the eval suite.

Traces each scenario run as a Langfuse trace with:
  - The system prompt and user message as the generation input
  - Each tool call as a span
  - Scoring results as Langfuse scores
  - Provider/model as metadata

Requires LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST env vars.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from .types import EvalRun, ScenarioResult

logger = logging.getLogger(__name__)

_langfuse = None


def _get_langfuse() -> Any:
    """Lazy-init Langfuse client."""
    global _langfuse
    if _langfuse is None:
        try:
            from langfuse import Langfuse

            _langfuse = Langfuse(
                public_key=os.environ.get("LANGFUSE_PUBLIC_KEY", ""),
                secret_key=os.environ.get("LANGFUSE_SECRET_KEY", ""),
                host=os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com"),
            )
        except Exception as e:
            logger.warning(f"Langfuse init failed: {e}. Tracing disabled.")
            return None
    return _langfuse


def is_configured() -> bool:
    """Check if Langfuse credentials are configured."""
    return bool(
        os.environ.get("LANGFUSE_PUBLIC_KEY")
        and os.environ.get("LANGFUSE_SECRET_KEY")
    )


def trace_scenario_result(result: ScenarioResult, run_id: str) -> str | None:
    """Trace a single scenario result to Langfuse.

    Returns the trace ID if successful, None otherwise.
    """
    lf = _get_langfuse()
    if lf is None:
        return None

    try:
        trace = lf.trace(
            name=f"epf-eval/{result.scenario_id}",
            session_id=run_id,
            metadata={
                "provider": result.provider.value,
                "model": result.model,
                "scenario_id": result.scenario_id,
                "scenario_name": result.scenario_name,
                "compliance_rate": result.compliance_rate,
                "error": result.error,
            },
            tags=["epf-eval", result.provider.value, result.scenario_id],
        )

        # Log the generation (system prompt + user message → model response)
        conv = result.conversation
        generation = trace.generation(
            name="agent-loop",
            model=result.model,
            input={
                "system": conv.system_prompt,
                "user": conv.user_messages[0] if conv.user_messages else "",
            },
            output={
                "turns": len(conv.turns),
                "tool_calls": [
                    {"tool": tc.tool_name, "args": tc.arguments}
                    for turn in conv.turns
                    for tc in turn.tool_calls
                ],
                "final_text": conv.turns[-1].content if conv.turns else "",
            },
            usage={
                "input": conv.total_input_tokens,
                "output": conv.total_output_tokens,
            },
            metadata={
                "tool_sequence": [
                    tc.tool_name
                    for turn in conv.turns
                    for tc in turn.tool_calls
                ],
            },
        )
        generation.end()

        # Log each tool call as a span
        for turn_idx, turn in enumerate(conv.turns):
            for tc_idx, tc in enumerate(turn.tool_calls):
                span = trace.span(
                    name=f"tool-call/{tc.tool_name}",
                    input=tc.arguments,
                    output=tc.result,
                    metadata={
                        "turn": turn_idx,
                        "tool_call_index": tc_idx,
                        "tool_name": tc.tool_name,
                    },
                )
                span.end()

        # Log scores
        for score in result.scores:
            trace.score(
                name=score.behavior.value,
                value=1.0 if score.passed else 0.0,
                comment=score.evidence[:500],
            )

        # Overall compliance score
        trace.score(
            name="compliance_rate",
            value=result.compliance_rate,
            comment=f"{result.compliance_rate:.0%} overall compliance",
        )

        return trace.id

    except Exception as e:
        logger.warning(f"Langfuse trace failed for {result.scenario_id}: {e}")
        return None


def trace_eval_run(run: EvalRun) -> list[str]:
    """Trace all results in an eval run. Returns list of trace IDs."""
    if not is_configured():
        logger.info("Langfuse not configured — skipping tracing")
        return []

    trace_ids = []
    for result in run.results:
        tid = trace_scenario_result(result, run.run_id)
        if tid:
            trace_ids.append(tid)

    # Flush
    lf = _get_langfuse()
    if lf:
        try:
            lf.flush()
        except Exception:
            pass

    return trace_ids
