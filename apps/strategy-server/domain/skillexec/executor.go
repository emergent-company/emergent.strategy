// Package skillexec provides the unified skill executor — the single engine
// that runs prompt-mode skills either interactively (returning the prompt to
// the caller) or autonomously (calling the LLM server-side and staging the
// resulting mutations for human review).
//
// Design principles:
//   - Domain-agnostic: knows nothing about AIM, heartbeat, or MCP.
//   - Injected dependencies: LLMClient and DB are provided by the caller.
//   - Backward compatible: nil LLM → skeleton mode (structure without narrative).
//   - Deterministic output contract: every autonomous run stages mutations and
//     returns a SkillResult with a BatchID the caller can surface for review.
package skillexec

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"strings"
	"text/template"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/activity"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// nonRetryableLLMError is satisfied by classified LLM errors that must not be
// retried (e.g. access denied, invalid model, malformed request). The llm
// package's *APIError implements this. We use a local interface so skillexec
// doesn't depend on the concrete error type.
type nonRetryableLLMError interface {
	error
	// Retryable reports whether retrying the call could succeed.
	IsRetryable() bool
}

// isFatalLLMError reports whether err is a classified LLM error that retrying
// cannot fix. When true, the executor should abort immediately rather than
// burning the remaining validation retries on a call that will keep failing.
func isFatalLLMError(err error) bool {
	var le nonRetryableLLMError
	return errors.As(err, &le) && !le.IsRetryable()
}

// maxTokenBudget is the approximate token ceiling for the rendered prompt
// context. Each token is ~4 bytes; 28K tokens ≈ 112K bytes.
const maxTokenBudget = 112_000 // bytes

// maxValidationRetries is the maximum number of times the executor will retry
// an LLM call after a validation failure, feeding the errors back as a
// correction prompt. The total number of LLM calls is maxValidationRetries+1.
const maxValidationRetries = 2

// LLMClient is the interface for calling an LLM with JSON-mode output.
type LLMClient interface {
	CompleteJSON(ctx context.Context, systemPrompt, userPrompt string) (LLMResult, error)
}

// RunLedger is the interface for persisting skill run records. Satisfied by
// skillrun.Service. Using an interface avoids importing domain/skillrun.
type RunLedger interface {
	Create(ctx context.Context, p RunLedgerCreateParams) (uuid.UUID, error)
	UpdateChunk(ctx context.Context, runID uuid.UUID, entry RunLedgerChunkEntry) error
	Complete(ctx context.Context, runID uuid.UUID, batchID uuid.UUID) error
	Fail(ctx context.Context, runID uuid.UUID, errMsg string) error
}

// RunLedgerCreateParams mirrors skillrun.CreateParams to avoid the import.
type RunLedgerCreateParams struct {
	InstanceID     uuid.UUID
	SkillName      string
	ChunkCount     int
	Model          string
	Trigger        string
	TriggerContext map[string]any
}

// RunLedgerChunkEntry mirrors skillrun.ChunkEntry to avoid the import.
type RunLedgerChunkEntry struct {
	Chunk            int      `json:"chunk"`
	OutputKey        string   `json:"output_key"`
	ArtifactType     string   `json:"artifact_type,omitempty"`
	Status           string   `json:"status"`
	StartedAt        string   `json:"started_at"`
	CompletedAt      string   `json:"completed_at"`
	Attempts         int      `json:"attempts"`
	InputTokens      int      `json:"input_tokens"`
	OutputTokens     int      `json:"output_tokens"`
	Errors           []string `json:"errors,omitempty"`
	ContextTruncated bool     `json:"context_truncated,omitempty"`
	DroppedFeatures  int      `json:"dropped_features,omitempty"`
}

// SkillResult is returned by Executor.Run after a successful autonomous execution.
type SkillResult struct {
	RunID            uuid.UUID `json:"run_id,omitempty"`
	BatchID          uuid.UUID `json:"batch_id"`
	ArtifactTypes    []string  `json:"artifact_types"`
	LLMUsed          bool      `json:"llm_used"`
	ValidationPassed bool      `json:"validation_passed"` // false when skill has no output schema
	InputTokens      int       `json:"input_tokens,omitempty"`
	OutputTokens     int       `json:"output_tokens,omitempty"`
}

// Executor runs prompt-mode skills autonomously: renders the prompt, calls the
// LLM, validates the output, and stages mutations for human review.
type Executor struct {
	db          *bun.DB
	packSvc     *pack.Service
	llm         LLMClient         // nil → skeleton mode
	activitySvc activity.Recorder // nil → no activity events
	runLedger   RunLedger         // nil → no run tracking
	modelName   string            // LLM model name for run ledger entries
}

// New creates a new Executor. Pass nil for llm to operate in skeleton mode.
func New(db *bun.DB, packSvc *pack.Service, llm LLMClient) *Executor {
	return &Executor{db: db, packSvc: packSvc, llm: llm}
}

// HasLLM returns true when the executor has an LLM client configured
// (autonomous mode). Returns false in skeleton mode.
func (e *Executor) HasLLM() bool {
	return e.llm != nil
}

// WithActivityRecorder attaches an activity recorder so the executor can emit
// skill.started / skill.chunk_staged / skill.completed / skill.failed /
// skill.retrying events to the instance activity stream.
func (e *Executor) WithActivityRecorder(rec activity.Recorder) *Executor {
	e.activitySvc = rec
	return e
}

// WithRunLedger attaches a run ledger for persisting structured skill run records.
func (e *Executor) WithRunLedger(rl RunLedger) *Executor {
	e.runLedger = rl
	return e
}

// WithModel sets the LLM model name recorded in run ledger entries.
func (e *Executor) WithModel(model string) *Executor {
	e.modelName = model
	return e
}

// record is a nil-safe helper — emits an activity event if activitySvc is set.
func (e *Executor) record(ctx context.Context, instanceID uuid.UUID, eventType string, payload map[string]any) {
	if e.activitySvc == nil {
		return
	}
	e.activitySvc.Record(ctx, activity.RecordRequest{
		InstanceID: instanceID,
		EventType:  eventType,
		Payload:    payload,
	})
}

// Run executes a prompt-mode skill autonomously for an instance:
//  1. Resolves the skill by name (installed → canonical → error)
//  2. Builds a ContextBundle from committed artifacts
//  3. Renders the prompt template with the context
//  4. Calls the LLM (or skeleton mode when llm == nil)
//  5. Validates LLM JSON output against:
//     a. the skill's output_schema.json envelope (required top-level keys)
//     b. the canonical EPF JSON schema for each produced artifact type
//  6. On validation failure, feeds errors back to the LLM for correction
//     (up to maxValidationRetries attempts before returning an error)
//  7. Stages mutations for each top-level artifact key in the validated output
//  8. Handles lra_evolution_entry appending and new_assumptions merging
//
// All mutations share a single batchID with the description provided.
func (e *Executor) Run(ctx context.Context, instanceID uuid.UUID, skillName string, params map[string]any) (SkillResult, error) {
	// 1. Resolve skill.
	skill, err := e.packSvc.ResolveSkill(ctx, instanceID, skillName)
	if err != nil {
		return SkillResult{}, fmt.Errorf("skillexec: resolve skill %q: %w", skillName, err)
	}

	if skill.ExecutionMode != "prompt" {
		return SkillResult{}, fmt.Errorf("skillexec: skill %q uses execution=%q; autonomous mode only supports prompt-mode skills", skillName, skill.ExecutionMode)
	}

	if skill.PromptMD == nil || *skill.PromptMD == "" {
		return SkillResult{}, fmt.Errorf("skillexec: skill %q has no prompt_md", skillName)
	}

	// 2. Build context bundle.
	bundle, err := buildContextBundle(ctx, e.db, instanceID, params)
	if err != nil {
		return SkillResult{}, fmt.Errorf("skillexec: build context: %w", err)
	}

	// 3. Render prompt template.
	rendered, droppedFeatures, err := renderPrompt(*skill.PromptMD, bundle)
	if err != nil {
		return SkillResult{}, fmt.Errorf("skillexec: render prompt: %w", err)
	}
	if droppedFeatures > 0 {
		slog.WarnContext(ctx, "skillexec: context truncated", "skill", skillName, "dropped_features", droppedFeatures)
	}

	// 4. Skeleton mode or LLM call.
	batchID := uuid.New()
	batchDesc := fmt.Sprintf("AI-generated by skill %q — requires human review", skillName)

	// Create run ledger entry for single-shot skills (same observability as chunked).
	// This must happen before skeleton mode returns so that all skill invocations
	// are recorded regardless of whether the LLM is configured.
	var runID uuid.UUID
	if e.runLedger != nil {
		trigger, _ := params["_trigger"].(string)
		triggerCtx, _ := params["_trigger_context"].(map[string]any)
		runID, _ = e.runLedger.Create(ctx, RunLedgerCreateParams{
			InstanceID:     instanceID,
			SkillName:      skillName,
			ChunkCount:     1,
			Model:          e.modelName,
			Trigger:        trigger,
			TriggerContext: triggerCtx,
		})
	}

	if e.llm == nil {
		result, err := e.stageSkeleton(ctx, instanceID, batchID, batchDesc, bundle)
		if e.runLedger != nil && runID != uuid.Nil {
			if err != nil {
				_ = e.runLedger.Fail(ctx, runID, err.Error())
			} else {
				_ = e.runLedger.Complete(ctx, runID, result.BatchID)
			}
		}
		return result, err
	}

	// Load the skill's output schema once (nil if not declared).
	outputSchemaBytes, err := loadSkillOutputSchema(skillName, skill.SkillYAML)
	if err != nil {
		slog.WarnContext(ctx, "skillexec: could not load output schema", "skill", skillName, "err", err)
		// Non-fatal: proceed without envelope validation.
	}

	// 5–6. LLM call + validation + retry loop.
	startedAt := time.Now()
	callResult, llmErr := e.callWithValidation(ctx, skillName, rendered, outputSchemaBytes)
	if llmErr != nil {
		// Record partial token usage even on failure.
		if e.runLedger != nil && runID != uuid.Nil {
			_ = e.runLedger.UpdateChunk(ctx, runID, RunLedgerChunkEntry{
				Chunk:        1,
				OutputKey:    skillName,
				Status:       "failed",
				StartedAt:    startedAt.UTC().Format(time.RFC3339),
				CompletedAt:  time.Now().UTC().Format(time.RFC3339),
				InputTokens:  callResult.InputTokens,
				OutputTokens: callResult.OutputTokens,
			})
			_ = e.runLedger.Fail(ctx, runID, llmErr.Error())
		}
		return SkillResult{
			RunID:        runID,
			InputTokens:  callResult.InputTokens,
			OutputTokens: callResult.OutputTokens,
		}, llmErr
	}

	// 7. Stage mutations.
	artifactTypes, err := e.stageMutationsFromOutput(ctx, instanceID, batchID, batchDesc, callResult.Output, bundle, domain.MutationStatusStaged)
	if err != nil {
		if e.runLedger != nil && runID != uuid.Nil {
			_ = e.runLedger.UpdateChunk(ctx, runID, RunLedgerChunkEntry{
				Chunk:        1,
				OutputKey:    skillName,
				Status:       "failed",
				StartedAt:    startedAt.UTC().Format(time.RFC3339),
				CompletedAt:  time.Now().UTC().Format(time.RFC3339),
				InputTokens:  callResult.InputTokens,
				OutputTokens: callResult.OutputTokens,
			})
			_ = e.runLedger.Fail(ctx, runID, err.Error())
		}
		return SkillResult{
			RunID:        runID,
			InputTokens:  callResult.InputTokens,
			OutputTokens: callResult.OutputTokens,
		}, fmt.Errorf("skillexec: stage mutations: %w", err)
	}

	// Record the successful single-shot chunk in the run ledger.
	if e.runLedger != nil && runID != uuid.Nil {
		_ = e.runLedger.UpdateChunk(ctx, runID, RunLedgerChunkEntry{
			Chunk:        1,
			OutputKey:    skillName,
			Status:       "staged",
			StartedAt:    startedAt.UTC().Format(time.RFC3339),
			CompletedAt:  time.Now().UTC().Format(time.RFC3339),
			InputTokens:  callResult.InputTokens,
			OutputTokens: callResult.OutputTokens,
		})
		_ = e.runLedger.Complete(ctx, runID, batchID)
	}

	return SkillResult{
		RunID:            runID,
		BatchID:          batchID,
		ArtifactTypes:    artifactTypes,
		LLMUsed:          true,
		ValidationPassed: callResult.Validated,
		InputTokens:      callResult.InputTokens,
		OutputTokens:     callResult.OutputTokens,
	}, nil
}

