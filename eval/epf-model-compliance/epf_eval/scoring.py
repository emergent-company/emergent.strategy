"""Scoring and reporting for eval results.

This module:
  - Runs scenario scoring functions against conversation traces
  - Aggregates results across providers and behaviors
  - Produces human-readable reports and JSON output
"""

from __future__ import annotations

import json
import subprocess
from typing import Any

from .agent_loop import run_agent_loop
from .providers import ModelProvider
from .scenarios import SYSTEM_PROMPT, Scenario
from .types import BehaviorScore, Conversation, EvalRun, ScenarioResult


def _git_sha() -> str | None:
    """Get the current git commit SHA, or None if not in a git repo."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


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
    """Format eval results as JSON with metadata for comparison."""
    providers = sorted({r.provider.value for r in run.results})
    scenarios = sorted({r.scenario_id for r in run.results})
    models = sorted({f"{r.provider.value}:{r.model}" for r in run.results})
    total_in = sum(r.conversation.total_input_tokens for r in run.results)
    total_out = sum(r.conversation.total_output_tokens for r in run.results)

    data: dict[str, Any] = {
        "run_id": run.run_id,
        "timestamp": run.timestamp,
        "meta": {
            "git_sha": _git_sha(),
            "providers": providers,
            "models": models,
            "scenarios": scenarios,
            "total_evals": len(run.results),
            "total_tokens": {"input": total_in, "output": total_out},
        },
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


def compare_reports(baseline_path: str, current_path: str) -> str:
    """Compare two eval report JSON files and produce a diff summary.

    Args:
        baseline_path: Path to the baseline (older) report JSON.
        current_path: Path to the current (newer) report JSON.

    Returns:
        Human-readable comparison table.
    """
    with open(baseline_path) as f:
        baseline = json.load(f)
    with open(current_path) as f:
        current = json.load(f)

    lines: list[str] = []
    lines.append("=" * 90)
    lines.append("EPF Model Compliance — Report Comparison")
    lines.append(f"  Baseline: {baseline.get('run_id', '?')} ({baseline.get('timestamp', '?')[:19]})")
    lines.append(f"  Current:  {current.get('run_id', '?')} ({current.get('timestamp', '?')[:19]})")

    b_meta = baseline.get("meta", {})
    c_meta = current.get("meta", {})
    if b_meta.get("git_sha") or c_meta.get("git_sha"):
        lines.append(f"  Git SHA:  {b_meta.get('git_sha', '?')} → {c_meta.get('git_sha', '?')}")
    lines.append("=" * 90)
    lines.append("")

    # --- Provider-level comparison ---
    b_providers = baseline.get("summary", {}).get("by_provider", {})
    c_providers = current.get("summary", {}).get("by_provider", {})
    all_providers = sorted(set(b_providers) | set(c_providers))

    if all_providers:
        lines.append("COMPLIANCE BY PROVIDER")
        lines.append(f"  {'Provider':<20} {'Baseline':>10} {'Current':>10} {'Delta':>10}")
        lines.append("  " + "-" * 52)
        for p in all_providers:
            b_rate = b_providers.get(p, 0.0)
            c_rate = c_providers.get(p, 0.0)
            delta = c_rate - b_rate
            arrow = "+" if delta > 0 else "" if delta == 0 else ""
            icon = "▲" if delta > 0.005 else "▼" if delta < -0.005 else "="
            lines.append(
                f"  {p:<20} {b_rate:>9.0%} {c_rate:>9.0%} {icon} {arrow}{delta:>+.0%}"
            )
        lines.append("")

    # --- Behavior-level comparison ---
    b_behaviors = baseline.get("summary", {}).get("by_behavior", {})
    c_behaviors = current.get("summary", {}).get("by_behavior", {})
    all_behaviors = sorted(set(b_behaviors) | set(c_behaviors))
    all_prov_keys = sorted(set(b_providers) | set(c_providers))

    if all_behaviors:
        lines.append("COMPLIANCE BY BEHAVIOR (per provider)")
        lines.append(f"  {'Behavior':<35} {'Provider':<20} {'Base':>6} {'Curr':>6} {'Delta':>7}")
        lines.append("  " + "-" * 76)
        for behavior in all_behaviors:
            b_prov = b_behaviors.get(behavior, {})
            c_prov = c_behaviors.get(behavior, {})
            prov_keys = sorted(set(b_prov) | set(c_prov))
            for i, p in enumerate(prov_keys):
                label = behavior if i == 0 else ""
                b_val = b_prov.get(p, 0.0)
                c_val = c_prov.get(p, 0.0)
                delta = c_val - b_val
                icon = "▲" if delta > 0.005 else "▼" if delta < -0.005 else "="
                lines.append(
                    f"  {label:<35} {p:<20} {b_val:>5.0%} {c_val:>5.0%} {icon} {delta:>+.0%}"
                )
        lines.append("")

    # --- Scenario-level regressions / improvements ---
    b_results = {(r["provider"], r["scenario_id"]): r for r in baseline.get("results", [])}
    c_results = {(r["provider"], r["scenario_id"]): r for r in current.get("results", [])}
    all_keys = sorted(set(b_results) | set(c_results))

    improvements: list[str] = []
    regressions: list[str] = []
    for key in all_keys:
        b_r = b_results.get(key)
        c_r = c_results.get(key)
        b_rate = b_r["compliance_rate"] if b_r else 0.0
        c_rate = c_r["compliance_rate"] if c_r else 0.0
        delta = c_rate - b_rate
        if delta > 0.005:
            improvements.append(f"  ▲ [{key[0]:<10}] {key[1]:<35} {b_rate:.0%} → {c_rate:.0%}")
        elif delta < -0.005:
            regressions.append(f"  ▼ [{key[0]:<10}] {key[1]:<35} {b_rate:.0%} → {c_rate:.0%}")

    if improvements:
        lines.append(f"IMPROVEMENTS ({len(improvements)})")
        lines.extend(improvements)
        lines.append("")

    if regressions:
        lines.append(f"REGRESSIONS ({len(regressions)})")
        lines.extend(regressions)
        lines.append("")

    if not improvements and not regressions:
        lines.append("No changes in individual scenario scores.")
        lines.append("")

    return "\n".join(lines)


def _bar(rate: float, width: int = 20) -> str:
    """Render a progress bar."""
    filled = int(rate * width)
    return f"[{'█' * filled}{'░' * (width - filled)}]"
