// Package strategy provides domain logic for strategy artifact authoring and reading.
//
// All writes go through a staged batch pattern:
//  1. Stage: create a StrategyMutation with status='staged' and a batch_id.
//  2. Commit: promote all mutations in a batch to status='committed',
//     then upsert strategy_artifacts and replace strategy_relationships.
//  3. Discard: mark all mutations in a batch as status='discarded'.
//
// Read operations query strategy_artifacts (the current-state cache) rather
// than re-scanning strategy_mutations with DISTINCT ON.
package strategy

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/index"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Service handles strategy authoring and reading.
type Service struct {
	db *bun.DB
}

// NewService creates a new strategy Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// DB returns the underlying *bun.DB for use by sibling domain services.
func (s *Service) DB() *bun.DB {
	return s.db
}

// ---------------------------------------------------------------------------
// Read operations — query strategy_artifacts (current-state cache)
// ---------------------------------------------------------------------------

// GetCurrentArtifact returns the current committed artifact payload for an artifact key.
// Returns apperror.ErrNotFound if the artifact does not exist or is archived.
func (s *Service) GetCurrentArtifact(ctx context.Context, instanceID uuid.UUID, artifactKey string) (json.RawMessage, error) {
	var a domain.StrategyArtifact
	err := s.db.NewSelect().
		Model(&a).
		Where("instance_id = ? AND artifact_key = ? AND status != ?",
			instanceID, artifactKey, domain.ArtifactStatusArchived).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrNotFound.WithDetail(
			fmt.Sprintf("no artifact %q for instance %s", artifactKey, instanceID))
	}
	if err != nil {
		return nil, fmt.Errorf("get artifact %q: %w", artifactKey, err)
	}
	return json.RawMessage(a.Payload), nil
}

// GetCurrentArtifactFull returns the full StrategyArtifact row (includes index fields).
func (s *Service) GetCurrentArtifactFull(ctx context.Context, instanceID uuid.UUID, artifactKey string) (*domain.StrategyArtifact, error) {
	var a domain.StrategyArtifact
	err := s.db.NewSelect().
		Model(&a).
		Where("instance_id = ? AND artifact_key = ? AND status != ?",
			instanceID, artifactKey, domain.ArtifactStatusArchived).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrNotFound.WithDetail(
			fmt.Sprintf("no artifact %q for instance %s", artifactKey, instanceID))
	}
	if err != nil {
		return nil, fmt.Errorf("get artifact %q: %w", artifactKey, err)
	}
	return &a, nil
}

// ListCurrentArtifacts returns all non-archived artifacts for an instance,
// optionally filtered by artifact_type.
func (s *Service) ListCurrentArtifacts(ctx context.Context, instanceID uuid.UUID, artifactType string) ([]*domain.StrategyArtifact, error) {
	return s.ListArtifactsFiltered(ctx, instanceID, artifactType, false)
}

// ListArtifactsFiltered returns artifacts for an instance, optionally filtered by
// artifact_type. When includeArchived is false, archived artifacts are excluded.
func (s *Service) ListArtifactsFiltered(ctx context.Context, instanceID uuid.UUID, artifactType string, includeArchived bool) ([]*domain.StrategyArtifact, error) {
	q := s.db.NewSelect().
		Model((*domain.StrategyArtifact)(nil)).
		Where("instance_id = ?", instanceID).
		OrderExpr("artifact_type, artifact_key")

	if !includeArchived {
		q = q.Where("status != ?", domain.ArtifactStatusArchived)
	}

	if artifactType != "" {
		q = q.Where("artifact_type = ?", artifactType)
	}

	var artifacts []*domain.StrategyArtifact
	if err := q.Scan(ctx, &artifacts); err != nil {
		return nil, fmt.Errorf("list artifacts: %w", err)
	}
	return artifacts, nil
}

// ListRelationships returns all relationships for a given source or target artifact key.
func (s *Service) ListRelationships(ctx context.Context, instanceID uuid.UUID, artifactKey string) ([]*domain.StrategyRelationship, error) {
	var rels []*domain.StrategyRelationship
	err := s.db.NewSelect().
		Model((*domain.StrategyRelationship)(nil)).
		Where("instance_id = ? AND (source_key = ? OR target_key = ?)",
			instanceID, artifactKey, artifactKey).
		Scan(ctx, &rels)
	if err != nil {
		return nil, fmt.Errorf("list relationships for %q: %w", artifactKey, err)
	}
	return rels, nil
}

// maxMutationList is the hard cap on mutation history queries.
const maxMutationList = 200