// ---------------------------------------------------------------------------
// RunChunked — sequential per-artifact LLM execution
// ---------------------------------------------------------------------------

// chunkDef describes one LLM call in a chunked skill execution.
type chunkDef struct {
	// promptFile is the path within the skill's chunks/ directory.
	promptFile string
	// outputKey is the top-level key this chunk produces in its JSON response
	// (e.g. "strategy_formula"). Used to extract and route the output.
	outputKey string
	// artifactType is the EPF artifact type for schema validation and staging.
	// Empty for special keys handled by stageMutationsFromOutput (lra_evolution_entry,
	// new_assumptions).
	artifactType string
}

// adaptStrategyChunks defines the ordered execution plan for adapt-strategy.
// Each chunk focuses on one artifact, receives prior outputs as context, and
// is independently validated before staging.
var adaptStrategyChunks = []chunkDef{
	{promptFile: "chunks/01_strategy_formula.md", outputKey: "strategy_formula", artifactType: domain.ArtifactTypeStrategyFormula},
	{promptFile: "chunks/02_roadmap_recipe.md", outputKey: "roadmap_recipe", artifactType: domain.ArtifactTypeRoadmap},
	{promptFile: "chunks/03_lra_evolution_entry.md", outputKey: "lra_evolution_entry", artifactType: ""},
	{promptFile: "chunks/04_new_assumptions.md", outputKey: "new_assumptions", artifactType: ""},
}

// adaptFoundationsChunks defines the ordered execution plan for adapt-foundations.
// Each chunk targets one READY-layer artifact. Prior chunk outputs are injected so
// later chunks (e.g. insight_opportunity) see the updated north_star and foundations.
var adaptFoundationsChunks = []chunkDef{
	{promptFile: "chunks/01_north_star.md", outputKey: "north_star", artifactType: domain.ArtifactTypeNorthStar},
	{promptFile: "chunks/02_strategy_foundations.md", outputKey: "strategy_foundations", artifactType: domain.ArtifactTypeStrategyFoundations},
	{promptFile: "chunks/03_insight_analyses.md", outputKey: "insight_analyses", artifactType: domain.ArtifactTypeInsightAnalyses},
	{promptFile: "chunks/04_insight_opportunity.md", outputKey: "insight_opportunity", artifactType: "insight_opportunity"},
}

// chunkPlanFor returns the chunk execution plan for the named skill.
// Falls back to adaptStrategyChunks for unknown skills (backward compat).
func chunkPlanFor(skillName string) []chunkDef {
	switch skillName {
	case "adapt-foundations":
		return adaptFoundationsChunks
	default:
		return adaptStrategyChunks
	}
}

// RunChunkedWithSignals is like RunChunked but injects triggering ripple signals
// into the ContextBundle so chunk prompts can describe why the draft was requested.
// batchDescOverride, if non-empty, replaces the default batch description.
func (e *Executor) RunChunkedWithSignals(ctx context.Context, instanceID uuid.UUID, skillName string, params map[string]any, triggeringSignals []map[string]any, batchDescOverride string) (SkillResult, error) {
	return e.runChunkedInternal(ctx, instanceID, skillName, params, triggeringSignals, batchDescOverride)
}

// RunChunked executes a prompt-mode skill autonomously, processing each artifact
// type in a separate focused LLM call. All chunks share one batch_id. Prior chunk
// outputs are injected into subsequent chunk prompts via ContextBundle.PriorOutputs.
//
// On chunk failure: prior chunks that already staged are preserved. The error
// indicates which chunk failed. The partial batch can be committed or discarded.
//
// Activity events emitted per chunk: skill.started (once), skill.chunk_staged,
// skill.retrying (on each retry), skill.completed or skill.failed.
func (e *Executor) RunChunked(ctx context.Context, instanceID uuid.UUID, skillName string, params map[string]any) (SkillResult, error) {
	return e.runChunkedInternal(ctx, instanceID, skillName, params, nil, "")
}

