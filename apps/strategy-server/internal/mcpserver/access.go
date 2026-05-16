package mcpserver

import (
	"context"
	"fmt"

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
// Skips the check when:
//   - org service is not available (dev mode)
//   - user is not in context
//   - workspace has no org_id set (unscoped legacy workspace)
func assertWorkspaceAccess(ctx context.Context, svc Services, workspaceID uuid.UUID) error {
	if svc.Org == nil {
		return nil // org service not wired — dev mode
	}
	u := web.UserFromContext(ctx)
	if u == nil {
		return nil // no user in context — auth disabled
	}

	orgID, err := svc.Workspace.OrgIDForWorkspace(ctx, workspaceID)
	if err != nil {
		return err
	}
	if orgID == nil {
		return nil // workspace not scoped to an org — allow access
	}

	isMember, _, err := svc.Org.IsMember(ctx, *orgID, u.ID)
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
func assertInstanceAccess(ctx context.Context, svc Services, instanceID uuid.UUID) error {
	if svc.Org == nil || svc.Instance == nil {
		return nil
	}
	u := web.UserFromContext(ctx)
	if u == nil {
		return nil
	}

	inst, err := svc.Instance.GetInstance(ctx, instanceID)
	if err != nil {
		return err
	}
	return assertWorkspaceAccess(ctx, svc, inst.WorkspaceID)
}
