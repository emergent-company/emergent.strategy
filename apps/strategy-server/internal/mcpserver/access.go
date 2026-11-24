package mcpserver

import (
	"context"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/authz"
)

// The access rules live in internal/authz, shared with the web handlers. These
// wrappers keep the names the tool handlers and their tests already use; read
// the package documentation of authz for the rules (fail closed, not-found for
// both "no access" and "no such instance", grants decide for a scoped token,
// tokens never administer an organisation).

func authzFor(svc Services) *authz.Authorizer {
	return authz.New(svc.Org, svc.Workspace, svc.Instance)
}

// userOrgIDs returns the organisation ids the current user belongs to, or nil.
func userOrgIDs(ctx context.Context, svc Services) []uuid.UUID {
	return authzFor(svc).UserOrgIDs(ctx)
}

// assertWorkspaceAccess requires membership of the workspace's organisation.
func assertWorkspaceAccess(ctx context.Context, svc Services, workspaceID uuid.UUID) error {
	return authzFor(svc).WorkspaceAccess(ctx, workspaceID)
}

// assertInstanceAccess requires access to the instance; no access and no such
// instance give the same error.
func assertInstanceAccess(ctx context.Context, svc Services, instanceID uuid.UUID) error {
	return authzFor(svc).InstanceAccess(ctx, instanceID)
}

// assertInstanceWrite requires access and, for a scoped token, a write grant.
func assertInstanceWrite(ctx context.Context, svc Services, instanceID uuid.UUID) error {
	return authzFor(svc).InstanceWrite(ctx, instanceID)
}

// assertOrgAdmin requires the org_admin role in the organisation.
func assertOrgAdmin(ctx context.Context, svc Services, orgID uuid.UUID) error {
	return authzFor(svc).OrgAdmin(ctx, orgID)
}

// assertWorkspaceAdmin requires org_admin of the organisation that owns the workspace.
func assertWorkspaceAdmin(ctx context.Context, svc Services, workspaceID uuid.UUID) error {
	return authzFor(svc).WorkspaceAdmin(ctx, workspaceID)
}
