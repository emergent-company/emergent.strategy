// Package skillrun persists structured records of autonomous skill executions.
// Each Run tracks a multi-chunk LLM-driven skill execution from start to
// completion, including per-chunk progress, token usage, and trigger context.
package skillrun

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

// Trigger constants identify how a skill run was initiated.
const (
	TriggerManual   = "manual"    // run_skill MCP tool
	TriggerRipple   = "ripple"    // enqueueFoundationDraft after commit
	TriggerAIMCycle = "aim_cycle" // orchestrated AIM workflow step
)

// Status constants for a skill run.
const (
	StatusRunning   = "running"
	StatusCompleted = "completed"
	StatusFailed    = "failed"
)

// Run is a persisted record of an autonomous skill execution.
type Run struct {
	bun.BaseModel `bun:"table:skill_runs"`

	ID                uuid.UUID       `bun:"id,pk"                json:"id"`
	InstanceID        uuid.UUID       `bun:"instance_id"          json:"instance_id"`
	SkillName         string          `bun:"skill_name"           json:"skill_name"`
	Status            string          `bun:"status"               json:"status"`
	Trigger           string          `bun:"trigger"              json:"trigger"`
	TriggerContext    json.RawMessage `bun:"trigger_context,type:jsonb" json:"trigger_context"`
	StartedAt         time.Time       `bun:"started_at"           json:"started_at"`
	CompletedAt       *time.Time      `bun:"completed_at"         json:"completed_at,omitempty"`
	ChunkCount        int             `bun:"chunk_count"          json:"chunk_count"`
	ChunksCompleted   int             `bun:"chunks_completed"     json:"chunks_completed"`
	TotalInputTokens  int             `bun:"total_input_tokens"   json:"total_input_tokens"`
	TotalOutputTokens int             `bun:"total_output_tokens"  json:"total_output_tokens"`
	Model             string          `bun:"model"                json:"model"`
	BatchID           *uuid.UUID      `bun:"batch_id"             json:"batch_id,omitempty"`
	Error             *string         `bun:"error"                json:"error,omitempty"`
	ChunkLog          json.RawMessage `bun:"chunk_log,type:jsonb" json:"chunk_log"`
	CreatedAt         time.Time       `bun:"created_at"           json:"created_at"`
}

// DurationSeconds returns the elapsed wall-clock time for this run.
// Returns 0 if the run has not completed.
func (r *Run) DurationSeconds() float64 {
	if r.CompletedAt == nil {
		return time.Since(r.StartedAt).Seconds()
	}
	return r.CompletedAt.Sub(r.StartedAt).Seconds()
}

// ChunkEntry represents a single chunk execution record within the chunk_log.
type ChunkEntry struct {
	Chunk            int      `json:"chunk"`
	OutputKey        string   `json:"output_key"`
	ArtifactType     string   `json:"artifact_type,omitempty"`
	Status           string   `json:"status"` // "staged" or "failed"
	StartedAt        string   `json:"started_at"`
	CompletedAt      string   `json:"completed_at"`
	Attempts         int      `json:"attempts"`
	InputTokens      int      `json:"input_tokens"`
	OutputTokens     int      `json:"output_tokens"`
	Errors           []string `json:"errors,omitempty"`
	ContextTruncated bool     `json:"context_truncated,omitempty"`
	DroppedFeatures  int      `json:"dropped_features,omitempty"`
}

// CreateParams holds the parameters for creating a new skill run.
type CreateParams struct {
	InstanceID     uuid.UUID
	SkillName      string
	ChunkCount     int
	Model          string
	Trigger        string         // TriggerManual, TriggerRipple, TriggerAIMCycle
	TriggerContext map[string]any // optional context (signal IDs, run ID, etc.)
}

// ListParams holds optional filters for listing skill runs.
type ListParams struct {
	Status  string // filter by status
	Trigger string // filter by trigger type
	Limit   int    // max results (default 50)
}
