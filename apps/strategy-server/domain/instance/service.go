// Package instance provides domain logic for strategy instance lifecycle.
package instance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// PackEnsurer is satisfied by pack.Service.EnsureStandardPack.
// It is called post-commit on instance creation to install the standard pack.
type PackEnsurer interface {
	EnsureStandardPack(ctx context.Context, instanceID uuid.UUID) error
}

// Service manages strategy instance lifecycle.
type Service struct {
	db          *bun.DB
	packEnsurer PackEnsurer // optional; nil = no auto-install
}

// NewService creates a new instance Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// WithPackEnsurer registers the pack service so new instances get the standard pack.
func (s *Service) WithPackEnsurer(pe PackEnsurer) {
	s.packEnsurer = pe
}

// ListParams controls instance listing.
type ListParams struct {
	WorkspaceID     uuid.UUID
	IncludeArchived bool
	Cursor          string
	Limit           int
}

// ListResult is the paginated instance list response.
type ListResult struct {
	Instances  []*domain.StrategyInstance
	NextCursor string
}

// ListInstances returns strategy instances in a workspace.
// The cursor is a composite "created_at|id" string that matches the sort order.
func (s *Service) ListInstances(ctx context.Context, p ListParams) (*ListResult, error) {
	limit := p.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	q := s.db.NewSelect().
		Model((*domain.StrategyInstance)(nil)).
		Where("workspace_id = ? AND deleted_at IS NULL", p.WorkspaceID).
		OrderExpr("created_at ASC, id ASC").
		Limit(limit + 1)

	if !p.IncludeArchived {
		q = q.Where("status != ?", domain.InstanceStatusArchived)
	}
	if p.Cursor != "" {
		cursorTime, cursorID, ok := parseCursor(p.Cursor)
		if ok {
			q = q.Where("(created_at, id) > (?, ?)", cursorTime, cursorID)
		}
	}

	var instances []*domain.StrategyInstance
	if err := q.Scan(ctx, &instances); err != nil {
		return nil, fmt.Errorf("list instances: %w", err)
	}

	var nextCursor string
	if len(instances) > limit {
		// Cursor = last item on the current page (not the peek-ahead row).
		last := instances[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		instances = instances[:limit]
	}

	return &ListResult{Instances: instances, NextCursor: nextCursor}, nil
}

// GetInstance returns a strategy instance by ID.
func (s *Service) GetInstance(ctx context.Context, id uuid.UUID) (*domain.StrategyInstance, error) {
	var inst domain.StrategyInstance
	err := s.db.NewSelect().
		Model(&inst).
		Where("id = ? AND deleted_at IS NULL", id).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrInstanceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get instance: %w", err)
	}
	return &inst, nil
}

// ImportParams holds the input for importing a new instance.
type ImportParams struct {
	WorkspaceID    uuid.UUID
	Name           string
	Description    *string
	GithubRepo     *string
	GithubBasePath *string
	// InitialPayloads are pre-parsed artifact payloads to seed as committed mutations.
	// Key: artifact_key, Value: marshallable artifact content.
	InitialPayloads map[string]any
}

// ImportInstance creates a new strategy instance and seeds its initial mutation history.
func (s *Service) ImportInstance(ctx context.Context, p ImportParams) (*domain.StrategyInstance, error) {
	actorID := audit.ActorFromContext(ctx)
	source := string(audit.SourceFromContext(ctx))

	schemaVersion := strings.TrimSpace(embedded.Version)
	inst := &domain.StrategyInstance{
		ID:             uuid.New(),
		WorkspaceID:    p.WorkspaceID,
		Name:           p.Name,
		Description:    p.Description,
		GithubRepo:     p.GithubRepo,
		GithubBasePath: p.GithubBasePath,
		Status:         domain.InstanceStatusDraft,
		SchemaVersion:  &schemaVersion,
		Dialect:        "standard",
		CreatedBy:      actorID,
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
	}

	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(inst).Exec(ctx); err != nil {
			return fmt.Errorf("insert instance: %w", err)
		}

		// Seed initial committed mutations from the imported payloads.
		for key, payload := range p.InitialPayloads {
			raw, err := json.Marshal(payload)
			if err != nil {
				return fmt.Errorf("marshal payload for %q: %w", key, err)
			}
			m := &domain.StrategyMutation{
				ID:           uuid.New(),
				InstanceID:   inst.ID,
				ArtifactType: inferArtifactType(key),
				ArtifactKey:  key,
				Action:       domain.MutationActionCreate,
				Payload:      raw,
				Status:       domain.MutationStatusCommitted,
				Source:       source,
				CreatedBy:    actorID,
				CreatedAt:    time.Now().UTC(),
			}
			if _, err := tx.NewInsert().Model(m).Exec(ctx); err != nil {
				return fmt.Errorf("insert mutation for %q: %w", key, err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_instance",
		EntityID:   inst.ID,
		Action:     "import",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details:    map[string]any{"workspace_id": p.WorkspaceID},
	})

	// Post-commit: install the standard pack. Runs outside the transaction so a
	// failure here does not roll back the instance creation (Decision 12).
	if s.packEnsurer != nil {
		if err := s.packEnsurer.EnsureStandardPack(ctx, inst.ID); err != nil {
			// Non-fatal: log and continue. standard_pack_version stays NULL,
			// which health_check surfaces as up_to_date: false.
			slog.WarnContext(ctx, "standard pack auto-install failed",
				"instance_id", inst.ID,
				"err", err)
		}
	}

	return inst, nil
}

// ActivateInstance sets an instance to active, demoting any currently active instance.
func (s *Service) ActivateInstance(ctx context.Context, id uuid.UUID) error {
	actorID := audit.ActorFromContext(ctx)

	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Load instance to get workspace_id.
		var inst domain.StrategyInstance
		if err := tx.NewSelect().Model(&inst).Where("id = ? AND deleted_at IS NULL", id).Scan(ctx); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apperror.ErrInstanceNotFound
			}
			return fmt.Errorf("load instance: %w", err)
		}
		if inst.Status == domain.InstanceStatusArchived {
			return apperror.ErrInstanceArchived
		}

		// Demote any currently active instance in the same workspace.
		_, err := tx.NewUpdate().Model((*domain.StrategyInstance)(nil)).
			Set("status = ?", domain.InstanceStatusDraft).
			Set("updated_at = NOW()").
			Where("workspace_id = ? AND status = ? AND deleted_at IS NULL AND id != ?",
				inst.WorkspaceID, domain.InstanceStatusActive, id).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("demote active instances: %w", err)
		}

		// Activate the target instance.
		_, err = tx.NewUpdate().Model((*domain.StrategyInstance)(nil)).
			Set("status = ?", domain.InstanceStatusActive).
			Set("updated_at = NOW()").
			Where("id = ?", id).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("activate instance: %w", err)
		}

		audit.FromContext(ctx).Write(ctx, audit.Entry{
			EntityType: "strategy_instance",
			EntityID:   id,
			Action:     "activate",
			Source:     audit.SourceFromContext(ctx),
			ActorID:    actorID,
		})

		return nil
	})
}