func (e *Executor) runChunkedInternal(ctx context.Context, instanceID uuid.UUID, skillName string, params map[string]any, triggeringSignals []map[string]any, batchDescOverride string) (SkillResult, error) {
	if e.llm == nil {
		// Skeleton mode falls back to Run() which handles it.
		return e.Run(ctx, instanceID, skillName, params)
	}

	// Only adapt-strategy has chunked prompts today; fall back to Run() for others.
	skillFS, err := embedded.SkillFS(skillName)
	if err != nil {
		return e.Run(ctx, instanceID, skillName, params)
	}
	// Check if chunks/ directory exists in this skill.
	if _, err := skillFS.Open("chunks"); err != nil {
		return e.Run(ctx, instanceID, skillName, params)
	}

	// Resolve skill to validate it exists and is prompt-mode.
	skill, err := e.packSvc.ResolveSkill(ctx, instanceID, skillName)
	if err != nil {
		return SkillResult{}, fmt.Errorf("skillexec: resolve skill %q: %w", skillName, err)
	}
	if skill.ExecutionMode != "prompt" {
		return SkillResult{}, fmt.Errorf("skillexec: skill %q uses execution=%q; chunked mode only supports prompt-mode skills", skillName, skill.ExecutionMode)
	}

	// Build context bundle (loaded once, shared across all chunks).
	bundle, err := buildContextBundle(ctx, e.db, instanceID, params)
	if err != nil {
		return SkillResult{}, fmt.Errorf("skillexec: build context: %w", err)
	}
	// Inject triggering signals from the ripple post-commit hook (may be nil).
	if len(triggeringSignals) > 0 {
		bundle.TriggeringSignals = triggeringSignals
	}

	// Select the chunk plan for this skill.
	chunks := chunkPlanFor(skillName)

	batchID := uuid.New()
	batchDesc := fmt.Sprintf("AI-generated by skill %q — requires human review", skillName)
	if batchDescOverride != "" {
		batchDesc = batchDescOverride
	}
	priorOutputs := make(map[string]any)
	changeSummaries := make(map[string]string) // output_key → change_summary from LLM
	var allArtifactTypes []string
	var totalInputTokens, totalOutputTokens int

	// Extract trigger context from params (callers set _trigger / _trigger_context).
	trigger := "manual"
	var triggerCtx map[string]any
	if t, ok := params["_trigger"].(string); ok && t != "" {
		trigger = t
	}
	if tc, ok := params["_trigger_context"].(map[string]any); ok {
		triggerCtx = tc
	}

	// Create a run record if the ledger is available.
	var runID uuid.UUID
	if e.runLedger != nil {
		var err error
		runID, err = e.runLedger.Create(ctx, RunLedgerCreateParams{
			InstanceID:     instanceID,
			SkillName:      skillName,
			ChunkCount:     len(chunks),
			Model:          e.modelName,
			Trigger:        trigger,
			TriggerContext: triggerCtx,
		})
		if err != nil {
			slog.WarnContext(ctx, "skillexec: failed to create run record (degraded)", "err", err)
			// Continue without tracking — degraded but functional.
		}
	}

	e.record(ctx, instanceID, "skill.started", map[string]any{
		"skill_name":  skillName,
		"batch_id":    batchID.String(),
		"chunk_count": len(chunks),
		"run_id":      runID.String(),
	})

	for i, chunk := range chunks {
		chunkNum := i + 1

		// Inject prior outputs into the bundle for this chunk.
		bundle.PriorOutputs = priorOutputs

		// Load and render the chunk prompt template.
		rendered, droppedFeatures, err := e.loadChunkPrompt(ctx, skillFS, skillName, chunkNum, chunk, bundle)
		if err != nil {
			if e.runLedger != nil && runID != uuid.Nil {
				_ = e.runLedger.Fail(ctx, runID, err.Error())
			}
			return SkillResult{RunID: runID}, err
		}

		slog.InfoContext(ctx, "skillexec: running chunk",
			"skill", skillName, "chunk", chunkNum, "output_key", chunk.outputKey)

		// Build existing artifact map for merge-on-validation. The bundle
		// stores artifacts by type; we need them keyed by output key.
		var existingForMerge map[string]any
		if existing, ok := bundle.Artifacts[chunk.outputKey]; ok {
			if m, ok := existing.(map[string]any); ok {
				existingForMerge = map[string]any{chunk.outputKey: m}
			}
		}

		// LLM call + validation for this chunk only.
		chunkResult, err := e.callWithValidationChunk(ctx, skillName, chunkNum, chunk.outputKey, chunk.artifactType, rendered, instanceID, existingForMerge)
		if err != nil {
			e.handleChunkFailure(ctx, instanceID, batchID, runID, skillName, trigger, params, chunk, chunkNum, err, chunkResult, allArtifactTypes, changeSummaries, &totalInputTokens, &totalOutputTokens)
			return SkillResult{
				RunID:         runID,
				BatchID:       batchID,
				ArtifactTypes: allArtifactTypes,
				InputTokens:   totalInputTokens,
				OutputTokens:  totalOutputTokens,
			}, fmt.Errorf("skillexec: chunk %d (%s) failed: %w", chunkNum, chunk.outputKey, err)
		}
		totalInputTokens += chunkResult.InputTokens
		totalOutputTokens += chunkResult.OutputTokens

		// Stage this chunk's output.
		staged, err := e.stageMutationsFromOutput(ctx, instanceID, batchID, batchDesc, chunkResult.Output, bundle, domain.MutationStatusStaging)
		if err != nil {
			failErr := fmt.Errorf("skillexec: chunk %d: stage: %w", chunkNum, err)
			if e.runLedger != nil && runID != uuid.Nil {
				_ = e.runLedger.Fail(ctx, runID, failErr.Error())
			}
			// Write metadata and promote staging → staged so the partial batch is reviewable.
			e.finalizeBatch(ctx, batchID, skillName, trigger, params, changeSummaries)
			return SkillResult{RunID: runID, BatchID: batchID, ArtifactTypes: allArtifactTypes}, failErr
		}
		allArtifactTypes = append(allArtifactTypes, staged...)

		e.recordChunkStaged(ctx, instanceID, batchID, runID, skillName, chunk, chunkNum, chunkResult, staged, droppedFeatures, priorOutputs, changeSummaries)
	}

	// Use a background context for post-chunk bookkeeping — the HTTP request
	// context may already be cancelled if the client timed out during LLM calls.
	bgCtx := context.Background()

	// Mark the run complete in the ledger.
	if e.runLedger != nil && runID != uuid.Nil {
		_ = e.runLedger.Complete(bgCtx, runID, batchID)
	}

	// Write batch_metadata (including change summaries) and promote
	// staging → staged atomically.
	e.finalizeBatch(bgCtx, batchID, skillName, trigger, params, changeSummaries)

	cascadeGen := 0
	if gen, ok := params["_cascade_generation"].(int); ok {
		cascadeGen = gen
	}
	e.record(bgCtx, instanceID, "skill.completed", map[string]any{
		"skill_name":         skillName,
		"batch_id":           batchID.String(),
		"artifact_types":     allArtifactTypes,
		"input_tokens":       totalInputTokens,
		"output_tokens":      totalOutputTokens,
		"run_id":             runID.String(),
		"cascade_generation": cascadeGen,
	})

	return SkillResult{
		RunID:            runID,
		BatchID:          batchID,
		ArtifactTypes:    allArtifactTypes,
		LLMUsed:          true,
		ValidationPassed: true,
		InputTokens:      totalInputTokens,
		OutputTokens:     totalOutputTokens,
	}, nil
}

// loadChunkPrompt opens the chunk's prompt template from the skill FS and
// renders it against the bundle. Returns the rendered prompt and the number of
// features dropped due to context-budget truncation.
func (e *Executor) loadChunkPrompt(
	ctx context.Context,
	skillFS fs.FS,
	skillName string,
	chunkNum int,
	chunk chunkDef,
	bundle *ContextBundle,
) (string, int, error) {
	// Read chunk prompt template from embedded FS.
	promptBytes, err := skillFS.Open(chunk.promptFile)
	if err != nil {
		return "", 0, fmt.Errorf("skillexec: chunk %d: open prompt %q: %w", chunkNum, chunk.promptFile, err)
	}
	buf := new(bytes.Buffer)
	if _, err := buf.ReadFrom(promptBytes); err != nil {
		return "", 0, fmt.Errorf("skillexec: chunk %d: read prompt: %w", chunkNum, err)
	}
	_ = promptBytes.(interface{ Close() error }).Close() //nolint:errcheck

	// Render the chunk prompt template.
	rendered, droppedFeatures, err := renderPrompt(buf.String(), bundle)
	if err != nil {
		return "", 0, fmt.Errorf("skillexec: chunk %d: render prompt: %w", chunkNum, err)
	}
	if droppedFeatures > 0 {
		slog.WarnContext(ctx, "skillexec: chunk context truncated", "skill", skillName, "chunk", chunkNum, "dropped_features", droppedFeatures)
	}
	return rendered, droppedFeatures, nil
}

// handleChunkFailure records the failed chunk in the activity stream and run
// ledger, accumulates the failed chunk's token usage into the running totals,
// and finalizes the partial batch so it remains reviewable. The caller is
// responsible for returning the SkillResult and wrapped error.
func (e *Executor) handleChunkFailure(
	ctx context.Context,
	instanceID, batchID, runID uuid.UUID,
	skillName, trigger string,
	params map[string]any,
	chunk chunkDef,
	chunkNum int,
	chunkErr error,
	chunkResult *chunkCallResult,
	allArtifactTypes []string,
	changeSummaries map[string]string,
	totalInputTokens, totalOutputTokens *int,
) {
	// Accumulate tokens from the failed chunk (includes all retry attempts).
	if chunkResult != nil {
		*totalInputTokens += chunkResult.InputTokens
		*totalOutputTokens += chunkResult.OutputTokens
	}
	e.record(ctx, instanceID, "skill.failed", map[string]any{
		"skill_name":    skillName,
		"batch_id":      batchID.String(),
		"chunk":         chunkNum,
		"output_key":    chunk.outputKey,
		"error":         chunkErr.Error(),
		"staged_so_far": allArtifactTypes,
		"input_tokens":  *totalInputTokens,
		"output_tokens": *totalOutputTokens,
	})
	// Record the failed chunk and overall failure in the run ledger.
	if e.runLedger != nil && runID != uuid.Nil {
		var chunkIn, chunkOut int
		if chunkResult != nil {
			chunkIn = chunkResult.InputTokens
			chunkOut = chunkResult.OutputTokens
		}
		_ = e.runLedger.UpdateChunk(ctx, runID, RunLedgerChunkEntry{
			Chunk:        chunkNum,
			OutputKey:    chunk.outputKey,
			ArtifactType: chunk.artifactType,
			Status:       "failed",
			StartedAt:    time.Now().UTC().Format(time.RFC3339),
			CompletedAt:  time.Now().UTC().Format(time.RFC3339),
			InputTokens:  chunkIn,
			OutputTokens: chunkOut,
		})
		_ = e.runLedger.Fail(ctx, runID, chunkErr.Error())
	}
	// Write metadata and promote staging → staged so the partial
	// batch is visible for review/discard with change summaries.
	e.finalizeBatch(ctx, batchID, skillName, trigger, params, changeSummaries)
}