// ListMutations returns mutations for an instance in reverse chronological order.
// Results are capped at maxMutationList rows. Use sinceMutationID for polling
// (returns only mutations committed after that ID) or cursor for page-based browsing.
func (s *Service) ListMutations(ctx context.Context, instanceID uuid.UUID, artifactType string, includeStaged bool, limit int, cursor string, sinceMutationID string) ([]*domain.StrategyMutation, string, error) {
	if limit <= 0 || limit > maxMutationList {
		limit = 50
	}

	q := s.db.NewSelect().
		Model((*domain.StrategyMutation)(nil)).
		Where("instance_id = ?", instanceID).
		OrderExpr("created_at DESC, id DESC").
		Limit(limit + 1)

	if artifactType != "" {
		q = q.Where("artifact_type = ?", artifactType)
	}
	if !includeStaged {
		q = q.Where("status = ?", domain.MutationStatusCommitted)
	}
	// sinceMutationID: agent polling — return only mutations newer than the given ID
	if sinceMutationID != "" {
		q = q.Where("created_at > (SELECT created_at FROM strategy_mutations WHERE id = ?::uuid)", sinceMutationID)
	} else if cursor != "" {
		// cursor: page-based browsing — return mutations older than cursor
		q = q.Where("created_at < (SELECT created_at FROM strategy_mutations WHERE id = ?::uuid)", cursor)
	}

	var mutations []*domain.StrategyMutation
	if err := q.Scan(ctx, &mutations); err != nil {
		return nil, "", fmt.Errorf("list mutations: %w", err)
	}

	var nextCursor string
	if len(mutations) > limit {
		nextCursor = mutations[limit].ID.String()
		mutations = mutations[:limit]
	}
	return mutations, nextCursor, nil
}

// GetMutation returns a single mutation by ID.
func (s *Service) GetMutation(ctx context.Context, mutationID uuid.UUID) (*domain.StrategyMutation, error) {
	var m domain.StrategyMutation
	err := s.db.NewSelect().Model(&m).Where("id = ?", mutationID).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrMutationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get mutation: %w", err)
	}
	return &m, nil
}

// ---------------------------------------------------------------------------
// Agent support — pending batches and batch description
// ---------------------------------------------------------------------------

// PendingBatch summarises a staged batch for human review.
type PendingBatch struct {
	BatchID          uuid.UUID `json:"batch_id"`
	ArtifactCount    int       `json:"artifact_count"`
	AgentID          *string   `json:"agent_id,omitempty"`
	BatchDescription *string   `json:"batch_description,omitempty"`
	StagedAt         time.Time `json:"staged_at"`
}

// ListPendingBatches returns all staged (uncommitted) batches for an instance.
func (s *Service) ListPendingBatches(ctx context.Context, instanceID uuid.UUID) ([]*PendingBatch, error) {
	type row struct {
		BatchID          uuid.UUID `bun:"batch_id"`
		ArtifactCount    int       `bun:"artifact_count"`
		AgentID          *string   `bun:"agent_id"`
		BatchDescription *string   `bun:"batch_description"`
		StagedAt         time.Time `bun:"staged_at"`
	}

	var rows []row
	err := s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("batch_id, COUNT(*) AS artifact_count, MAX(agent_id) AS agent_id, MAX(batch_description) AS batch_description, MIN(created_at) AS staged_at").
		Where("instance_id = ? AND status = ? AND batch_id IS NOT NULL", instanceID, domain.MutationStatusStaged).
		GroupExpr("batch_id").
		OrderExpr("staged_at DESC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("list pending batches: %w", err)
	}

	result := make([]*PendingBatch, len(rows))
	for i, r := range rows {
		result[i] = &PendingBatch{
			BatchID:          r.BatchID,
			ArtifactCount:    r.ArtifactCount,
			AgentID:          r.AgentID,
			BatchDescription: r.BatchDescription,
			StagedAt:         r.StagedAt,
		}
	}
	return result, nil
}

// DescribeBatch attaches an agent_id and description to all mutations in a staged batch.
func (s *Service) DescribeBatch(ctx context.Context, batchID uuid.UUID, agentID, description string) error {
	res, err := s.db.NewUpdate().
		Model((*domain.StrategyMutation)(nil)).
		Set("agent_id = ?, batch_description = ?", agentID, description).
		Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusStaged).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("describe batch: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return apperror.ErrBatchNotFound
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_mutation",
		Action:     "describe_batch",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
		Details:    map[string]any{"batch_id": batchID, "agent_id": agentID},
	})

	return nil
}

