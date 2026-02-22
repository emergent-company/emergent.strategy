"""Eval scenarios that test specific EPF compliance behaviors.

Each scenario defines:
  - A user task prompt (what the model is asked to do)
  - A custom fixture resolver (so the model sees scenario-appropriate tool responses)
  - The compliance behaviors being tested
  - Scoring functions that analyze the conversation trace

The scenarios are designed so that a compliant model follows the structured
tool responses (required_next_tool_calls, wizard-first, tiered discovery)
while a non-compliant model falls back on pre-training heuristics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from .agent_loop import (
    extract_tool_call_sequence,
    get_first_tool_call,
    tool_called_before,
    tool_was_called,
)
from .tools import ToolDef, get_all_tool_defs, get_fixture
from .types import BehaviorScore, ComplianceBehavior, Conversation


@dataclass
class Scenario:
    """A single eval scenario."""

    id: str
    name: str
    description: str
    user_message: str
    behaviors: list[ComplianceBehavior]
    fixture_resolver: Callable[[str, dict[str, Any]], str] | None = None
    tools: list[ToolDef] | None = None  # defaults to all tools
    score_fn: Callable[[Conversation], list[BehaviorScore]] | None = None


# ---------------------------------------------------------------------------
# System prompt — shared across all scenarios
# This is a condensed version of the EPF AGENTS.md instructions
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an AI assistant working with the Emergent Product Framework (EPF).
You have access to EPF MCP tools for validation, health checking, and guided workflows.

## Mandatory Protocols

### 1. Wizard-First Workflow
Before creating or modifying any EPF artifact, you MUST:
1. Call `epf_get_wizard_for_task` with the task description
2. Retrieve the recommended wizard with `epf_get_wizard`
3. Follow the wizard's instructions to produce the artifact
4. Validate the result with `epf_validate_file`

**Never write EPF content without first consulting the appropriate wizard.**

### 2. Tiered Tool Discovery
EPF tools are organized into 3 tiers. **Start with Tier 1 only** — tool responses will \
tell you exactly what to call next via `required_next_tool_calls`.

| Tier | Tools | When |
|------|-------|------|
| **1. Essential** | `epf_health_check`, `epf_get_wizard_for_task`, `epf_validate_file` | Always start here |
| **2. Guided** | `epf_get_wizard`, `epf_get_template`, `epf_get_schema`, strategy query tools | When Tier 1 directs you |
| **3. Specialized** | All remaining tools | For specific tasks as needed |

### 3. Anti-Heuristic Warning
Do NOT use pre-training knowledge to guess EPF artifact structure, tool sequences, \
or validation rules. EPF has specific schemas, wizards, and workflows that differ from \
general knowledge. Always follow the structured `required_next_tool_calls` and \
`recommended_tool` fields in tool responses instead of inferring what to do next.

### 4. Validation-Always Workflow
After ANY change to an EPF YAML file, you MUST validate with `epf_validate_file`.

The EPF instance is at: docs/EPF/_instances/emergent
"""


# ---------------------------------------------------------------------------
# Scenario 1: Health Check → Follow required_next_tool_calls
# ---------------------------------------------------------------------------

def _score_health_check_compliance(conv: Conversation) -> list[BehaviorScore]:
    """Score whether the model follows required_next_tool_calls from health check."""
    scores = []
    seq = extract_tool_call_sequence(conv)

    # Behavior: FOLLOWS_REQUIRED_TOOL_CALLS
    # The health check fixture returns 4 required_next_tool_calls.
    # A compliant model should call at least the "urgent" ones.
    first = get_first_tool_call(conv)
    started_with_health = first is not None and first.tool_name == "epf_health_check"

    # Check if model called epf_get_wizard_for_task after health check (urgent items)
    called_wizard_for_task = tool_was_called(conv, "epf_get_wizard_for_task")
    followed_order = started_with_health and called_wizard_for_task

    # Check if any of the suggested tools were called
    suggested_tools = {"epf_get_wizard_for_task", "epf_validate_relationships", "epf_validate_with_plan"}
    called_suggested = suggested_tools.intersection(set(seq))

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.FOLLOWS_REQUIRED_TOOL_CALLS,
        passed=len(called_suggested) >= 2,  # called at least 2 of the 4 suggested tools
        evidence=(
            f"Tool sequence: {seq}. "
            f"Called {len(called_suggested)}/3 suggested tool types: {called_suggested}. "
            f"Started with health check: {started_with_health}."
        ),
        weight=2.0,  # high importance
    ))

    # Behavior: TIERED_DISCOVERY
    # Model should start with a Tier 1 tool
    tier1 = {"epf_health_check", "epf_get_wizard_for_task", "epf_validate_file"}
    started_tier1 = first is not None and first.tool_name in tier1

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.TIERED_DISCOVERY,
        passed=started_tier1,
        evidence=(
            f"First tool called: {first.tool_name if first else 'none'}. "
            f"Is Tier 1: {started_tier1}."
        ),
        weight=1.0,
    ))

    return scores


