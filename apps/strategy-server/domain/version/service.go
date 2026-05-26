// Package version provides strategy versioning — atomic JSONB snapshots of
// all artifacts and relationships in an instance.
package version

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Service manages strategy version lifecycle.
type Service struct {
	db *bun.DB
}

// NewService creates a new version Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// Snapshot is the JSONB structure stored in strategy_versions.snapshot.
type Snapshot struct {
	Artifacts     map[string]json.RawMessage `json:"artifacts"`
	Relationships []RelationshipEntry        `json:"relationships"`
	Metadata      SnapshotMetadata           `json:"metadata"`
}

// RelationshipEntry is a relationship in the snapshot.
type RelationshipEntry struct {
	SourceKey    string `json:"source_key"`
	SourceType   string `json:"source_type"`
	TargetKey    string `json:"target_key"`
	TargetType   string `json:"target_type"`
	Relationship string `json:"relationship"`
}

// SnapshotMetadata captures context about the snapshot.
type SnapshotMetadata struct {
	ArtifactCount     int    `json:"artifact_count"`
	RelationshipCount int    `json:"relationship_count"`
	SchemaVersion     string `json:"schema_version,omitempty"`
	Dialect           string `json:"dialect,omitempty"`
	PublishedBy       string `json:"published_by,omitempty"`
}

// VersionSummary is a lightweight view returned by List (no snapshot blob).
type VersionSummary struct {
	ID               uuid.UUID  `json:"id"`
	InstanceID       uuid.UUID  `json:"instance_id"`
	Version          int        `json:"version"`
	Label            *string    `json:"label,omitempty"`
	Description      *string    `json:"description,omitempty"`
	Status           string     `json:"status"`
	Source           string     `json:"source"`
	ParentVersionID  *uuid.UUID `json:"parent_version_id,omitempty"`
	ArtifactCount    int        `json:"artifact_count"`
	EquilibriumScore *float64   `json:"equilibrium_score,omitempty"`
	PublishedBy      *uuid.UUID `json:"published_by,omitempty"`
	PublishedAt      string     `json:"published_at"`
}

// DiffResult is the structured output of comparing two versions.
type DiffResult struct {
	FromVersion int            `json:"from_version"`
	ToVersion   int            `json:"to_version"`
	Added       []DiffArtifact `json:"added"`
	Removed     []DiffArtifact `json:"removed"`
	Changed     []DiffArtifact `json:"changed"`
	Summary     string         `json:"summary"`
}

