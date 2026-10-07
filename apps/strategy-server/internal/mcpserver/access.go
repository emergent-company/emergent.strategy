package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// userOrgIDs returns the org IDs the current user belongs to.
// Returns nil if there is no user in context or the org service is nil (dev mode
// without org filtering).
func userOrgIDs(ctx context.Context, svc Services) []uuid.UUID {
	u := web.UserFromContext(ctx)
	if u == nil || svc.Org == nil {
		return nil
	}
	orgIDs, err := svc.Org.UserOrgIDs(ctx, u.ID)
	if err != nil {
		return nil // graceful: don't block on org lookup failure
	}
	return orgIDs
}

// assertWorkspaceAccess verifies the current user has access to the given
// workspace via org membership. Returns nil if access is granted, or an
// ErrForbidden if the user does not belong to the workspace's org.
//
// # Fail closed
//
// This function used to return nil — allow — when the org service was nil or
// no user was in context, on the reasoning that both mean "dev mode". That
// reasoning held only by accident: absence of a principal is ambiguous, and
// resolving ambiguity to "allow" means any future code path that reaches a
// handler without populating context silently receives full access to every
// tenant. Both conditions now deny.
//
// Dev mode is preserved by AuthMiddleware injecting an explicit DevUser when
// AUTH_ENABLED=false, so dev is a *present* principal with wide authority
// rather than an *absent* one. Callers that genuinely have no tenant context
// (tool-listing, transport introspection) never reach here, because only
// instance- and workspace-scoped tools call it.
func assertWorkspaceAccess(ctx context.Context, svc Services, workspaceID uuid.UUID) error {
	if svc.Org == nil {
		return apperror.ErrForbidden.WithDetail("authorisation unavailable: org service not wired")
	}
	u := web.UserFromContext(ctx)
	if u == nil {
		// Middleware should always populate a principal. Reaching here is a
		// server-side defect, not a client error — log it so it is findable,
		// then deny.
		slog.ErrorContext(ctx, "authorisation: no principal in context; denying",
			"workspace_id", workspaceID)
		return apperror.ErrForbidden.WithDetail("no authenticated principal")
	}

	orgID, err := svc.Workspace.OrgIDForWorkspace(ctx, workspaceID)
	if err != nil {
		return err
	}

	isMember, _, err := svc.Org.IsMember(ctx, orgID, u.ID)
	if err != nil {
		return fmt.Errorf("check org membership: %w", err)
	}
	if !isMember {
		return apperror.ErrForbidden.WithDetail("you do not have access to this workspace")
	}
	return nil
}

// assertInstanceAccess verifies the current user has access to the instance's
// workspace via org membership.
//
// A caller who may not access an instance and a caller naming an instance that
// does not exist receive the same error. Returning ErrInstanceNotFound for the
// former and ErrForbidden for the latter would let anyone enumerate which
// instance UUIDs are real by diffing the two responses. Since instance_id is
// an untrusted tool argument, that is a live enumeration oracle, so both cases
// collapse to not-found.
func assertInstanceAccess(ctx context.Context, svc Services, instanceID uuid.UUID) error {
	// Fail closed — see assertWorkspaceAccess for why absence is not consent.
	if svc.Org == nil || svc.Instance == nil {
		return apperror.ErrForbidden.WithDetail("authorisation unavailable: services not wired")
	}
	p := web.PrincipalFromContext(ctx)
	if p == nil || p.User == nil {
		slog.ErrorContext(ctx, "authorisation: no principal in context; denying",
			"instance_id", instanceID)
		return apperror.ErrInstanceNotFound
	}

	inst, err := svc.Instance.GetInstance(ctx, instanceID)
	if err != nil {
		return err
	}
	if err := assertWorkspaceAccess(ctx, svc, inst.WorkspaceID); err != nil {
		// Compare by code, not by errors.Is: AppError has no Is method, so
		// errors.Is degrades to pointer equality, and assertWorkspaceAccess
		// returns ErrForbidden.WithDetail(...) — a copy, never the sentinel
		// pointer. A pointer comparison here would silently never match and
		// the enumeration oracle would stay open.
		var ae *apperror.AppError
		if errors.As(err, &ae) && ae.Code == apperror.ErrForbidden.Code {
			return apperror.ErrInstanceNotFound
		}
		return err
	}
	return nil
}