// SetBatchMetadata updates the batch_metadata JSONB column on all mutations
// in a staged batch. Used to attach ripple context (root_cause_key, chain).
func (s *Service) SetBatchMetadata(ctx context.Context, batchID uuid.UUID, metadata json.RawMessage) error {
	res, err := s.db.NewUpdate().
		Model((*domain.StrategyMutation)(nil)).
		Set("batch_metadata = ?", metadata).
		Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusStaged).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("set batch metadata: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return apperror.ErrBatchNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Write operations — staged batch pattern
// ---------------------------------------------------------------------------

// StageParams is the common input for staging any artifact mutation.
type StageParams struct {
	InstanceID   uuid.UUID
	ArtifactType string
	ArtifactKey  string
	Action       string     // domain.MutationAction*
	Payload      any        // will be JSON-marshalled
	BatchID      *uuid.UUID // nil = create new batch
}

// Stage creates a staged mutation and returns the batch ID.
func (s *Service) Stage(ctx context.Context, p StageParams) (uuid.UUID, error) {
	actorID := audit.ActorFromContext(ctx)
	source := string(audit.SourceFromContext(ctx))

	raw, err := json.Marshal(p.Payload)
	if err != nil {
		return uuid.Nil, apperror.ErrBadRequest.WithDetail("payload cannot be marshalled to JSON")
	}

	batchID := uuid.New()
	if p.BatchID != nil {
		batchID = *p.BatchID
	}

	m := &domain.StrategyMutation{
		ID:           uuid.New(),
		InstanceID:   p.InstanceID,
		BatchID:      &batchID,
		ArtifactType: p.ArtifactType,
		ArtifactKey:  p.ArtifactKey,
		Action:       p.Action,
		Payload:      raw,
		Status:       domain.MutationStatusStaged,
		Source:       source,
		CreatedBy:    actorID,
		CreatedAt:    time.Now().UTC(),
	}

	if _, err := s.db.NewInsert().Model(m).Exec(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("stage mutation: %w", err)
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_mutation",
		EntityID:   m.ID,
		Action:     "stage",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details:    map[string]any{"batch_id": batchID, "artifact_key": p.ArtifactKey, "artifact_type": p.ArtifactType},
	})

	return batchID, nil
}

// CommitBatch atomically promotes all staged mutations in a batch to committed,
// then derives the Strategic Index (strategy_artifacts + strategy_relationships).
func (s *Service) CommitBatch(ctx context.Context, batchID uuid.UUID) (int, error) {
	actorID := audit.ActorFromContext(ctx)

	// 1. Promote mutations to committed.
	res, err := s.db.NewUpdate().
		Model((*domain.StrategyMutation)(nil)).
		Set("status = ?", domain.MutationStatusCommitted).
		Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusStaged).
		Exec(ctx)
	if err != nil {
		return 0, fmt.Errorf("commit batch: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return 0, apperror.ErrBatchNotFound
	}

	// 2. Load the just-committed mutations.
	var mutations []*domain.StrategyMutation
	if err := s.db.NewSelect().
		Model((*domain.StrategyMutation)(nil)).
		Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusCommitted).
		Scan(ctx, &mutations); err != nil {
		return int(n), fmt.Errorf("reload committed mutations: %w", err)
	}

	// 3. Derive Strategic Index for each mutation.
	for _, m := range mutations {
		if err := s.deriveIndex(ctx, m); err != nil {
			// Log but don't fail the commit — the mutation is already committed.
			// The backfill command can re-derive on next run.
			slog.WarnContext(ctx, "derive index failed for committed mutation",
				"mutation_id", m.ID,
				"artifact_key", m.ArtifactKey,
				"err", err)
		}
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_mutation",
		Action:     "commit_batch",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details:    map[string]any{"batch_id": batchID, "count": n},
	})

	return int(n), nil
}

// CommitAutoParams is the input for creating an autonomous (convergence loop) commit.
type CommitAutoParams struct {
	InstanceID   uuid.UUID
	ArtifactType string
	ArtifactKey  string
	Action       string
	Payload      any
	SignalID     *uuid.UUID // the signal that triggered this auto-commit
}

// CommitAuto creates a committed mutation directly without staging, for use by
// the convergence loop. The mutation is tagged with source='ripple_auto' and
// includes the originating signal ID in batch_metadata. It derives the strategic
// index immediately.
func (s *Service) CommitAuto(ctx context.Context, p CommitAutoParams) (*domain.StrategyMutation, error) {
	raw, err := json.Marshal(p.Payload)
	if err != nil {
		return nil, fmt.Errorf("marshal auto-commit payload: %w", err)
	}

	var metadata json.RawMessage
	if p.SignalID != nil {
		metadata, _ = json.Marshal(map[string]any{
			"authority_tier": "autonomous",
			"signal_id":      p.SignalID.String(),
		})
	}

	m := &domain.StrategyMutation{
		ID:            uuid.New(),
		InstanceID:    p.InstanceID,
		ArtifactType:  p.ArtifactType,
		ArtifactKey:   p.ArtifactKey,
		Action:        p.Action,
		Payload:       raw,
		Status:        domain.MutationStatusCommitted,
		Source:        "ripple_auto",
		BatchMetadata: metadata,
		CreatedAt:     time.Now().UTC(),
	}

	if _, err := s.db.NewInsert().Model(m).Exec(ctx); err != nil {
		return nil, fmt.Errorf("auto-commit mutation: %w", err)
	}

	// Derive the strategic index for the auto-committed mutation.
	if err := s.deriveIndex(ctx, m); err != nil {
		slog.WarnContext(ctx, "auto-commit: derive index failed",
			"artifact_key", p.ArtifactKey, "err", err)
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_mutation",
		EntityID:   m.ID,
		Action:     "commit_auto",
		Source:     "ripple_auto",
		Details: map[string]any{
			"artifact_key":  p.ArtifactKey,
			"artifact_type": p.ArtifactType,
			"signal_id":     p.SignalID,
		},
	})

	return m, nil
}

