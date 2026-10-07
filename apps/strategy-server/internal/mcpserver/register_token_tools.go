package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/accesstoken"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// registerTokenTools registers access-token administration.
//
// Every tool here requires org_admin via assertOrgAdmin, which also refuses
// token-authenticated callers outright — a token must never be able to mint
// or revoke tokens, or the scoping it was issued under becomes advisory.
func registerTokenTools(s *server.MCPServer, svc Services) {
	if svc.AccessToken == nil {
		return
	}

	registerMintAccessToken(s, svc)
	registerListAccessTokens(s, svc)
	registerRevokeAccessToken(s, svc)
}

func registerMintAccessToken(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("mint_access_token",
		mcp.WithDescription("USE WHEN you need to give an external party read-only (or scoped write) MCP access to specific strategy instances. Requires org_admin. Returns the token plaintext exactly once — it cannot be retrieved again."),
		mcp.WithString("org_id", mcp.Required(), mcp.Description("Organisation UUID that will own the token")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Human-readable label, e.g. 'Acme Corp read-only'")),
		mcp.WithString("grants", mcp.Required(), mcp.Description(`JSON array of grants, e.g. [{"instance_id":"<uuid>","permission":"read"}]. Permission is "read" or "write". Every granted instance must belong to org_id, and the token owner must already have access to it.`)),
		mcp.WithString("expires_at", mcp.Description("RFC3339 expiry timestamp. Defaults to 90 days; maximum 365 days.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		orgID, err := parseUUID(argString(req, "org_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertOrgAdmin(ctx, svc, orgID); err != nil {
			return toolErr(ctx, err), nil
		}

		name := argString(req, "name")
		if name == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("name is required")), nil
		}

		grants, err := parseGrants(argString(req, "grants"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		expiresAt, err := parseOptionalTime(argString(req, "expires_at"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// The token is owned by the admin who mints it. Minting on behalf of
		// another user is deliberately not exposed: Mint validates grants
		// against the owner's authority, so a user_id argument would let an
		// admin mint a token carrying someone else's access, and the audit
		// trail would name the wrong person as owner.
		p := web.PrincipalFromContext(ctx)

		res, err := svc.AccessToken.Mint(ctx, accesstoken.MintParams{
			OrgID:     orgID,
			UserID:    p.User.ID,
			Name:      name,
			ExpiresAt: expiresAt,
			Grants:    grants,
		})
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"id":         res.Token.ID,
			"name":       res.Token.Name,
			"org_id":     res.Token.OrgID,
			"expires_at": res.Token.ExpiresAt.UTC().Format(time.RFC3339),
			"grants":     grantsSummary(res.Token.ID, grants),
			"token":      res.Plaintext,
			"warning": "Store this token now. It is not recoverable — " +
				"the server keeps only a hash. If it is lost, revoke it and mint another.",
		})
	})
}

func registerListAccessTokens(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("list_access_tokens",
		mcp.WithDescription("USE WHEN you need to audit which access tokens exist for an organisation, what they can reach, and when they were last used. Requires org_admin. Never returns token plaintext or hashes."),
		mcp.WithString("org_id", mcp.Required(), mcp.Description("Organisation UUID")),
		mcp.WithBoolean("include_inactive", mcp.Description("Include revoked and expired tokens (default false)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		orgID, err := parseUUID(argString(req, "org_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertOrgAdmin(ctx, svc, orgID); err != nil {
			return toolErr(ctx, err), nil
		}

		tokens, err := svc.AccessToken.List(ctx, orgID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		includeInactive := argBool(req, "include_inactive")
		now := time.Now()
		out := make([]map[string]any, 0, len(tokens))
		for i := range tokens {
			tok := &tokens[i]
			if !includeInactive && !tok.IsUsable(now) {
				continue
			}
			out = append(out, tokenSummary(tok, now))
		}

		return mustJSON(map[string]any{
			"org_id": orgID,
			"count":  len(out),
			"tokens": out,
		})
	})
}

func registerRevokeAccessToken(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("revoke_access_token",
		mcp.WithDescription("USE WHEN an access token is leaked, no longer needed, or its holder should lose access. Requires org_admin. Takes effect immediately on this server; revocation is permanent and cannot be undone."),
		mcp.WithString("org_id", mcp.Required(), mcp.Description("Organisation UUID that owns the token")),
		mcp.WithString("token_id", mcp.Required(), mcp.Description("Access token UUID (from list_access_tokens)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		orgID, err := parseUUID(argString(req, "org_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		tokenID, err := parseUUID(argString(req, "token_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertOrgAdmin(ctx, svc, orgID); err != nil {
			return toolErr(ctx, err), nil
		}

		// Revoke is org-scoped at the service layer, so a token belonging to
		// another org reports not-found rather than being revoked.
		if err := svc.AccessToken.Revoke(ctx, orgID, tokenID); err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"id":      tokenID,
			"revoked": true,
		})
	})
}

// tokenSummary is the safe projection of a token for listing.
//
// Built field by field rather than marshalling domain.AccessToken directly.
// That struct relies on `json:"-"` to keep TokenHash out of the output, which
// is one struct-tag edit away from leaking every hash in the org through this
// tool. An explicit allowlist cannot fail that way.
func tokenSummary(tok *domain.AccessToken, now time.Time) map[string]any {
	grants := make([]map[string]any, 0, len(tok.Grants))
	for _, g := range tok.Grants {
		grants = append(grants, map[string]any{
			"instance_id": g.InstanceID,
			"permission":  g.Permission,
		})
	}

	status := "active"
	switch {
	case tok.IsRevoked():
		status = "revoked"
	case tok.IsExpired(now):
		status = "expired"
	}

	out := map[string]any{
		"id":     tok.ID,
		"name":   tok.Name,
		"status": status,
		// The prefix is the non-secret head of the token, enough for a human
		// to match a row against a credential they are holding.
		"token_prefix": tok.TokenPrefix,
		"owner_id":     tok.UserID,
		"created_at":   tok.CreatedAt.UTC().Format(time.RFC3339),
		"expires_at":   tok.ExpiresAt.UTC().Format(time.RFC3339),
		"grants":       grants,
	}
	if tok.LastUsedAt != nil {
		out["last_used_at"] = tok.LastUsedAt.UTC().Format(time.RFC3339)
	} else {
		// Distinguishing "never used" from "field omitted" matters when the
		// question is whether a leaked token was actually exercised.
		out["last_used_at"] = nil
	}
	if tok.RevokedAt != nil {
		out["revoked_at"] = tok.RevokedAt.UTC().Format(time.RFC3339)
	}
	return out
}

func grantsSummary(tokenID uuid.UUID, grants []accesstoken.GrantRequest) []map[string]any {
	out := make([]map[string]any, 0, len(grants))
	for _, g := range grants {
		out = append(out, map[string]any{
			"token_id":    tokenID,
			"instance_id": g.InstanceID,
			"permission":  g.Permission,
		})
	}
	return out
}

// parseGrants decodes the grants argument.
//
// Grants arrive as a JSON string rather than a structured array because the
// MCP schema has no nested-object array primitive in use here. Validation is
// strict and the messages name the offending element: a malformed grant is
// the difference between a token that reaches one instance and one that
// reaches none, and a vague error invites a retry that guesses.
func parseGrants(raw string) ([]accesstoken.GrantRequest, error) {
	if raw == "" {
		return nil, apperror.ErrBadRequest.WithDetail("grants is required")
	}

	var items []struct {
		InstanceID string `json:"instance_id"`
		Permission string `json:"permission"`
	}
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, apperror.ErrBadRequest.WithDetail(
			fmt.Sprintf(`grants must be a JSON array like [{"instance_id":"<uuid>","permission":"read"}]: %v`, err))
	}
	if len(items) == 0 {
		return nil, apperror.ErrBadRequest.WithDetail("at least one grant is required")
	}

	grants := make([]accesstoken.GrantRequest, 0, len(items))
	for i, it := range items {
		instID, err := uuid.Parse(it.InstanceID)
		if err != nil {
			return nil, apperror.ErrBadRequest.WithDetail(
				fmt.Sprintf("grant %d: invalid instance_id %q", i, it.InstanceID))
		}
		perm := it.Permission
		if perm == "" {
			// Defaulting to read is the safe direction: the entire point of
			// this subsystem is read-only external access, so an omitted
			// permission should not silently confer write.
			perm = domain.TokenPermissionRead
		}
		if perm != domain.TokenPermissionRead && perm != domain.TokenPermissionWrite {
			return nil, apperror.ErrBadRequest.WithDetail(
				fmt.Sprintf("grant %d: permission must be 'read' or 'write', got %q", i, perm))
		}
		grants = append(grants, accesstoken.GrantRequest{InstanceID: instID, Permission: perm})
	}
	return grants, nil
}

func parseOptionalTime(raw string) (time.Time, error) {
	if raw == "" {
		return time.Time{}, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, apperror.ErrBadRequest.WithDetail(
			fmt.Sprintf("expires_at must be RFC3339 (e.g. 2026-12-31T23:59:59Z), got %q", raw))
	}
	return t, nil
}