// recordChunkStaged records a successfully staged chunk: it exposes the chunk's
// output to subsequent chunks, collects any change_summary, updates the run
// ledger, and emits the skill.chunk_staged activity event.
func (e *Executor) recordChunkStaged(
	ctx context.Context,
	instanceID, batchID, runID uuid.UUID,
	skillName string,
	chunk chunkDef,
	chunkNum int,
	chunkResult *chunkCallResult,
	staged []string,
	droppedFeatures int,
	priorOutputs map[string]any,
	changeSummaries map[string]string,
) {
	// Record the successful chunk and make its output available to subsequent chunks.
	if val, ok := chunkResult.Output[chunk.outputKey]; ok {
		priorOutputs[chunk.outputKey] = val
	}

	// Collect change_summary if the LLM produced one.
	// Key by each actually-staged artifact type so the handler can look up
	// summaries by artifact_type directly. Also store by output_key as fallback.
	if cs, ok := chunkResult.Output["change_summary"].(string); ok && cs != "" {
		changeSummaries[chunk.outputKey] = cs
		for _, at := range staged {
			changeSummaries[at] = cs
		}
	}

	// Update the run ledger with this chunk's results.
	if e.runLedger != nil && runID != uuid.Nil {
		chunkStarted := time.Now().Add(-time.Duration(chunkResult.InputTokens+chunkResult.OutputTokens) * time.Millisecond) // rough estimate
		_ = e.runLedger.UpdateChunk(ctx, runID, RunLedgerChunkEntry{
			Chunk:            chunkNum,
			OutputKey:        chunk.outputKey,
			ArtifactType:     chunk.artifactType,
			Status:           "staged",
			StartedAt:        chunkStarted.UTC().Format(time.RFC3339),
			CompletedAt:      time.Now().UTC().Format(time.RFC3339),
			InputTokens:      chunkResult.InputTokens,
			OutputTokens:     chunkResult.OutputTokens,
			ContextTruncated: droppedFeatures > 0,
			DroppedFeatures:  droppedFeatures,
		})
	}

	e.record(ctx, instanceID, "skill.chunk_staged", map[string]any{
		"skill_name":     skillName,
		"batch_id":       batchID.String(),
		"chunk":          chunkNum,
		"output_key":     chunk.outputKey,
		"artifact_types": staged,
		"input_tokens":   chunkResult.InputTokens,
		"output_tokens":  chunkResult.OutputTokens,
		"run_id":         runID.String(),
	})

	slog.InfoContext(ctx, "skillexec: chunk staged",
		"skill", skillName, "chunk", chunkNum, "output_key", chunk.outputKey, "artifact_types", staged)
}

// callWithValidationChunk is a scoped variant of callWithValidation for a single
// chunk. It validates only the single artifact type produced by this chunk.
// chunkCallResult bundles the parsed output with accumulated token counts
// across all attempts (including retries).
type chunkCallResult struct {
	Output       map[string]any
	Validated    bool
	InputTokens  int
	OutputTokens int
}

// instanceID is used solely for activity event emission on retries.
// existingArtifact, when non-nil, is merged under the LLM output so that
// required structural fields omitted by the LLM are preserved from the
// current committed version.
func (e *Executor) callWithValidationChunk(
	ctx context.Context,
	skillName string,
	chunkNum int,
	outputKey string,
	artifactType string,
	initialPrompt string,
	instanceID uuid.UUID,
	existingArtifact map[string]any,
) (*chunkCallResult, error) {
	currentPrompt := initialPrompt
	var lastErrors []string
	var lastRawOutput string
	var totalIn, totalOut int

	for attempt := 0; attempt <= maxValidationRetries; attempt++ {
		if attempt > 0 {
			slog.InfoContext(ctx, "skillexec: chunk retrying",
				"skill", skillName, "chunk", chunkNum, "output_key", outputKey,
				"attempt", attempt, "error_count", len(lastErrors))
			e.record(ctx, instanceID, "skill.retrying", map[string]any{
				"skill_name":  skillName,
				"chunk":       chunkNum,
				"output_key":  outputKey,
				"attempt":     attempt,
				"error_count": len(lastErrors),
				"errors":      lastErrors,
			})
			currentPrompt = correctionPrompt(initialPrompt, lastErrors, lastRawOutput)
		}

		result, err := e.llm.CompleteJSON(ctx, systemPromptFor(skillName), currentPrompt)
		if err != nil {
			if isFatalLLMError(err) {
				// Provider rejected the call for a reason retrying won't fix
				// (e.g. access denied, invalid model). Abort immediately and
				// surface the classified error verbatim so the cause is obvious.
				return nil, fmt.Errorf("LLM call failed (non-retryable): %w", err)
			}
			return nil, fmt.Errorf("LLM call (attempt %d): %w", attempt+1, err)
		}
		totalIn += result.InputTokens
		totalOut += result.OutputTokens
		lastRawOutput = result.Content

		// Clean common LLM output issues (markdown fences, trailing commas)
		// before attempting JSON parse to avoid burning retries on trivial fixes.
		cleaned := cleanJSON(result.Content)

		var output map[string]any
		if err := json.Unmarshal([]byte(cleaned), &output); err != nil {
			lastErrors = []string{fmt.Sprintf("LLM returned invalid JSON: %v", err)}
			continue
		}

		// Auto-wrap: if the expected output key is missing but the output
		// contains fields that look like the inner artifact (i.e. the LLM
		// produced a flat object without the wrapper key), wrap them
		// automatically. This is a common LLM failure mode.
		//
		// Artifact payloads use a double-envelope pattern:
		//   output[outputKey] → { outputKey: { ...fields... } }
		// The outer key routes the chunk. The inner key is part of the
		// canonical artifact payload (validated by the EPF schema).
		// When the LLM omits both envelopes, we re-wrap here.
		if outputKey != "" && output[outputKey] == nil && len(output) > 0 {
			// Check that the output isn't already a different known structure
			// (e.g. it has "change_summary" but not the artifact key).
			// Heuristic: if none of the output keys are known artifact keys,
			// the LLM likely produced the inner artifact flat.
			hasAnyKnownKey := false
			for k := range knownArtifactOutputKeys {
				if output[k] != nil {
					hasAnyKnownKey = true
					break
				}
			}
			if !hasAnyKnownKey {
				innerKey := innerKeyFor(outputKey)
				slog.InfoContext(ctx, "skillexec: auto-wrapping flat LLM output",
					"skill", skillName, "chunk", chunkNum, "output_key", outputKey,
					"inner_key", innerKey, "flat_keys_count", len(output))
				// Pull out change_summary before wrapping (it's a sibling, not part of the artifact).
				changeSummary := output["change_summary"]
				delete(output, "change_summary")
				// Double-wrap: inner envelope uses the schema's expected key
				// (e.g. "strategy" for strategy_formula), outer envelope is
				// the chunk routing key.
				wrapped := map[string]any{
					outputKey: map[string]any{innerKey: output},
				}
				if changeSummary != nil {
					wrapped["change_summary"] = changeSummary
				}
				output = wrapped
			}
		}

		// Single-wrap fix: the routing key exists but the schema inner key is
		// missing inside it. This happens when the LLM produces:
		//   {"strategy_formula": {"version": "...", ...}}
		// but the schema expects:
		//   {"strategy_formula": {"strategy": {"id": "...", ...}}}
		// Also covers the same-key case (e.g. north_star → north_star):
		//   {"north_star": {"purpose": ..., "vision": ...}}
		// should become:
		//   {"north_star": {"north_star": {"organization": {...}, ...}}}
		//
		// Skip for flat schemas (assessment_report, calibration_memo,
		// insight_analyses) where the schema has no single wrapper property.
		if outputKey != "" && artifactType != "" && !flatSchemas[outputKey] {
			innerKey := innerKeyFor(outputKey)
			if inner, ok := output[outputKey].(map[string]any); ok {
				if inner[innerKey] == nil {
					slog.InfoContext(ctx, "skillexec: re-wrapping single-wrapped output with correct inner key",
						"skill", skillName, "chunk", chunkNum, "output_key", outputKey, "inner_key", innerKey)
					// Pull change_summary out of inner if it leaked in.
					cs := inner["change_summary"]
					delete(inner, "change_summary")
					output[outputKey] = map[string]any{innerKey: inner}
					if cs != nil {
						output["change_summary"] = cs
					}
				}
			}
		}

		// Inject metadata defaults that LLMs commonly omit. These are
		// bookkeeping fields (dates, confidence levels) that don't affect
		// the strategic content but are required by the schema.
		injectMetadataDefaults(outputKey, output)

		// Merge with existing artifact — LLMs sometimes omit required
		// structural fields (id, strategy_id, tracks, etc.) when focusing
		// on content changes. Merging the existing artifact underneath
		// preserves those fields while letting LLM changes take precedence.
		if existingArtifact != nil {
			mergeExistingArtifact(outputKey, output, existingArtifact)
		}

		// Validate canonical EPF schema for this artifact type (if known).
		if artifactType != "" {
			valMap := map[string]any{outputKey: output[outputKey]}
			if errs := validateArtifactPayloads(valMap); len(errs) > 0 {
				// Auto-fix maxItems violations — trim arrays in-place and
				// re-validate. This avoids burning a retry on a trivially
				// fixable issue (LLMs commonly overshoot array counts).
				if fixed := fixMaxItemsViolations(output[outputKey], errs); fixed > 0 {
					slog.InfoContext(ctx, "skillexec: auto-fixed maxItems violations",
						"skill", skillName, "chunk", chunkNum, "output_key", outputKey,
						"fixed_count", fixed)
					// Re-validate after fix.
					valMap = map[string]any{outputKey: output[outputKey]}
					errs = validateArtifactPayloads(valMap)
				}
				if len(errs) > 0 {
					lastErrors = errs
					slog.WarnContext(ctx, "skillexec: chunk artifact validation failed",
						"skill", skillName, "chunk", chunkNum, "output_key", outputKey,
						"attempt", attempt+1, "errors", errs)
					continue
				}
			}
		}

		return &chunkCallResult{
			Output:       output,
			Validated:    true,
			InputTokens:  totalIn,
			OutputTokens: totalOut,
		}, nil
	}

	return &chunkCallResult{InputTokens: totalIn, OutputTokens: totalOut},
		fmt.Errorf("chunk %d (%s) failed validation after %d attempt(s): %s",
			chunkNum, outputKey, maxValidationRetries+1, strings.Join(lastErrors, "; "))
}

