// Package orchestration provides a general-purpose, interface-driven workflow engine.
// Callers define Workflow implementations; the Engine coordinates execution, human gates,
// and SSE event fanout. The persistence + dispatch backend is swappable via the Backend
// interface — today's implementation is the pgBackend in pkg/orchestration/pg.
package orchestration

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// ErrAlreadyActive is returned by Engine.StartRun when a run with the same
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

// StepLog records the outcome of a single step execution.
type StepLog struct {
	Name       string         `json:"name"`
	Status     string         `json:"status"` // pending | running | awaiting_human | done | failed
	BatchID    string         `json:"batch_id,omitempty"`
	Meta       map[string]any `json:"meta,omitempty"`
	StartedAt  *time.Time     `json:"started_at,omitempty"`
	FinishedAt *time.Time     `json:"finished_at,omitempty"`
	Error      string         `json:"error,omitempty"`
}

// StepResult is returned by a StepFunc to communicate what the step produced.
type StepResult struct {
	// BatchID is non-empty when this step staged a batch requiring human review.
	// Must be set when the enclosing Step has HumanGate: true.
	BatchID string
	// Artifact is an optional free-form output reference (document path, URL,
	// external ID) for steps that produce something other than a staged batch.
	// Stored in StepLog.Meta["artifact"]. Not used by AIM steps today.
	Artifact string
	// Meta holds arbitrary step output stored in StepLog.Meta (serialised to JSONB).
	Meta map[string]any
}

// StepFunc is the executable body of a workflow step.
type StepFunc func(ctx context.Context, run *Run) (StepResult, error)

// Step defines a single unit of work within a workflow.
type Step struct {
	// Name is unique within the workflow, e.g. "draft_assessment".
	Name string
	// Execute is called by the worker goroutine.
	Execute StepFunc
	// HumanGate: if true, the run pauses after Execute completes until the user
	// commits or discards the staged batch. Execute must return a non-empty BatchID.
	HumanGate bool
}

// EventType classifies an SSE event published by the Engine.
type EventType string

const (
	EventStepStarted    EventType = "step_started"
	EventStepFinished   EventType = "step_finished"
	EventAwaitingHuman  EventType = "awaiting_human"
	EventCompleted      EventType = "completed"
	EventAborted        EventType = "aborted"
	EventFailed         EventType = "failed"
)

// Event is published by the Engine fanout on each lifecycle transition.
type Event struct {
	Type    EventType `json:"type"`
	RunID   uuid.UUID `json:"run_id"`
	Step    string    `json:"step,omitempty"`
	BatchID string    `json:"batch_id,omitempty"`
	Status  RunStatus `json:"status"`
}