SCENARIO_HEALTH_CHECK = Scenario(
    id="health-check-compliance",
    name="Health Check → Follow Suggestions",
    description=(
        "Tests whether the model runs a health check and follows the "
        "required_next_tool_calls in the response."
    ),
    user_message=(
        "I just cloned the EPF instance at docs/EPF/_instances/emergent. "
        "Please check its health and fix any issues you find."
    ),
    behaviors=[
        ComplianceBehavior.FOLLOWS_REQUIRED_TOOL_CALLS,
        ComplianceBehavior.TIERED_DISCOVERY,
    ],
    score_fn=_score_health_check_compliance,
)


# ---------------------------------------------------------------------------
# Scenario 2: Create Feature Definition → Wizard First
# ---------------------------------------------------------------------------

def _score_wizard_before_write(conv: Conversation) -> list[BehaviorScore]:
    """Score whether the model consults a wizard before writing an artifact."""
    scores = []
    seq = extract_tool_call_sequence(conv)

    # Behavior: WIZARD_BEFORE_WRITE
    # Model must call epf_get_wizard_for_task → epf_get_wizard before producing YAML
    called_wizard_for_task = tool_was_called(conv, "epf_get_wizard_for_task")
    called_wizard = tool_was_called(conv, "epf_get_wizard")

    wizard_sequence_correct = (
        called_wizard_for_task
        and called_wizard
        and tool_called_before(conv, "epf_get_wizard_for_task", "epf_get_wizard")
    )

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.WIZARD_BEFORE_WRITE,
        passed=wizard_sequence_correct,
        evidence=(
            f"Tool sequence: {seq}. "
            f"Called wizard_for_task: {called_wizard_for_task}. "
            f"Called get_wizard: {called_wizard}. "
            f"Correct order: {wizard_sequence_correct}."
        ),
        weight=2.0,
    ))

    # Behavior: NO_INVENTED_STRUCTURE
    # Check if model called epf_get_template or epf_get_schema (getting structure from tools)
    # vs just writing YAML from memory
    got_template = tool_was_called(conv, "epf_get_template")
    got_schema = tool_was_called(conv, "epf_get_schema")
    consulted_structure = got_template or got_schema or called_wizard

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.NO_INVENTED_STRUCTURE,
        passed=consulted_structure,
        evidence=(
            f"Got template: {got_template}. Got schema: {got_schema}. "
            f"Got wizard: {called_wizard}. "
            f"Consulted at least one structural source: {consulted_structure}."
        ),
        weight=2.0,
    ))

    # Behavior: VALIDATES_AFTER_WRITE
    # Model should call epf_validate_file at some point
    validated = tool_was_called(conv, "epf_validate_file")

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.VALIDATES_AFTER_WRITE,
        passed=validated,
        evidence=f"Called epf_validate_file: {validated}. Sequence: {seq}.",
        weight=1.5,
    ))

    # Behavior: TIERED_DISCOVERY
    first = get_first_tool_call(conv)
    tier1 = {"epf_health_check", "epf_get_wizard_for_task", "epf_validate_file"}
    started_tier1 = first is not None and first.tool_name in tier1

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.TIERED_DISCOVERY,
        passed=started_tier1,
        evidence=f"First tool: {first.tool_name if first else 'none'}. Is Tier 1: {started_tier1}.",
        weight=1.0,
    ))

    return scores


