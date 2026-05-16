// Package org provides domain logic for organisation management.
// Organisations are tenant containers — all workspaces belong to an org,
// and access is controlled through org memberships.
package org

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

var slugRe = regexp.MustCompile(`[^a-z0-9-]`)

// Service handles org operations.
type Service struct {
	db *bun.DB
}

// NewService creates an org service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// Create creates an org and adds the caller as admin.
func (s *Service) Create(ctx context.Context, name string, callerID uuid.UUID) (*domain.Org, error) {
	slug := slugify(name)

	org := &domain.Org{
		ID:        uuid.New(),
		Name:      name,
		Slug:      slug,
		CreatedBy: &callerID,
	}

	if _, err := s.db.NewInsert().Model(org).Exec(ctx); err != nil {
		return nil, fmt.Errorf("create org: %w", err)
	}

	// Add caller as admin.
	membership := &domain.OrgMembership{
		ID:     uuid.New(),
		OrgID:  org.ID,
		UserID: callerID,
		Role:   domain.OrgRoleAdmin,
	}
	if _, err := s.db.NewInsert().Model(membership).Exec(ctx); err != nil {
		return nil, fmt.Errorf("create admin membership: %w", err)
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "org",
		EntityID:   org.ID,
		Action:     "create",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
	})

	return org, nil
}

// List returns all orgs the given user is a member of.
func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]domain.Org, error) {
	var orgs []domain.Org
	err := s.db.NewSelect().
		Model(&orgs).
		Join("JOIN org_memberships om ON om.org_id = o.id").
		Where("om.user_id = ?", userID).
		OrderExpr("o.name ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list orgs: %w", err)
	}
	return orgs, nil
}

// GetByID retrieves an org by ID.
func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*domain.Org, error) {
	var org domain.Org
	err := s.db.NewSelect().Model(&org).Where("id = ?", id).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrNotFound.WithDetail("org not found")
	}
	if err != nil {
		return nil, fmt.Errorf("get org: %w", err)
	}
	return &org, nil
}

// ListMembers returns all members of an org.
func (s *Service) ListMembers(ctx context.Context, orgID uuid.UUID) ([]domain.OrgMembership, error) {
	var members []domain.OrgMembership
	err := s.db.NewSelect().
		Model(&members).
		Relation("User").
		Where("om.org_id = ?", orgID).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	return members, nil
}

// AddMember adds a user to an org. If the user already exists, it returns their membership.
func (s *Service) AddMember(ctx context.Context, orgID, userID uuid.UUID, role string) (*domain.OrgMembership, error) {
	if role == "" {
		role = domain.OrgRoleViewer
	}

	membership := &domain.OrgMembership{
		ID:     uuid.New(),
		OrgID:  orgID,
		UserID: userID,
		Role:   role,
	}

	_, err := s.db.NewInsert().Model(membership).
		On("CONFLICT (org_id, user_id) DO UPDATE").
		Set("role = EXCLUDED.role").
		Set("updated_at = NOW()").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("add member: %w", err)
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "org_membership",
		EntityID:   membership.ID,
		Action:     "add_member",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
	})

	return membership, nil
}

// RemoveMember removes a user from an org. Fails if removing the last admin.
func (s *Service) RemoveMember(ctx context.Context, orgID, userID uuid.UUID) error {
	// Check if this is the last admin.
	adminCount, err := s.db.NewSelect().
		Model((*domain.OrgMembership)(nil)).
		Where("org_id = ?", orgID).
		Where("role = ?", domain.OrgRoleAdmin).
		Count(ctx)
	if err != nil {
		return fmt.Errorf("count admins: %w", err)
	}

	// Check if the user being removed is an admin.
	var membership domain.OrgMembership
	err = s.db.NewSelect().
		Model(&membership).
		Where("org_id = ?", orgID).
		Where("user_id = ?", userID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return apperror.ErrNotFound.WithDetail("membership not found")
	}
	if err != nil {
		return fmt.Errorf("get membership: %w", err)
	}

	if membership.Role == domain.OrgRoleAdmin && adminCount <= 1 {
		return apperror.ErrForbidden.WithDetail("cannot remove the last admin")
	}

	_, err = s.db.NewDelete().
		Model((*domain.OrgMembership)(nil)).
		Where("org_id = ?", orgID).
		Where("user_id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("remove member: %w", err)
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "org_membership",
		EntityID:   membership.ID,
		Action:     "remove_member",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
	})

	return nil
}