// singleCallResult bundles the parsed output with accumulated token counts
// across all attempts (including retries) for single-shot (non-chunked) calls.
type singleCallResult struct {
	Output       map[string]any
	Validated    bool
	InputTokens  int
	OutputTokens int
}

// callWithValidation calls the LLM and validates the output against:
//   - the skill's output_schema.json envelope (if outputSchemaBytes != nil)
//   - the canonical EPF JSON schema for each artifact type present in the output
//
// On failure, it retries up to maxValidationRetries times by feeding the
// validation errors back as a correction prompt.
// Token counts are accumulated across all attempts (including retries).
func (e *Executor) callWithValidation(
	ctx context.Context,
	skillName string,
	initialPrompt string,
	outputSchemaBytes []byte,
) (*singleCallResult, error) {
	currentPrompt := initialPrompt
	var lastErrors []string
	var lastRawOutput string
	var totalIn, totalOut int

	for attempt := 0; attempt <= maxValidationRetries; attempt++ {
		if attempt > 0 {
			slog.InfoContext(ctx, "skillexec: retrying after validation errors",
				"skill", skillName, "attempt", attempt, "error_count", len(lastErrors))
			currentPrompt = correctionPrompt(initialPrompt, lastErrors, lastRawOutput)
		}

		result, err := e.llm.CompleteJSON(ctx, systemPromptFor(skillName), currentPrompt)
		if err != nil {
			if isFatalLLMError(err) {
				return &singleCallResult{InputTokens: totalIn, OutputTokens: totalOut},
					fmt.Errorf("skillexec: LLM call failed (non-retryable): %w", err)
			}
			return &singleCallResult{InputTokens: totalIn, OutputTokens: totalOut},
				fmt.Errorf("skillexec: LLM call (attempt %d): %w", attempt+1, err)
		}
		totalIn += result.InputTokens
		totalOut += result.OutputTokens
		lastRawOutput = result.Content

		// Clean common LLM output issues (markdown fences, trailing commas)
		// before attempting JSON parse to avoid burning retries on trivial fixes.
		cleaned := cleanJSON(result.Content)

		var output map[string]any
		if err := json.Unmarshal([]byte(cleaned), &output); err != nil {
			lastErrors = []string{fmt.Sprintf("LLM returned invalid JSON: %v", err)}
			continue
		}

		// Validate envelope schema (output_schema.json).
		if outputSchemaBytes != nil {
			if errs := validateJSONSchema(result.Content, outputSchemaBytes); len(errs) > 0 {
				lastErrors = errs
				slog.WarnContext(ctx, "skillexec: envelope schema validation failed",
					"skill", skillName, "attempt", attempt+1, "errors", errs)
				continue
			}
		}

		// Inject metadata defaults before validation (same as chunked path).
		for key := range output {
			injectMetadataDefaults(key, output)
		}

		// Validate each artifact payload against its canonical EPF schema.
		artifactErrors := validateArtifactPayloads(output)
		if len(artifactErrors) > 0 {
			// Auto-fix maxItems violations before burning a retry.
			totalFixed := 0
			for key := range output {
				if n := fixMaxItemsViolations(output[key], artifactErrors); n > 0 {
					totalFixed += n
				}
			}
			if totalFixed > 0 {
				slog.InfoContext(ctx, "skillexec: auto-fixed maxItems violations",
					"skill", skillName, "fixed_count", totalFixed)
				artifactErrors = validateArtifactPayloads(output)
			}
			if len(artifactErrors) > 0 {
				lastErrors = artifactErrors
				slog.WarnContext(ctx, "skillexec: artifact schema validation failed",
					"skill", skillName, "attempt", attempt+1, "errors", artifactErrors)
				continue
			}
		}

		// All validations passed.
		validationPassed := outputSchemaBytes != nil
		return &singleCallResult{
			Output:       output,
			Validated:    validationPassed,
			InputTokens:  totalIn,
			OutputTokens: totalOut,
		}, nil
	}

	// All retries exhausted.
	return &singleCallResult{InputTokens: totalIn, OutputTokens: totalOut},
		fmt.Errorf("skillexec: skill %q output failed validation after %d attempt(s): %s",
			skillName, maxValidationRetries+1, strings.Join(lastErrors, "; "))
}

// ---------------------------------------------------------------------------
// stageSkeleton — nil-LLM path
// ---------------------------------------------------------------------------

// stageSkeleton stages the current committed payloads for the skill's required
// artifacts, each marked with _skeleton: true, so the human can edit in the
// draft-review UI.
func (e *Executor) stageSkeleton(ctx context.Context, instanceID, batchID uuid.UUID, batchDesc string, bundle *ContextBundle) (SkillResult, error) {
	var artifactTypes []string

	for artType, payload := range bundle.Artifacts {
		// Only stage primary mutable artifact types — skip features (noisy), skip
		// read-only types like evidence.
		if !isMutableArtifactType(artType) {
			continue
		}

		marked := copyWithSkeletonFlag(payload)
		if err := e.stageMutation(ctx, instanceID, batchID, batchDesc, artType, artTypeToKey(artType), marked, domain.MutationStatusStaged); err != nil {
			slog.WarnContext(ctx, "skillexec: skeleton: failed to stage mutation", "artifact_type", artType, "err", err)
			continue
		}
		artifactTypes = append(artifactTypes, artType)
	}

	return SkillResult{
		BatchID:          batchID,
		ArtifactTypes:    artifactTypes,
		LLMUsed:          false,
		ValidationPassed: false,
	}, nil
}

// ---------------------------------------------------------------------------
// stageMutationsFromOutput — normal LLM path
// ---------------------------------------------------------------------------

// knownArtifactOutputKeys are the top-level keys in LLM output that map
// directly to artifact types via the standard name mapping. The special keys
// lra_evolution_entry and new_assumptions are handled separately.
var knownArtifactOutputKeys = map[string]string{
	"strategy_formula":     domain.ArtifactTypeStrategyFormula,
	"roadmap_recipe":       domain.ArtifactTypeRoadmap,
	"north_star":           domain.ArtifactTypeNorthStar,
	"strategy_foundations": domain.ArtifactTypeStrategyFoundations,
	"insight_analyses":     domain.ArtifactTypeInsightAnalyses,
	"insight_opportunity":  "insight_opportunity",
	"assessment_report":    domain.ArtifactTypeAssessmentReport,
	"calibration_memo":     "calibration_memo",
}

// schemaInnerKey maps an output routing key to the inner wrapper key expected
// by the canonical EPF JSON schema. For most artifacts the inner key matches
// the output key, but several schemas use a shorter name:
//
//	strategy_formula    → "strategy"    (strategy_formula_schema.json requires "strategy")
//	roadmap_recipe      → "roadmap"     (roadmap_recipe_schema.json  requires "roadmap")
//	insight_opportunity → "opportunity" (insight_opportunity_schema.json requires "opportunity")
//
// Flat schemas (assessment_report, calibration_memo, insight_analyses) have no
// single wrapper key — their root required fields list content directly.
var schemaInnerKeyOverrides = map[string]string{
	"strategy_formula":    "strategy",
	"roadmap_recipe":      "roadmap",
	"insight_opportunity": "opportunity",
}

// flatSchemas are output keys whose canonical schema validates flat content
// (no single wrapper property). The auto-wrap logic must NOT wrap these.
var flatSchemas = map[string]bool{
	"assessment_report": true,
	"calibration_memo":  true,
	"insight_analyses":  true,
}

// innerKeyFor returns the correct inner (schema wrapper) key for a given
// output routing key. Uses schemaInnerKeyOverrides when the inner key differs
// from the routing key; falls back to the routing key itself.
func innerKeyFor(outputKey string) string {
	if inner, ok := schemaInnerKeyOverrides[outputKey]; ok {
		return inner
	}
	return outputKey
}

