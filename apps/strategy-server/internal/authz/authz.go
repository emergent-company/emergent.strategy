// Package authz decides whether the caller named in a request context may reach
// a workspace, an instance or an organisation. The MCP server and the web
// handlers share it, so the two cannot drift apart: the rules were first written
// for the MCP tools (internal/mcpserver/access.go) and are the same here.
//
// Every check fails closed. A missing organisation service, a missing principal
// or a failed lookup denies; absence of a principal is never consent. A caller who
// may not reach an instance gets the answer for an instance that does not exist,
// so ids cannot be probed by comparing responses.
package authz

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Orgs is what the checks need to know about organisation membership.
type Orgs interface {
	IsMember(ctx context.Context, orgID, userID uuid.UUID) (bool, string, error)
	UserOrgIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error)
}

// Workspaces resolves the organisation that owns a workspace.
type Workspaces interface {
	OrgIDForWorkspace(ctx context.Context, workspaceID uuid.UUID) (uuid.UUID, error)
}

// Instances loads an instance, to find its workspace.
type Instances interface {
	GetInstance(ctx context.Context, id uuid.UUID) (*domain.StrategyInstance, error)
}

// Authorizer holds the lookups. The zero value denies everything.
type Authorizer struct {
	Orgs       Orgs
	Workspaces Workspaces
	Instances  Instances
}

// New builds an Authorizer from the domain services. A nil service stays a nil
// interface (a nil pointer wrapped in an interface is not nil and would pass the
// "not wired" checks), so the check that depends on it denies.
func New(org *orgdom.Service, ws *workspace.Service, inst *instance.Service) *Authorizer {
	a := &Authorizer{}
	if org != nil {
		a.Orgs = org
	}
	if ws != nil {
		a.Workspaces = ws
	}
	if inst != nil {
		a.Instances = inst
	}
	return a
}

// UserOrgIDs returns the organisations the caller belongs to. It returns nil with
// no user in context, no organisation service, or a failed lookup; callers that
// filter a list by it get an empty list, not everything.
func (a *Authorizer) UserOrgIDs(ctx context.Context) []uuid.UUID {
	u := web.UserFromContext(ctx)
	if u == nil || a.Orgs == nil {
		return nil
	}
	ids, err := a.Orgs.UserOrgIDs(ctx, u.ID)
	if err != nil {
		return nil
	}
	return ids
}

// WorkspaceAccess requires the caller to be a member of the organisation that
// owns the workspace.
func (a *Authorizer) WorkspaceAccess(ctx context.Context, workspaceID uuid.UUID) error {
	if a.Orgs == nil || a.Workspaces == nil {
		return apperror.ErrForbidden.WithDetail("authorisation unavailable: services not wired")
	}
	u := web.UserFromContext(ctx)
	if u == nil {
		// The middleware always sets a principal (a dev user when auth is off).
		// Reaching here is a server-side defect: log it so it is findable, deny.
		slog.ErrorContext(ctx, "authorisation: no principal in context; denying",
			"workspace_id", workspaceID)
		return apperror.ErrForbidden.WithDetail("no authenticated principal")
	}
	orgID, err := a.Workspaces.OrgIDForWorkspace(ctx, workspaceID)
	if err != nil {
		return err
	}
	isMember, _, err := a.Orgs.IsMember(ctx, orgID, u.ID)
	if err != nil {
		return fmt.Errorf("check org membership: %w", err)
	}
	if !isMember {
		return apperror.ErrForbidden.WithDetail("you do not have access to this workspace")
	}
	return nil
}