// InstanceIDForBatch returns the instance_id for a batch by reading the first
// mutation in that batch. Returns uuid.Nil if not found.
func (s *Service) InstanceIDForBatch(ctx context.Context, batchID uuid.UUID) uuid.UUID {
	var m domain.StrategyMutation
	err := s.db.NewSelect().
		Model(&m).
		Column("instance_id").
		Where("batch_id = ?", batchID).
		Limit(1).
		Scan(ctx)
	if err != nil {
		return uuid.Nil
	}
	return m.InstanceID
}

// AssessmentEvidenceKeys returns the artifact_keys from the evidence_summary
// embedded in any assessment_report mutation in the given batch. Used to mark
// evidence as processed after an assessment batch is committed.
func (s *Service) AssessmentEvidenceKeys(ctx context.Context, batchID uuid.UUID) (instanceID uuid.UUID, evidenceKeys []string) {
	var mutations []*domain.StrategyMutation
	if err := s.db.NewSelect().
		Model((*domain.StrategyMutation)(nil)).
		Column("instance_id", "artifact_type", "artifact_key", "payload").
		Where("batch_id = ?", batchID).
		Where("artifact_type = ?", domain.ArtifactTypeAssessmentReport).
		Where("status = ?", domain.MutationStatusCommitted).
		Scan(ctx, &mutations); err != nil || len(mutations) == 0 {
		return uuid.Nil, nil
	}

	instanceID = mutations[0].InstanceID
	assessmentKey := mutations[0].ArtifactKey

	// Parse evidence_summary from the payload.
	var payload map[string]any
	if err := json.Unmarshal(mutations[0].Payload, &payload); err != nil {
		return instanceID, nil
	}
	summaryRaw, ok := payload["evidence_summary"].([]any)
	if !ok {
		return instanceID, nil
	}
	for _, entry := range summaryRaw {
		if m, ok := entry.(map[string]any); ok {
			if k, ok := m["artifact_key"].(string); ok && k != "" {
				evidenceKeys = append(evidenceKeys, k)
			}
		}
	}
	_ = assessmentKey // available for future use (e.g. recording which assessment consumed it)
	return instanceID, evidenceKeys
}

// deriveIndex upserts strategy_artifacts and replaces strategy_relationships
// for a single committed mutation.
func (s *Service) deriveIndex(ctx context.Context, m *domain.StrategyMutation) error {
	fields := index.ExtractArtifactFields(m.ArtifactType, m.Payload)

	if m.Action == domain.MutationActionArchive {
		// Mark artifact as archived; remove its relationships.
		_, err := s.db.NewUpdate().
			Model((*domain.StrategyArtifact)(nil)).
			Set("status = ?, mutation_id = ?, updated_at = NOW()", domain.ArtifactStatusArchived, m.ID).
			Where("instance_id = ? AND artifact_key = ?", m.InstanceID, m.ArtifactKey).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("archive artifact %q: %w", m.ArtifactKey, err)
		}
		_, err = s.db.NewDelete().
			Model((*domain.StrategyRelationship)(nil)).
			Where("instance_id = ? AND source_key = ?", m.InstanceID, m.ArtifactKey).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("delete relationships for archived %q: %w", m.ArtifactKey, err)
		}
		return nil
	}

	// Upsert into strategy_artifacts.
	track := (*string)(nil)
	if fields.Track != "" {
		track = &fields.Track
	}
	name := (*string)(nil)
	if fields.Name != "" {
		name = &fields.Name
	}

	artifact := &domain.StrategyArtifact{
		ID:           uuid.New(),
		InstanceID:   m.InstanceID,
		ArtifactType: m.ArtifactType,
		ArtifactKey:  m.ArtifactKey,
		Track:        track,
		Name:         name,
		Status:       fields.Status,
		Payload:      m.Payload,
		MutationID:   m.ID,
		CreatedAt:    m.CreatedAt,
		UpdatedAt:    time.Now().UTC(),
	}

	_, err := s.db.NewInsert().
		Model(artifact).
		On("CONFLICT (instance_id, artifact_key) DO UPDATE SET " +
			"artifact_type = EXCLUDED.artifact_type, " +
			"track = EXCLUDED.track, " +
			"name = EXCLUDED.name, " +
			"status = EXCLUDED.status, " +
			"payload = EXCLUDED.payload, " +
			"mutation_id = EXCLUDED.mutation_id, " +
			"updated_at = EXCLUDED.updated_at").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("upsert artifact %q: %w", m.ArtifactKey, err)
	}

	// Replace relationships for this source artifact.
	rels := index.ExtractRelationships(m.ArtifactType, m.ArtifactKey, m.Payload)

	_, err = s.db.NewDelete().
		Model((*domain.StrategyRelationship)(nil)).
		Where("instance_id = ? AND source_key = ?", m.InstanceID, m.ArtifactKey).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete old relationships for %q: %w", m.ArtifactKey, err)
	}

	if len(rels) > 0 {
		rows := make([]*domain.StrategyRelationship, 0, len(rels))
		for _, r := range rels {
			var meta json.RawMessage
			if r.Metadata != nil {
				var marshalErr error
				meta, marshalErr = json.Marshal(r.Metadata)
				if marshalErr != nil {
					slog.WarnContext(ctx, "skip relationship metadata marshal",
						"artifact_key", m.ArtifactKey,
						"target_key", r.TargetKey,
						"err", marshalErr)
					meta = nil
				}
			}
			rows = append(rows, &domain.StrategyRelationship{
				ID:           uuid.New(),
				InstanceID:   m.InstanceID,
				SourceKey:    m.ArtifactKey,
				SourceType:   m.ArtifactType,
				TargetKey:    r.TargetKey,
				TargetType:   r.TargetType,
				Relationship: r.Relationship,
				Metadata:     meta,
				CreatedAt:    time.Now().UTC(),
			})
		}
		_, err = s.db.NewInsert().
			Model(&rows).
			On("CONFLICT (instance_id, source_key, target_key, relationship) DO NOTHING").
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("insert relationships for %q: %w", m.ArtifactKey, err)
		}
	}

	return nil
}

