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
	"fmt"
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
}

// New creates a new Executor. Pass nil for llm to operate in skeleton mode.
func New(db *bun.DB, packSvc *pack.Service, llm LLMClient) *Executor {
	return &Executor{db: db, packSvc: packSvc, llm: llm}
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

	if e.llm == nil {
		return e.stageSkeleton(ctx, instanceID, batchID, batchDesc, bundle)
	}

	// Load the skill's output schema once (nil if not declared).
	outputSchemaBytes, err := loadSkillOutputSchema(skillName, skill.SkillYAML)
	if err != nil {
		slog.WarnContext(ctx, "skillexec: could not load output schema", "skill", skillName, "err", err)
		// Non-fatal: proceed without envelope validation.
	}

	// 5–6. LLM call + validation + retry loop.
	output, validationPassed, err := e.callWithValidation(ctx, skillName, rendered, outputSchemaBytes)
	if err != nil {
		return SkillResult{}, err
	}

	// 7. Stage mutations.
	artifactTypes, err := e.stageMutationsFromOutput(ctx, instanceID, batchID, batchDesc, output, bundle)
	if err != nil {
		return SkillResult{}, fmt.Errorf("skillexec: stage mutations: %w", err)
	}

	return SkillResult{
		BatchID:          batchID,
		ArtifactTypes:    artifactTypes,
		LLMUsed:          true,
		ValidationPassed: validationPassed,
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
			Model:          "", // populated by the adapter; not available here
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

		// Read chunk prompt template from embedded FS.
		promptBytes, err := skillFS.Open(chunk.promptFile)
		if err != nil {
			return SkillResult{}, fmt.Errorf("skillexec: chunk %d: open prompt %q: %w", chunkNum, chunk.promptFile, err)
		}
		buf := new(bytes.Buffer)
		if _, err := buf.ReadFrom(promptBytes); err != nil {
			return SkillResult{}, fmt.Errorf("skillexec: chunk %d: read prompt: %w", chunkNum, err)
		}
		_ = promptBytes.(interface{ Close() error }).Close() //nolint:errcheck

		// Inject prior outputs into the bundle for this chunk.
		bundle.PriorOutputs = priorOutputs

		// Render the chunk prompt template.
		rendered, droppedFeatures, err := renderPrompt(buf.String(), bundle)
		if err != nil {
			return SkillResult{}, fmt.Errorf("skillexec: chunk %d: render prompt: %w", chunkNum, err)
		}
		if droppedFeatures > 0 {
			slog.WarnContext(ctx, "skillexec: chunk context truncated", "skill", skillName, "chunk", chunkNum, "dropped_features", droppedFeatures)
		}

		slog.InfoContext(ctx, "skillexec: running chunk",
			"skill", skillName, "chunk", chunkNum, "output_key", chunk.outputKey)

		// LLM call + validation for this chunk only.
		chunkResult, err := e.callWithValidationChunk(ctx, skillName, chunkNum, chunk.outputKey, chunk.artifactType, rendered, instanceID)
		if err != nil {
			e.record(ctx, instanceID, "skill.failed", map[string]any{
				"skill_name":    skillName,
				"batch_id":      batchID.String(),
				"chunk":         chunkNum,
				"output_key":    chunk.outputKey,
				"error":         err.Error(),
				"staged_so_far": allArtifactTypes,
			})
			// Record failure in the run ledger.
			if e.runLedger != nil && runID != uuid.Nil {
				_ = e.runLedger.Fail(ctx, runID, err.Error())
			}
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
		staged, err := e.stageMutationsFromOutput(ctx, instanceID, batchID, batchDesc, chunkResult.Output, bundle)
		if err != nil {
			return SkillResult{BatchID: batchID, ArtifactTypes: allArtifactTypes},
				fmt.Errorf("skillexec: chunk %d: stage: %w", chunkNum, err)
		}
		allArtifactTypes = append(allArtifactTypes, staged...)

		// Record the successful chunk and make its output available to subsequent chunks.
		if val, ok := chunkResult.Output[chunk.outputKey]; ok {
			priorOutputs[chunk.outputKey] = val
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

	// Mark the run complete in the ledger.
	if e.runLedger != nil && runID != uuid.Nil {
		_ = e.runLedger.Complete(ctx, runID, batchID)
	}

	e.record(ctx, instanceID, "skill.completed", map[string]any{
		"skill_name":     skillName,
		"batch_id":       batchID.String(),
		"artifact_types": allArtifactTypes,
		"input_tokens":   totalInputTokens,
		"output_tokens":  totalOutputTokens,
		"run_id":         runID.String(),
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
func (e *Executor) callWithValidationChunk(
	ctx context.Context,
	skillName string,
	chunkNum int,
	outputKey string,
	artifactType string,
	initialPrompt string,
	instanceID uuid.UUID,
) (*chunkCallResult, error) {
	currentPrompt := initialPrompt
	var lastErrors []string
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
			currentPrompt = correctionPrompt(initialPrompt, lastErrors)
		}

		result, err := e.llm.CompleteJSON(ctx, systemPromptFor(skillName), currentPrompt)
		if err != nil {
			return nil, fmt.Errorf("LLM call (attempt %d): %w", attempt+1, err)
		}
		totalIn += result.InputTokens
		totalOut += result.OutputTokens

		var output map[string]any
		if err := json.Unmarshal([]byte(result.Content), &output); err != nil {
			lastErrors = []string{fmt.Sprintf("LLM returned invalid JSON: %v", err)}
			continue
		}

		// Validate canonical EPF schema for this artifact type (if known).
		if artifactType != "" {
			valMap := map[string]any{outputKey: output[outputKey]}
			if errs := validateArtifactPayloads(valMap); len(errs) > 0 {
				lastErrors = errs
				slog.WarnContext(ctx, "skillexec: chunk artifact validation failed",
					"skill", skillName, "chunk", chunkNum, "output_key", outputKey,
					"attempt", attempt+1, "errors", errs)
				continue
			}
		}

		return &chunkCallResult{
			Output:       output,
			Validated:    true,
			InputTokens:  totalIn,
			OutputTokens: totalOut,
		}, nil
	}

	return nil, fmt.Errorf("chunk %d (%s) failed validation after %d attempt(s): %s",
		chunkNum, outputKey, maxValidationRetries+1, strings.Join(lastErrors, "; "))
}

// callWithValidation calls the LLM and validates the output against:
//   - the skill's output_schema.json envelope (if outputSchemaBytes != nil)
//   - the canonical EPF JSON schema for each artifact type present in the output
//
// On failure, it retries up to maxValidationRetries times by feeding the
// validation errors back as a correction prompt.
func (e *Executor) callWithValidation(
	ctx context.Context,
	skillName string,
	initialPrompt string,
	outputSchemaBytes []byte,
) (map[string]any, bool, error) {
	currentPrompt := initialPrompt
	var lastErrors []string

	for attempt := 0; attempt <= maxValidationRetries; attempt++ {
		if attempt > 0 {
			slog.InfoContext(ctx, "skillexec: retrying after validation errors",
				"skill", skillName, "attempt", attempt, "error_count", len(lastErrors))
			currentPrompt = correctionPrompt(initialPrompt, lastErrors)
		}

		result, err := e.llm.CompleteJSON(ctx, systemPromptFor(skillName), currentPrompt)
		if err != nil {
			return nil, false, fmt.Errorf("skillexec: LLM call (attempt %d): %w", attempt+1, err)
		}

		var output map[string]any
		if err := json.Unmarshal([]byte(result.Content), &output); err != nil {
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

		// Validate each artifact payload against its canonical EPF schema.
		artifactErrors := validateArtifactPayloads(output)
		if len(artifactErrors) > 0 {
			lastErrors = artifactErrors
			slog.WarnContext(ctx, "skillexec: artifact schema validation failed",
				"skill", skillName, "attempt", attempt+1, "errors", artifactErrors)
			continue
		}

		// All validations passed.
		validationPassed := outputSchemaBytes != nil
		return output, validationPassed, nil
	}

	// All retries exhausted.
	return nil, false, fmt.Errorf("skillexec: skill %q output failed validation after %d attempt(s): %s",
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
		if err := e.stageMutation(ctx, instanceID, batchID, batchDesc, artType, artTypeToKey(artType), marked); err != nil {
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
}

func (e *Executor) stageMutationsFromOutput(
	ctx context.Context,
	instanceID, batchID uuid.UUID,
	batchDesc string,
	output map[string]any,
	bundle *ContextBundle,
) ([]string, error) {
	var artifactTypes []string

	// Handle lra_evolution_entry first — append to LRA evolution_log.
	if entry, ok := output["lra_evolution_entry"]; ok && entry != nil {
		if err := e.appendLRAEvolutionEntry(ctx, instanceID, batchID, batchDesc, entry, bundle); err != nil {
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
		if err := e.stageMutation(ctx, instanceID, batchID, batchDesc, artType, key, payload); err != nil {
			return nil, fmt.Errorf("stage %s: %w", artType, err)
		}
		artifactTypes = append(artifactTypes, artType)
	}

	return artifactTypes, nil
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
	return e.stageMutation(ctx, instanceID, batchID, batchDesc, domain.ArtifactTypeLRA, "living-reality-assessment", merged)
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
// Helpers
// ---------------------------------------------------------------------------

// stageMutation inserts a single staged mutation row.
func (e *Executor) stageMutation(ctx context.Context, instanceID, batchID uuid.UUID, description, artifactType, artifactKey string, payload any) error {
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
		Status:           domain.MutationStatusStaged,
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

// correctionPrompt builds a retry prompt that includes the original prompt
// followed by a correction section listing the validation errors the LLM
// must fix. The LLM is instructed to produce a corrected JSON response.
func correctionPrompt(originalPrompt string, validationErrors []string) string {
	var sb strings.Builder
	sb.WriteString(originalPrompt)
	sb.WriteString("\n\n---\n\n## CORRECTION REQUIRED\n\n")
	sb.WriteString("Your previous response failed schema validation. You MUST fix ALL of the following errors before responding:\n\n")
	for i, e := range validationErrors {
		fmt.Fprintf(&sb, "%d. %s\n", i+1, e)
	}
	sb.WriteString("\nRespond with a corrected JSON object that passes all validation rules. Do not include any text outside the JSON object.")
	return sb.String()
}
