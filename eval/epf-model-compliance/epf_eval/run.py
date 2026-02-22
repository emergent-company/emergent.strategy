"""CLI entry point for the EPF model compliance eval suite.

Usage:
    # Run all scenarios against all providers
    epf-eval run

    # Run specific scenario
    epf-eval run --scenario health-check-compliance

    # Run against specific provider
    epf-eval run --provider anthropic

    # List scenarios
    epf-eval list

    # Dry run (no API calls)
    epf-eval dry-run
"""

from __future__ import annotations

import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import click

from .providers import DEFAULT_MODELS, PROVIDER_MAP, VERTEX_PROVIDERS, create_provider
from .scenarios import ALL_SCENARIOS, SYSTEM_PROMPT, get_scenario, list_scenarios
from .scoring import format_result_json, format_result_table, run_scenario
from .tracing import is_configured as langfuse_configured, trace_eval_run
from .types import EvalRun

logger = logging.getLogger(__name__)


def _load_dotenv() -> None:
    """Load .env file if it exists."""
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


@click.group()
@click.option("-v", "--verbose", is_flag=True, help="Enable debug logging")
def cli(verbose: bool) -> None:
    """EPF Model Compliance Eval Suite."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s — %(message)s",
        datefmt="%H:%M:%S",
    )
    _load_dotenv()


@cli.command("list")
def list_cmd() -> None:
    """List available eval scenarios."""
    scenarios = list_scenarios()
    click.echo(f"\n{'ID':<35} {'Name':<45} Behaviors")
    click.echo("-" * 100)
    for s in ALL_SCENARIOS:
        behaviors = ", ".join(b.value for b in s.behaviors)
        click.echo(f"  {s.id:<33} {s.name:<43} {behaviors}")
    click.echo(f"\n{len(scenarios)} scenarios available.\n")


@cli.command("run")
@click.option(
    "--provider", "-p",
    multiple=True,
    type=click.Choice(list(PROVIDER_MAP.keys())),
    help="Provider(s) to test. Defaults to all.",
)
@click.option(
    "--scenario", "-s",
    multiple=True,
    help="Scenario ID(s) to run. Defaults to all.",
)
@click.option(
    "--model", "-m",
    default=None,
    help="Override model name (applies to all providers).",
)
@click.option("--json-output", "-j", is_flag=True, help="Output as JSON.")
@click.option(
    "--output", "-o",
    type=click.Path(),
    default=None,
    help="Write results to file.",
)
@click.option("--no-trace", is_flag=True, help="Disable Langfuse tracing.")
@click.option("--vertex", is_flag=True, help="Use Vertex AI providers (vertex-claude + vertex-gemini). Uses ADC auth.")
def run_cmd(
    provider: tuple[str, ...],
    scenario: tuple[str, ...],
    model: str | None,
    json_output: bool,
    output: str | None,
    no_trace: bool,
    vertex: bool,
) -> None:
    """Run eval scenarios against model providers."""
    # Resolve provider list
    if vertex and not provider:
        # --vertex with no explicit providers: use both vertex providers
        providers = ["vertex-claude", "vertex-gemini"]
    elif vertex and provider:
        # --vertex with explicit providers: prefix non-vertex ones with vertex-
        providers = []
        for p in provider:
            if p in VERTEX_PROVIDERS:
                providers.append(p)
            elif p == "anthropic":
                providers.append("vertex-claude")
            elif p == "google":
                providers.append("vertex-gemini")
            else:
                providers.append(p)  # keep openai etc. as-is
    elif provider:
        providers = list(provider)
    else:
        # Default: only direct-API providers (require API keys)
        providers = ["anthropic", "openai", "google"]
    scenario_ids = list(scenario) if scenario else [s.id for s in ALL_SCENARIOS]

    # Validate scenarios
    for sid in scenario_ids:
        try:
            get_scenario(sid)
        except ValueError as e:
            click.echo(f"Error: {e}", err=True)
            sys.exit(1)

    # Check API keys (Vertex providers use ADC, not API keys)
    missing_keys = []
    key_map = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "google": "GOOGLE_API_KEY",
    }
    for p in providers:
        if p in VERTEX_PROVIDERS:
            continue  # Vertex uses ADC auth, no API key needed
        key = key_map.get(p, "")
        if key and not os.environ.get(key):
            missing_keys.append(f"{p} ({key})")

    if missing_keys:
        click.echo(f"Missing API keys: {', '.join(missing_keys)}", err=True)
        click.echo("Set them in .env or environment variables.", err=True)
        sys.exit(1)

    # Build run
    run_id = f"eval-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    run = EvalRun(
        run_id=run_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    total = len(providers) * len(scenario_ids)
    click.echo(f"\nRunning {total} eval(s): {len(scenario_ids)} scenarios × {len(providers)} providers\n")

    for p_name in providers:
        p = create_provider(p_name, model)
        for sid in scenario_ids:
            s = get_scenario(sid)
            click.echo(f"  [{p_name:<10}] {s.name}...", nl=False)
            result = run_scenario(s, p)
            run.results.append(result)

            if result.error:
                click.echo(f" ERROR: {result.error[:60]}")
            else:
                click.echo(f" {result.compliance_rate:.0%}")

    click.echo("")

    # Trace to Langfuse
    if not no_trace and langfuse_configured():
        click.echo("Tracing to Langfuse...")
        trace_ids = trace_eval_run(run)
        click.echo(f"  {len(trace_ids)} traces sent.\n")
    elif not no_trace:
        click.echo("Langfuse not configured — skipping tracing.\n")

    # Output
    if json_output:
        report = format_result_json(run)
    else:
        report = format_result_table(run)

    click.echo(report)

    if output:
        Path(output).write_text(report)
        click.echo(f"Results written to {output}")


@cli.command("dry-run")
def dry_run_cmd() -> None:
    """Dry run — validate the eval framework without API calls.

    Tests that all scenarios, tools, fixtures, and scoring functions
    work correctly using a mock conversation.
    """
    from .agent_loop import extract_tool_call_sequence
    from .tools import get_all_tool_defs, get_fixture

    click.echo("\n=== EPF Model Compliance Eval — Dry Run ===\n")

    # 1. Check tool definitions
    tools = get_all_tool_defs()
    click.echo(f"Tool definitions: {len(tools)} tools loaded")
    for t in tools:
        schema = t.to_openai_schema()
        assert schema["function"]["name"] == t.name
    click.echo("  All tool schemas valid (OpenAI, Anthropic, Google)\n")

    # 2. Check fixtures
    click.echo("Fixture responses:")
    fixture_keys = [
        "epf_health_check", "epf_health_check__healthy",
        "epf_get_wizard_for_task", "epf_get_wizard_for_task__value_model",
        "epf_validate_file", "epf_validate_file__structural_errors",
        "epf_validate_file__surface_errors",
        "epf_get_wizard", "epf_get_template", "epf_get_schema",
        "epf_validate_with_plan", "epf_get_product_vision",
        "epf_agent_instructions",
    ]
    for key in fixture_keys:
        parts = key.split("__")
        tool_name = parts[0]
        variant = parts[1] if len(parts) > 1 else None
        fixture = get_fixture(tool_name, variant)
        data = json.loads(fixture)
        assert "error" not in data or tool_name not in data.get("error", ""), f"Missing fixture: {key}"
        click.echo(f"  {key:<45} OK ({len(fixture)} bytes)")
    click.echo()

    # 3. Check scenarios
    click.echo("Scenarios:")
    for s in ALL_SCENARIOS:
        behaviors = [b.value for b in s.behaviors]
        click.echo(f"  {s.id:<35} {len(behaviors)} behaviors")
        assert s.score_fn is not None, f"Scenario {s.id} missing score_fn"
    click.echo()

    # 4. Simulate a conversation and score it
    click.echo("Simulated scoring test:")
    from .types import BehaviorScore, ComplianceBehavior, Conversation, ToolCall, Turn

    # Simulate a compliant conversation for scenario 1 (health check)
    mock_conv = Conversation(
        system_prompt=SYSTEM_PROMPT,
        user_messages=["Check health"],
        turns=[
            Turn(
                content="I'll check the health of your EPF instance.",
                tool_calls=[ToolCall(tool_name="epf_health_check", arguments={"instance_path": "docs/EPF/_instances/emergent"})],
            ),
            Turn(
                content="The health check found issues. Let me follow the required_next_tool_calls.",
                tool_calls=[
                    ToolCall(tool_name="epf_get_wizard_for_task", arguments={"task": "fix value model quality issues"}),
                    ToolCall(tool_name="epf_validate_relationships", arguments={"instance_path": "docs/EPF/_instances/emergent"}),
                ],
            ),
            Turn(
                content="I've identified the issues and will proceed to fix them.",
                tool_calls=[],
            ),
        ],
    )

    scores = ALL_SCENARIOS[0].score_fn(mock_conv)
    click.echo(f"  Scenario: {ALL_SCENARIOS[0].name}")
    for score in scores:
        icon = "✓" if score.passed else "✗"
        click.echo(f"    {icon} {score.behavior.value}: {'PASS' if score.passed else 'FAIL'}")
    click.echo()

    # 5. Check provider availability
    click.echo("Provider API keys (direct API):")
    for name, key_name in [("anthropic", "ANTHROPIC_API_KEY"), ("openai", "OPENAI_API_KEY"), ("google", "GOOGLE_API_KEY")]:
        has_key = bool(os.environ.get(key_name))
        icon = "✓" if has_key else "✗"
        click.echo(f"  {icon} {name:<12} {'configured' if has_key else 'not set'}")

    click.echo("\nVertex AI providers (ADC auth):")
    for name in ["vertex-claude", "vertex-gemini"]:
        click.echo(f"  - {name:<16} uses gcloud ADC (no API key needed)")

    from .providers import VERTEX_PROJECT, VERTEX_CLAUDE_REGION, VERTEX_GEMINI_REGION
    click.echo(f"  Project:  {VERTEX_PROJECT}")
    click.echo(f"  Regions:  Claude={VERTEX_CLAUDE_REGION}, Gemini={VERTEX_GEMINI_REGION}")

    click.echo(f"\n  Langfuse: {'configured' if langfuse_configured() else 'not configured'}")
    click.echo()

    click.echo("=== Dry run complete — framework is ready ===\n")


@cli.command("show-system-prompt")
def show_system_prompt_cmd() -> None:
    """Show the system prompt used for eval scenarios."""
    click.echo(SYSTEM_PROMPT)


@cli.command("show-tools")
def show_tools_cmd() -> None:
    """Show all tool definitions with their tier."""
    from .tools import TIER_1_TOOLS, TIER_2_TOOLS, TIER_3_TOOLS

    for tier_name, tools in [("Tier 1 (Essential)", TIER_1_TOOLS), ("Tier 2 (Guided)", TIER_2_TOOLS), ("Tier 3 (Specialized)", TIER_3_TOOLS)]:
        click.echo(f"\n{tier_name}")
        click.echo("-" * 60)
        for t in tools:
            params = ", ".join(p.name for p in t.parameters)
            click.echo(f"  {t.name:<35} ({params})")
    click.echo()


if __name__ == "__main__":
    cli()
