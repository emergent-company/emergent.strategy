package mcpserver

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// registerOrgTools registers MCP tools for organisation management.
func registerOrgTools(s *server.MCPServer, svc Services) {
	if svc.Org == nil {
		return
	}

	s.AddTool(mcp.NewTool("create_org",
		mcp.WithDescription("USE WHEN you need to create a new organisation. The caller becomes the org admin."),
		mcp.WithString("name", mcp.Required(), mcp.Description("Organisation name")),
		mcp.WithString("org_number", mcp.Description("Norwegian organisation number (e.g. 912345678)")),
		mcp.WithString("country", mcp.Description("ISO country code (default: NO)")),
		mcp.WithString("website", mcp.Description("Company website URL")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		user := web.UserFromContext(ctx)
		if user == nil {
			return toolErr(ctx, apperror.ErrUnauthorized), nil
		}
		name := argString(req, "name")
		if name == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("name is required")), nil
		}
		p := org.CreateParams{
			Name:      name,
			OrgNumber: argString(req, "org_number"),
			Country:   argString(req, "country"),
			Website:   argString(req, "website"),
		}
		o, err := svc.Org.Create(ctx, p, user.ID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(o)
	})

	s.AddTool(mcp.NewTool("update_org",
		mcp.WithDescription("USE WHEN you need to update organisation metadata (name, website, org number). Requires org_admin role."),
		mcp.WithString("org_id", mcp.Required(), mcp.Description("Organisation UUID")),
		mcp.WithString("name", mcp.Description("New organisation name")),
		mcp.WithString("org_number", mcp.Description("Norwegian organisation number")),
		mcp.WithString("country", mcp.Description("ISO country code")),
		mcp.WithString("website", mcp.Description("Company website URL")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		user := web.UserFromContext(ctx)
		if user == nil {
			return toolErr(ctx, apperror.ErrUnauthorized), nil
		}
		orgID, err := parseUUID(argString(req, "org_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Check caller is admin.
		isMember, callerRole, err := svc.Org.IsMember(ctx, orgID, user.ID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if !isMember || callerRole != "org_admin" {
			return toolErr(ctx, apperror.ErrForbidden.WithDetail("org_admin role required")), nil
		}

		p := org.CreateParams{
			Name:      argString(req, "name"),
			OrgNumber: argString(req, "org_number"),
			Country:   argString(req, "country"),
			Website:   argString(req, "website"),
		}
		o, err := svc.Org.Update(ctx, orgID, p)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(o)
	})

	s.AddTool(mcp.NewTool("assign_workspace_to_org",
		mcp.WithDescription("USE WHEN you need to reassign a workspace to a different organisation. Requires org_admin role on the target org."),
		mcp.WithString("workspace_id", mcp.Required(), mcp.Description("Workspace UUID")),
		mcp.WithString("org_id", mcp.Required(), mcp.Description("Target organisation UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		user := web.UserFromContext(ctx)
		if user == nil {
			return toolErr(ctx, apperror.ErrUnauthorized), nil
		}
		wsID, err := parseUUID(argString(req, "workspace_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		orgID, err := parseUUID(argString(req, "org_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Check caller is admin of the target org.
		isMember, callerRole, err := svc.Org.IsMember(ctx, orgID, user.ID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if !isMember || callerRole != "org_admin" {
			return toolErr(ctx, apperror.ErrForbidden.WithDetail("org_admin role required on target org")), nil
		}

		if err := svc.Workspace.ReassignOrg(ctx, wsID, orgID); err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"assigned": true, "workspace_id": wsID, "org_id": orgID})
	})

	s.AddTool(mcp.NewTool("list_orgs",
		mcp.WithDescription("USE WHEN you need to see all organisations the caller belongs to."),
	), func(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		user := web.UserFromContext(ctx)
		if user == nil {
			return toolErr(ctx, apperror.ErrUnauthorized), nil
		}
		orgs, err := svc.Org.List(ctx, user.ID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(orgs)
	})

	s.AddTool(mcp.NewTool("invite_member",
		mcp.WithDescription("USE WHEN you need to invite a user to an organisation by email. Requires org_admin role."),
		mcp.WithString("org_id", mcp.Required(), mcp.Description("Organisation UUID")),
		mcp.WithString("email", mcp.Required(), mcp.Description("Email address to invite")),
		mcp.WithString("role", mcp.Description("Role: org_admin or org_viewer (default: org_viewer)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		user := web.UserFromContext(ctx)
		if user == nil {
			return toolErr(ctx, apperror.ErrUnauthorized), nil
		}
		orgID, err := parseUUID(argString(req, "org_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		email := argString(req, "email")
		if email == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("email is required")), nil
		}
		role := argString(req, "role")
		if role == "" {
			role = "org_viewer"
		}

		// Check caller is admin.
		isMember, callerRole, err := svc.Org.IsMember(ctx, orgID, user.ID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if !isMember || callerRole != "org_admin" {
			return toolErr(ctx, apperror.ErrForbidden.WithDetail("org_admin role required")), nil
		}

		if err := svc.Org.Invite(ctx, orgID, email, role, user.ID); err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"invited": true, "email": email, "org_id": orgID, "role": role})
	})

	s.AddTool(mcp.NewTool("remove_member",
		mcp.WithDescription("USE WHEN you need to remove a member from an organisation. Requires org_admin role."),
		mcp.WithString("org_id", mcp.Required(), mcp.Description("Organisation UUID")),
		mcp.WithString("user_id", mcp.Required(), mcp.Description("User UUID to remove")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		user := web.UserFromContext(ctx)
		if user == nil {
			return toolErr(ctx, apperror.ErrUnauthorized), nil
		}
		orgID, err := parseUUID(argString(req, "org_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		userID, err := parseUUID(argString(req, "user_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Check caller is admin.
		isMember, callerRole, err := svc.Org.IsMember(ctx, orgID, user.ID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if !isMember || callerRole != "org_admin" {
			return toolErr(ctx, apperror.ErrForbidden.WithDetail("org_admin role required")), nil
		}

		if err := svc.Org.RemoveMember(ctx, orgID, userID); err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"removed": true, "user_id": userID, "org_id": orgID})
	})

	s.AddTool(mcp.NewTool("list_members",
		mcp.WithDescription("USE WHEN you need to see all members and pending invitations for an organisation."),
		mcp.WithString("org_id", mcp.Required(), mcp.Description("Organisation UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		user := web.UserFromContext(ctx)
		if user == nil {
			return toolErr(ctx, apperror.ErrUnauthorized), nil
		}
		orgID, err := parseUUID(argString(req, "org_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Check caller is member.
		isMember, _, err := svc.Org.IsMember(ctx, orgID, user.ID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if !isMember {
			return toolErr(ctx, apperror.ErrForbidden.WithDetail("not a member of this org")), nil
		}

		members, err := svc.Org.ListMembers(ctx, orgID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		invitations, err := svc.Org.ListPendingInvitations(ctx, orgID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"members":     members,
			"invitations": invitations,
		})
	})
}