// BackfillIndex re-derives strategy_artifacts and strategy_relationships from
// all committed mutations for an instance. Safe to run multiple times.
func (s *Service) BackfillIndex(ctx context.Context, instanceID uuid.UUID) (int, error) {
	// Load all committed mutations ordered oldest-first so later mutations win on upsert.
	var mutations []*domain.StrategyMutation
	err := s.db.NewSelect().
		Model((*domain.StrategyMutation)(nil)).
		Where("instance_id = ? AND status = ?", instanceID, domain.MutationStatusCommitted).
		OrderExpr("created_at ASC, id ASC").
		Scan(ctx, &mutations)
	if err != nil {
		return 0, fmt.Errorf("load mutations for backfill: %w", err)
	}

	count := 0
	for _, m := range mutations {
		if err := s.deriveIndex(ctx, m); err != nil {
			return count, fmt.Errorf("backfill artifact %q: %w", m.ArtifactKey, err)
		}
		count++
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_mutation",
		Action:     "backfill_index",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
		Details:    map[string]any{"instance_id": instanceID, "count": count},
	})

	return count, nil
}

// DiscardBatch marks all staged mutations in a batch as discarded.
func (s *Service) DiscardBatch(ctx context.Context, batchID uuid.UUID) (int, error) {
	actorID := audit.ActorFromContext(ctx)

	res, err := s.db.NewUpdate().
		Model((*domain.StrategyMutation)(nil)).
		Set("status = ?", domain.MutationStatusDiscarded).
		Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusStaged).
		Exec(ctx)
	if err != nil {
		return 0, fmt.Errorf("discard batch: %w", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return 0, apperror.ErrBatchNotFound
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_mutation",
		Action:     "discard_batch",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details:    map[string]any{"batch_id": batchID, "count": n},
	})

	return int(n), nil
}

// ---------------------------------------------------------------------------
// Phase E: Derived read views (cross-artifact queries via strategy_relationships)
// ---------------------------------------------------------------------------

// FeatureStrategicContext bundles a feature artifact with all of its indexed
// cross-artifact relationships, grouped by relationship type.
type FeatureStrategicContext struct {
	Feature          *domain.StrategyArtifact       `json:"feature"`
	ContributesTo    []string                       `json:"contributes_to"`
	TestsAssumptions []string                       `json:"tests_assumptions"`
	DependsOn        []string                       `json:"depends_on"`
	Enables          []string                       `json:"enables"`
	InTracks         []string                       `json:"in_tracks"`
	Relationships    []*domain.StrategyRelationship `json:"relationships"`
}