func (e *Executor) stageMutationsFromOutput(
	ctx context.Context,
	instanceID, batchID uuid.UUID,
	batchDesc string,
	output map[string]any,
	bundle *ContextBundle,
	status string,
) ([]string, error) {
	var artifactTypes []string

	// Handle lra_evolution_entry first — append to LRA evolution_log.
	if entry, ok := output["lra_evolution_entry"]; ok && entry != nil {
		if err := e.appendLRAEvolutionEntry(ctx, instanceID, batchID, batchDesc, entry, bundle, status); err != nil {
			// Non-fatal: log warning but continue.
			slog.WarnContext(ctx, "skillexec: failed to stage LRA evolution entry", "err", err)
		} else {
			artifactTypes = append(artifactTypes, domain.ArtifactTypeLRA)
		}
	}

	// Extract new_assumptions for later merging into the roadmap mutation.
	var newAssumptions []any
	if na, ok := output["new_assumptions"]; ok {
		if arr, ok := na.([]any); ok {
			newAssumptions = arr
		}
	}

	// Stage direct artifact replacement mutations.
	stagedRoadmap := false
	for outputKey, artType := range knownArtifactOutputKeys {
		val, ok := output[outputKey]
		if !ok || val == nil {
			continue
		}

		payload, ok := val.(map[string]any)
		if !ok {
			slog.WarnContext(ctx, "skillexec: output key is not a JSON object — skipping",
				"key", outputKey, "type", fmt.Sprintf("%T", val))
			continue
		}

		// Merge new_assumptions into the roadmap payload before staging.
		if artType == domain.ArtifactTypeRoadmap && newAssumptions != nil {
			payload = mergeNewAssumptions(payload, newAssumptions)
		}

		key := artTypeToKey(artType)
		if err := e.stageMutation(ctx, instanceID, batchID, batchDesc, artType, key, payload, status); err != nil {
			return nil, fmt.Errorf("stage %s: %w", artType, err)
		}
		artifactTypes = append(artifactTypes, artType)
		if artType == domain.ArtifactTypeRoadmap {
			stagedRoadmap = true
		}
	}

	// Handle value_models array — one value_model per track (produced by align-portfolio).
	if vmArr, ok := output["value_models"]; ok && vmArr != nil {
		if arr, ok := vmArr.([]any); ok {
			for i, item := range arr {
				payload, ok := item.(map[string]any)
				if !ok {
					slog.WarnContext(ctx, "skillexec: value_models entry is not a JSON object — skipping",
						"index", i, "type", fmt.Sprintf("%T", item))
					continue
				}
				trackName, _ := payload["track_name"].(string)
				if trackName == "" {
					slog.WarnContext(ctx, "skillexec: value_models entry missing track_name — skipping", "index", i)
					continue
				}
				// Derive the artifact key from track_name: "Product" → "value_model_product.value_model".
				trackSlug := valueModelTrackSlug(trackName)
				artKey := "value_model_" + trackSlug + ".value_model"

				if err := e.stageMutation(ctx, instanceID, batchID, batchDesc, domain.ArtifactTypeValueModel, artKey, payload, status); err != nil {
					slog.WarnContext(ctx, "skillexec: failed to stage value_model", "track", trackName, "key", artKey, "err", err)
					continue
				}
				artifactTypes = append(artifactTypes, domain.ArtifactTypeValueModel)
				slog.InfoContext(ctx, "skillexec: staged value_model", "track", trackName, "key", artKey)
			}
		}
	}

	// Chunked path: if new_assumptions were produced but the roadmap was already
	// staged by a prior chunk, update the existing mutation in-place.
	if newAssumptions != nil && !stagedRoadmap {
		if err := e.mergeAssumptionsIntoStagedRoadmap(ctx, batchID, newAssumptions, status); err != nil {
			slog.WarnContext(ctx, "skillexec: failed to merge new_assumptions into staged roadmap", "err", err)
		}
	}

	return artifactTypes, nil
}

// valueModelTrackSlug normalises a track_name from an LLM-generated value model
// payload into the slug used in artifact keys. The canonical slugs are:
// product, strategy, org_ops, commercial.
func valueModelTrackSlug(trackName string) string {
	switch strings.ToLower(trackName) {
	case "orgops", "org ops", "org & ops", "org_ops":
		return "org_ops"
	default:
		s := strings.ToLower(strings.ReplaceAll(trackName, " & ", "_"))
		return strings.ReplaceAll(s, " ", "_")
	}
}

// ---------------------------------------------------------------------------
// Merge new_assumptions into an already-staged roadmap (chunked path)
// ---------------------------------------------------------------------------

// mergeAssumptionsIntoStagedRoadmap loads the roadmap_recipe mutation already
// inserted in this batch, merges the new assumptions into its payload, and
// updates the mutation row in-place. The status parameter matches the
// mutation's current status (staging during chunked runs, staged otherwise).
func (e *Executor) mergeAssumptionsIntoStagedRoadmap(ctx context.Context, batchID uuid.UUID, newAssumptions []any, status string) error {
	// Fetch the roadmap mutation's payload as a string (JSONB → text).
	var payloadStr string
	err := e.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("payload::text").
		Where("batch_id = ?", batchID).
		Where("status = ?", status).
		Where("artifact_type = ?", domain.ArtifactTypeRoadmap).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil {
		return fmt.Errorf("fetch roadmap mutation: %w", err)
	}
	if payloadStr == "" {
		return fmt.Errorf("no roadmap mutation in batch %s", batchID)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(payloadStr), &payload); err != nil {
		return fmt.Errorf("unmarshal roadmap payload: %w", err)
	}

	merged := mergeNewAssumptions(payload, newAssumptions)

	mergedRaw, err := json.Marshal(merged)
	if err != nil {
		return fmt.Errorf("marshal merged roadmap: %w", err)
	}

	_, err = e.db.NewUpdate().
		TableExpr("strategy_mutations").
		Set("payload = ?::jsonb", string(mergedRaw)).
		Where("batch_id = ?", batchID).
		Where("status = ?", status).
		Where("artifact_type = ?", domain.ArtifactTypeRoadmap).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("update roadmap mutation: %w", err)
	}

	slog.InfoContext(ctx, "skillexec: merged new_assumptions into roadmap mutation",
		"batch_id", batchID.String(), "assumption_count", len(newAssumptions))
	return nil
}

// ---------------------------------------------------------------------------
// LRA evolution log appending (Task 1.6)
// ---------------------------------------------------------------------------

// appendLRAEvolutionEntry fetches the current LRA artifact payload, appends
// the new evolution entry, and stages an update mutation.
// If no LRA artifact exists for the instance, logs a warning and returns nil.
func (e *Executor) appendLRAEvolutionEntry(
	ctx context.Context,
	instanceID, batchID uuid.UUID,
	batchDesc string,
	entry any,
	bundle *ContextBundle,
	status string,
) error {
	// Use the bundle's LRA payload if available; otherwise attempt a live fetch.
	raw, ok := bundle.Artifacts[domain.ArtifactTypeLRA]
	if !ok || raw == nil {
		slog.WarnContext(ctx, "skillexec: no LRA artifact found for instance — skipping evolution entry", "instance_id", instanceID)
		return nil
	}
	lraPayload, ok := raw.(map[string]any)
	if !ok {
		slog.WarnContext(ctx, "skillexec: LRA artifact has unexpected type — skipping evolution entry", "instance_id", instanceID)
		return nil
	}

	// Append the new entry to evolution_log.
	merged := appendToEvolutionLog(lraPayload, entry)
	return e.stageMutation(ctx, instanceID, batchID, batchDesc, domain.ArtifactTypeLRA, "living-reality-assessment", merged, status)
}

// appendToEvolutionLog clones lraPayload and appends entry to evolution_log.
func appendToEvolutionLog(lraPayload map[string]any, entry any) map[string]any {
	// Deep clone via JSON round-trip to avoid mutating the bundle.
	raw, _ := json.Marshal(lraPayload)
	var cloned map[string]any
	_ = json.Unmarshal(raw, &cloned)

	existing, _ := cloned["evolution_log"].([]any)
	cloned["evolution_log"] = append(existing, entry)
	return cloned
}

// ---------------------------------------------------------------------------
// New assumptions merging (Task 1.7)
// ---------------------------------------------------------------------------

// mergeNewAssumptions replaces the riskiest_assumptions array for the
// appropriate tracks in a roadmap payload, inferred from the assumption ID
// prefix (asm-p → product, asm-s → strategy, asm-o → org_ops, asm-c → commercial).
// When newAssumptions is empty (pull_the_plug), all track assumptions are cleared.
func mergeNewAssumptions(roadmapPayload map[string]any, newAssumptions []any) map[string]any {
	// Deep clone via JSON round-trip.
	raw, _ := json.Marshal(roadmapPayload)
	var cloned map[string]any
	_ = json.Unmarshal(raw, &cloned)

	roadmap, ok := cloned["roadmap"].(map[string]any)
	if !ok {
		return cloned
	}

	if len(newAssumptions) == 0 {
		// pull_the_plug: clear all track assumptions.
		for _, trackKey := range []string{"product", "strategy", "org_ops", "commercial"} {
			if track, ok := roadmap[trackKey].(map[string]any); ok {
				track["riskiest_assumptions"] = []any{}
				roadmap[trackKey] = track
			}
		}
		cloned["roadmap"] = roadmap
		return cloned
	}

	// Group assumptions by track prefix.
	byTrack := map[string][]any{}
	for _, a := range newAssumptions {
		aMap, ok := a.(map[string]any)
		if !ok {
			continue
		}
		id, _ := aMap["id"].(string)
		trackKey := assumptionIDToTrack(id)
		if trackKey == "" {
			continue
		}
		byTrack[trackKey] = append(byTrack[trackKey], a)
	}

	for trackKey, assumptions := range byTrack {
		if track, ok := roadmap[trackKey].(map[string]any); ok {
			track["riskiest_assumptions"] = assumptions
			roadmap[trackKey] = track
		}
	}
	cloned["roadmap"] = roadmap
	return cloned
}

// assumptionIDToTrack maps an assumption ID prefix to the roadmap track key.
// Pattern: asm-{p|s|o|c}-NNN
func assumptionIDToTrack(id string) string {
	switch {
	case strings.HasPrefix(id, "asm-p-"):
		return "product"
	case strings.HasPrefix(id, "asm-s-"):
		return "strategy"
	case strings.HasPrefix(id, "asm-o-"):
		return "org_ops"
	case strings.HasPrefix(id, "asm-c-"):
		return "commercial"
	default:
		return ""
	}
}