// DiffArtifact identifies an artifact in a diff with optional change details.
type DiffArtifact struct {
	ArtifactKey    string   `json:"artifact_key"`
	ChangeDetails  []string `json:"change_details,omitempty"` // human-readable field-level changes
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

// Publish creates a new version by snapshotting all current artifacts and
// relationships for the instance.
func (s *Service) Publish(ctx context.Context, instanceID uuid.UUID, label, description string) (*domain.StrategyVersion, error) {
	actorID := audit.ActorFromContext(ctx)

	// Load instance for schema metadata.
	var inst domain.StrategyInstance
	err := s.db.NewSelect().Model(&inst).Where("id = ?", instanceID).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrInstanceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load instance: %w", err)
	}

	// Load all non-archived artifacts.
	var artifacts []*domain.StrategyArtifact
	err = s.db.NewSelect().
		Model((*domain.StrategyArtifact)(nil)).
		Where("instance_id = ? AND status != ?", instanceID, domain.ArtifactStatusArchived).
		Scan(ctx, &artifacts)
	if err != nil {
		return nil, fmt.Errorf("load artifacts: %w", err)
	}

	// Load all relationships.
	var rels []*domain.StrategyRelationship
	err = s.db.NewSelect().
		Model((*domain.StrategyRelationship)(nil)).
		Where("instance_id = ?", instanceID).
		Scan(ctx, &rels)
	if err != nil {
		return nil, fmt.Errorf("load relationships: %w", err)
	}

	// Build snapshot.
	snap := Snapshot{
		Artifacts:     make(map[string]json.RawMessage, len(artifacts)),
		Relationships: make([]RelationshipEntry, 0, len(rels)),
		Metadata: SnapshotMetadata{
			ArtifactCount:     len(artifacts),
			RelationshipCount: len(rels),
			Dialect:           inst.Dialect,
		},
	}
	if inst.SchemaVersion != nil {
		snap.Metadata.SchemaVersion = *inst.SchemaVersion
	}
	if actorID != nil {
		snap.Metadata.PublishedBy = actorID.String()
	}

	for _, a := range artifacts {
		snap.Artifacts[a.ArtifactKey] = a.Payload
	}
	for _, r := range rels {
		snap.Relationships = append(snap.Relationships, RelationshipEntry{
			SourceKey:    r.SourceKey,
			SourceType:   r.SourceType,
			TargetKey:    r.TargetKey,
			TargetType:   r.TargetType,
			Relationship: r.Relationship,
		})
	}

	snapshotBytes, err := json.Marshal(snap)
	if err != nil {
		return nil, fmt.Errorf("marshal snapshot: %w", err)
	}

	// Transaction: get next version number, supersede previous, insert new.
	var ver domain.StrategyVersion
	err = s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Next version number: service-level MAX+1.
		var maxVersion int
		err := tx.NewSelect().
			Model((*domain.StrategyVersion)(nil)).
			ColumnExpr("COALESCE(MAX(version), 0)").
			Where("instance_id = ?", instanceID).
			Scan(ctx, &maxVersion)
		if err != nil {
			return fmt.Errorf("get max version: %w", err)
		}
		nextVersion := maxVersion + 1

		// Find current published version to set as parent and supersede.
		var parentID *uuid.UUID
		var currentPublished domain.StrategyVersion
		err = tx.NewSelect().
			Model(&currentPublished).
			Where("instance_id = ? AND status = ?", instanceID, domain.VersionStatusPublished).
			OrderExpr("version DESC").
			Limit(1).
			Scan(ctx)
		if err == nil {
			parentID = &currentPublished.ID
			// Supersede the previous version.
			_, err = tx.NewUpdate().
				Model((*domain.StrategyVersion)(nil)).
				Set("status = ?", domain.VersionStatusSuperseded).
				Where("id = ?", currentPublished.ID).
				Exec(ctx)
			if err != nil {
				return fmt.Errorf("supersede previous version: %w", err)
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("find current version: %w", err)
		}

		// Set label.
		var labelPtr, descPtr *string
		if label != "" {
			labelPtr = &label
		}
		if description != "" {
			descPtr = &description
		}

		ver = domain.StrategyVersion{
			ID:              uuid.New(),
			InstanceID:      instanceID,
			Version:         nextVersion,
			Label:           labelPtr,
			Description:     descPtr,
			Status:          domain.VersionStatusPublished,
			ParentVersionID: parentID,
			Snapshot:        json.RawMessage(snapshotBytes),
			PublishedBy:     actorID,
		}

		if _, err := tx.NewInsert().Model(&ver).Exec(ctx); err != nil {
			return fmt.Errorf("insert version: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_version",
		EntityID:   ver.ID,
		Action:     "publish",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details: map[string]any{
			"instance_id": instanceID,
			"version":     ver.Version,
			"label":       label,
		},
	})

	return &ver, nil
}

// PublishAIMCycle is like Publish but stamps source='aim_cycle' on the version.
// It is called by the orchestration snapshot step after a completed AIM cycle.
func (s *Service) PublishAIMCycle(ctx context.Context, instanceID uuid.UUID, label, description string) (uuid.UUID, error) {
	ver, err := s.Publish(ctx, instanceID, label, description)
	if err != nil {
		return uuid.Nil, err
	}
	// Stamp source = 'aim_cycle' — Publish always writes 'manual' (the DB default).
	if _, err := s.db.NewUpdate().
		Model((*domain.StrategyVersion)(nil)).
		Set("source = ?", "aim_cycle").
		Where("id = ?", ver.ID).
		Exec(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("stamp aim_cycle source: %w", err)
	}
	return ver.ID, nil
}

// CountAIMCycles returns the number of published aim_cycle versions for an instance.
func (s *Service) CountAIMCycles(ctx context.Context, instanceID uuid.UUID) (int, error) {
	var count int
	err := s.db.NewSelect().
		TableExpr("strategy_versions").
		ColumnExpr("COUNT(*)").
		Where("instance_id = ?", instanceID).
		Where("source = ?", "aim_cycle").
		Scan(ctx, &count)
	return count, err
}

// ---------------------------------------------------------------------------
// List / Get
// ---------------------------------------------------------------------------

// List returns all versions for an instance, ordered by version number descending.
// The snapshot is excluded from the response for performance.
func (s *Service) List(ctx context.Context, instanceID uuid.UUID) ([]VersionSummary, error) {
	// Fetch version metadata without loading the full JSONB snapshot blob.
	// Artifact count is extracted via a SQL expression on the snapshot metadata.
	type versionRow struct {
		ID               uuid.UUID  `bun:"id"`
		InstanceID       uuid.UUID  `bun:"instance_id"`
		Version          int        `bun:"version"`
		Label            *string    `bun:"label"`
		Description      *string    `bun:"description"`
		Status           string     `bun:"status"`
		Source           string     `bun:"source"`
		EquilibriumScore *float64   `bun:"equilibrium_score"`
		ParentVersionID  *uuid.UUID `bun:"parent_version_id"`
		PublishedBy      *uuid.UUID `bun:"published_by"`
		PublishedAt      time.Time  `bun:"published_at"`
		ArtifactCount    int        `bun:"artifact_count"`
	}

	var rows []versionRow
	err := s.db.NewSelect().
		TableExpr("strategy_versions").
		ColumnExpr("id, instance_id, version, label, description, status, source").
		ColumnExpr("equilibrium_score, parent_version_id, published_by, published_at").
		ColumnExpr("COALESCE((snapshot->'metadata'->>'artifact_count')::int, 0) AS artifact_count").
		Where("instance_id = ?", instanceID).
		OrderExpr("version DESC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}

	summaries := make([]VersionSummary, 0, len(rows))
	for _, v := range rows {
		summaries = append(summaries, VersionSummary{
			ID:               v.ID,
			InstanceID:       v.InstanceID,
			Version:          v.Version,
			Label:            v.Label,
			Description:      v.Description,
			Status:           v.Status,
			Source:           v.Source,
			EquilibriumScore: v.EquilibriumScore,
			ParentVersionID:  v.ParentVersionID,
			PublishedBy:      v.PublishedBy,
			PublishedAt:      v.PublishedAt.UTC().Format("2006-01-02T15:04:05Z"),
			ArtifactCount:    v.ArtifactCount,
		})
	}
	return summaries, nil
}

// Get returns a specific version with its full snapshot.
func (s *Service) Get(ctx context.Context, instanceID, versionID uuid.UUID) (*domain.StrategyVersion, error) {
	var ver domain.StrategyVersion
	err := s.db.NewSelect().
		Model(&ver).
		Where("id = ? AND instance_id = ?", versionID, instanceID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrNotFound.WithDetail("strategy version not found")
	}
	if err != nil {
		return nil, fmt.Errorf("get version: %w", err)
	}
	return &ver, nil
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

// Diff compares two versions and returns a structured diff.
func (s *Service) Diff(ctx context.Context, instanceID, fromVersionID, toVersionID uuid.UUID) (*DiffResult, error) {
	fromVer, err := s.Get(ctx, instanceID, fromVersionID)
	if err != nil {
		return nil, fmt.Errorf("load from-version: %w", err)
	}
	toVer, err := s.Get(ctx, instanceID, toVersionID)
	if err != nil {
		return nil, fmt.Errorf("load to-version: %w", err)
	}
	return diffVersionSnapshots(fromVer, toVer)
}

// DiffAgainstParent diffs the given version against its parent, loading only
// the parent snapshot from the database. Use this when you already have the
// current version loaded to avoid a redundant fetch.
func (s *Service) DiffAgainstParent(ctx context.Context, ver *domain.StrategyVersion) (*DiffResult, error) {
	if ver.ParentVersionID == nil {
		return nil, fmt.Errorf("version has no parent")
	}
	parentVer, err := s.Get(ctx, ver.InstanceID, *ver.ParentVersionID)
	if err != nil {
		return nil, fmt.Errorf("load parent version: %w", err)
	}
	return diffVersionSnapshots(parentVer, ver)
}

// diffVersionSnapshots compares two version snapshots and returns a structured diff.
func diffVersionSnapshots(fromVer, toVer *domain.StrategyVersion) (*DiffResult, error) {
	var fromSnap, toSnap Snapshot
	if err := json.Unmarshal(fromVer.Snapshot, &fromSnap); err != nil {
		return nil, fmt.Errorf("unmarshal from-snapshot: %w", err)
	}
	if err := json.Unmarshal(toVer.Snapshot, &toSnap); err != nil {
		return nil, fmt.Errorf("unmarshal to-snapshot: %w", err)
	}

	result := &DiffResult{
		FromVersion: fromVer.Version,
		ToVersion:   toVer.Version,
	}

	// Find added and changed.
	// Snapshots may contain both hyphenated and underscored keys for the
	// same artifact (e.g. "strategy-formula" and "strategy_formula").
	// Deduplicate by tracking the normalized (underscored) form.
	seenNormalized := make(map[string]bool)
	for key, toPayload := range toSnap.Artifacts {
		norm := strings.ReplaceAll(key, "-", "_")
		if seenNormalized[norm] {
			continue // already processed via the other key variant
		}
		seenNormalized[norm] = true

		// Look up from-payload using both key variants.
		fromPayload, exists := fromSnap.Artifacts[key]
		if !exists {
			altKey := strings.ReplaceAll(key, "-", "_")
			if altKey == key {
				altKey = strings.ReplaceAll(key, "_", "-")
			}
			fromPayload, exists = fromSnap.Artifacts[altKey]
		}

		if !exists {
			result.Added = append(result.Added, DiffArtifact{ArtifactKey: key})
		} else if string(fromPayload) != string(toPayload) {
			details := diffArtifactDetails(fromPayload, toPayload)
			result.Changed = append(result.Changed, DiffArtifact{
				ArtifactKey:   key,
				ChangeDetails: details,
			})
		}
	}

	// Find removed.
	for key := range fromSnap.Artifacts {
		norm := strings.ReplaceAll(key, "-", "_")
		if seenNormalized[norm] {
			continue // present in to-snapshot (possibly under different key variant)
		}
		// Also check the alternate key form in the to-snapshot.
		altKey := strings.ReplaceAll(key, "-", "_")
		if altKey == key {
			altKey = strings.ReplaceAll(key, "_", "-")
		}
		if _, exists := toSnap.Artifacts[altKey]; exists {
			continue // present under alternate key
		}
		result.Removed = append(result.Removed, DiffArtifact{ArtifactKey: key})
	}

	// Summary.
	parts := make([]string, 0, 3)
	if len(result.Added) > 0 {
		parts = append(parts, fmt.Sprintf("%d added", len(result.Added)))
	}
	if len(result.Removed) > 0 {
		parts = append(parts, fmt.Sprintf("%d removed", len(result.Removed)))
	}
	if len(result.Changed) > 0 {
		parts = append(parts, fmt.Sprintf("%d changed", len(result.Changed)))
	}
	if len(parts) == 0 {
		result.Summary = "no changes"
	} else {
		result.Summary = strings.Join(parts, ", ")
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

// Restore recreates the artifact state from a previous version's snapshot.
// It deletes all current artifacts and relationships, then re-inserts from the
// snapshot. The restored state is tracked as a new version with status "restored".
func (s *Service) Restore(ctx context.Context, instanceID, versionID uuid.UUID) (*domain.StrategyVersion, error) {
	actorID := audit.ActorFromContext(ctx)

	// Load the version to restore.
	sourceVer, err := s.Get(ctx, instanceID, versionID)
	if err != nil {
		return nil, err
	}

	var snap Snapshot
	if err := json.Unmarshal(sourceVer.Snapshot, &snap); err != nil {
		return nil, fmt.Errorf("unmarshal snapshot: %w", err)
	}

	// Create a mutation batch for the restore.
	batchID := uuid.New()
	source := string(audit.SourceFromContext(ctx))

	var restoredVer domain.StrategyVersion
	err = s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Delete current artifacts.
		_, err := tx.NewDelete().
			Model((*domain.StrategyArtifact)(nil)).
			Where("instance_id = ?", instanceID).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("delete current artifacts: %w", err)
		}

		// Delete current relationships.
		_, err = tx.NewDelete().
			Model((*domain.StrategyRelationship)(nil)).
			Where("instance_id = ?", instanceID).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("delete current relationships: %w", err)
		}

		// Re-insert artifacts from snapshot.
		for key, payload := range snap.Artifacts {
			// Infer artifact type from key.
			artifactType := inferArtifactType(key)

			// Create a committed mutation.
			mut := &domain.StrategyMutation{
				ID:               uuid.New(),
				InstanceID:       instanceID,
				BatchID:          &batchID,
				ArtifactType:     artifactType,
				ArtifactKey:      key,
				Action:           domain.MutationActionCreate,
				Payload:          payload,
				Status:           domain.MutationStatusCommitted,
				Source:           source,
				BatchDescription: strPtr(fmt.Sprintf("restored from version %d", sourceVer.Version)),
				CreatedBy:        actorID,
			}
			if _, err := tx.NewInsert().Model(mut).Exec(ctx); err != nil {
				return fmt.Errorf("insert mutation for %q: %w", key, err)
			}

			// Insert artifact.
			art := &domain.StrategyArtifact{
				ID:           uuid.New(),
				InstanceID:   instanceID,
				ArtifactType: artifactType,
				ArtifactKey:  key,
				Status:       domain.ArtifactStatusActive,
				Payload:      payload,
				MutationID:   mut.ID,
			}
			if _, err := tx.NewInsert().Model(art).Exec(ctx); err != nil {
				return fmt.Errorf("insert artifact for %q: %w", key, err)
			}
		}

		// Re-insert relationships from snapshot.
		for _, r := range snap.Relationships {
			rel := &domain.StrategyRelationship{
				ID:           uuid.New(),
				InstanceID:   instanceID,
				SourceKey:    r.SourceKey,
				SourceType:   r.SourceType,
				TargetKey:    r.TargetKey,
				TargetType:   r.TargetType,
				Relationship: r.Relationship,
			}
			if _, err := tx.NewInsert().Model(rel).Exec(ctx); err != nil {
				return fmt.Errorf("insert relationship: %w", err)
			}
		}

		// Publish the restored state as a new version.
		var maxVersion int
		if scanErr := tx.NewSelect().
			Model((*domain.StrategyVersion)(nil)).
			ColumnExpr("COALESCE(MAX(version), 0)").
			Where("instance_id = ?", instanceID).
			Scan(ctx, &maxVersion); scanErr != nil {
			return fmt.Errorf("get max version: %w", scanErr)
		}

		// Supersede current published version.
		_, err = tx.NewUpdate().
			Model((*domain.StrategyVersion)(nil)).
			Set("status = ?", domain.VersionStatusSuperseded).
			Where("instance_id = ? AND status = ?", instanceID, domain.VersionStatusPublished).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("supersede current version: %w", err)
		}

		label := fmt.Sprintf("Restored from v%d", sourceVer.Version)
		desc := fmt.Sprintf("Restored from version %d (%s)", sourceVer.Version, versionID.String())
		restoredVer = domain.StrategyVersion{
			ID:              uuid.New(),
			InstanceID:      instanceID,
			Version:         maxVersion + 1,
			Label:           &label,
			Description:     &desc,
			Status:          domain.VersionStatusRestored,
			ParentVersionID: &sourceVer.ID,
			Snapshot:        sourceVer.Snapshot, // same snapshot
			PublishedBy:     actorID,
		}
		if _, err := tx.NewInsert().Model(&restoredVer).Exec(ctx); err != nil {
			return fmt.Errorf("insert restored version: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_version",
		EntityID:   restoredVer.ID,
		Action:     "restore",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details: map[string]any{
			"instance_id":   instanceID,
			"restored_from": sourceVer.Version,
			"new_version":   restoredVer.Version,
		},
	})

	return &restoredVer, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// inferArtifactType guesses the artifact type from the key.
// Matches the logic in domain/instance/service.go.
func inferArtifactType(key string) string {
	switch {
	case strings.HasPrefix(key, "fd-"):
		return domain.ArtifactTypeFeature
	case key == "north_star":
		return domain.ArtifactTypeNorthStar
	case key == "strategy_foundations":
		return domain.ArtifactTypeStrategyFoundations
	case key == "strategy_formula":
		return domain.ArtifactTypeStrategyFormula
	case key == "insight_analyses":
		return domain.ArtifactTypeInsightAnalyses
	case strings.HasPrefix(key, "vm-"):
		return domain.ArtifactTypeValueModel
	case key == "roadmap" || key == "roadmap_recipe":
		return domain.ArtifactTypeRoadmap
	case strings.HasPrefix(key, "lra-"):
		return domain.ArtifactTypeLRA
	case strings.HasPrefix(key, "aim-report-"):
		return domain.ArtifactTypeAssessmentReport
	case key == "aim_trigger_config":
		return domain.ArtifactTypeAIMTriggerConfig
	default:
		return "unknown"
	}
}

// diffArtifactDetails compares two artifact JSONB payloads and returns
// human-readable descriptions of key changes. It uses artifact-type-aware
// extraction to surface the most strategically meaningful changes.
func diffArtifactDetails(fromRaw, toRaw json.RawMessage) []string {
	var from, to map[string]any
	if err := json.Unmarshal(fromRaw, &from); err != nil {
		return nil
	}
	if err := json.Unmarshal(toRaw, &to); err != nil {
		return nil
	}

	var details []string

	// ── Calibration memo ──
	details = append(details, diffCalibrationMemo(from, to)...)

	// ── Assessment report ──
	details = append(details, diffAssessmentReport(from, to)...)

	// ── Strategy formula ──
	details = append(details, diffStrategyFormula(from, to)...)

	// ── Roadmap recipe ──
	details = append(details, diffRoadmapRecipe(from, to)...)

	// ── North star ──
	details = append(details, diffNorthStar(from, to)...)

	// ── LRA ──
	details = append(details, diffLRA(from, to)...)

	// ── Insight analyses ──
	details = append(details, diffInsightAnalyses(from, to)...)

	// ── Strategy foundations ──
	details = append(details, diffStrategyFoundations(from, to)...)

	// ── Generic fallback: detect top-level field count changes ──
	if len(details) == 0 {
		details = diffGenericChanges(from, to)
	}

	return details
}

// ── Artifact-specific diff extractors ──────────────────────────────────────

func diffCalibrationMemo(from, to map[string]any) []string {
	if _, ok := to["decision"]; !ok {
		return nil // not a calibration memo
	}
	var details []string
	fromDec, _ := from["decision"].(string)
	toDec, _ := to["decision"].(string)
	if toDec != "" && fromDec != "" && toDec != fromDec {
		details = append(details, fmt.Sprintf("Decision: %s → %s", fromDec, toDec))
	} else if toDec != "" {
		details = append(details, fmt.Sprintf("Decision: %s", toDec))
	}
	if toRate, ok := to["okr_hit_rate_pct"]; ok {
		fromRate, _ := from["okr_hit_rate_pct"]
		if fmt.Sprint(toRate) != fmt.Sprint(fromRate) {
			details = append(details, fmt.Sprintf("OKR hit rate: %v%%", toRate))
		}
	}
	if toReasoning, _ := to["reasoning"].(string); toReasoning != "" {
		fromReasoning, _ := from["reasoning"].(string)
		if toReasoning != fromReasoning {
			details = append(details, truncateSentence(toReasoning, 200))
		}
	}
	return details
}

func diffAssessmentReport(from, to map[string]any) []string {
	if _, ok := to["okr_assessments"]; !ok {
		return nil
	}
	var details []string
	if toStatus, _ := to["overall_status"].(string); toStatus != "" {
		fromStatus, _ := from["overall_status"].(string)
		label := strings.ReplaceAll(toStatus, "_", " ")
		if fromStatus != "" && fromStatus != toStatus {
			details = append(details, fmt.Sprintf("Overall status: %s → %s",
				strings.ReplaceAll(fromStatus, "_", " "), label))
		} else {
			details = append(details, fmt.Sprintf("Overall status: %s", label))
		}
	}
	if toInsights, ok := to["strategic_insights"].([]any); ok && len(toInsights) > 0 {
		// Show first insight text as a preview.
		if first, ok := toInsights[0].(string); ok {
			details = append(details, truncateSentence(first, 180))
		}
	}
	diffArrayCount(&details, from, to, "okr_assessments", "OKRs assessed")
	diffArrayCount(&details, from, to, "assumption_validations", "assumptions validated")
	diffArrayCount(&details, from, to, "next_cycle_recommendations", "recommendations")
	return details
}

func diffStrategyFormula(from, to map[string]any) []string {
	// The formula is nested under "strategy" key.
	toStrat, _ := to["strategy"].(map[string]any)
	if toStrat == nil {
		return nil
	}
	fromStrat, _ := from["strategy"].(map[string]any)
	if fromStrat == nil {
		fromStrat = map[string]any{}
	}
	var details []string
	// Confidence level change.
	toConf, _ := toStrat["confidence_level"].(string)
	fromConf, _ := fromStrat["confidence_level"].(string)
	if toConf != "" && toConf != fromConf {
		if fromConf != "" {
			details = append(details, fmt.Sprintf("Confidence: %s → %s", fromConf, toConf))
		} else {
			details = append(details, fmt.Sprintf("Confidence: %s", toConf))
		}
	}
	// UVP change.
	toPos, _ := toStrat["positioning"].(map[string]any)
	fromPos, _ := fromStrat["positioning"].(map[string]any)
	if toPos != nil {
		toUVP, _ := toPos["unique_value_proposition"].(string)
		var fromUVP string
		if fromPos != nil {
			fromUVP, _ = fromPos["unique_value_proposition"].(string)
		}
		if toUVP != "" && toUVP != fromUVP {
			details = append(details, "Value proposition updated")
		}
	}
	// Revenue streams count.
	toBM, _ := toStrat["business_model"].(map[string]any)
	fromBM, _ := fromStrat["business_model"].(map[string]any)
	if toBM != nil && fromBM != nil {
		diffNestedArrayCount(&details, fromBM, toBM, "revenue_streams", "revenue streams")
		diffNestedArrayCount(&details, fromBM, toBM, "growth_engines", "growth engines")
	}
	// Risks count.
	diffNestedArrayCount(&details, fromStrat, toStrat, "risks", "risks")
	// Success metrics.
	toMetrics, _ := toStrat["success_metrics"].(map[string]any)
	fromMetrics, _ := fromStrat["success_metrics"].(map[string]any)
	if toMetrics != nil && fromMetrics != nil {
		diffNestedArrayCount(&details, fromMetrics, toMetrics, "leading_indicators", "leading indicators")
		diffNestedArrayCount(&details, fromMetrics, toMetrics, "lagging_indicators", "lagging indicators")
	}
	// Competitive moat changes.
	toMoat, _ := toStrat["competitive_moat"].(map[string]any)
	fromMoat, _ := fromStrat["competitive_moat"].(map[string]any)
	if toMoat != nil && fromMoat != nil {
		diffNestedArrayCount(&details, fromMoat, toMoat, "moat_sources", "moat sources")
	}
	return details
}

func diffRoadmapRecipe(from, to map[string]any) []string {
	toRoadmap, _ := to["roadmap"].(map[string]any)
	if toRoadmap == nil {
		return nil
	}
	fromRoadmap, _ := from["roadmap"].(map[string]any)
	if fromRoadmap == nil {
		fromRoadmap = map[string]any{}
	}
	var details []string
	diffNestedArrayCount(&details, fromRoadmap, toRoadmap, "tracks", "tracks")
	// Count total KRs across tracks.
	toKRs := countNestedArrays(toRoadmap, "tracks", "key_results")
	fromKRs := countNestedArrays(fromRoadmap, "tracks", "key_results")
	if toKRs != fromKRs && toKRs > 0 {
		details = append(details, fmt.Sprintf("Key results: %d → %d across all tracks", fromKRs, toKRs))
	}
	return details
}

func diffNorthStar(from, to map[string]any) []string {
	toNS, _ := to["north_star"].(map[string]any)
	if toNS == nil {
		return nil
	}
	fromNS, _ := from["north_star"].(map[string]any)
	if fromNS == nil {
		fromNS = map[string]any{}
	}
	var details []string
	// Mission/vision text change.
	for _, key := range []string{"mission", "vision", "purpose"} {
		toVal, _ := toNS[key].(string)
		fromVal, _ := fromNS[key].(string)
		if toVal != "" && toVal != fromVal {
			details = append(details, fmt.Sprintf("%s updated", key))
		}
	}
	// Core beliefs sub-arrays.
	toBeliefs, _ := toNS["core_beliefs"].(map[string]any)
	fromBeliefs, _ := fromNS["core_beliefs"].(map[string]any)
	if toBeliefs != nil && fromBeliefs != nil {
		for _, subKey := range []string{"about_our_market", "about_our_customers", "about_our_approach", "about_our_team"} {
			label := strings.ReplaceAll(subKey, "_", " ")
			diffNestedArrayCount(&details, fromBeliefs, toBeliefs, subKey, label)
		}
	}
	return details
}

func diffLRA(from, to map[string]any) []string {
	if _, ok := to["track_baselines"]; !ok {
		return nil
	}
	var details []string
	diffArrayCount(&details, from, to, "evolution_log", "evolution entries")
	diffArrayCount(&details, from, to, "track_baselines", "track baselines")
	if toFocus, _ := to["current_focus"].(string); toFocus != "" {
		fromFocus, _ := from["current_focus"].(string)
		if toFocus != fromFocus {
			details = append(details, truncateSentence(toFocus, 150))
		}
	}
	return details
}

func diffInsightAnalyses(from, to map[string]any) []string {
	toIA, _ := to["insight_analyses"].(map[string]any)
	if toIA == nil {
		return nil
	}
	fromIA, _ := from["insight_analyses"].(map[string]any)
	if fromIA == nil {
		fromIA = map[string]any{}
	}
	var details []string
	diffNestedArrayCount(&details, fromIA, toIA, "insight_areas", "insight areas")
	diffNestedArrayCount(&details, fromIA, toIA, "confidence_gaps", "confidence gaps")
	diffNestedArrayCount(&details, fromIA, toIA, "blind_spots", "blind spots")
	return details
}

func diffStrategyFoundations(from, to map[string]any) []string {
	toSF, _ := to["foundations"].(map[string]any)
	if toSF == nil {
		return nil
	}
	fromSF, _ := from["foundations"].(map[string]any)
	if fromSF == nil {
		fromSF = map[string]any{}
	}
	var details []string
	diffNestedArrayCount(&details, fromSF, toSF, "strategic_principles", "strategic principles")
	diffNestedArrayCount(&details, fromSF, toSF, "competitive_landscape", "competitive landscape entries")
	// Check for resource/constraint text changes.
	for _, key := range []string{"primary_resources", "key_constraints"} {
		toVal, _ := toSF[key].(string)
		fromVal, _ := fromSF[key].(string)
		if toVal != "" && toVal != fromVal {
			details = append(details, fmt.Sprintf("%s updated", strings.ReplaceAll(key, "_", " ")))
		}
	}
	return details
}

func diffGenericChanges(from, to map[string]any) []string {
	var details []string
	for key, toVal := range to {
		if key == "metadata" || key == "last_updated" || key == "confidence_level" {
			continue
		}
		fromVal, exists := from[key]
		if !exists {
			details = append(details, fmt.Sprintf("%s added", strings.ReplaceAll(key, "_", " ")))
		} else if fmt.Sprint(toVal) != fmt.Sprint(fromVal) {
			details = append(details, fmt.Sprintf("%s updated", strings.ReplaceAll(key, "_", " ")))
		}
	}
	if len(details) > 5 {
		details = details[:5]
	}
	return details
}

// ── Diff helpers ───────────────────────────────────────────────────────────

func truncateSentence(s string, maxLen int) string {
	if idx := strings.Index(s, ". "); idx > 0 && idx < maxLen {
		return s[:idx+1]
	}
	if len(s) > maxLen {
		// Break at last space before maxLen.
		if idx := strings.LastIndex(s[:maxLen], " "); idx > maxLen/2 {
			return s[:idx] + "…"
		}
		return s[:maxLen] + "…"
	}
	return s
}

func diffArrayCount(details *[]string, from, to map[string]any, key, label string) {
	toArr, toOk := to[key].([]any)
	fromArr, fromOk := from[key].([]any)
	if toOk && fromOk && len(toArr) != len(fromArr) {
		*details = append(*details, fmt.Sprintf("%s: %d → %d", label, len(fromArr), len(toArr)))
	}
}

func diffNestedArrayCount(details *[]string, from, to map[string]any, key, label string) {
	toArr, toOk := to[key].([]any)
	fromArr, fromOk := from[key].([]any)
	if toOk && fromOk && len(toArr) != len(fromArr) {
		*details = append(*details, fmt.Sprintf("%s: %d → %d", label, len(fromArr), len(toArr)))
	} else if toOk && !fromOk && len(toArr) > 0 {
		*details = append(*details, fmt.Sprintf("%s: %d items", label, len(toArr)))
	}
}

// countNestedArrays sums the lengths of a named sub-array across all elements
// of a parent array. e.g. count all "key_results" across all "tracks".
func countNestedArrays(obj map[string]any, parentKey, childKey string) int {
	parentArr, ok := obj[parentKey].([]any)
	if !ok {
		return 0
	}
	total := 0
	for _, item := range parentArr {
		if m, ok := item.(map[string]any); ok {
			if arr, ok := m[childKey].([]any); ok {
				total += len(arr)
			}
		}
	}
	return total
}

func strPtr(s string) *string {
	return &s
}
