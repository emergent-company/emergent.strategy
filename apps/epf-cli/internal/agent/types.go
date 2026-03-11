// Package agent provides agent discovery, loading, and recommendation for EPF.
//
// An Agent is a named AI persona with a defined purpose, personality, and set
// of skills. Agents replace the wizard/agent_prompt concept from earlier EPF
// versions. They are defined via agent.yaml manifests alongside prompt.md
// files, and support three-tier discovery (instance > framework > global).
//
// Legacy wizard files (.agent_prompt.md) are read as agents for backward
// compatibility.
package agent

import (
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
)

// AgentType classifies agents by their orchestration role.
type AgentType string

const (
	// AgentTypeGuide is for onboarding and navigation agents.
	AgentTypeGuide AgentType = "guide"

	// AgentTypeStrategist is for strategic planning agents (READY/AIM phases).
	AgentTypeStrategist AgentType = "strategist"

	// AgentTypeSpecialist is for domain-specific expertise agents (sub-wizards).
	AgentTypeSpecialist AgentType = "specialist"

	// AgentTypeArchitect is for design and structure agents (FIRE phase).
	AgentTypeArchitect AgentType = "architect"

	// AgentTypeReviewer is for quality assurance agents.
	AgentTypeReviewer AgentType = "reviewer"
)

// String returns the string representation of the agent type.
func (t AgentType) String() string {
	return string(t)
}

// AgentTypeFromString converts a string to AgentType with validation.
func AgentTypeFromString(s string) (AgentType, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "guide":
		return AgentTypeGuide, nil
	case "strategist":
		return AgentTypeStrategist, nil
	case "specialist":
		return AgentTypeSpecialist, nil
	case "architect":
		return AgentTypeArchitect, nil
	case "reviewer":
		return AgentTypeReviewer, nil
	default:
		return "", fmt.Errorf("unknown agent type: %q", s)
	}
}

// ValidAgentTypes returns all valid agent type values.
func ValidAgentTypes() []AgentType {
	return []AgentType{
		AgentTypeGuide,
		AgentTypeStrategist,
		AgentTypeSpecialist,
		AgentTypeArchitect,
		AgentTypeReviewer,
	}
}

// AgentSource indicates where an agent was discovered.
type AgentSource string

const (
	// SourceInstance is an agent in the EPF instance's agents/ directory.
	SourceInstance AgentSource = "instance"

	// SourceFramework is an agent in the canonical EPF agents/ (or wizards/) directory.
	SourceFramework AgentSource = "framework"

	// SourceGlobal is an agent in ~/.epf-cli/agents/.
	SourceGlobal AgentSource = "global"
)

// String returns a human-readable label for the source.
func (s AgentSource) String() string {
	switch s {
	case SourceInstance:
		return "Instance"
	case SourceFramework:
		return "EPF Framework"
	case SourceGlobal:
		return "Global"
	default:
		return string(s)
	}
}

// SourcePriority returns the priority of a source (lower is higher priority).
func SourcePriority(s AgentSource) int {
	switch s {
	case SourceInstance:
		return 0 // Highest priority
	case SourceFramework:
		return 1
	case SourceGlobal:
		return 2
	default:
		return 99
	}
}

// CapabilityClass hints at the computational complexity an agent requires,
// allowing the host runtime to select an appropriate model tier.
type CapabilityClass string

const (
	// CapabilityHighReasoning is for complex strategy, architecture, and multi-step analysis.
	CapabilityHighReasoning CapabilityClass = "high-reasoning"

	// CapabilityBalanced is for general creation, enrichment, and moderate complexity.
	CapabilityBalanced CapabilityClass = "balanced"

	// CapabilityFastExec is for simple validation, documentation, and formatting.
	CapabilityFastExec CapabilityClass = "fast-exec"
)

// ContextBudget hints at the context window requirements for an agent or skill.
type ContextBudget string

const (
	// ContextBudgetSmall is for prompts + output under ~8K tokens.
	ContextBudgetSmall ContextBudget = "small"

	// ContextBudgetMedium is for skills that need to read a few EPF files (8-32K tokens).
	ContextBudgetMedium ContextBudget = "medium"

	// ContextBudgetLarge is for skills that synthesize across many files (32K+ tokens).
	ContextBudgetLarge ContextBudget = "large"
)

// CapabilitySpec holds capability class and context budget metadata.
type CapabilitySpec struct {
	Class         CapabilityClass `yaml:"class,omitempty" json:"class,omitempty"`
	ContextBudget ContextBudget   `yaml:"context_budget,omitempty" json:"context_budget,omitempty"`
}

// IdentitySpec defines the agent's display identity and personality traits.
type IdentitySpec struct {
	DisplayName string   `yaml:"display_name" json:"display_name"`
	Description string   `yaml:"description" json:"description"`
	Personality []string `yaml:"personality,omitempty" json:"personality,omitempty"`
}

// RoutingSpec defines how hosts match tasks to this agent.
type RoutingSpec struct {
	TriggerPhrases []string `yaml:"trigger_phrases,omitempty" json:"trigger_phrases,omitempty"`
	Keywords       []string `yaml:"keywords,omitempty" json:"keywords,omitempty"`
}

// AgentSkillsSpec declares which skills this agent requires and optionally uses.
type AgentSkillsSpec struct {
	Required []string `yaml:"required,omitempty" json:"required,omitempty"`
	Optional []string `yaml:"optional,omitempty" json:"optional,omitempty"`
}

