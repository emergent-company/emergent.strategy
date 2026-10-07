package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/accesstoken"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/logger"
)

// runToken executes the token subcommand.
//
// This is the bootstrap path. The MCP tools require an authenticated
// org_admin, which nobody can be before the first credential exists, and it
// is the recovery route if every admin credential is lost. It therefore runs
// with direct database access and no principal.
//
// What it does *not* skip is the service-layer authority check: Mint still
// validates every grant against --user-id's own org membership. Running on
// the server's host proves you control the deployment, not that any
// particular user consented to their access being delegated.
func runToken(cfg *config.Config) error {
	log := logger.New(cfg.LogLevel)
	slog.SetDefault(log)

	tc := cfg.Token

	// go-arg has no mutually-exclusive flag group, so enforce it here rather
	// than silently acting on the first match.
	var chosen []string
	for name, set := range map[string]bool{"--mint": tc.Mint, "--list": tc.List, "--revoke": tc.Revoke} {
		if set {
			chosen = append(chosen, name)
		}
	}
	if len(chosen) == 0 {
		return fmt.Errorf("specify exactly one of --mint, --list, or --revoke")
	}
	if len(chosen) > 1 {
		return fmt.Errorf("specify exactly one operation, got %s", strings.Join(chosen, " and "))
	}

	orgID, err := uuid.Parse(tc.OrgID)
	if err != nil {
		return fmt.Errorf("--org-id must be a UUID: %w", err)
	}

	db, err := database.Open(cfg)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = db.Close() }()

	// Without an audit writer the mint and revoke entries would be dropped on
	// the floor — FromContext returns a nil-safe noop. A credential issued
	// with no record of its issuance is exactly the thing the audit log is for.
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceSystem)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())

	svc := accesstoken.NewService(db, org.NewService(db))

	switch {
	case tc.Mint:
		return runTokenMint(ctx, svc, tc, orgID)
	case tc.List:
		return runTokenList(ctx, svc, tc, orgID)
	default:
		return runTokenRevoke(ctx, svc, tc, orgID)
	}
}

func runTokenMint(ctx context.Context, svc *accesstoken.Service, tc *config.TokenCmd, orgID uuid.UUID) error {
	if tc.Name == "" {
		return fmt.Errorf("--name is required when minting")
	}
	userID, err := uuid.Parse(tc.UserID)
	if err != nil {
		return fmt.Errorf("--user-id must be a UUID (the token owner, whose access the grants are checked against): %w", err)
	}
	grants, err := parseCLIGrants(tc.Grant)
	if err != nil {
		return err
	}

	var expiresAt time.Time
	if tc.Expires != "" {
		expiresAt, err = time.Parse(time.RFC3339, tc.Expires)
		if err != nil {
			return fmt.Errorf("--expires must be RFC3339 (e.g. 2026-12-31T23:59:59Z): %w", err)
		}
	}

	res, err := svc.Mint(ctx, accesstoken.MintParams{
		OrgID:     orgID,
		UserID:    userID,
		Name:      tc.Name,
		ExpiresAt: expiresAt,
		Grants:    grants,
	})
	if err != nil {
		return fmt.Errorf("mint token: %w", err)
	}

	slog.Info("access token minted",
		"token_id", res.Token.ID,
		"name", res.Token.Name,
		"org_id", res.Token.OrgID,
		"expires_at", res.Token.ExpiresAt.UTC().Format(time.RFC3339),
		"grant_count", len(grants))

	// To stdout via fmt, never slog: logs are shipped, aggregated and
	// retained, and this is a live credential. Keeping it off the log stream
	// is the whole reason TokenHash carries `json:"-"`.
	fmt.Printf("\n%s\n", res.Plaintext)
	fmt.Fprintln(os.Stderr,
		"\nStore this token now — it is not recoverable. The server keeps only a hash.\n"+
			"If it is lost, revoke it and mint another.")
	return nil
}

func runTokenList(ctx context.Context, svc *accesstoken.Service, tc *config.TokenCmd, orgID uuid.UUID) error {
	tokens, err := svc.List(ctx, orgID)
	if err != nil {
		return fmt.Errorf("list tokens: %w", err)
	}

	now := time.Now()
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	// Writes to the tabwriter are buffered; any error surfaces from Flush
	// below, which is checked. Ignoring them individually avoids seven
	// identical checks that can only report the same failure.
	_, _ = fmt.Fprintln(w, "ID\tNAME\tSTATUS\tPREFIX\tEXPIRES\tLAST USED\tGRANTS")

	shown := 0
	for i := range tokens {
		tok := &tokens[i]
		if !tc.IncludeInactive && !tok.IsUsable(now) {
			continue
		}
		shown++

		status := "active"
		switch {
		case tok.IsRevoked():
			status = "revoked"
		case tok.IsExpired(now):
			status = "expired"
		}

		lastUsed := "never"
		if tok.LastUsedAt != nil {
			lastUsed = tok.LastUsedAt.UTC().Format(time.RFC3339)
		}

		parts := make([]string, 0, len(tok.Grants))
		for _, g := range tok.Grants {
			parts = append(parts, fmt.Sprintf("%s:%s", g.InstanceID, g.Permission))
		}

		_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\t%s\n",
			tok.ID, tok.Name, status, tok.TokenPrefix,
			tok.ExpiresAt.UTC().Format(time.RFC3339), lastUsed,
			strings.Join(parts, ","))
	}
	if err := w.Flush(); err != nil {
		return fmt.Errorf("write table: %w", err)
	}

	if shown == 0 {
		hint := " (use --include-inactive to show revoked and expired tokens)"
		if tc.IncludeInactive {
			hint = ""
		}
		fmt.Fprintf(os.Stderr, "no tokens%s\n", hint)
	}
	return nil
}

func runTokenRevoke(ctx context.Context, svc *accesstoken.Service, tc *config.TokenCmd, orgID uuid.UUID) error {
	tokenID, err := uuid.Parse(tc.TokenID)
	if err != nil {
		return fmt.Errorf("--token-id must be a UUID: %w", err)
	}
	if err := svc.Revoke(ctx, orgID, tokenID); err != nil {
		return fmt.Errorf("revoke token: %w", err)
	}
	slog.Info("access token revoked", "token_id", tokenID, "org_id", orgID)
	return nil
}

// parseCLIGrants parses repeated --grant <instance-uuid>:<permission> flags.
func parseCLIGrants(raw []string) ([]accesstoken.GrantRequest, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("at least one --grant is required, e.g. --grant <instance-uuid>:read")
	}
	grants := make([]accesstoken.GrantRequest, 0, len(raw))
	for _, item := range raw {
		instStr, perm, found := strings.Cut(item, ":")
		if !found {
			// Defaulting to read rather than erroring: read-only is the point
			// of the subsystem, so the terse form should give the safe thing.
			perm = domain.TokenPermissionRead
		}
		instID, err := uuid.Parse(strings.TrimSpace(instStr))
		if err != nil {
			return nil, fmt.Errorf("--grant %q: instance id is not a UUID", item)
		}
		perm = strings.TrimSpace(perm)
		if perm == "" {
			perm = domain.TokenPermissionRead
		}
		if perm != domain.TokenPermissionRead && perm != domain.TokenPermissionWrite {
			return nil, fmt.Errorf("--grant %q: permission must be 'read' or 'write', got %q", item, perm)
		}
		grants = append(grants, accesstoken.GrantRequest{InstanceID: instID, Permission: perm})
	}
	return grants, nil
}