// GetStrategicContextForFeature returns a feature with all its indexed relationships
// grouped by type for an agent-friendly strategic overview.
func (s *Service) GetStrategicContextForFeature(ctx context.Context, instanceID uuid.UUID, featureKey string) (*FeatureStrategicContext, error) {
	artifact, err := s.GetCurrentArtifactFull(ctx, instanceID, featureKey)
	if err != nil {
		return nil, err
	}

	rels, err := s.ListRelationships(ctx, instanceID, featureKey)
	if err != nil {
		return nil, err
	}

	result := &FeatureStrategicContext{
		Feature:       artifact,
		Relationships: rels,
	}
	for _, r := range rels {
		switch r.Relationship {
		case domain.RelContributesTo:
			result.ContributesTo = append(result.ContributesTo, r.TargetKey)
		case domain.RelTestsAssumption:
			result.TestsAssumptions = append(result.TestsAssumptions, r.TargetKey)
		case domain.RelDependsOn:
			result.DependsOn = append(result.DependsOn, r.TargetKey)
		case domain.RelEnables:
			result.Enables = append(result.Enables, r.TargetKey)
		case domain.RelInTrack:
			result.InTracks = append(result.InTracks, r.TargetKey)
		}
	}
	return result, nil
}

// ValuePathEntry describes a value model path and which features contribute to it.
type ValuePathEntry struct {
	ValuePath string   `json:"value_path"`
	Features  []string `json:"features"`
}

// ExplainValuePath returns all contributes_to edges for a feature, showing
// the chain from feature → value model paths it delivers.
func (s *Service) ExplainValuePath(ctx context.Context, instanceID uuid.UUID, featureKey string) ([]string, error) {
	var rels []*domain.StrategyRelationship
	err := s.db.NewSelect().
		Model((*domain.StrategyRelationship)(nil)).
		Where("instance_id = ? AND source_key = ? AND relationship = ?",
			instanceID, featureKey, domain.RelContributesTo).
		Scan(ctx, &rels)
	if err != nil {
		return nil, fmt.Errorf("explain value path for %q: %w", featureKey, err)
	}
	paths := make([]string, 0, len(rels))
	for _, r := range rels {
		paths = append(paths, r.TargetKey)
	}
	return paths, nil
}

// GetCoverageAnalysis returns, for each value model path that at least one feature
// contributes to, the list of contributing feature keys — a coverage matrix.
func (s *Service) GetCoverageAnalysis(ctx context.Context, instanceID uuid.UUID) ([]ValuePathEntry, error) {
	type row struct {
		ValuePath  string `bun:"target_key"`
		FeatureKey string `bun:"source_key"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("target_key, source_key").
		Where("instance_id = ? AND relationship = ? AND source_type = ?",
			instanceID, domain.RelContributesTo, "feature").
		OrderExpr("target_key, source_key").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("coverage analysis: %w", err)
	}

	// Group by value path.
	seen := make(map[string]*ValuePathEntry)
	var order []string
	for _, r := range rows {
		e, ok := seen[r.ValuePath]
		if !ok {
			e = &ValuePathEntry{ValuePath: r.ValuePath}
			seen[r.ValuePath] = e
			order = append(order, r.ValuePath)
		}
		e.Features = append(e.Features, r.FeatureKey)
	}

	result := make([]ValuePathEntry, 0, len(order))
	for _, path := range order {
		result = append(result, *seen[path])
	}
	return result, nil
}

// FeatureValueProposition summarises a single feature's value path contributions.
type FeatureValueProposition struct {
	ArtifactKey   string   `json:"artifact_key"`
	Name          *string  `json:"name,omitempty"`
	Track         *string  `json:"track,omitempty"`
	Status        string   `json:"status"`
	ContributesTo []string `json:"contributes_to"`
}

// GetValuePropositions returns all features with their contributes_to paths,
// giving a cross-feature view of what value each feature delivers.
func (s *Service) GetValuePropositions(ctx context.Context, instanceID uuid.UUID) ([]FeatureValueProposition, error) {
	features, err := s.ListCurrentArtifacts(ctx, instanceID, "feature")
	if err != nil {
		return nil, err
	}

	// Bulk-load all contributes_to relationships for features in this instance.
	type row struct {
		SourceKey string `bun:"source_key"`
		TargetKey string `bun:"target_key"`
	}
	var rels []row
	err = s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("source_key, target_key").
		Where("instance_id = ? AND relationship = ? AND source_type = ?",
			instanceID, domain.RelContributesTo, "feature").
		Scan(ctx, &rels)
	if err != nil {
		return nil, fmt.Errorf("get value propositions: %w", err)
	}

	// Index contributes_to by feature key.
	contribMap := make(map[string][]string)
	for _, r := range rels {
		contribMap[r.SourceKey] = append(contribMap[r.SourceKey], r.TargetKey)
	}

	result := make([]FeatureValueProposition, 0, len(features))
	for _, f := range features {
		result = append(result, FeatureValueProposition{
			ArtifactKey:   f.ArtifactKey,
			Name:          f.Name,
			Track:         f.Track,
			Status:        f.Status,
			ContributesTo: contribMap[f.ArtifactKey],
		})
	}
	return result, nil
}

// AssumptionCoverage describes an assumption key and which features test it.
type AssumptionCoverage struct {
	AssumptionKey string   `json:"assumption_key"`
	TestedBy      []string `json:"tested_by"`
}

// GetAssumptions returns all assumption keys referenced in tests_assumption relationships
// and the features that test each one.
func (s *Service) GetAssumptions(ctx context.Context, instanceID uuid.UUID) ([]AssumptionCoverage, error) {
	type row struct {
		AssumptionKey string `bun:"target_key"`
		FeatureKey    string `bun:"source_key"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("target_key, source_key").
		Where("instance_id = ? AND relationship = ?", instanceID, domain.RelTestsAssumption).
		OrderExpr("target_key, source_key").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("get assumptions: %w", err)
	}

	seen := make(map[string]*AssumptionCoverage)
	var order []string
	for _, r := range rows {
		e, ok := seen[r.AssumptionKey]
		if !ok {
			e = &AssumptionCoverage{AssumptionKey: r.AssumptionKey}
			seen[r.AssumptionKey] = e
			order = append(order, r.AssumptionKey)
		}
		e.TestedBy = append(e.TestedBy, r.FeatureKey)
	}

	result := make([]AssumptionCoverage, 0, len(order))
	for _, key := range order {
		result = append(result, *seen[key])
	}
	return result, nil
}