SCENARIO_CREATE_FEATURE = Scenario(
    id="create-feature-wizard-first",
    name="Create Feature → Wizard First",
    description=(
        "Tests whether the model follows the wizard-first protocol when asked "
        "to create a new feature definition."
    ),
    user_message=(
        "Create a new feature definition for a 'Smart Search' capability in our product. "
        "It should allow users to search across knowledge base articles using semantic search. "
        "The EPF instance is at docs/EPF/_instances/emergent."
    ),
    behaviors=[
        ComplianceBehavior.WIZARD_BEFORE_WRITE,
        ComplianceBehavior.NO_INVENTED_STRUCTURE,
        ComplianceBehavior.VALIDATES_AFTER_WRITE,
        ComplianceBehavior.TIERED_DISCOVERY,
    ],
    score_fn=_score_wizard_before_write,
)


# ---------------------------------------------------------------------------
# Scenario 3: Structural Errors → Consult Wizard, Don't Brute-Force
# ---------------------------------------------------------------------------

def _fixture_structural_errors(tool_name: str, args: dict[str, Any]) -> str:
    """Fixture resolver that returns structural validation errors."""
    if tool_name == "epf_validate_file":
        return get_fixture("epf_validate_file", "structural_errors")
    if tool_name == "epf_get_wizard_for_task":
        return get_fixture("epf_get_wizard_for_task")
    return get_fixture(tool_name)


def _score_structural_error_handling(conv: Conversation) -> list[BehaviorScore]:
    """Score whether the model consults wizard for structural errors."""
    scores = []
    seq = extract_tool_call_sequence(conv)

    # Behavior: STRUCTURAL_ERROR_CLASSIFICATION
    # After seeing structural_issue: true and recommended_tool pointing to wizard,
    # the model should call epf_get_wizard_for_task (not just try to fix errors directly)
    called_wizard_for_task = tool_was_called(conv, "epf_get_wizard_for_task")
    called_wizard = tool_was_called(conv, "epf_get_wizard")

    # Check that wizard was called AFTER validate (i.e., model read the structural_issue flag)
    validate_then_wizard = (
        tool_was_called(conv, "epf_validate_file")
        and called_wizard_for_task
        and tool_called_before(conv, "epf_validate_file", "epf_get_wizard_for_task")
    )

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.STRUCTURAL_ERROR_CLASSIFICATION,
        passed=validate_then_wizard,
        evidence=(
            f"Tool sequence: {seq}. "
            f"Validate → wizard_for_task: {validate_then_wizard}. "
            f"Called wizard: {called_wizard}."
        ),
        weight=2.0,
    ))

    # Behavior: FOLLOWS_REQUIRED_TOOL_CALLS
    # The validation response includes recommended_tool — model should follow it
    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.FOLLOWS_REQUIRED_TOOL_CALLS,
        passed=called_wizard_for_task,
        evidence=(
            f"Validation returned recommended_tool pointing to epf_get_wizard_for_task. "
            f"Model called it: {called_wizard_for_task}."
        ),
        weight=1.5,
    ))

    return scores


SCENARIO_STRUCTURAL_ERRORS = Scenario(
    id="structural-error-wizard",
    name="Structural Errors → Consult Wizard",
    description=(
        "Tests whether the model recognizes structural validation errors and "
        "consults the wizard instead of brute-forcing fixes."
    ),
    user_message=(
        "Please validate the feature definition at FIRE/definitions/product/fd-014.yaml "
        "and fix any errors. Use ai_friendly=true for the validation."
    ),
    behaviors=[
        ComplianceBehavior.STRUCTURAL_ERROR_CLASSIFICATION,
        ComplianceBehavior.FOLLOWS_REQUIRED_TOOL_CALLS,
    ],
    fixture_resolver=_fixture_structural_errors,
    score_fn=_score_structural_error_handling,
)


# ---------------------------------------------------------------------------
# Scenario 4: Surface Errors → Fix Directly (No Wizard Needed)
# ---------------------------------------------------------------------------

def _fixture_surface_errors(tool_name: str, args: dict[str, Any]) -> str:
    """Fixture resolver that returns surface-level validation errors."""
    if tool_name == "epf_validate_file":
        return get_fixture("epf_validate_file", "surface_errors")
    return get_fixture(tool_name)