// ---------------------------------------------------------------------------
// Prompt rendering (Task 1.3 / 1.5)
// ---------------------------------------------------------------------------

// renderPrompt renders the skill's prompt.md as a Go text/template with the
// context bundle. Returns the rendered string, the number of dropped features
// (token budget truncation), and any template parse/execute error.
//
// Template functions available to prompt.md authors:
//   - toJSON v          — renders v as indented JSON
//   - schemaConstraints name — returns a Markdown constraint appendix derived
//     live from the embedded canonical schema for the named artifact type.
//     Example: {{schemaConstraints "roadmap_recipe"}}
func renderPrompt(promptMD string, bundle *ContextBundle) (string, int, error) {
	tmpl, err := template.New("skill").Funcs(template.FuncMap{
		"toJSON": func(v any) string {
			b, _ := json.MarshalIndent(v, "", "  ")
			return string(b)
		},
		"schemaConstraints": func(artifactType string) string {
			sc, err := ExtractSchemaConstraints(artifactType)
			if err != nil {
				slog.Warn("renderPrompt: schemaConstraints failed", "artifact_type", artifactType, "err", err)
				return fmt.Sprintf("<!-- schemaConstraints(%q) unavailable: %v -->", artifactType, err)
			}
			return RenderConstraintAppendix(sc)
		},
		// triggeringSignals renders a human-readable summary of the ripple signals
		// that caused this skill run. Returns an empty string if none.
		"triggeringSignals": func(b *ContextBundle) string {
			if len(b.TriggeringSignals) == 0 {
				return ""
			}
			var sb strings.Builder
			sb.WriteString("## Ripple Signals That Triggered This Draft\n\n")
			for _, sig := range b.TriggeringSignals {
				desc, _ := sig["description"].(string)
				tier, _ := sig["authority_tier"].(string)
				sev, _ := sig["severity"].(string)
				target, _ := sig["target_key"].(string)
				fmt.Fprintf(&sb, "- **%s** (%s/%s): %s\n", target, tier, sev, desc)
			}
			return sb.String()
		},
		// triggeringSignalsSeverity returns the highest severity among triggering
		// signals ("critical", "warning", or "info"), or "" if none.
		"triggeringSignalsSeverity": func(b *ContextBundle) string {
			highest := ""
			order := map[string]int{"critical": 3, "warning": 2, "info": 1}
			for _, sig := range b.TriggeringSignals {
				sev, _ := sig["severity"].(string)
				if order[sev] > order[highest] {
					highest = sev
				}
			}
			if highest == "" {
				return "No severity information available."
			}
			return fmt.Sprintf("Highest triggering signal severity: **%s**", highest)
		},
	}).Parse(promptMD)
	if err != nil {
		return "", 0, fmt.Errorf("parse prompt template: %w", err)
	}

	// First attempt: render with full context.
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, bundle); err != nil {
		return "", 0, fmt.Errorf("execute prompt template: %w", err)
	}

	rendered := buf.String()
	if utf8.RuneCountInString(rendered) <= maxTokenBudget {
		return rendered, 0, nil
	}

	// Token budget exceeded: drop feature definitions one by one.
	dropped := 0
	features, _ := bundle.Artifacts[domain.ArtifactTypeFeature].([]any)
	for len(features) > 0 && utf8.RuneCountInString(rendered) > maxTokenBudget {
		features = features[:len(features)-1]
		dropped++

		// Rebuild artifacts map without the trimmed features.
		trimmed := copyArtifacts(bundle.Artifacts)
		if len(features) == 0 {
			delete(trimmed, domain.ArtifactTypeFeature)
		} else {
			trimmed[domain.ArtifactTypeFeature] = features
		}
		trimmedBundle := &ContextBundle{
			InstanceID:        bundle.InstanceID,
			Decision:          bundle.Decision,
			AssessmentSummary: bundle.AssessmentSummary,
			Artifacts:         trimmed,
			Params:            bundle.Params,
			PriorOutputs:      bundle.PriorOutputs,
			TriggeringSignals: bundle.TriggeringSignals,
		}

		buf.Reset()
		if err := tmpl.Execute(&buf, trimmedBundle); err != nil {
			return "", dropped, fmt.Errorf("execute prompt template (truncated): %w", err)
		}
		rendered = buf.String()
	}

	return rendered, dropped, nil
}

// copyArtifacts makes a shallow copy of an artifacts map.
func copyArtifacts(src map[string]any) map[string]any {
	dst := make(map[string]any, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

// ---------------------------------------------------------------------------
// Batch finalization helpers
// ---------------------------------------------------------------------------

// finalizeBatch writes batch_metadata and promotes all staging mutations to
// staged in one shot. Called from both the success and error paths of
// runChunkedInternal so that change summaries are always persisted — even
// when a later chunk fails and only a partial batch is promoted.
func (e *Executor) finalizeBatch(ctx context.Context, batchID uuid.UUID, skillName, trigger string, params map[string]any, changeSummaries map[string]string) {
	cascadeGen := 0
	if gen, ok := params["_cascade_generation"].(int); ok {
		cascadeGen = gen
	}
	meta := map[string]any{
		"cascade_generation": cascadeGen,
		"skill_name":         skillName,
		"trigger":            trigger,
	}
	if len(changeSummaries) > 0 {
		meta["change_summaries"] = changeSummaries
	}
	metaRaw, marshalErr := json.Marshal(meta)
	if marshalErr != nil {
		slog.Error("skillexec: failed to marshal batch_metadata",
			"skill", skillName, "batch_id", batchID.String(), "err", marshalErr)
	} else {
		if _, dbErr := e.db.NewUpdate().
			TableExpr("strategy_mutations").
			Set("batch_metadata = ?::jsonb", string(metaRaw)).
			Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusStaging).
			Exec(ctx); dbErr != nil {
			slog.Error("skillexec: failed to write batch_metadata",
				"skill", skillName, "batch_id", batchID.String(), "err", dbErr)
		}
	}

	// Promote all mutations from "staging" → "staged" atomically.
	if _, dbErr := e.db.NewUpdate().
		TableExpr("strategy_mutations").
		Set("status = ?", domain.MutationStatusStaged).
		Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusStaging).
		Exec(ctx); dbErr != nil {
		slog.Error("skillexec: failed to promote staging → staged",
			"skill", skillName, "batch_id", batchID.String(), "err", dbErr)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// stageMutation inserts a single mutation row with the given status.
// Use domain.MutationStatusStaging for chunked runs (promoted to staged
// after all chunks complete) or domain.MutationStatusStaged for single-shot runs.
func (e *Executor) stageMutation(ctx context.Context, instanceID, batchID uuid.UUID, description, artifactType, artifactKey string, payload any, status string) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal %s: %w", artifactType, err)
	}
	m := &domain.StrategyMutation{
		ID:               uuid.New(),
		InstanceID:       instanceID,
		BatchID:          &batchID,
		ArtifactType:     artifactType,
		ArtifactKey:      artifactKey,
		Action:           domain.MutationActionUpdate,
		Payload:          raw,
		Status:           status,
		Source:           domain.MutationSourceSystem,
		BatchDescription: &description,
		CreatedAt:        time.Now().UTC(),
	}
	if _, err := e.db.NewInsert().Model(m).Exec(ctx); err != nil {
		return fmt.Errorf("insert mutation: %w", err)
	}
	return nil
}

// artTypeToKey derives a conventional artifact key from an artifact type.
func artTypeToKey(artType string) string {
	return strings.ReplaceAll(artType, "_", "-")
}

// mergeExistingArtifact fills in structural fields that the LLM omitted by
// copying them from the existing committed artifact. The LLM's output takes
// precedence — only missing keys are filled from the existing version.
// This handles cases where the LLM focuses on content changes and drops
// required envelope fields like id, strategy_id, tracks, etc.
func mergeExistingArtifact(outputKey string, output, existing map[string]any) {
	llmPayload, ok := output[outputKey].(map[string]any)
	if !ok {
		return
	}
	existingPayload, ok := existing[outputKey].(map[string]any)
	if !ok {
		// Try without the outer key — some artifacts store payload directly.
		existingPayload, ok = existing["payload"].(map[string]any)
		if !ok {
			return
		}
	}

	// Shallow merge: fill missing top-level keys from existing.
	for k, v := range existingPayload {
		if _, has := llmPayload[k]; !has {
			llmPayload[k] = v
		}
	}

	// Also merge one level deeper for known wrapper keys (e.g. "roadmap"
	// inside roadmap_recipe, "strategy" inside strategy_formula).
	for _, innerKey := range []string{"roadmap", "strategy", "portfolio", "north_star", "strategy_foundations", "opportunity"} {
		llmInner, llmOK := llmPayload[innerKey].(map[string]any)
		existInner, exOK := existingPayload[innerKey].(map[string]any)
		if llmOK && exOK {
			for k, v := range existInner {
				if _, has := llmInner[k]; !has {
					llmInner[k] = v
				}
			}
		}
	}
}

// metadataDefaults defines default values for metadata fields that LLMs
// commonly omit. Each entry is only injected if the artifact's schema
// actually defines that property (checked via embedded.SchemaAllowsProperty).
var metadataDefaults = []struct {
	field        string
	defaultValue func() any
}{
	{"last_updated", func() any { return time.Now().UTC().Format("2006-01-02") }},
	{"confidence_level", func() any { return "medium" }},
}

