// Package user provides domain logic for user identity persistence.
// Users are created on first successful authentication via EnsureUser.
package user

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Service handles user identity operations.
type Service struct {
	db *bun.DB
}

// NewService creates a user service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// EnsureUser creates or updates a user record on authentication.
// If the user exists (by sub), it updates email/name and reactivates if deleted.
// If the user is new, it creates a record and accepts any pending invitations.
func (s *Service) EnsureUser(ctx context.Context, sub, email, name string) (*domain.User, error) {
	var user domain.User
	err := s.db.NewSelect().
		Model(&user).
		Where("sub = ?", sub).
		Scan(ctx)

	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("lookup user by sub: %w", err)
	}

	if errors.Is(err, sql.ErrNoRows) {
		// New user — create.
		user = domain.User{
			ID:    uuid.New(),
			Sub:   sub,
			Email: email,
			Status: domain.UserStatusActive,
		}
		if name != "" {
			user.Name = &name
		}

		if _, err := s.db.NewInsert().Model(&user).Exec(ctx); err != nil {
			return nil, fmt.Errorf("create user: %w", err)
		}

		audit.FromContext(ctx).Write(ctx, audit.Entry{
			EntityType: "user",
			EntityID:   user.ID,
			Action:     "create",
			Source:     audit.SourceFromContext(ctx),
			ActorID:    audit.ActorFromContext(ctx),
		})

		// Accept pending invitations for this email.
		if err := s.acceptPendingInvitations(ctx, &user); err != nil {
			// Non-fatal — log and continue.
			fmt.Printf("warning: accept invitations failed: %v\n", err)
		}

		return &user, nil
	}

	// Existing user — update and reactivate if needed.
	user.Email = email
	if name != "" {
		user.Name = &name
	}
	if user.DeletedAt != nil {
		user.DeletedAt = nil
		user.Status = domain.UserStatusActive
	}
	user.UpdatedAt = time.Now()

	if _, err := s.db.NewUpdate().Model(&user).WherePK().Exec(ctx); err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}

	return &user, nil
}

// GetByID retrieves a user by ID.
func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	var user domain.User
	err := s.db.NewSelect().Model(&user).Where("id = ?", id).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrNotFound.WithDetail("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return &user, nil
}

// GetBySub retrieves a user by Zitadel subject ID.
func (s *Service) GetBySub(ctx context.Context, sub string) (*domain.User, error) {
	var user domain.User
	err := s.db.NewSelect().Model(&user).Where("sub = ?", sub).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrNotFound.WithDetail("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("get user by sub: %w", err)
	}
	return &user, nil
}

// acceptPendingInvitations converts pending org invitations for the user's email
// into memberships.
func (s *Service) acceptPendingInvitations(ctx context.Context, user *domain.User) error {
	var invitations []domain.OrgInvitation
	err := s.db.NewSelect().
		Model(&invitations).
		Where("email = ?", user.Email).
		Where("status = ?", domain.InvitationStatusPending).
		Scan(ctx)
	if err != nil {
		return fmt.Errorf("list pending invitations: %w", err)
	}

	for _, inv := range invitations {
		// Create membership.
		membership := &domain.OrgMembership{
			ID:     uuid.New(),
			OrgID:  inv.OrgID,
			UserID: user.ID,
			Role:   inv.Role,
		}
		if _, err := s.db.NewInsert().Model(membership).
			On("CONFLICT (org_id, user_id) DO NOTHING").
			Exec(ctx); err != nil {
			return fmt.Errorf("create membership from invitation: %w", err)
		}

		// Mark invitation as accepted.
		inv.Status = domain.InvitationStatusAccepted
		if _, err := s.db.NewUpdate().Model(&inv).
			Column("status", "updated_at").
			WherePK().Exec(ctx); err != nil {
			return fmt.Errorf("accept invitation: %w", err)
		}
	}

	return nil
}
