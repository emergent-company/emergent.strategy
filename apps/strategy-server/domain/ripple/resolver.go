package ripple

import (
	"context"
	"encoding/json"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// SignalResolver generates fixes for autonomous-tier ripple signals.
//
// In server-orchestrated mode, this is an LLM-backed implementation that
// reads the signal, the current artifact payload, and produces an updated
// payload. In agent-orchestrated mode (MCP client drives), this is nil —
// the convergence loop detects and classifies only.
type SignalResolver interface {
	// Resolve attempts to generate a fix for a signal. Returns nil result
	// (not an error) if the resolver decides the signal cannot be auto-fixed.
	Resolve(ctx context.Context, signal *domain.RippleSignal, currentPayload json.RawMessage) (*ResolveResult, error)
}

// ResolveResult is the output of a signal resolution attempt.
type ResolveResult struct {
	// Updated is true if a fix was generated.
	Updated bool `json:"updated"`

	// NewPayload is the fixed artifact content (valid JSON).
	NewPayload json.RawMessage `json:"new_payload,omitempty"`

	// Explanation is a human-readable description of what was changed.
	Explanation string `json:"explanation,omitempty"`

	// Distance is the semantic distance of the fix (0-1). Used to track
	// cumulative change budget in the convergence loop.
	Distance float64 `json:"distance"`
}

// AutoCommitter writes resolved fixes to the strategy ledger.
// Separated from SignalResolver so the convergence loop controls the
// commit decision (damping checks happen between resolve and commit).
type AutoCommitter interface {
	// CommitFix writes a resolved fix as an autonomous mutation.
	// Returns the mutation ID.
	CommitFix(ctx context.Context, instanceID, signalID, artifactKey, artifactType string, payload json.RawMessage) error
}