// AgentPrerequisitesSpec defines what must be present to use this agent.
type AgentPrerequisitesSpec struct {
	InstanceRequired bool `yaml:"instance_required,omitempty" json:"instance_required,omitempty"`
	LRARequired      bool `yaml:"lra_required,omitempty" json:"lra_required,omitempty"`
}

// AgentManifest represents the parsed agent.yaml file.
type AgentManifest struct {
	Name    string    `yaml:"name" json:"name"`
	Version string    `yaml:"version" json:"version"`
	Type    AgentType `yaml:"type" json:"type"`
	Phase   string    `yaml:"phase,omitempty" json:"phase,omitempty"` // READY, FIRE, AIM, or empty

	Identity   IdentitySpec    `yaml:"identity" json:"identity"`
	Capability *CapabilitySpec `yaml:"capability,omitempty" json:"capability,omitempty"`

	Routing       *RoutingSpec            `yaml:"routing,omitempty" json:"routing,omitempty"`
	Skills        *AgentSkillsSpec        `yaml:"skills,omitempty" json:"skills,omitempty"`
	Tools         *AgentToolsSpec         `yaml:"tools,omitempty" json:"tools,omitempty"`
	RelatedAgents []string                `yaml:"related_agents,omitempty" json:"related_agents,omitempty"`
	Prerequisites *AgentPrerequisitesSpec `yaml:"prerequisites,omitempty" json:"prerequisites,omitempty"`
}

// AgentToolsSpec declares which MCP tools this agent requires.
type AgentToolsSpec struct {
	Required []string `yaml:"required,omitempty" json:"required,omitempty"`
}

// AgentInfo contains full metadata about a discovered agent, combining manifest
// data with discovery context. The Content field is lazily loaded.
type AgentInfo struct {
	// Identity
	Name   string      `json:"name"`
	Source AgentSource `json:"source"`
	Path   string      `json:"path"` // Full path to agent directory or file

	// From manifest (or parsed from legacy wizard)
	Type    AgentType    `json:"type"`
	Phase   schema.Phase `json:"phase,omitempty"`
	Version string       `json:"version,omitempty"`

	// Display
	DisplayName string `json:"display_name"`
	Description string `json:"description"`

	// Capability hints
	Capability *CapabilitySpec `json:"capability,omitempty"`

	// Routing
	TriggerPhrases []string `json:"trigger_phrases,omitempty"`
	Keywords       []string `json:"keywords,omitempty"`

	// Relationships
	RequiredSkills []string `json:"required_skills,omitempty"`
	OptionalSkills []string `json:"optional_skills,omitempty"`
	RequiredTools  []string `json:"required_tools,omitempty"`
	RelatedAgents  []string `json:"related_agents,omitempty"`

	// Files
	HasManifest bool `json:"has_manifest"` // true if agent.yaml exists (vs legacy format)
	HasPrompt   bool `json:"has_prompt"`   // true if prompt.md or legacy .agent_prompt.md exists

	// Legacy format indicator
	LegacyFormat bool `json:"legacy_format,omitempty"` // true if loaded from .agent_prompt.md

	// Lazily loaded content
	contentLoaded bool
	Content       string `json:"content,omitempty"` // Full prompt content (loaded on demand)
}

// ContentLoaded returns whether the prompt content has been loaded.
func (a *AgentInfo) ContentLoaded() bool {
	return a.contentLoaded
}

// SetContent sets the prompt content and marks it as loaded.
func (a *AgentInfo) SetContent(content string) {
	a.Content = content
	a.contentLoaded = true
}

// Recommendation represents an agent recommendation for a task.
type Recommendation struct {
	Agent        *AgentInfo                   `json:"agent"`
	Confidence   string                       `json:"confidence"` // high, medium, low
	Reason       string                       `json:"reason"`
	Alternatives []*AlternativeRecommendation `json:"alternatives,omitempty"`
}

// AlternativeRecommendation represents an alternative agent for a task.
type AlternativeRecommendation struct {
	AgentName string `json:"agent_name"`
	Reason    string `json:"reason"`
}

// Default file and directory names.
const (
	ManifestFile = "agent.yaml"
	PromptFile   = "prompt.md"
	ReadmeFile   = "README.md"

	// Legacy file suffixes (for backward compatibility with wizards).
	LegacyAgentPromptSuffix = ".agent_prompt.md"
	LegacyWizardSuffix      = ".wizard.md"
	LegacySubWizardPattern  = "^[0-9]{2}_.*\\.agent_prompt\\.md$"

	// Directory names.
	InstanceDirName  = "agents"
	FrameworkDirName = "agents" // In canonical-epf; legacy: "wizards"
	GlobalDirName    = "agents" // In ~/.epf-cli/; legacy: none existed
)

// PhaseForAgent maps known agent names to their EPF phases.
// This is used for legacy agents that don't have a manifest with a phase field.
var PhaseForAgent = map[string]schema.Phase{
	// Onboarding (no phase)
	"onboarding-guide": "",
	"start_epf":        "", // legacy name

	// READY phase
	"ready-phase-strategist": schema.PhaseREADY,
	"lean-start-strategist":  schema.PhaseREADY,
	"pathfinder":             schema.PhaseREADY, // legacy name
	"lean_start":             schema.PhaseREADY, // legacy name

	// FIRE phase
	"fire-phase-architect": schema.PhaseFIRE,
	"product_architect":    schema.PhaseFIRE, // legacy name

	// AIM phase
	"aim-phase-strategist": schema.PhaseAIM,
	"synthesizer":          schema.PhaseAIM, // legacy name
}
