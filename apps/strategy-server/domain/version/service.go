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
	FromVersion int                `json:"from_version"`
	ToVersion   int                `json:"to_version"`
	Added       []DiffArtifact     `json:"added"`
	Removed     []DiffArtifact     `json:"removed"`
	Changed     []DiffArtifact     `json:"changed"`
	Summary     string             `json:"summary"`
}

// DiffArtifact identifies an artifact in a diff.
type DiffArtifact struct {
	ArtifactKey string `json:"artifact_key"`
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
func (s *Service) PublishAIMCycle(ctx context.Context, instanceID uuid.UUID, label, description string) error {
	ver, err := s.Publish(ctx, instanceID, label, description)
	if err != nil {
		return err
	}
	// Stamp source = 'aim_cycle' — Publish always writes 'manual' (the DB default).
	if _, err := s.db.NewUpdate().
		Model((*domain.StrategyVersion)(nil)).
		Set("source = ?", "aim_cycle").
		Where("id = ?", ver.ID).
		Exec(ctx); err != nil {
		return fmt.Errorf("stamp aim_cycle source: %w", err)
	}
	return nil
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
	var versions []*domain.StrategyVersion
	err := s.db.NewSelect().
		Model((*domain.StrategyVersion)(nil)).
		Column("id", "instance_id", "version", "label", "description", "status",
			"source", "equilibrium_score", "parent_version_id", "published_by",
			"published_at", "snapshot").
		Where("instance_id = ?", instanceID).
		OrderExpr("version DESC").
		Scan(ctx, &versions)
	if err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}

	summaries := make([]VersionSummary, 0, len(versions))
	for _, v := range versions {
		sum := VersionSummary{
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
		}
		// Extract artifact count from snapshot metadata without deserializing the whole blob.
		var snap Snapshot
		if err := json.Unmarshal(v.Snapshot, &snap); err == nil {
			sum.ArtifactCount = snap.Metadata.ArtifactCount
		}
		summaries = append(summaries, sum)
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
	for key, toPayload := range toSnap.Artifacts {
		fromPayload, exists := fromSnap.Artifacts[key]
		if !exists {
			result.Added = append(result.Added, DiffArtifact{ArtifactKey: key})
		} else if string(fromPayload) != string(toPayload) {
			result.Changed = append(result.Changed, DiffArtifact{ArtifactKey: key})
		}
	}

	// Find removed.
	for key := range fromSnap.Artifacts {
		if _, exists := toSnap.Artifacts[key]; !exists {
			result.Removed = append(result.Removed, DiffArtifact{ArtifactKey: key})
		}
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
			"instance_id":     instanceID,
			"restored_from":   sourceVer.Version,
			"new_version":     restoredVer.Version,
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

func strPtr(s string) *string {
	return &s
}