def _score_surface_error_handling(conv: Conversation) -> list[BehaviorScore]:
    """Score whether the model handles surface errors directly without wizard."""
    scores = []
    seq = extract_tool_call_sequence(conv)

    # Behavior: STRUCTURAL_ERROR_CLASSIFICATION (inverted test)
    # For surface errors (structural_issue: false), the model should NOT
    # need to call the wizard — it should fix errors directly based on fix_hints
    validated = tool_was_called(conv, "epf_validate_file")

    # Model should NOT call wizard_for_task for surface errors
    # (though calling it isn't wrong, it's unnecessary overhead)
    called_wizard = tool_was_called(conv, "epf_get_wizard_for_task")

    # The key signal: model should attempt to describe fixes or validate again
    # without going through the wizard pipeline
    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.STRUCTURAL_ERROR_CLASSIFICATION,
        passed=validated and not called_wizard,
        evidence=(
            f"Tool sequence: {seq}. "
            f"Validated: {validated}. Called wizard: {called_wizard}. "
            f"Surface errors (structural_issue=false) should be fixed directly."
        ),
        weight=1.5,
    ))

    return scores


SCENARIO_SURFACE_ERRORS = Scenario(
    id="surface-error-direct-fix",
    name="Surface Errors → Fix Directly",
    description=(
        "Tests whether the model correctly identifies surface errors and "
        "fixes them directly instead of unnecessarily consulting a wizard."
    ),
    user_message=(
        "Validate the feature definition at FIRE/definitions/product/fd-014.yaml "
        "(use ai_friendly=true) and tell me what needs fixing."
    ),
    behaviors=[
        ComplianceBehavior.STRUCTURAL_ERROR_CLASSIFICATION,
    ],
    fixture_resolver=_fixture_surface_errors,
    score_fn=_score_surface_error_handling,
)


# ---------------------------------------------------------------------------
# Scenario 5: Tiered Discovery — Don't Skip to Tier 3
# ---------------------------------------------------------------------------

def _score_tiered_discovery(conv: Conversation) -> list[BehaviorScore]:
    """Score whether the model respects tool tier ordering."""
    scores = []
    seq = extract_tool_call_sequence(conv)

    tier1 = {"epf_health_check", "epf_get_wizard_for_task", "epf_validate_file"}
    tier3 = {
        "epf_list_schemas", "epf_detect_artifact_type", "epf_agent_instructions",
        "epf_aim_bootstrap", "epf_fix_file",
    }

    first = get_first_tool_call(conv)
    started_tier1 = first is not None and first.tool_name in tier1

    # Check if any Tier 3 tool was called before any Tier 1 tool
    tier3_before_tier1 = False
    first_tier1_idx = None
    for i, name in enumerate(seq):
        if name in tier1 and first_tier1_idx is None:
            first_tier1_idx = i
        if name in tier3:
            if first_tier1_idx is None:
                tier3_before_tier1 = True
                break

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.TIERED_DISCOVERY,
        passed=started_tier1 and not tier3_before_tier1,
        evidence=(
            f"First tool: {first.tool_name if first else 'none'}. "
            f"Started with Tier 1: {started_tier1}. "
            f"Tier 3 before Tier 1: {tier3_before_tier1}. "
            f"Full sequence: {seq}."
        ),
        weight=1.5,
    ))

    return scores


SCENARIO_TIERED_DISCOVERY = Scenario(
    id="tiered-discovery",
    name="Tiered Discovery — Start with Tier 1",
    description=(
        "Tests whether the model starts with Tier 1 tools (health_check, "
        "wizard_for_task, validate_file) instead of jumping to specialized tools."
    ),
    user_message=(
        "I need to understand the current state of our EPF instance at "
        "docs/EPF/_instances/emergent and make sure everything is in order. "
        "What tools should I use and what's the status?"
    ),
    behaviors=[
        ComplianceBehavior.TIERED_DISCOVERY,
    ],
    score_fn=_score_tiered_discovery,
)


# ---------------------------------------------------------------------------
# Scenario 6: End-to-End — Full Feature Workflow
# ---------------------------------------------------------------------------