// InstanceAccess requires the caller to reach the instance. A scoped access token
// is answered by its grants alone: a token narrows its owner's authority and never
// widens it, so membership is not consulted for it. Both "no access" and "no such
// instance" return ErrInstanceNotFound.
func (a *Authorizer) InstanceAccess(ctx context.Context, instanceID uuid.UUID) error {
	if a.Orgs == nil || a.Instances == nil {
		return apperror.ErrForbidden.WithDetail("authorisation unavailable: services not wired")
	}
	p := web.PrincipalFromContext(ctx)
	if p == nil || p.User == nil {
		slog.ErrorContext(ctx, "authorisation: no principal in context; denying",
			"instance_id", instanceID)
		return apperror.ErrInstanceNotFound
	}
	if p.Scoped() {
		if _, ok := p.GrantFor(instanceID); !ok {
			return apperror.ErrInstanceNotFound
		}
		return nil
	}
	inst, err := a.Instances.GetInstance(ctx, instanceID)
	if err != nil {
		return err
	}
	if err := a.WorkspaceAccess(ctx, inst.WorkspaceID); err != nil {
		// Compare by code: AppError has no Is method, and WorkspaceAccess returns a
		// copy (WithDetail), never the sentinel pointer.
		var ae *apperror.AppError
		if errors.As(err, &ae) && ae.Code == apperror.ErrForbidden.Code {
			return apperror.ErrInstanceNotFound
		}
		return err
	}
	return nil
}

// InstanceWrite requires InstanceAccess and, for a scoped token, a write grant.
// An interactive session is governed by membership alone (see InstanceAdmin for
// the check that also requires the admin role).
func (a *Authorizer) InstanceWrite(ctx context.Context, instanceID uuid.UUID) error {
	if err := a.InstanceAccess(ctx, instanceID); err != nil {
		return err
	}
	p := web.PrincipalFromContext(ctx)
	if p == nil {
		return apperror.ErrInstanceNotFound
	}
	if !p.Scoped() {
		return nil
	}
	grant, ok := p.GrantFor(instanceID)
	if !ok {
		return apperror.ErrInstanceNotFound
	}
	if grant.Permission != web.PermissionWrite {
		// Forbidden, not not-found: the caller holds a grant, so it knows the
		// instance exists and a clear message is more useful.
		return apperror.ErrForbidden.WithDetail(
			"this access token is read-only for this strategy instance")
	}
	return nil
}

// OrgAdmin requires the caller to hold the org_admin role in the organisation.
// A non-member gets not-found (so organisation ids cannot be probed); a member
// without the role gets forbidden. A token is refused whatever its grants.
func (a *Authorizer) OrgAdmin(ctx context.Context, orgID uuid.UUID) error {
	if a.Orgs == nil {
		return apperror.ErrForbidden.WithDetail("authorisation unavailable: services not wired")
	}
	p := web.PrincipalFromContext(ctx)
	if p == nil || p.User == nil {
		slog.ErrorContext(ctx, "authorisation: no principal at org-admin check; denying",
			"org_id", orgID)
		return apperror.ErrUnauthorized
	}
	if p.TokenID != nil {
		return apperror.ErrForbidden.WithDetail(
			"access tokens cannot manage access tokens; use an interactive session")
	}
	isMember, role, err := a.Orgs.IsMember(ctx, orgID, p.User.ID)
	if err != nil {
		return fmt.Errorf("check org membership: %w", err)
	}
	if !isMember {
		return apperror.ErrNotFound.WithDetail("organisation not found")
	}
	if role != domain.OrgRoleAdmin {
		return apperror.ErrForbidden.WithDetail("org_admin role required")
	}
	return nil
}

// WorkspaceAdmin requires org_admin of the organisation that owns the workspace.
func (a *Authorizer) WorkspaceAdmin(ctx context.Context, workspaceID uuid.UUID) error {
	if a.Workspaces == nil {
		return apperror.ErrForbidden.WithDetail("authorisation unavailable: workspace service not wired")
	}
	orgID, err := a.Workspaces.OrgIDForWorkspace(ctx, workspaceID)
	if err != nil {
		return err
	}
	return a.OrgAdmin(ctx, orgID)
}

// InstanceAdmin requires access to the instance and org_admin of its
// organisation. A caller with no access gets the answer for a missing instance;
// a member who is not an admin gets forbidden.
func (a *Authorizer) InstanceAdmin(ctx context.Context, instanceID uuid.UUID) error {
	if err := a.InstanceAccess(ctx, instanceID); err != nil {
		return err
	}
	inst, err := a.Instances.GetInstance(ctx, instanceID)
	if err != nil {
		return err
	}
	return a.WorkspaceAdmin(ctx, inst.WorkspaceID)
}