// Invite creates a pending invitation for an email address.
// If the user already exists, creates a membership immediately.
func (s *Service) Invite(ctx context.Context, orgID uuid.UUID, email, role string, invitedBy uuid.UUID) error {
	if role == "" {
		role = domain.OrgRoleViewer
	}

	// Check if user already exists.
	var existingUser domain.User
	err := s.db.NewSelect().
		Model(&existingUser).
		Where("email = ?", email).
		Where("deleted_at IS NULL").
		Scan(ctx)

	if err == nil {
		// User exists — create membership directly.
		_, err := s.AddMember(ctx, orgID, existingUser.ID, role)
		return err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check existing user: %w", err)
	}

	// User doesn't exist — create pending invitation.
	invitation := &domain.OrgInvitation{
		ID:        uuid.New(),
		OrgID:     orgID,
		Email:     email,
		Role:      role,
		Status:    domain.InvitationStatusPending,
		InvitedBy: &invitedBy,
	}

	_, err = s.db.NewInsert().Model(invitation).
		On("CONFLICT (org_id, email) WHERE status = 'pending' DO UPDATE").
		Set("role = EXCLUDED.role").
		Set("updated_at = NOW()").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("create invitation: %w", err)
	}

	return nil
}

// ListPendingInvitations returns pending invitations for an org.
func (s *Service) ListPendingInvitations(ctx context.Context, orgID uuid.UUID) ([]domain.OrgInvitation, error) {
	var invitations []domain.OrgInvitation
	err := s.db.NewSelect().
		Model(&invitations).
		Where("org_id = ?", orgID).
		Where("status = ?", domain.InvitationStatusPending).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list invitations: %w", err)
	}
	return invitations, nil
}

// IsMember checks if a user belongs to an org.
func (s *Service) IsMember(ctx context.Context, orgID, userID uuid.UUID) (bool, string, error) {
	var membership domain.OrgMembership
	err := s.db.NewSelect().
		Model(&membership).
		Where("org_id = ?", orgID).
		Where("user_id = ?", userID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return false, "", nil
	}
	if err != nil {
		return false, "", fmt.Errorf("check membership: %w", err)
	}
	return true, membership.Role, nil
}

// UserOrgIDs returns all org IDs the user belongs to.
func (s *Service) UserOrgIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	var orgIDs []uuid.UUID
	err := s.db.NewSelect().
		Model((*domain.OrgMembership)(nil)).
		Column("org_id").
		Where("user_id = ?", userID).
		Scan(ctx, &orgIDs)
	if err != nil {
		return nil, fmt.Errorf("list user org IDs: %w", err)
	}
	return orgIDs, nil
}

// EnsureDevOrg creates the default development org if it doesn't exist.
// Used when AUTH_ENABLED=false to provide a default org for the dev user.
func (s *Service) EnsureDevOrg(ctx context.Context, devUserID uuid.UUID) (*domain.Org, error) {
	var org domain.Org
	err := s.db.NewSelect().Model(&org).Where("slug = ?", "dev").Scan(ctx)
	if err == nil {
		return &org, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check dev org: %w", err)
	}

	org = domain.Org{
		ID:        uuid.MustParse("00000000-0000-0000-0000-000000000002"),
		Name:      "Development",
		Slug:      "dev",
		CreatedBy: &devUserID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if _, err := s.db.NewInsert().Model(&org).
		On("CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING").
		Exec(ctx); err != nil {
		return nil, fmt.Errorf("create dev org: %w", err)
	}

	// Add dev user as admin.
	membership := &domain.OrgMembership{
		ID:     uuid.New(),
		OrgID:  org.ID,
		UserID: devUserID,
		Role:   domain.OrgRoleAdmin,
	}
	if _, err := s.db.NewInsert().Model(membership).
		On("CONFLICT (org_id, user_id) DO NOTHING").
		Exec(ctx); err != nil {
		return nil, fmt.Errorf("create dev admin membership: %w", err)
	}

	return &org, nil
}

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "org"
	}
	return s
}