def _fixture_full_workflow(tool_name: str, args: dict[str, Any]) -> str:
    """Fixture resolver for the full workflow scenario."""
    if tool_name == "epf_health_check":
        return get_fixture("epf_health_check", "healthy")
    if tool_name == "epf_validate_file":
        # First validation returns errors, second returns clean
        return get_fixture("epf_validate_file")  # valid
    return get_fixture(tool_name)


def _score_full_workflow(conv: Conversation) -> list[BehaviorScore]:
    """Score the full end-to-end feature creation workflow."""
    scores = []
    seq = extract_tool_call_sequence(conv)

    # TIERED_DISCOVERY: starts with Tier 1
    first = get_first_tool_call(conv)
    tier1 = {"epf_health_check", "epf_get_wizard_for_task", "epf_validate_file"}
    started_tier1 = first is not None and first.tool_name in tier1

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.TIERED_DISCOVERY,
        passed=started_tier1,
        evidence=f"First tool: {first.tool_name if first else 'none'}.",
        weight=1.0,
    ))

    # WIZARD_BEFORE_WRITE: wizard consulted before producing artifact
    called_wizard_for_task = tool_was_called(conv, "epf_get_wizard_for_task")
    called_wizard = tool_was_called(conv, "epf_get_wizard")
    wizard_ok = called_wizard_for_task and called_wizard

    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.WIZARD_BEFORE_WRITE,
        passed=wizard_ok,
        evidence=f"wizard_for_task: {called_wizard_for_task}, get_wizard: {called_wizard}.",
        weight=2.0,
    ))

    # NO_INVENTED_STRUCTURE: consulted template or schema
    got_template = tool_was_called(conv, "epf_get_template")
    got_schema = tool_was_called(conv, "epf_get_schema")
    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.NO_INVENTED_STRUCTURE,
        passed=got_template or got_schema or called_wizard,
        evidence=f"template: {got_template}, schema: {got_schema}, wizard: {called_wizard}.",
        weight=2.0,
    ))

    # VALIDATES_AFTER_WRITE: validation was called
    validated = tool_was_called(conv, "epf_validate_file")
    scores.append(BehaviorScore(
        behavior=ComplianceBehavior.VALIDATES_AFTER_WRITE,
        passed=validated,
        evidence=f"epf_validate_file called: {validated}.",
        weight=1.5,
    ))

    return scores


SCENARIO_FULL_WORKFLOW = Scenario(
    id="full-feature-workflow",
    name="Full Feature Workflow (E2E)",
    description=(
        "End-to-end test: model must check health, consult wizard, get template, "
        "produce artifact content, and validate — all in the correct order."
    ),
    user_message=(
        "Create a new feature definition (fd-015) for 'Automated Report Generation' — "
        "the ability to generate investor memos and compliance documents from EPF data. "
        "Follow the full EPF workflow. Instance: docs/EPF/_instances/emergent."
    ),
    behaviors=[
        ComplianceBehavior.TIERED_DISCOVERY,
        ComplianceBehavior.WIZARD_BEFORE_WRITE,
        ComplianceBehavior.NO_INVENTED_STRUCTURE,
        ComplianceBehavior.VALIDATES_AFTER_WRITE,
    ],
    fixture_resolver=_fixture_full_workflow,
    score_fn=_score_full_workflow,
)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

ALL_SCENARIOS: list[Scenario] = [
    SCENARIO_HEALTH_CHECK,
    SCENARIO_CREATE_FEATURE,
    SCENARIO_STRUCTURAL_ERRORS,
    SCENARIO_SURFACE_ERRORS,
    SCENARIO_TIERED_DISCOVERY,
    SCENARIO_FULL_WORKFLOW,
]

SCENARIO_MAP: dict[str, Scenario] = {s.id: s for s in ALL_SCENARIOS}


def get_scenario(scenario_id: str) -> Scenario:
    """Get a scenario by ID."""
    if scenario_id not in SCENARIO_MAP:
        available = ", ".join(SCENARIO_MAP.keys())
        raise ValueError(f"Unknown scenario: {scenario_id}. Available: {available}")
    return SCENARIO_MAP[scenario_id]


def list_scenarios() -> list[dict[str, str]]:
    """List all scenarios with their IDs and descriptions."""
    return [
        {"id": s.id, "name": s.name, "description": s.description}
        for s in ALL_SCENARIOS
    ]
