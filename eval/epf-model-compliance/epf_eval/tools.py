"""EPF MCP tool definitions and fixture responses for the eval suite.

This module defines the simulated MCP tools that models interact with during eval.
Each tool has:
  - A definition (name, description, parameters) matching the real epf-cli MCP server
  - One or more fixture responses keyed by scenario context

The fixture responses are crafted from the real Go struct shapes in server.go
so models see exactly what they'd see from a live MCP server.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Tool definition format (matches OpenAI/Anthropic function-calling schema)
# ---------------------------------------------------------------------------


@dataclass
class ToolParam:
    name: str
    type: str
    description: str
    required: bool = False
    enum: list[str] | None = None


@dataclass
class ToolDef:
    name: str
    description: str
    parameters: list[ToolParam] = field(default_factory=list)

    def to_openai_schema(self) -> dict[str, Any]:
        """Convert to OpenAI function-calling tool schema."""
        props = {}
        required = []
        for p in self.parameters:
            prop: dict[str, Any] = {"type": p.type, "description": p.description}
            if p.enum:
                prop["enum"] = p.enum
            props[p.name] = prop
            if p.required:
                required.append(p.name)
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": props,
                    **({"required": required} if required else {}),
                },
            },
        }

    def to_anthropic_schema(self) -> dict[str, Any]:
        """Convert to Anthropic tool schema."""
        props = {}
        required = []
        for p in self.parameters:
            prop: dict[str, Any] = {"type": p.type, "description": p.description}
            if p.enum:
                prop["enum"] = p.enum
            props[p.name] = prop
            if p.required:
                required.append(p.name)
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": props,
                **({"required": required} if required else {}),
            },
        }

    def to_google_schema(self) -> dict[str, Any]:
        """Convert to Google Gemini function declaration."""
        props = {}
        required = []
        for p in self.parameters:
            prop: dict[str, Any] = {"type": p.type.upper(), "description": p.description}
            if p.enum:
                prop["enum"] = p.enum
            props[p.name] = prop
            if p.required:
                required.append(p.name)
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "OBJECT",
                "properties": props,
                **({"required": required} if required else {}),
            },
        }


# ---------------------------------------------------------------------------
# Tool definitions — subset of the 49 real tools, focused on the ones
# scenarios exercise. Grouped by tier.
# ---------------------------------------------------------------------------

TIER_1_TOOLS = [
    ToolDef(
        name="epf_health_check",
        description=(
            "Run a comprehensive health check on an EPF instance. "
            "RECOMMENDED FIRST STEP: Always run health check before starting work to assess scope. "
            "Returns structure validation, schema validation, content readiness, and workflow guidance. "
            "The response includes required_next_tool_calls that you MUST follow."
        ),
        parameters=[
            ToolParam("instance_path", "string", "Path to the EPF instance directory", required=True),
            ToolParam("detail_level", "string", "Level of detail: summary, warnings_only, full"),
        ],
    ),
    ToolDef(
        name="epf_get_wizard_for_task",
        description=(
            "Recommend the best wizard for a user's task. "
            "This is the MANDATORY first step before creating, modifying, or evaluating any EPF artifact. "
            "You MUST call this tool before writing feature definitions, roadmaps, assessments, or any other EPF content."
        ),
        parameters=[
            ToolParam("task", "string", "Description of what the user wants to do", required=True),
        ],
    ),
    ToolDef(
        name="epf_validate_file",
        description=(
            "Validate a local EPF YAML file against its schema. "
            "Automatically detects the artifact type from the filename/path pattern. "
            "Use ai_friendly=true for structured output with error classification and required_next_tool_calls."
        ),
        parameters=[
            ToolParam("path", "string", "The path to the YAML file to validate", required=True),
            ToolParam("ai_friendly", "string", "Return AI-friendly structured output (true/false, default: false)"),
        ],
    ),
]

TIER_2_TOOLS = [
    ToolDef(
        name="epf_get_wizard",
        description=(
            "Get the full content and metadata for an EPF wizard. "
            "MUST be called after epf_get_wizard_for_task identifies the right wizard."
        ),
        parameters=[
            ToolParam("name", "string", "The wizard name", required=True),
        ],
    ),
    ToolDef(
        name="epf_get_template",
        description="Get the starting template YAML for an EPF artifact type.",
        parameters=[
            ToolParam("artifact_type", "string", "The artifact type (e.g., 'feature_definition')", required=True),
        ],
    ),
    ToolDef(
        name="epf_get_schema",
        description="Get the JSON Schema for a specific EPF artifact type.",
        parameters=[
            ToolParam("artifact_type", "string", "The artifact type", required=True),
        ],
    ),
    ToolDef(
        name="epf_validate_with_plan",
        description=(
            "Validate a file and return a chunked fix plan for AI agents. "
            "Groups errors into manageable chunks with priorities and fix strategies."
        ),
        parameters=[
            ToolParam("path", "string", "The path to the YAML file to validate", required=True),
        ],
    ),
    ToolDef(
        name="epf_get_product_vision",
        description="Get the product's vision, mission, purpose, and values from the North Star artifact.",
        parameters=[
            ToolParam("instance_path", "string", "Path to the EPF instance directory", required=True),
        ],
    ),
    ToolDef(
        name="epf_get_personas",
        description="Get all personas (target users) from the EPF instance.",
        parameters=[
            ToolParam("instance_path", "string", "Path to the EPF instance directory", required=True),
        ],
    ),
    ToolDef(
        name="epf_get_roadmap_summary",
        description="Get roadmap summary with OKRs and key results.",
        parameters=[
            ToolParam("instance_path", "string", "Path to the EPF instance directory", required=True),
            ToolParam("track", "string", "Optional track name to filter"),
        ],
    ),
    ToolDef(
        name="epf_validate_relationships",
        description="Validate all relationship paths in features and KRs against the value model.",
        parameters=[
            ToolParam("instance_path", "string", "Path to the EPF instance directory", required=True),
        ],
    ),
    ToolDef(
        name="epf_get_section_example",
        description="Get a template example for a specific section of an artifact type.",
        parameters=[
            ToolParam("artifact_type", "string", "The artifact type", required=True),
            ToolParam("section", "string", "The section path to extract", required=True),
        ],
    ),
]

TIER_3_TOOLS = [
    ToolDef(
        name="epf_list_schemas",
        description="List all available EPF schemas.",
        parameters=[],
    ),
    ToolDef(
        name="epf_detect_artifact_type",
        description="Detect the EPF artifact type from a file path.",
        parameters=[
            ToolParam("path", "string", "The file path to analyze", required=True),
        ],
    ),
    ToolDef(
        name="epf_agent_instructions",
        description="Get comprehensive AI agent instructions for working with EPF.",
        parameters=[
            ToolParam("path", "string", "Optional path to check for EPF instance"),
        ],
    ),
    ToolDef(
        name="epf_aim_bootstrap",
        description="Create a Living Reality Assessment non-interactively.",
        parameters=[
            ToolParam("instance_path", "string", "Path to EPF instance", required=True),
        ],
    ),
    ToolDef(
        name="epf_fix_file",
        description="Auto-fix common issues in EPF YAML files.",
        parameters=[
            ToolParam("path", "string", "Path to the YAML file or directory to fix", required=True),
            ToolParam("dry_run", "string", "Preview changes (true/false, default: false)"),
        ],
    ),
]

ALL_TOOLS = TIER_1_TOOLS + TIER_2_TOOLS + TIER_3_TOOLS


def get_all_tool_defs() -> list[ToolDef]:
    return list(ALL_TOOLS)


# ---------------------------------------------------------------------------
# Fixture responses — keyed by (tool_name, scenario_variant)
# These match the JSON shapes from server.go structs.
# ---------------------------------------------------------------------------

# Default fixture responses (used when no scenario-specific one exists)
_DEFAULT_FIXTURES: dict[str, Any] = {
    # --- Tier 1 ---
    "epf_health_check": {
        "instance_path": "docs/EPF/_instances/emergent",
        "overall_status": "WARNINGS",
        "detail_level": "warnings_only",
        "instance_check": {
            "total": 27,
            "passed": 24,
            "failed": 3,
            "results": [
                {"path": "FIRE/definitions/product/fd-014.yaml", "passed": False, "message": "Schema validation failed: 12 errors"},
            ],
        },
        "content_readiness": {"score": 65, "total_files": 27, "files_with_placeholders": 5},
        "feature_quality": {"average_score": 72, "features_checked": 13, "below_threshold": 4},
        "value_model_quality": {"overall_score": 68, "issues": ["Product track: 3 L2 components lack L3 sub-components"]},
        "relationships": {"total_paths": 45, "valid_paths": 42, "invalid_paths": 3},
        "required_next_tool_calls": [
            {
                "tool": "epf_get_wizard_for_task",
                "params": {"task": "fix value model quality issues"},
                "reason": "Value model quality score 68/100 is below the 80 threshold — consult the value model wizard before making changes",
                "priority": "urgent",
            },
            {
                "tool": "epf_get_wizard_for_task",
                "params": {"task": "review feature quality"},
                "reason": "Feature quality average score 72% is below the 80% threshold",
                "priority": "urgent",
            },
            {
                "tool": "epf_validate_relationships",
                "params": {"instance_path": "docs/EPF/_instances/emergent"},
                "reason": "3 invalid contributes_to or KR target path(s) — run relationship validation for details",
                "priority": "recommended",
            },
            {
                "tool": "epf_validate_with_plan",
                "params": {"path": "FIRE/definitions/product/fd-014.yaml"},
                "reason": "Schema validation failed: 12 errors",
                "priority": "recommended",
            },
        ],
        "summary": "Instance has warnings: value model quality below threshold, feature quality below threshold, 3 invalid relationship paths, 1 file with schema errors.",
    },

    "epf_health_check__healthy": {
        "instance_path": "docs/EPF/_instances/emergent",
        "overall_status": "HEALTHY",
        "detail_level": "full",
        "instance_check": {"total": 27, "passed": 27, "failed": 0, "results": []},
        "content_readiness": {"score": 95, "total_files": 27, "files_with_placeholders": 1},
        "feature_quality": {"average_score": 88, "features_checked": 13, "below_threshold": 0},
        "value_model_quality": {"overall_score": 92, "issues": []},
        "relationships": {"total_paths": 45, "valid_paths": 45, "invalid_paths": 0},
        "required_next_tool_calls": [],
        "summary": "Instance is healthy. All checks passed.",
    },

    "epf_get_wizard_for_task": {
        "recommended": {
            "name": "feature_definition",
            "type": "wizard",
            "phase": "FIRE",
            "confidence": "high",
            "reason": "Task matches feature definition creation workflow",
        },
        "alternatives": [
            {"name": "product_architect", "type": "agent_prompt", "confidence": "medium"},
        ],
    },

    "epf_get_wizard_for_task__value_model": {
        "recommended": {
            "name": "value_model_review",
            "type": "wizard",
            "phase": "READY",
            "confidence": "high",
            "reason": "Task requires value model structural review",
        },
        "alternatives": [],
    },

    "epf_validate_file": {
        "file": "FIRE/definitions/product/fd-014.yaml",
        "artifact_type": "feature_definition",
        "valid": True,
        "error_count": 0,
        "structural_issue": False,
    },

    "epf_validate_file__structural_errors": {
        "file": "FIRE/definitions/product/fd-014.yaml",
        "artifact_type": "feature_definition",
        "valid": False,
        "error_count": 25,
        "structural_issue": True,
        "recommended_tool": {
            "tool": "epf_get_wizard_for_task",
            "params": {"task": "fix feature_definition structure"},
            "reason": "Structural issues detected (12 critical errors, 8 type mismatches in 25 total errors). Do NOT brute-force these fixes — consult the wizard first to understand the correct structure.",
            "priority": "urgent",
        },
        "errors_by_section": [
            {
                "section": "definition",
                "error_count": 15,
                "errors": [
                    {
                        "path": "definition.personas",
                        "error_type": "type_mismatch",
                        "priority": "critical",
                        "message": "Type mismatch: expected array of objects with 11 required fields, got array of strings",
                        "fix_hint": "Each persona requires id, name, role, technical_proficiency, current_situation, etc.",
                    },
                    {
                        "path": "definition.capabilities",
                        "error_type": "type_mismatch",
                        "priority": "critical",
                        "message": "Type mismatch: expected array of objects, got object",
                        "fix_hint": "Capabilities must be an array of {id, name, description} objects",
                    },
                ],
            },
            {
                "section": "implementation",
                "error_count": 10,
                "errors": [
                    {
                        "path": "implementation.contexts[0].type",
                        "error_type": "invalid_enum",
                        "priority": "high",
                        "message": "value must be one of 'ui', 'email', 'notification', 'api', 'report', 'integration'",
                        "fix_hint": "Use one of the allowed values",
                    },
                ],
            },
        ],
        "summary": {
            "critical_count": 12,
            "high_count": 8,
            "medium_count": 3,
            "low_count": 2,
            "suggested_fix_order": ["definition", "implementation"],
        },
    },

    "epf_validate_file__surface_errors": {
        "file": "FIRE/definitions/product/fd-014.yaml",
        "artifact_type": "feature_definition",
        "valid": False,
        "error_count": 3,
        "structural_issue": False,
        "errors_by_section": [
            {
                "section": "definition",
                "error_count": 3,
                "errors": [
                    {
                        "path": "definition.personas[2].technical_proficiency",
                        "error_type": "invalid_enum",
                        "priority": "high",
                        "message": "value must be one of 'basic', 'intermediate', 'advanced', 'expert'",
                        "fix_hint": "Use one of the allowed values: basic, intermediate, advanced, expert",
                    },
                    {
                        "path": "definition.personas[3].current_situation",
                        "error_type": "constraint_violation",
                        "priority": "medium",
                        "message": "String length 85 is less than minimum 200",
                        "fix_hint": "Expand the narrative to at least 200 characters",
                    },
                    {
                        "path": "strategic_context.contributes_to[0]",
                        "error_type": "pattern_mismatch",
                        "priority": "medium",
                        "message": "Does not match pattern ^(Product|Commercial|Strategy|OrgOps)\\.[A-Za-z]+\\.[A-Za-z]+",
                        "fix_hint": "Use format: Product.Layer.Component",
                    },
                ],
            },
        ],
        "summary": {"critical_count": 0, "high_count": 1, "medium_count": 2, "low_count": 0},
    },

    # --- Tier 2 ---
    "epf_get_wizard": {
        "name": "feature_definition",
        "type": "wizard",
        "phase": "FIRE",
        "content": (
            "# Feature Definition Wizard\n\n"
            "## Step 1: Job-to-be-Done\nDefine the JTBD using the format: "
            "'When I [situation], I want to [action], so I can [outcome].'\n\n"
            "## Step 2: Personas (exactly 4)\nEach persona requires 11 fields including "
            "current_situation (200+ chars), transformation_moment (200+ chars), "
            "emotional_resolution (200+ chars).\n\n"
            "## Step 3: Capabilities\nDefine 2-15 capabilities with id pattern cap-NNN.\n\n"
            "## Step 4: Contexts\nDefine implementation contexts with type from: "
            "ui, email, notification, api, report, integration.\n\n"
            "## Step 5: Validate\nRun epf_validate_file to check the result."
        ),
        "related_template": "feature_definition",
        "related_schema": "feature_definition_schema.json",
    },

    "epf_get_template": {
        "artifact_type": "feature_definition",
        "content": (
            "id: 'fd-NNN'\nname: 'Feature Name'\nslug: 'feature-name'\n"
            "status: 'draft'\n\nstrategic_context:\n  contributes_to:\n"
            "    - 'Product.Layer.Component'\n  tracks:\n    - 'product'\n\n"
            "definition:\n  job_to_be_done: |\n    When I [situation], I want to [action], "
            "so I can [outcome].\n  solution_approach: |\n    High-level approach...\n"
            "  personas:\n    - id: 'persona-1'\n      # ... 11 required fields\n"
            "  capabilities:\n    - id: 'cap-001'\n      name: 'Capability Name'\n"
            "      description: '...'\n"
        ),
    },

    "epf_get_schema": {
        "artifact_type": "feature_definition",
        "schema": {
            "type": "object",
            "required": ["id", "name", "slug", "status", "strategic_context", "definition", "implementation"],
            "properties": {
                "id": {"type": "string", "pattern": "^fd-[0-9]+$"},
                "status": {"type": "string", "enum": ["draft", "ready", "in-progress", "delivered"]},
                "definition": {
                    "type": "object",
                    "required": ["job_to_be_done", "solution_approach", "personas", "capabilities"],
                    "properties": {
                        "personas": {"type": "array", "minItems": 4, "maxItems": 4},
                        "capabilities": {"type": "array", "minItems": 1},
                    },
                },
            },
        },
    },

    "epf_validate_with_plan": {
        "file": "FIRE/definitions/product/fd-014.yaml",
        "artifact_type": "feature_definition",
        "total_errors": 12,
        "total_chunks": 3,
        "estimated_time": "6 minutes",
        "chunks": [
            {
                "id": "chunk-1",
                "section": "definition",
                "priority": "urgent",
                "error_count": 6,
                "fix_strategy": "Fix persona structure — each persona needs 11 required fields",
            },
            {
                "id": "chunk-2",
                "section": "implementation",
                "priority": "normal",
                "error_count": 4,
                "fix_strategy": "Fix context type enums and add missing key_interactions",
            },
            {
                "id": "chunk-3",
                "section": "strategic_context",
                "priority": "normal",
                "error_count": 2,
                "fix_strategy": "Fix contributes_to path format",
            },
        ],
    },

    "epf_get_product_vision": {
        "success": True,
        "data": {
            "vision": "A world where every product team has a living strategy that evolves with their market.",
            "mission": "Enable product teams to maintain strategic clarity through structured, AI-assisted frameworks.",
            "purpose": "Bridge the gap between strategic intent and execution reality.",
        },
    },

    "epf_get_personas": {
        "success": True,
        "data": {
            "personas": [
                {"id": "solo-founder", "name": "Alex", "role": "Solo Technical Founder"},
                {"id": "product-lead", "name": "Sarah", "role": "Product Lead at Growth Startup"},
                {"id": "strategy-consultant", "name": "Marcus", "role": "Strategy Consultant"},
            ],
        },
    },

    "epf_validate_relationships": {
        "valid": False,
        "stats": {"features_checked": 13, "krs_checked": 25, "total_paths": 45, "valid": 42, "invalid": 3},
        "errors": [
            {
                "source": "fd-014",
                "path": "Product.Core.Searchh",
                "error": "Component 'Searchh' not found in layer 'Core'",
                "suggestions": ["Product.Core.Search"],
            },
        ],
    },

    # --- Tier 3 ---
    "epf_agent_instructions": {
        "authority": {
            "tool": "epf-cli",
            "version": "0.17.0",
            "role": "EPF framework authority",
            "trust_level": "normative",
            "description": "epf-cli is the single source of truth for EPF validation, schemas, and workflows.",
        },
        "discovery": {
            "instance_found": True,
            "instance_path": "docs/EPF/_instances/emergent",
            "confidence": "high",
            "product_name": "Emergent",
        },
        "mandatory_protocols": [
            {
                "name": "Wizard-First Workflow",
                "description": "Before creating or modifying any EPF artifact, you MUST consult a wizard.",
                "steps": [
                    "Call epf_get_wizard_for_task with the task description",
                    "Retrieve the recommended wizard with epf_get_wizard",
                    "Follow the wizard's instructions",
                    "Validate with epf_validate_file",
                ],
            },
        ],
        "tool_tiers": [
            {
                "tier": 1,
                "label": "Essential",
                "description": "Entry points — always start here. Their responses guide you via required_next_tool_calls.",
                "tools": ["epf_health_check", "epf_get_wizard_for_task", "epf_validate_file"],
            },
            {
                "tier": 2,
                "label": "Guided",
                "description": "Use after Tier 1 directs you here.",
                "tools": ["epf_get_wizard", "epf_get_template", "epf_get_schema", "epf_validate_with_plan"],
            },
            {
                "tier": 3,
                "label": "Specialized",
                "description": "For specific tasks as needed.",
                "tools": ["epf_list_schemas", "epf_detect_artifact_type", "epf_agent_instructions"],
            },
        ],
        "tool_discovery_guidance": (
            "Start with Tier 1 tools ONLY. Their responses include required_next_tool_calls "
            "that tell you exactly what to call next. Do NOT skip tiers or use pre-training "
            "knowledge to guess tool sequences."
        ),
    },
}

# Scenario-specific fixture overrides
_SCENARIO_FIXTURES: dict[str, dict[str, Any]] = {}


def get_fixture(tool_name: str, variant: str | None = None) -> str:
    """Get the fixture JSON response for a tool call.

    Args:
        tool_name: The MCP tool name (e.g., "epf_health_check")
        variant: Optional variant suffix (e.g., "healthy", "structural_errors")

    Returns:
        JSON string matching the real MCP server response shape.
    """
    key = f"{tool_name}__{variant}" if variant else tool_name
    if key in _SCENARIO_FIXTURES:
        return json.dumps(_SCENARIO_FIXTURES[key], indent=2)
    if key in _DEFAULT_FIXTURES:
        return json.dumps(_DEFAULT_FIXTURES[key], indent=2)
    if tool_name in _DEFAULT_FIXTURES:
        return json.dumps(_DEFAULT_FIXTURES[tool_name], indent=2)
    return json.dumps({"error": f"Unknown tool: {tool_name}", "message": "Tool not found in eval fixtures"})


def register_scenario_fixture(tool_name: str, variant: str, fixture: dict[str, Any]) -> None:
    """Register a scenario-specific fixture override."""
    _SCENARIO_FIXTURES[f"{tool_name}__{variant}"] = fixture