// FeatureDependencyGraph summarises all depends_on and enables edges for an instance.
type FeatureDependencyGraph struct {
	DependsOn []struct {
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"depends_on"`
	Enables []struct {
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"enables"`
}

// GetFeatureDependencies returns the full depends_on and enables graph for an instance.
func (s *Service) GetFeatureDependencies(ctx context.Context, instanceID uuid.UUID) (*FeatureDependencyGraph, error) {
	type row struct {
		SourceKey    string `bun:"source_key"`
		TargetKey    string `bun:"target_key"`
		Relationship string `bun:"relationship"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("source_key, target_key, relationship").
		Where("instance_id = ? AND relationship IN (?, ?)", instanceID, domain.RelDependsOn, domain.RelEnables).
		OrderExpr("relationship, source_key").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("get feature dependencies: %w", err)
	}

	g := &FeatureDependencyGraph{}
	for _, r := range rows {
		switch r.Relationship {
		case domain.RelDependsOn:
			g.DependsOn = append(g.DependsOn, struct {
				From string `json:"from"`
				To   string `json:"to"`
			}{r.SourceKey, r.TargetKey})
		case domain.RelEnables:
			g.Enables = append(g.Enables, struct {
				From string `json:"from"`
				To   string `json:"to"`
			}{r.SourceKey, r.TargetKey})
		}
	}
	return g, nil
}

// ---------------------------------------------------------------------------
// Phase G: AIM lifecycle domain methods
// ---------------------------------------------------------------------------

// AIMSummary is the overview of all AIM-phase artifacts for an instance.
type AIMSummary struct {
	InstanceID   string                     `json:"instance_id"`
	LRACount     int                        `json:"lra_count"`
	ReportCount  int                        `json:"report_count"`
	TriggerCount int                        `json:"trigger_count"`
	LRAs         []*domain.StrategyArtifact `json:"lras"`
	Reports      []*domain.StrategyArtifact `json:"reports"`
	Triggers     []*domain.StrategyArtifact `json:"triggers"`
}

// StageLRA stages a new Living Reality Assessment artifact.
// artifactKey should be unique per LRA (e.g. "lra-2025-q1").
func (s *Service) StageLRA(ctx context.Context, instanceID uuid.UUID, artifactKey string, payload any, batchID *uuid.UUID) (uuid.UUID, error) {
	return s.Stage(ctx, StageParams{
		InstanceID:   instanceID,
		ArtifactType: domain.ArtifactTypeLRA,
		ArtifactKey:  artifactKey,
		Action:       domain.MutationActionCreate,
		Payload:      payload,
		BatchID:      batchID,
	})
}

// UpdateLRA stages an update to an existing LRA artifact.
func (s *Service) UpdateLRA(ctx context.Context, instanceID uuid.UUID, artifactKey string, payload any, batchID *uuid.UUID) (uuid.UUID, error) {
	return s.Stage(ctx, StageParams{
		InstanceID:   instanceID,
		ArtifactType: domain.ArtifactTypeLRA,
		ArtifactKey:  artifactKey,
		Action:       domain.MutationActionUpdate,
		Payload:      payload,
		BatchID:      batchID,
	})
}

// GetLRA returns the current payload for a specific LRA artifact.
func (s *Service) GetLRA(ctx context.Context, instanceID uuid.UUID, artifactKey string) (json.RawMessage, error) {
	return s.GetCurrentArtifact(ctx, instanceID, artifactKey)
}

// StageAIMReport stages a new AIM assessment report artifact.
// artifactKey should identify the cycle (e.g. "aim-report-2025-q1").
func (s *Service) StageAIMReport(ctx context.Context, instanceID uuid.UUID, artifactKey string, payload any, batchID *uuid.UUID) (uuid.UUID, error) {
	return s.Stage(ctx, StageParams{
		InstanceID:   instanceID,
		ArtifactType: domain.ArtifactTypeAssessmentReport,
		ArtifactKey:  artifactKey,
		Action:       domain.MutationActionCreate,
		Payload:      payload,
		BatchID:      batchID,
	})
}

// GetAIMSummary returns an overview of all AIM-phase artifacts for an instance.
func (s *Service) GetAIMSummary(ctx context.Context, instanceID uuid.UUID) (*AIMSummary, error) {
	allArtifacts, err := s.ListCurrentArtifacts(ctx, instanceID, "")
	if err != nil {
		return nil, err
	}

	summary := &AIMSummary{InstanceID: instanceID.String()}
	for _, a := range allArtifacts {
		switch a.ArtifactType {
		case domain.ArtifactTypeLRA:
			summary.LRAs = append(summary.LRAs, a)
			summary.LRACount++
		case domain.ArtifactTypeAssessmentReport:
			summary.Reports = append(summary.Reports, a)
			summary.ReportCount++
		case domain.ArtifactTypeAIMTriggerConfig:
			summary.Triggers = append(summary.Triggers, a)
			summary.TriggerCount++
		}
	}
	return summary, nil
}

// ---------------------------------------------------------------------------
// ArtifactFetcher adapter — implements app.ArtifactFetcher
// ---------------------------------------------------------------------------

// ListArtifacts returns all non-archived artifacts for the instance as a slice of
// generic maps suitable for JSON serialisation into app push payloads.
// If artifactTypes is non-empty, only artifacts of those types are returned.
func (s *Service) ListArtifacts(ctx context.Context, instanceID uuid.UUID, artifactTypes []string) ([]map[string]interface{}, error) {
	q := s.db.NewSelect().
		Model((*domain.StrategyArtifact)(nil)).
		Where("instance_id = ? AND status != ?", instanceID, domain.ArtifactStatusArchived).
		OrderExpr("artifact_type, artifact_key")

	if len(artifactTypes) > 0 {
		q = q.Where("artifact_type IN (?)", bun.List(artifactTypes))
	}

	var artifacts []*domain.StrategyArtifact
	if err := q.Scan(ctx, &artifacts); err != nil {
		return nil, fmt.Errorf("list artifacts for app push: %w", err)
	}

	out := make([]map[string]interface{}, 0, len(artifacts))
	for _, a := range artifacts {
		var payload interface{}
		if err := json.Unmarshal(a.Payload, &payload); err != nil {
			slog.WarnContext(ctx, "skip artifact with invalid payload JSON",
				"artifact_key", a.ArtifactKey,
				"err", err)
			continue
		}
		out = append(out, map[string]interface{}{
			"artifact_key":  a.ArtifactKey,
			"artifact_type": a.ArtifactType,
			"status":        a.Status,
			"payload":       payload,
		})
	}
	return out, nil
}

// ListAllRelationships returns all relationships for the instance as generic maps
// suitable for JSON serialisation into app push payloads.
// This satisfies the app.ArtifactFetcher interface.
func (s *Service) ListAllRelationships(ctx context.Context, instanceID uuid.UUID) ([]map[string]interface{}, error) {
	var rels []*domain.StrategyRelationship
	if err := s.db.NewSelect().
		Model((*domain.StrategyRelationship)(nil)).
		Where("instance_id = ?", instanceID).
		Scan(ctx, &rels); err != nil {
		return nil, fmt.Errorf("list relationships for app push: %w", err)
	}

	out := make([]map[string]interface{}, 0, len(rels))
	for _, r := range rels {
		row := map[string]interface{}{
			"source_key":   r.SourceKey,
			"source_type":  r.SourceType,
			"target_key":   r.TargetKey,
			"target_type":  r.TargetType,
			"relationship": r.Relationship,
		}
		if r.Metadata != nil {
			var meta interface{}
			if err := json.Unmarshal(r.Metadata, &meta); err != nil {
				slog.WarnContext(ctx, "skip relationship metadata unmarshal",
					"source_key", r.SourceKey,
					"target_key", r.TargetKey,
					"err", err)
			} else {
				row["metadata"] = meta
			}
		}
		out = append(out, row)
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Domain type aliases for convenience
// ---------------------------------------------------------------------------

// StrategyArtifact is re-exported for callers that import only this package.
type StrategyArtifact = domain.StrategyArtifact
type StrategyRelationship = domain.StrategyRelationship
