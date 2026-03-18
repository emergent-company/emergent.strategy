// Package propagation implements the semantic strategy propagation circuit.
//
// The circuit follows a 5-step loop:
//  1. Signal arrives at a source node (a change was detected)
//  2. Query connected nodes via in-memory graph traversal
//  3. For each neighbor: check signal strength vs inertia threshold
//  4. If threshold met: evaluate with TieredReasoner
//  5. If verdict is "modified": apply proposed change, emit new signal (decayed)
//
// Five protection layers prevent runaway cascades:
//   - Signal decay (0.7× per hop, configurable)
//   - Temporal damping (60s cooldown per node)
//   - Oscillation detection (3+ evals → freeze)
//   - Token budget (50K/100K/200K per cascade)
//   - Change validation (schema check before apply)
//
// The circuit operates on an in-memory graph snapshot loaded from Memory once.
// It does NOT make live API calls per hop — traversal is microseconds.
package propagation

import (
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/reasoning"
)

// CascadeMode controls the circuit's budget and behavior.
type CascadeMode int

const (
	// ModeInteractive is for user-triggered analysis (lowest budget).
	ModeInteractive CascadeMode = iota

	// ModeAutomatic is for AIM-triggered cascades (medium budget).
	ModeAutomatic

	// ModeScenario is for what-if exploration (highest budget).
	ModeScenario
)

// String returns the mode name.
func (m CascadeMode) String() string {
	switch m {
	case ModeInteractive:
		return "interactive"
	case ModeAutomatic:
		return "automatic"
	case ModeScenario:
		return "scenario"
	default:
		return "unknown"
	}
}

// Config controls the propagation circuit behavior.
type Config struct {
	// DecayFactor is the signal strength multiplier per hop (default 0.7).
	DecayFactor float64

	// MinSignalStrength is the threshold below which signals are dropped (default 0.05).
	MinSignalStrength float64

	// DampingInterval is the minimum time between re-evaluations of the same node (default 60s).
	DampingInterval time.Duration

	// MaxEvaluationsPerNode is the oscillation detection limit (default 3).
	MaxEvaluationsPerNode int

	// TokenBudget is the maximum LLM tokens per cascade. Set by mode if zero.
	TokenBudget int

	// Mode controls budget defaults and behavior.
	Mode CascadeMode

	// DryRun prevents changes from being applied. The circuit still runs
	// evaluations but records them as proposed rather than applied.
	DryRun bool
}

// DefaultConfig returns a Config with conservative defaults.
func DefaultConfig() Config {
	return Config{
		DecayFactor:           0.7,
		MinSignalStrength:     0.05,
		DampingInterval:       60 * time.Second,
		MaxEvaluationsPerNode: 3,
		Mode:                  ModeInteractive,
	}
}

// TokenBudgetForMode returns the token budget for a cascade mode.
func TokenBudgetForMode(mode CascadeMode) int {
	switch mode {
	case ModeInteractive:
		return 50_000
	case ModeAutomatic:
		return 100_000
	case ModeScenario:
		return 200_000
	default:
		return 50_000
	}
}

// CascadeResult is the output of a propagation cascade.
type CascadeResult struct {
	// Trace records every evaluation that occurred during the cascade.
	Trace []NodeEvaluation

	// ProposedChanges are modifications proposed but not yet applied (DryRun or needs_review).
	ProposedChanges []ProposedChange

	// AppliedChanges are modifications that were applied to the graph.
	AppliedChanges []ProposedChange

	// FrozenNodes are nodes where oscillation was detected.
	FrozenNodes []string

	// SkippedNodes are nodes where signal was below threshold.
	SkippedNodes []SkippedNode

	// BudgetExhausted is true if the cascade was halted due to token budget.
	BudgetExhausted bool

	// TotalTokensUsed tracks cumulative token consumption.
	TotalTokensUsed int

	// Duration is the total cascade time.
	Duration time.Duration

	// Waves counts how many propagation waves completed.
	Waves int
}

// NodeEvaluation records a single evaluation during the cascade.
type NodeEvaluation struct {
	// NodeKey identifies the evaluated node.
	NodeKey string

	// NodeType is the graph object type.
	NodeType string

	// InertiaTier is the node's resistance to change.
	InertiaTier int

	// SignalStrength at the time of evaluation.
	SignalStrength float64

	// SignalSource is the key of the node that triggered this evaluation.
	SignalSource string

	// Assessment is the reasoner's output.
	Assessment *reasoning.Assessment

	// Wave is which cascade wave this evaluation occurred in.
	Wave int

	// Timestamp when the evaluation completed.
	Timestamp time.Time
}

// ProposedChange records a proposed or applied modification.
type ProposedChange struct {
	// NodeKey identifies the changed node.
	NodeKey string

	// NodeType is the graph object type.
	NodeType string

	// Changes maps property names to new values.
	Changes map[string]any

	// Classification is the change category.
	Classification reasoning.ChangeClassification

	// Reasoning explains why this change was proposed.
	Reasoning string

	// Applied is true if the change was written to the graph.
	Applied bool

	// Wave is which cascade wave produced this change.
	Wave int
}

// SkippedNode records a node that was not evaluated.
type SkippedNode struct {
	// NodeKey identifies the skipped node.
	NodeKey string

	// Reason explains why it was skipped.
	Reason string // "below_threshold", "damping", "budget_exhausted", "oscillation_frozen"

	// SignalStrength at the time of skipping (for below_threshold).
	SignalStrength float64
}

// Summary returns a human-readable summary of the cascade.
func (r *CascadeResult) Summary() string {
	return ""
}