// ArchiveInstance archives an instance and discards any staged mutations.
func (s *Service) ArchiveInstance(ctx context.Context, id uuid.UUID) error {
	actorID := audit.ActorFromContext(ctx)

	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		res, err := tx.NewUpdate().Model((*domain.StrategyInstance)(nil)).
			Set("status = ?", domain.InstanceStatusArchived).
			Set("updated_at = NOW()").
			Where("id = ? AND deleted_at IS NULL", id).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("archive instance: %w", err)
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return apperror.ErrInstanceNotFound
		}

		// Discard all staged mutations for this instance.
		_, err = tx.NewUpdate().Model((*domain.StrategyMutation)(nil)).
			Set("status = ?", domain.MutationStatusDiscarded).
			Where("instance_id = ? AND status = ?", id, domain.MutationStatusStaged).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("discard staged mutations: %w", err)
		}

		audit.FromContext(ctx).Write(ctx, audit.Entry{
			EntityType: "strategy_instance",
			EntityID:   id,
			Action:     "archive",
			Source:     audit.SourceFromContext(ctx),
			ActorID:    actorID,
		})

		return nil
	})
}

// DeleteInstance permanently soft-deletes a strategy instance by setting deleted_at.
// All child rows (mutations, artifacts, relationships, versions, sync log, signals,
// packs, apps, ripple config) are removed automatically via ON DELETE CASCADE
// (migration 020). The instance is excluded from all queries after deletion.
func (s *Service) DeleteInstance(ctx context.Context, id uuid.UUID) error {
	actorID := audit.ActorFromContext(ctx)

	res, err := s.db.NewUpdate().
		Model((*domain.StrategyInstance)(nil)).
		Set("deleted_at = NOW()").
		Where("id = ? AND deleted_at IS NULL", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete instance: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return apperror.ErrInstanceNotFound
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_instance",
		EntityID:   id,
		Action:     "delete",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
	})

	return nil
}

// inferArtifactType maps well-known artifact keys to their type strings.
func inferArtifactType(key string) string {
	switch key {
	case "north_star":
		return "north_star"
	case "insight_analyses":
		return "insight_analyses"
	case "strategy_foundations":
		return "strategy_foundations"
	case "insight_opportunity":
		return "insight_opportunity"
	case "strategy_formula":
		return "strategy_formula"
	case "roadmap_recipe":
		return "roadmap_recipe"
	case "assessment_report":
		return "assessment_report"
	case "calibration_memo":
		return "calibration_memo"
	case "AIM/living_reality_assessment":
		return "living_reality_assessment"
	case "AIM/aim_trigger_config":
		return "aim_trigger_config"
	case "product_portfolio":
		return "product_portfolio"
	case "mappings":
		return "mappings"
	}
	// Feature definitions: fd-* keys
	if strings.HasPrefix(key, "fd-") {
		return "feature"
	}
	// Path-based FIRE definitions
	switch {
	case strings.HasPrefix(key, "FIRE/definitions/commercial/"):
		return "commercial_def"
	case strings.HasPrefix(key, "FIRE/definitions/org_ops/"):
		return "org_ops_def"
	case strings.HasPrefix(key, "FIRE/definitions/strategy/"):
		return "strategy_def"
	case strings.HasPrefix(key, "value_model_"):
		return "value_model"
	}
	return "artifact"
}

// ---------------------------------------------------------------------------
// Cursor helpers — composite (created_at, id) cursors
// ---------------------------------------------------------------------------

// cursorSep is the separator for composite cursor encoding.
const cursorSep = "|"

// encodeCursor produces an opaque "created_at|id" cursor string.
func encodeCursor(createdAt time.Time, id uuid.UUID) string {
	return createdAt.UTC().Format(time.RFC3339Nano) + cursorSep + id.String()
}

// parseCursor decodes a composite cursor. Returns false if the cursor is malformed.
func parseCursor(cursor string) (time.Time, uuid.UUID, bool) {
	parts := strings.SplitN(cursor, cursorSep, 2)
	if len(parts) != 2 {
		return time.Time{}, uuid.Nil, false
	}
	t, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, uuid.Nil, false
	}
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return time.Time{}, uuid.Nil, false
	}
	return t, id, true
}
