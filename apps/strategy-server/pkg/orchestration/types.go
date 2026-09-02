// Package orchestration is the engine-agnostic contract an orchestration
// engine implements and callers (internal/handler, internal/mcpserver) depend
// on: EngineAPI, the Run/StepLog record shape, and the gate-lifecycle helpers
// in gate.go.
//
// It holds no concrete engine. internal/aimadk.ADKEngine is the only
// implementation of EngineAPI; a prior implementation — a Postgres-backed
// goroutine pool wrapping this package's own Engine type — was deleted once
// ADKEngine reached parity with it. This package's types outlived that
// deletion because ADKEngine deliberately reuses them rather than
// introducing a parallel shape: Run and StepLog are what the run panel and
// every handler already know how to render.
package orchestration

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ErrAlreadyActive is returned by EngineAPI.StartRun when a run with the same
// workflow name and concurrency key is already active.
var ErrAlreadyActive = errors.New("orchestration: a run is already active for this workflow and key")

// RunStatus is the lifecycle state of a workflow run.
type RunStatus string

const (
	StatusPending       RunStatus = "pending"
	StatusRunning       RunStatus = "running"
	StatusAwaitingHuman RunStatus = "awaiting_human"
	StatusCompleted     RunStatus = "completed"
	StatusAborted       RunStatus = "aborted"
	StatusFailed        RunStatus = "failed"
)

// Run is the persistent state record for one execution of a workflow.
type Run struct {
	ID             uuid.UUID      `json:"id"`
	WorkflowName   string         `json:"workflow_name"`
	ConcurrencyKey string         `json:"concurrency_key"`
	Input          map[string]any `json:"input"`
	Status         RunStatus      `json:"status"`
	CurrentStep    string         `json:"current_step"`
	Steps          []StepLog      `json:"steps"`
	Error          string         `json:"error,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// Gate outcomes. How a human review gate was resolved.
const (
	// GateCommitted — a reviewer approved the staged batch.
	GateCommitted = "committed"
	// GateDiscarded — a reviewer rejected the staged batch.
	GateDiscarded = "discarded"
	// GateAbandoned — nobody responded and the run was released by the sweep.
	GateAbandoned = "abandoned"
)

// StepLog records the outcome of a single step execution.
type StepLog struct {
	Name       string         `json:"name"`
	Status     string         `json:"status"` // pending | running | awaiting_human | done | failed
	BatchID    string         `json:"batch_id,omitempty"`
	Meta       map[string]any `json:"meta,omitempty"`
	StartedAt  *time.Time     `json:"started_at,omitempty"`
	FinishedAt *time.Time     `json:"finished_at,omitempty"`
	Error      string         `json:"error,omitempty"`

	// Gate lifecycle. These exist because FinishedAt marks the step *body*
	// returning, not the step completing: for a gated step the body finishes,
	// then the gate opens and may stay open indefinitely, and on resume the
	// awaiting_human status is overwritten with "done". Without separate
	// timestamps a gate a human cleared is indistinguishable afterwards from a
	// step that never gated, which makes review latency unmeasurable.
	//
	// All three are absent on steps that never gated, and on runs written
	// before this was recorded. Pointers rather than values so absent does not
	// read as the zero time.
	GateOpenedAt  *time.Time `json:"gate_opened_at,omitempty"`
	GateClearedAt *time.Time `json:"gate_cleared_at,omitempty"`
	GateOutcome   string     `json:"gate_outcome,omitempty"`
}

// GateWait reports how long this step waited for human review, and whether
// that is known. It is unknown for steps that never gated, for gates still
// open, and for runs written before the gate lifecycle was recorded.
func (s StepLog) GateWait() (time.Duration, bool) {
	if s.GateOpenedAt == nil || s.GateClearedAt == nil {
		return 0, false
	}
	return s.GateClearedAt.Sub(*s.GateOpenedAt), true
}

// GateOpenFor reports how long a currently-open gate has been waiting.
func (s StepLog) GateOpenFor(now time.Time) (time.Duration, bool) {
	if s.GateOpenedAt == nil || s.GateClearedAt != nil {
		return 0, false
	}
	return now.Sub(*s.GateOpenedAt), true
}
