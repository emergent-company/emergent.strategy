// Package reasoning provides the tiered LLM reasoning engine for the semantic
// strategy runtime. It evaluates whether graph nodes need to change when a
// signal reaches them during propagation.
//
// The engine uses three reasoning tiers:
//
//	Local (Ollama)   — tier 5-7 artifacts (features, capabilities, value models)
//	Cloud (mid-tier) — tier 3-4 artifacts (strategy formula, roadmap)
//	Frontier         — tier 1-2 artifacts (north star, insights)
//
// Each tier uses progressively more capable (and expensive) models. The
// TieredReasoner routes by inertia tier and escalates when confidence is low.
package reasoning

// Reasoner evaluates whether a target node needs to change given a signal.
// This is the core interface called by the propagation circuit.
type Reasoner interface {
	// Evaluate assesses whether the target node should change in response
	// to a signal (a change at a connected node). The neighborhood provides
	// semantic context — other nodes connected to the target.
	//
	// Returns an Assessment with the verdict (unchanged, modified, needs_review),
	// proposed changes if any, and confidence in the assessment.
	Evaluate(req EvaluationRequest) (*Assessment, error)
}

// EvaluationRequest contains everything the reasoner needs to evaluate a node.
type EvaluationRequest struct {
	// Signal describes what changed and triggered this evaluation.
	Signal Signal

	// Target is the node being evaluated — should it change?
	Target Node

	// Neighborhood is the set of nodes directly connected to the target,
	// providing semantic context for the evaluation.
	Neighborhood []Node

	// Constraints are schema rules the response must satisfy (field lengths,
	// enum values, etc.). Derived from the EPF JSON schema for the target's
	// artifact type.
	Constraints []Constraint
}

// Signal describes a change that triggered evaluation.
type Signal struct {
	// SourceNodeKey identifies the node that changed.
	SourceNodeKey string

	// SourceNodeType is the graph object type (e.g., "Belief", "Feature").
	SourceNodeType string

	// ChangeType classifies the change: "content_modified", "created", "deleted".
	ChangeType string

	// Description is a human-readable summary of what changed.
	Description string

	// Strength is the current signal strength (0.0 to 1.0), decayed per hop.
	Strength float64

	// Before is the previous content of the changed node (empty for "created").
	Before string

	// After is the new content of the changed node (empty for "deleted").
	After string
}

// Node represents a graph object in the evaluation context.
type Node struct {
	// Key is the object key (e.g., "Belief:north_star:purpose").
	Key string

	// Type is the schema object type (e.g., "Belief", "Feature", "OKR").
	Type string

	// InertiaTier is the node's resistance to change (1=highest, 7=lowest).
	InertiaTier int

	// Properties holds the node's current content as key-value pairs.
	Properties map[string]any

	// EdgeTypes lists the relationship types connecting this node to the target.
	// Only populated for neighborhood nodes.
	EdgeTypes []string
}

// Constraint represents a schema constraint that proposed changes must satisfy.
type Constraint struct {
	// Field is the property path (e.g., "statement", "description").
	Field string

	// Type is the constraint type: "maxLength", "minLength", "enum", "pattern".
	Type string

	// Value is the constraint value (e.g., "500" for maxLength, "draft,ready,delivered" for enum).
	Value string
}

// Assessment is the result of evaluating a node.
type Assessment struct {
	// Verdict is the evaluation outcome.
	Verdict Verdict

	// Confidence is how certain the reasoner is (0.0 to 1.0).
	// Low confidence may trigger escalation to a higher reasoning tier.
	Confidence float64

	// Reasoning explains why this verdict was reached.
	Reasoning string

	// ProposedChanges maps property names to their new values.
	// Only populated when Verdict is VerdictModified.
	ProposedChanges map[string]any

	// ChangeClassification categorizes the proposed change.
	Classification ChangeClassification

	// ModelUsed identifies which model produced this assessment.
	ModelUsed string

	// TokensUsed tracks token consumption for budget enforcement.
	TokensUsed TokenUsage
}

// Verdict represents the evaluation outcome.
type Verdict string

const (
	// VerdictUnchanged means the target node doesn't need to change.
	VerdictUnchanged Verdict = "unchanged"

	// VerdictModified means the target node should be modified.
	// ProposedChanges contains the new property values.
	VerdictModified Verdict = "modified"

	// VerdictNeedsReview means the evaluation is uncertain and needs human review.
	// Used for high-inertia nodes or when confidence is too low.
	VerdictNeedsReview Verdict = "needs_review"

	// VerdictNeedsCreation means a new node should be created (e.g., new cross-reference).
	VerdictNeedsCreation Verdict = "needs_creation"
)

// ChangeClassification categorizes the type of change proposed.
type ChangeClassification string

const (
	// ClassMechanical is a deterministic change (path rename, status update).
	// Can be auto-applied without review.
	ClassMechanical ChangeClassification = "mechanical"

	// ClassSemantic is a meaning-level change (rewording, realignment).
	// Should be proposed for review.
	ClassSemantic ChangeClassification = "semantic"

	// ClassStructural is a structural change (new dependencies, reorganization).
	// Requires approval.
	ClassStructural ChangeClassification = "structural"

	// ClassCreative requires generating new content or artifacts.
	// Always requires human review and likely frontier-model reasoning.
	ClassCreative ChangeClassification = "creative"
)

// TokenUsage tracks token consumption for a single evaluation.
type TokenUsage struct {
	InputTokens  int
	OutputTokens int
}

// Total returns the total token count.
func (t TokenUsage) Total() int {
	return t.InputTokens + t.OutputTokens
}

// ModelTier represents the reasoning tier for model selection.
type ModelTier int

const (
	// TierLocal uses a local SLM (Ollama) — free, fast (~100ms).
	TierLocal ModelTier = iota

	// TierCloud uses a mid-tier cloud model — ~$0.01/eval, ~1-2s.
	TierCloud

	// TierFrontier uses a frontier model — ~$0.05-0.10/eval, ~3-5s.
	TierFrontier
)

// String returns a human-readable tier name.
func (t ModelTier) String() string {
	switch t {
	case TierLocal:
		return "local"
	case TierCloud:
		return "cloud"
	case TierFrontier:
		return "frontier"
	default:
		return "unknown"
	}
}

// TierForInertia maps an inertia tier (1-7) to a model tier.
func TierForInertia(inertiaTier int) ModelTier {
	switch {
	case inertiaTier >= 5:
		return TierLocal
	case inertiaTier >= 3:
		return TierCloud
	default:
		return TierFrontier
	}
}
