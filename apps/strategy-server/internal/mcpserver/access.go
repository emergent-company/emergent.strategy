package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
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

	// A scoped credential is answered by its grants alone.
	//
	// Org membership is deliberately *not* consulted here. A token is a
	// narrowing of its owner's authority, never a widening — if membership
	// were also checked, an org admin's read-only token would reach every
	// instance in the org, which is the opposite of what scoping it meant.
	// The owner's membership was already verified at resolution time, so
	// skipping it here loses no protection.
	if p.Scoped() {
		if _, ok := p.GrantFor(instanceID); !ok {
			return apperror.ErrInstanceNotFound
		}
		return nil
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

// assertInstanceWrite verifies the caller may *mutate* the given instance.
//
// This is the per-instance half of write authorisation. The tool-handler
// middleware in write_gate.go is the global half: it refuses write-classified
// tools outright for a read-only credential. The two are not redundant —
// the middleware knows which tool was called but not which instance it
// targets, so a token with write on instance A and read on instance B passes
// the middleware and must still be refused here when it aims at B.
//
// Access is checked first, so a caller with no access to the instance gets
// not-found rather than a permission error that would confirm it exists.
func assertInstanceWrite(ctx context.Context, svc Services, instanceID uuid.UUID) error {
	if err := assertInstanceAccess(ctx, svc, instanceID); err != nil {
		return err
	}

	p := web.PrincipalFromContext(ctx)
	if p == nil {
		// assertInstanceAccess already rejects a nil principal; this is
		// belt-and-braces so a future reordering cannot open a hole.
		slog.ErrorContext(ctx, "authorisation: no principal at write check; denying",
			"instance_id", instanceID)
		return apperror.ErrInstanceNotFound
	}

	// Unscoped credentials (interactive sessions) are governed by org
	// membership, which assertInstanceAccess has already established.
	if !p.Scoped() {
		return nil
	}

	grant, ok := p.GrantFor(instanceID)
	if !ok {
		// Unreachable via assertInstanceAccess, which already requires a
		// grant for scoped principals. Kept so the function is correct
		// standing alone.
		return apperror.ErrInstanceNotFound
	}
	if grant.Permission != web.PermissionWrite {
		// Forbidden, not not-found: the caller demonstrably knows this
		// instance exists — they hold a grant for it — so there is no
		// enumeration to protect against, and a clear message is more
		// useful than a misleading one.
		return apperror.ErrForbidden.WithDetail(
			"this access token is read-only for this strategy instance")
	}
	return nil
}

// assertOrgAdmin verifies the caller holds the org_admin role in the given org.
//
// Factored out of the four hand-rolled copies in register_org_tools.go. The
// duplication was the risk: four chances to invert a condition, and nothing
// forcing a fifth call site to remember the check exists at all.
//
// Returns not-found rather than forbidden for non-members, matching
// assertInstanceAccess — telling a non-member that an org exists but is
// off-limits lets them enumerate org UUIDs. A member who merely lacks the
// admin role gets forbidden: they already know the org exists.
func assertOrgAdmin(ctx context.Context, svc Services, orgID uuid.UUID) error {
	if svc.Org == nil {
		return apperror.ErrForbidden.WithDetail("authorisation unavailable: services not wired")
	}
	p := web.PrincipalFromContext(ctx)
	if p == nil || p.User == nil {
		slog.ErrorContext(ctx, "authorisation: no principal at org-admin check; denying",
			"org_id", orgID)
		return apperror.ErrUnauthorized
	}

	// A token-authenticated caller is refused outright, whatever its grants.
	//
	// Token administration is the one operation a token must never perform:
	// otherwise a leaked read-only token is a route to minting a write token,
	// and the scoping it was issued under becomes advisory. Grants are
	// per-instance and carry no org-level authority in any case.
	if p.TokenID != nil {
		return apperror.ErrForbidden.WithDetail(
			"access tokens cannot manage access tokens; use an interactive session")
	}

	isMember, role, err := svc.Org.IsMember(ctx, orgID, p.User.ID)
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
