// Package compute provides inline execution of computational skills.
//
// Computational skills are deterministic algorithms compiled into the epf-cli
// binary. They replace LLM prompt-following for tasks like template rendering,
// graph algorithms, and arithmetic that code handles more reliably.
package compute

import (
	"context"
	"encoding/json"
	"time"
)

// SkillHandler is the interface that all inline skill implementations must satisfy.
type SkillHandler interface {
	// Execute runs the skill with the given input and returns a structured result.
	Execute(ctx context.Context, input *ExecutionInput) (*ExecutionResult, error)

	// Name returns the handler name (matches inline.handler in skill.yaml).
	Name() string
}

// ExecutionInput contains the input data for an inline skill execution.
type ExecutionInput struct {
	// InstancePath is the path to the EPF instance providing data.
	InstancePath string `json:"instance_path"`

	// Parameters are skill-specific key-value parameters.
	Parameters map[string]interface{} `json:"parameters,omitempty"`

	// SkillDir is the path to the skill directory (for script execution).
	SkillDir string `json:"skill_dir,omitempty"`

	// RawParameters is the unparsed JSON parameters (for forwarding to scripts).
	RawParameters json.RawMessage `json:"raw_parameters,omitempty"`
}

// ExecutionResult is the structured response from executing a skill.
type ExecutionResult struct {
	Success bool             `json:"success"`
	Output  *ExecutionOutput `json:"output,omitempty"`
	Log     *ExecutionLog    `json:"execution_log,omitempty"`
	Error   string           `json:"error,omitempty"`
}

// ExecutionOutput contains the skill's output data.
type ExecutionOutput struct {
	Format   string      `json:"format"`             // html, json, markdown, text
	Content  interface{} `json:"content"`            // The actual output
	Filename string      `json:"filename,omitempty"` // Suggested filename
}

// ExecutionLog records execution metadata for observability.
type ExecutionLog struct {
	Skill      string          `json:"skill"`
	DurationMs int64           `json:"duration_ms"`
	Steps      []ExecutionStep `json:"steps,omitempty"`
}

// ExecutionStep records one step within a skill execution.
type ExecutionStep struct {
	Name       string `json:"name"`
	Status     string `json:"status"` // success, failure
	DurationMs int64  `json:"duration_ms"`
	Details    string `json:"details,omitempty"`
}

// LogBuilder is a helper for building execution logs incrementally.
type LogBuilder struct {
	skill   string
	start   time.Time
	steps   []ExecutionStep
	current *stepTimer
}

type stepTimer struct {
	name  string
	start time.Time
}

// NewLogBuilder creates a new log builder for the given skill.
func NewLogBuilder(skill string) *LogBuilder {
	return &LogBuilder{
		skill: skill,
		start: time.Now(),
	}
}

// StartStep begins timing a new step.
func (b *LogBuilder) StartStep(name string) {
	b.current = &stepTimer{name: name, start: time.Now()}
}

// CompleteStep marks the current step as successful.
func (b *LogBuilder) CompleteStep(details string) {
	if b.current == nil {
		return
	}
	b.steps = append(b.steps, ExecutionStep{
		Name:       b.current.name,
		Status:     "success",
		DurationMs: time.Since(b.current.start).Milliseconds(),
		Details:    details,
	})
	b.current = nil
}

// FailStep marks the current step as failed.
func (b *LogBuilder) FailStep(details string) {
	if b.current == nil {
		return
	}
	b.steps = append(b.steps, ExecutionStep{
		Name:       b.current.name,
		Status:     "failure",
		DurationMs: time.Since(b.current.start).Milliseconds(),
		Details:    details,
	})
	b.current = nil
}

// Build creates the final ExecutionLog.
func (b *LogBuilder) Build() *ExecutionLog {
	return &ExecutionLog{
		Skill:      b.skill,
		DurationMs: time.Since(b.start).Milliseconds(),
		Steps:      b.steps,
	}
}
