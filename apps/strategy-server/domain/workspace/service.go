// Package workspace provides domain logic for workspace management.
package workspace

import (
	"context"
	"database/sql"
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

// Service manages workspace lifecycle.
type Service struct {
	db *bun.DB
}

// NewService creates a new workspace Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// ListParams controls workspace listing.
// Cursor is an opaque string of the form "created_at|id" produced by a previous
// ListResult.NextCursor. Legacy callers that pass a bare UUID are handled for
// backward compatibility.
type ListParams struct {
	Cursor string
	Limit  int
	// OrgIDs filters to workspaces belonging to these orgs.
	// When nil or empty, no org filtering is applied (admin/dev mode).
	OrgIDs []uuid.UUID
}

// ListResult is the paginated workspace list response.
type ListResult struct {
	Workspaces []*domain.Workspace
	NextCursor string
}

// ListWorkspaces returns all non-deleted workspaces with cursor pagination.
// The cursor is a composite "created_at|id" string that matches the sort order.
func (s *Service) ListWorkspaces(ctx context.Context, p ListParams) (*ListResult, error) {
	limit := p.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	q := s.db.NewSelect().
		Model((*domain.Workspace)(nil)).
		Where("deleted_at IS NULL").
		OrderExpr("created_at ASC, id ASC").
		Limit(limit + 1)

	if len(p.OrgIDs) > 0 {
		q = q.Where("org_id IN (?)", bun.In(p.OrgIDs))
	}

	if p.Cursor != "" {
		cursorTime, cursorID, ok := parseCursor(p.Cursor)
		if ok {
			q = q.Where("(created_at, id) > (?, ?)", cursorTime, cursorID)
		}
	}

	var workspaces []*domain.Workspace
	if err := q.Scan(ctx, &workspaces); err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}

	var nextCursor string
	if len(workspaces) > limit {
		// Cursor = last item on the current page (not the peek-ahead row).
		last := workspaces[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		workspaces = workspaces[:limit]
	}

	return &ListResult{Workspaces: workspaces, NextCursor: nextCursor}, nil
}

// GetWorkspace returns a workspace by ID, or ErrWorkspaceNotFound.
func (s *Service) GetWorkspace(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
	var ws domain.Workspace
	err := s.db.NewSelect().
		Model(&ws).
		Where("id = ? AND deleted_at IS NULL", id).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrWorkspaceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}
	return &ws, nil
}

// GetWorkspaceByOwner returns the workspace for a given GitHub owner slug,
// or ErrWorkspaceNotFound if it does not exist.
func (s *Service) GetWorkspaceByOwner(ctx context.Context, githubOwner string) (*domain.Workspace, error) {
	var ws domain.Workspace
	err := s.db.NewSelect().
		Model(&ws).
		Where("github_owner = ? AND deleted_at IS NULL", githubOwner).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrWorkspaceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace by owner: %w", err)
	}
	return &ws, nil
}

// CreateWorkspace registers a new workspace. Returns ErrWorkspaceConflict if the
// github_owner already exists.
func (s *Service) CreateWorkspace(ctx context.Context, githubOwner string, displayName *string) (*domain.Workspace, error) {
	actorID := audit.ActorFromContext(ctx)

	ws := &domain.Workspace{
		ID:          uuid.New(),
		GithubOwner: githubOwner,
		DisplayName: displayName,
		CreatedBy:   actorID,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	res, err := s.db.NewInsert().
		Model(ws).
		On("CONFLICT (github_owner) WHERE deleted_at IS NULL DO NOTHING").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("insert workspace: %w", err)
	}

	// If no row was inserted (conflict on github_owner), return conflict error.
	n, err := res.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return nil, apperror.ErrWorkspaceConflict
	}

	// Re-query to get the fully-populated row.
	result, err := s.GetWorkspace(ctx, ws.ID)
	if err != nil {
		return nil, err
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "workspace",
		EntityID:   result.ID,
		Action:     "create",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
	})

	return result, nil
}

// DeleteWorkspace soft-deletes a workspace and all its instances.
func (s *Service) DeleteWorkspace(ctx context.Context, id uuid.UUID) error {
	actorID := audit.ActorFromContext(ctx)
	now := time.Now().UTC()

	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Soft-delete the workspace.
		res, err := tx.NewUpdate().
			Model((*domain.Workspace)(nil)).
			Set("deleted_at = ?", now).
			Where("id = ? AND deleted_at IS NULL", id).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("delete workspace: %w", err)
		}
		n, err := res.RowsAffected()
		if err != nil {
			return fmt.Errorf("rows affected: %w", err)
		}
		if n == 0 {
			return apperror.ErrWorkspaceNotFound
		}

		// Cascade soft-delete to all instances.
		_, err = tx.NewUpdate().
			Model((*domain.StrategyInstance)(nil)).
			Set("deleted_at = ?", now).
			Where("workspace_id = ? AND deleted_at IS NULL", id).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("cascade delete instances: %w", err)
		}

		audit.FromContext(ctx).Write(ctx, audit.Entry{
			EntityType: "workspace",
			EntityID:   id,
			Action:     "delete",
			Source:     audit.SourceFromContext(ctx),
			ActorID:    actorID,
		})

		return nil
	})
}

// SetOrgID assigns an org to a workspace. Used when creating a workspace in
// the context of an org.
func (s *Service) SetOrgID(ctx context.Context, workspaceID, orgID uuid.UUID) error {
	res, err := s.db.NewUpdate().
		Model((*domain.Workspace)(nil)).
		Set("org_id = ?, updated_at = ?", orgID, time.Now().UTC()).
		Where("id = ? AND deleted_at IS NULL", workspaceID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("set org_id: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return apperror.ErrWorkspaceNotFound
	}
	return nil
}

// OrgIDForWorkspace returns the org_id for a workspace, or nil if unset.
func (s *Service) OrgIDForWorkspace(ctx context.Context, workspaceID uuid.UUID) (*uuid.UUID, error) {
	ws, err := s.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	return ws.OrgID, nil
}

// StrategyInstance is an alias so callers don't need to import internal/domain directly.
type StrategyInstance = domain.StrategyInstance

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