// injectMetadataDefaults fills in bookkeeping fields that LLMs commonly omit.
// Only injects a field if the artifact's embedded schema defines it, so
// artifact types with additionalProperties: false won't be poisoned.
func injectMetadataDefaults(outputKey string, output map[string]any) {
	inner, ok := output[outputKey].(map[string]any)
	if !ok {
		return
	}

	for _, md := range metadataDefaults {
		if _, exists := inner[md.field]; exists {
			continue // LLM already provided it
		}
		if !embedded.SchemaAllowsProperty(outputKey, md.field) {
			continue // schema doesn't define this field
		}
		inner[md.field] = md.defaultValue()
	}
}

// isMutableArtifactType returns true for artifact types that should be
// included in skeleton mode staging. Excludes features (too many), evidence,
// and config artifacts.
func isMutableArtifactType(artType string) bool {
	switch artType {
	case domain.ArtifactTypeStrategyFormula,
		domain.ArtifactTypeRoadmap,
		domain.ArtifactTypeNorthStar,
		domain.ArtifactTypeLRA:
		return true
	}
	return false
}

// copyWithSkeletonFlag returns a new map with _skeleton: true added.
func copyWithSkeletonFlag(payload any) map[string]any {
	m, _ := payload.(map[string]any)
	raw, _ := json.Marshal(m)
	var cloned map[string]any
	_ = json.Unmarshal(raw, &cloned)
	if cloned == nil {
		cloned = map[string]any{}
	}
	cloned["_skeleton"] = true
	return cloned
}

// systemPromptFor builds a brief system prompt for the LLM skill execution.
func systemPromptFor(skillName string) string {
	return fmt.Sprintf(
		"You are the Emergent Strategy skill executor running the %q skill. "+
			"You MUST respond with valid JSON matching the skill's output schema. "+
			"Do not include any text outside the JSON object.",
		skillName,
	)
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

// loadSkillOutputSchema loads the output_schema.json for a skill. It first
// tries the embedded canonical skills FS, then checks whether skillYAML
// declares an inline output_schema field. Returns nil if no schema is found.
func loadSkillOutputSchema(skillName, _ string) ([]byte, error) {
	data, err := embedded.GetSkillOutputSchema(skillName)
	if err != nil {
		return nil, fmt.Errorf("load output schema: %w", err)
	}
	return data, nil // nil means no schema declared — caller handles
}

// validateJSONSchema validates rawJSON against jsonSchemaBytes using the
// embedded jsonschema v6 engine. Returns a list of human-readable error
// strings; empty slice means valid.
func validateJSONSchema(rawJSON string, jsonSchemaBytes []byte) []string {
	result := embedded.ValidateArtifactFromBytes("", []byte(rawJSON), jsonSchemaBytes)
	if result.Valid {
		return nil
	}
	return result.Errors
}

// validateArtifactPayloads validates each known artifact payload in the LLM
// output against its canonical EPF JSON schema. Returns a list of errors
// prefixed with the artifact type for clarity.
func validateArtifactPayloads(output map[string]any) []string {
	var errs []string
	for outputKey, artType := range knownArtifactOutputKeys {
		val, ok := output[outputKey]
		if !ok || val == nil {
			continue
		}
		payloadBytes, err := json.Marshal(val)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: failed to marshal payload: %v", artType, err))
			continue
		}
		result := embedded.ValidateArtifact(artType, payloadBytes)
		for _, e := range result.Errors {
			errs = append(errs, fmt.Sprintf("%s: %s", artType, e))
		}
	}
	return errs
}

// fixMaxItemsViolations scans validation errors for maxItems violations and
// trims the offending arrays in-place. Returns the count of arrays fixed.
// Error format: "artifact_type: at '/path/to/array': maxItems: got N, want M"
func fixMaxItemsViolations(artifact any, errs []string) int {
	fixed := 0
	for _, e := range errs {
		// Parse: "...: at '/a/b/c': maxItems: got N, want M"
		atIdx := strings.Index(e, "at '")
		if atIdx < 0 {
			continue
		}
		maxIdx := strings.Index(e, "maxItems: got ")
		if maxIdx < 0 {
			continue
		}
		// Extract the JSON pointer path.
		pathStart := atIdx + len("at '")
		pathEnd := strings.Index(e[pathStart:], "'")
		if pathEnd < 0 {
			continue
		}
		jsonPath := e[pathStart : pathStart+pathEnd]

		// Extract the "want" value.
		wantStr := ""
		if wantIdx := strings.Index(e, "want "); wantIdx >= 0 {
			wantStr = e[wantIdx+len("want "):]
			// Trim any trailing non-digit characters.
			end := 0
			for end < len(wantStr) && wantStr[end] >= '0' && wantStr[end] <= '9' {
				end++
			}
			wantStr = wantStr[:end]
		}
		if wantStr == "" {
			continue
		}
		maxItems := 0
		for _, c := range wantStr {
			maxItems = maxItems*10 + int(c-'0')
		}
		if maxItems <= 0 {
			continue
		}

		// Walk the JSON path to find the array.
		segments := strings.Split(strings.TrimPrefix(jsonPath, "/"), "/")
		if len(segments) == 0 {
			continue
		}

		current := artifact
		var parentMap map[string]any
		var lastKey string
		for _, seg := range segments {
			if seg == "" {
				continue
			}
			m, ok := current.(map[string]any)
			if !ok {
				current = nil
				break
			}
			parentMap = m
			lastKey = seg
			current = m[seg]
		}

		arr, ok := current.([]any)
		if !ok || len(arr) <= maxItems {
			continue
		}

		// Trim the array.
		parentMap[lastKey] = arr[:maxItems]
		fixed++
	}
	return fixed
}

// correctionPrompt builds a retry prompt that includes the original prompt
// followed by a correction section listing the validation errors the LLM
// must fix. When the previous output is available, it is included (truncated
// to 4000 chars) so the LLM can see exactly what it produced and fix it.
func correctionPrompt(originalPrompt string, validationErrors []string, previousOutput string) string {
	var sb strings.Builder
	sb.WriteString(originalPrompt)
	sb.WriteString("\n\n---\n\n## CORRECTION REQUIRED\n\n")
	sb.WriteString("Your previous response failed validation. You MUST fix ALL of the following errors before responding:\n\n")
	for i, e := range validationErrors {
		fmt.Fprintf(&sb, "%d. %s\n", i+1, e)
	}
	if previousOutput != "" {
		sb.WriteString("\n### Your Previous (Invalid) Response\n\n")
		if len(previousOutput) > 4000 {
			sb.WriteString("```json\n")
			sb.WriteString(previousOutput[:4000])
			sb.WriteString("\n... (truncated)\n```\n")
		} else {
			sb.WriteString("```json\n")
			sb.WriteString(previousOutput)
			sb.WriteString("\n```\n")
		}
	}
	sb.WriteString("\nRespond with a corrected JSON object that passes all validation rules. Do not include any text outside the JSON object.")
	return sb.String()
}

// cleanJSON attempts to extract valid JSON from LLM output that may contain
// markdown fences, trailing commas, or other common LLM malformations.
// Applied before json.Unmarshal to avoid burning retries on trivially fixable issues.
func cleanJSON(s string) string {
	s = strings.TrimSpace(s)

	// Strip markdown code fences: ```json ... ``` or ``` ... ```
	if strings.HasPrefix(s, "```json") {
		s = strings.TrimPrefix(s, "```json")
		if idx := strings.LastIndex(s, "```"); idx >= 0 {
			s = s[:idx]
		}
		s = strings.TrimSpace(s)
	} else if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
		if idx := strings.LastIndex(s, "```"); idx >= 0 {
			s = s[:idx]
		}
		s = strings.TrimSpace(s)
	}

	// Extract the outermost { ... } if there's surrounding text.
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		s = s[start : end+1]
	}

	// Remove trailing commas before } or ] (extremely common LLM error).
	// Handles: ,} ,] ,\n} ,\n] and variants with whitespace.
	s = removeTrailingCommas(s)

	return s
}

// removeTrailingCommas removes trailing commas before closing braces/brackets.
// Handles patterns like: ,} ,] , } , ] ,\n  } etc.
func removeTrailingCommas(s string) string {
	// Fast path: no commas at all.
	if !strings.Contains(s, ",") {
		return s
	}

	var buf strings.Builder
	buf.Grow(len(s))

	inString := false
	escaped := false

	for i := 0; i < len(s); i++ {
		c := s[i]

		if escaped {
			buf.WriteByte(c)
			escaped = false
			continue
		}

		if c == '\\' && inString {
			buf.WriteByte(c)
			escaped = true
			continue
		}

		if c == '"' {
			inString = !inString
			buf.WriteByte(c)
			continue
		}

		if inString {
			buf.WriteByte(c)
			continue
		}

		// Outside a string, check for trailing comma.
		if c == ',' {
			// Look ahead past whitespace for } or ].
			j := i + 1
			for j < len(s) && (s[j] == ' ' || s[j] == '\t' || s[j] == '\n' || s[j] == '\r') {
				j++
			}
			if j < len(s) && (s[j] == '}' || s[j] == ']') {
				// Skip the comma (trailing comma before close).
				continue
			}
		}

		buf.WriteByte(c)
	}

	return buf.String()
}
