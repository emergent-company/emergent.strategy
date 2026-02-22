"""Scoring and reporting for eval results.

This module:
  - Runs scenario scoring functions against conversation traces
  - Aggregates results across providers and behaviors
  - Produces human-readable reports and JSON output
"""

from __future__ import annotations

import json
from typing import Any

from .agent_loop import run_agent_loop
from .providers import ModelProvider
from .scenarios import SYSTEM_PROMPT, Scenario
from .types import BehaviorScore, Conversation, EvalRun, ScenarioResult


def run_scenario(
    scenario: Scenario,
    provider: ModelProvider,
) -> ScenarioResult:
    """Run a single scenario against a single provider and score it.

    Args:
        scenario: The scenario to run.
        provider: The model provider.

    Returns:
        ScenarioResult with conversation trace and scores.
    """
    try:
        conversation = run_agent_loop(
            provider=provider,
            system_prompt=SYSTEM_PROMPT,
            user_message=scenario.user_message,
            tools=scenario.tools,
            fixture_resolver=scenario.fixture_resolver,
        )
    except Exception as e:
        return ScenarioResult(
            scenario_id=scenario.id,
            scenario_name=scenario.name,
            provider=provider.provider,
            model=provider.model,
            conversation=Conversation(
                system_prompt=SYSTEM_PROMPT,
                user_messages=[scenario.user_message],
            ),
            error=str(e),
        )

    # Score the conversation
    scores: list[BehaviorScore] = []
    if scenario.score_fn:
        scores = scenario.score_fn(conversation)

    return ScenarioResult(
        scenario_id=scenario.id,
        scenario_name=scenario.name,
        provider=provider.provider,
        model=provider.model,
        conversation=conversation,
        scores=scores,
    )


def format_result_table(run: EvalRun) -> str:
    """Format eval results as an ASCII table."""
    lines = []
    lines.append("=" * 90)
    lines.append(f"EPF Model Compliance Eval — {run.run_id}")
    lines.append(f"Timestamp: {run.timestamp}")
    lines.append("=" * 90)
    lines.append("")

    # Summary by provider
    by_provider = run.summary_by_provider()
    lines.append("OVERALL COMPLIANCE BY PROVIDER")
    lines.append("-" * 50)
    for provider, rate in sorted(by_provider.items()):
        bar = _bar(rate)
        lines.append(f"  {provider:<12} {bar} {rate:.0%}")
    lines.append("")

    # Summary by behavior
    by_behavior = run.summary_by_behavior()
    if by_behavior:
        lines.append("COMPLIANCE BY BEHAVIOR")
        lines.append("-" * 70)
        providers = sorted({r.provider.value for r in run.results})
        header = f"  {'Behavior':<40}" + "".join(f"{p:<14}" for p in providers)
        lines.append(header)
        lines.append("  " + "-" * (40 + 14 * len(providers)))
        for behavior, provider_rates in sorted(by_behavior.items()):
            row = f"  {behavior:<40}"
            for p in providers:
                rate = provider_rates.get(p, 0.0)
                row += f"{rate:.0%}{'':<11}"
            lines.append(row)
        lines.append("")

    # Detailed results
    lines.append("DETAILED RESULTS")
    lines.append("-" * 90)
    for result in run.results:
        status = "ERROR" if result.error else f"{result.compliance_rate:.0%}"
        lines.append(
            f"  [{result.provider.value:<10}] {result.scenario_name:<40} → {status}"
        )
        if result.error:
            lines.append(f"    Error: {result.error}")
        for score in result.scores:
            icon = "✓" if score.passed else "✗"
            lines.append(f"    {icon} {score.behavior.value}")
            if not score.passed:
                lines.append(f"      Evidence: {score.evidence[:120]}")
    lines.append("")

    # Token usage
    total_in = sum(r.conversation.total_input_tokens for r in run.results)
    total_out = sum(r.conversation.total_output_tokens for r in run.results)
    lines.append(f"Total tokens: {total_in:,} input + {total_out:,} output = {total_in + total_out:,}")
    lines.append("")

    return "\n".join(lines)


def format_result_json(run: EvalRun) -> str:
    """Format eval results as JSON."""
    data: dict[str, Any] = {
        "run_id": run.run_id,
        "timestamp": run.timestamp,
        "summary": {
            "by_provider": run.summary_by_provider(),
            "by_behavior": run.summary_by_behavior(),
        },
        "results": [
            {
                "scenario_id": r.scenario_id,
                "scenario_name": r.scenario_name,
                "provider": r.provider.value,
                "model": r.model,
                "compliance_rate": r.compliance_rate,
                "error": r.error,
                "tool_sequence": [
                    tc.tool_name
                    for turn in r.conversation.turns
                    for tc in turn.tool_calls
                ],
                "scores": [
                    {
                        "behavior": s.behavior.value,
                        "passed": s.passed,
                        "evidence": s.evidence,
                        "weight": s.weight,
                    }
                    for s in r.scores
                ],
                "turns": len(r.conversation.turns),
                "tokens": {
                    "input": r.conversation.total_input_tokens,
                    "output": r.conversation.total_output_tokens,
                },
            }
            for r in run.results
        ],
    }
    return json.dumps(data, indent=2)


def _bar(rate: float, width: int = 20) -> str:
    """Render a progress bar."""
    filled = int(rate * width)
    return f"[{'█' * filled}{'░' * (width - filled)}]"
