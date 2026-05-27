package skillexec

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ContextBundle is the data passed to the prompt template via text/template.
// All fields are exported so template expressions like {{.Decision}} work.
type ContextBundle struct {
	// InstanceID is the strategy instance UUID (string form for template use).
	InstanceID string

	// Decision is the calibration decision (persevere / pivot / pull_the_plug)
	// or empty if no committed calibration memo exists.
	Decision string

	// AssessmentSummary is the JSON-encoded summary of the last assessment report,
	// or empty if no assessment exists.
	AssessmentSummary string

	// Artifacts holds all committed artifact payloads keyed by artifact_type.
	// Feature artifacts are collected under the "feature" key as a []any slice.
	Artifacts map[string]any

	// Params are caller-supplied parameters (from workflow step input or MCP call).
	Params map[string]any

	// PriorOutputs holds the validated LLM outputs from earlier chunks in a
	// RunChunked execution. Keyed by output key (e.g. "strategy_formula").
	// Empty during single-shot Run() calls.
	PriorOutputs map[string]any

	// TriggeringSignals is the list of ripple signals that caused this skill run.
	// Each entry has: id, type, severity, authority_tier, source_key, target_key, description.
	// Empty when the skill is invoked manually rather than by the ripple trigger.
	TriggeringSignals []map[string]any

	// Evidence is the list of evidence items for the instance, as flat maps ready
	// for template injection. Keys: artifact_key, source_name, source_type, summary,
	// tags ([]string), content (string or object), processing_status.
	// Only populated for bootstrap skills — nil otherwise.
	Evidence []map[string]any
}

// buildContextBundle queries committed artifacts for the instance and
// constructs a ContextBundle ready for template rendering.
func buildContextBundle(ctx context.Context, db *bun.DB, instanceID uuid.UUID, params map[string]any) (*ContextBundle, error) {
	artifacts, err := loadAllArtifacts(ctx, db, instanceID)
	if err != nil {
		return nil, fmt.Errorf("load artifacts: %w", err)
	}

	decision := extractDecisionFromCalibration(artifacts)
	assessmentSummary := extractAssessmentSummary(artifacts)

	// Load evidence items — injected for bootstrap skills that need context.
	evidence := loadEvidenceForBundle(ctx, db, instanceID)

	bundle := &ContextBundle{
		InstanceID:        instanceID.String(),
		Decision:          decision,
		AssessmentSummary: assessmentSummary,
		Artifacts:         artifacts,
		Params:            params,
		Evidence:          evidence,
	}
	if bundle.Params == nil {
		bundle.Params = map[string]any{}
	}
	return bundle, nil
}

// loadEvidenceForBundle returns evidence items as flat maps for template injection.
// Returns nil on error (evidence is optional context — skill still runs).
func loadEvidenceForBundle(ctx context.Context, db *bun.DB, instanceID uuid.UUID) []map[string]any {
	type row struct {
		Payload json.RawMessage `bun:"payload"`
	}

	var rows []row
	err := db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeEvidence).
		Where("status != ?", domain.ArtifactStatusArchived).
		OrderExpr("created_at DESC").
		Limit(50). // cap at 50 items to avoid context overflow
		Scan(ctx, &rows)
	if err != nil {
		return nil
	}

	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var p map[string]any
		if err := json.Unmarshal(r.Payload, &p); err != nil {
			continue
		}
		// Flatten source sub-object for easier template access.
		if src, ok := p["source"].(map[string]any); ok {
			p["source_name"] = src["name"]
			p["source_type"] = src["type"]
		}
		items = append(items, p)
	}
	return items
}

// loadAllArtifacts returns all non-archived committed artifacts for the instance.
// Singleton artifacts are stored as map[string]any under their artifact_type key.
// Feature artifacts are collected into a []any slice under the "feature" key.
func loadAllArtifacts(ctx context.Context, db *bun.DB, instanceID uuid.UUID) (map[string]any, error) {
	type row struct {
		ArtifactType string          `bun:"artifact_type"`
		Payload      json.RawMessage `bun:"payload"`
	}

	var rows []row
	err := db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_type, payload").
		Where("instance_id = ?", instanceID).
		Where("status != ?", domain.ArtifactStatusArchived).
		OrderExpr("updated_at DESC").
		Scan(ctx, &rows)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("query artifacts: %w", err)
	}

	result := make(map[string]any)
	seenSingleton := map[string]bool{} // take only the most-recent per type

	// Multi-instance artifact types: collected as []any slices rather than
	// single entries, because multiple artifacts of the same type coexist.
	multiTypes := map[string]bool{
		domain.ArtifactTypeFeature:    true,
		domain.ArtifactTypeValueModel: true,
	}
	multiCollections := map[string][]any{}

	for _, r := range rows {
		if multiTypes[r.ArtifactType] {
			var p map[string]any
			if err := json.Unmarshal(r.Payload, &p); err == nil {
				multiCollections[r.ArtifactType] = append(multiCollections[r.ArtifactType], p)
			}
			continue
		}

		if seenSingleton[r.ArtifactType] {
			continue // keep only most-recent (ORDER BY updated_at DESC)
		}
		seenSingleton[r.ArtifactType] = true

		var p map[string]any
		if err := json.Unmarshal(r.Payload, &p); err != nil {
			continue
		}
		result[r.ArtifactType] = p
	}

	for artType, items := range multiCollections {
		result[artType] = items
	}

	return result, nil
}

// extractDecisionFromCalibration returns the decision token from the
// committed calibration_memo payload, or "" if none exists.
func extractDecisionFromCalibration(artifacts map[string]any) string {
	cal, ok := artifacts["calibration_memo"].(map[string]any)
	if !ok {
		return ""
	}
	decision, _ := cal["decision"].(string)
	return decision
}

// extractAssessmentSummary serialises the assessment_report into a compact
// JSON string for prompt injection. Returns "" if none exists.
func extractAssessmentSummary(artifacts map[string]any) string {
	ar, ok := artifacts[domain.ArtifactTypeAssessmentReport]
	if !ok {
		return ""
	}
	b, err := json.Marshal(ar)
	if err != nil {
		return ""
	}
	return string(b)
}
