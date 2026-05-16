package mcpserver

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

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
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		user := web.UserFromContext(ctx)
		if user == nil {
			return toolErr(ctx, apperror.ErrUnauthorized), nil
		}
		name := argString(req, "name")
		if name == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("name is required")), nil
		}
		org, err := svc.Org.Create(ctx, name, user.ID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(org)
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
