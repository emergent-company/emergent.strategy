"""Shared data types for the EPF model compliance eval suite."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Provider(str, Enum):
    """Model provider."""

    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    GOOGLE = "google"


class ComplianceBehavior(str, Enum):
    """Discrete compliance behaviors we score."""

    # Does the model follow required_next_tool_calls from health check?
    FOLLOWS_REQUIRED_TOOL_CALLS = "follows_required_tool_calls"

    # Does the model call wizard before writing an artifact?
    WIZARD_BEFORE_WRITE = "wizard_before_write"

    # Does the model avoid inventing artifact structure from pre-training?
    NO_INVENTED_STRUCTURE = "no_invented_structure"

    # Does the model use tiered tool discovery (start with Tier 1)?
    TIERED_DISCOVERY = "tiered_discovery"

    # Does the model validate after writing?
    VALIDATES_AFTER_WRITE = "validates_after_write"

    # Does the model correctly interpret structural vs surface errors?
    STRUCTURAL_ERROR_CLASSIFICATION = "structural_error_classification"


@dataclass
class ToolCall:
    """A single tool call made by the model."""

    tool_name: str
    arguments: dict[str, Any]
    result: str | dict[str, Any] | None = None


@dataclass
class Turn:
    """A single turn in the conversation (assistant response)."""

    content: str  # text output from the model
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw: dict[str, Any] | None = None  # raw API response for debugging


@dataclass
class Conversation:
    """Full multi-turn conversation trace."""

    system_prompt: str
    user_messages: list[str]
    turns: list[Turn] = field(default_factory=list)
    total_input_tokens: int = 0
    total_output_tokens: int = 0


@dataclass
class BehaviorScore:
    """Score for a single compliance behavior."""

    behavior: ComplianceBehavior
    passed: bool
    evidence: str  # explanation of why it passed or failed
    weight: float = 1.0  # relative importance


@dataclass
class ScenarioResult:
    """Result of running one scenario against one model."""

    scenario_id: str
    scenario_name: str
    provider: Provider
    model: str
    conversation: Conversation
    scores: list[BehaviorScore] = field(default_factory=list)
    error: str | None = None  # if the scenario failed to run

    @property
    def compliance_rate(self) -> float:
        """Weighted compliance rate (0.0 - 1.0)."""
        if not self.scores:
            return 0.0
        total_weight = sum(s.weight for s in self.scores)
        passed_weight = sum(s.weight for s in self.scores if s.passed)
        return passed_weight / total_weight if total_weight > 0 else 0.0


@dataclass
class EvalRun:
    """Complete eval run across all scenarios and models."""

    run_id: str
    timestamp: str
    results: list[ScenarioResult] = field(default_factory=list)

    def summary_by_provider(self) -> dict[str, float]:
        """Average compliance rate per provider."""
        by_provider: dict[str, list[float]] = {}
        for r in self.results:
            by_provider.setdefault(r.provider.value, []).append(r.compliance_rate)
        return {p: sum(rates) / len(rates) for p, rates in by_provider.items()}

    def summary_by_behavior(self) -> dict[str, dict[str, float]]:
        """Pass rate per behavior per provider."""
        # behavior -> provider -> [passed, total]
        data: dict[str, dict[str, list[int]]] = {}
        for r in self.results:
            for s in r.scores:
                b = s.behavior.value
                p = r.provider.value
                if b not in data:
                    data[b] = {}
                if p not in data[b]:
                    data[b][p] = [0, 0]
                data[b][p][1] += 1
                if s.passed:
                    data[b][p][0] += 1
        return {
            b: {p: counts[0] / counts[1] if counts[1] else 0.0 for p, counts in providers.items()}
            for b, providers in data.items()
        }
