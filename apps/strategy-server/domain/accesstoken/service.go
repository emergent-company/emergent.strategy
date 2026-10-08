package accesstoken

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Lifetime bounds.
const (
	// DefaultTTL is used when a caller does not specify an expiry.
	DefaultTTL = 90 * 24 * time.Hour

	// MaxTTL caps any requested lifetime. A credential handed to an external
	// party should come up for renewal on a human timescale; without a cap,
	// "expiry is mandatory" is satisfied by asking for a hundred years.
	MaxTTL = 365 * 24 * time.Hour

	// CacheTTL is how long a successful resolution is reused.
	//
	// This value *is* the revocation latency, and that is the whole reason
	// it is short. Revoke purges the entry directly, so revocation is
	// effectively immediate on the replica handling the revoke; this bound
	// only matters for other replicas.
	CacheTTL = 60 * time.Second
)

// OrgChecker is the membership check Resolve needs.
//
// Declared here as a narrow interface rather than importing domain/org
// concretely: this package needs one method, and depending on the whole org
// service would make it un-testable without a database.
type OrgChecker interface {
	IsMember(ctx context.Context, orgID, userID uuid.UUID) (bool, string, error)
}

// Service issues and resolves access tokens.
type Service struct {
	db  *bun.DB
	org OrgChecker

	mu    sync.RWMutex
	cache map[string]cacheEntry

	// now is overridable in tests so expiry boundaries can be exercised
	// without sleeping.
	now func() time.Time
}

type cacheEntry struct {
	resolved  *Resolved
	expiresAt time.Time
}

// Resolved is the outcome of authenticating a token.
type Resolved struct {
	TokenID uuid.UUID
	UserID  uuid.UUID
	OrgID   uuid.UUID
	Grants  []domain.AccessTokenGrant
}

// NewService creates an access token service.
func NewService(db *bun.DB, org OrgChecker) *Service {
	return &Service{
		db:    db,
		org:   org,
		cache: make(map[string]cacheEntry),
		now:   time.Now,
	}
}

// MintParams describes a token to create.
type MintParams struct {
	OrgID  uuid.UUID
	UserID uuid.UUID
	Name   string
	// ExpiresAt is optional; DefaultTTL applies when zero. Must not exceed
	// MaxTTL and must be in the future.
	ExpiresAt time.Time
	Grants    []GrantRequest
}

// GrantRequest is one requested instance grant.
type GrantRequest struct {
	InstanceID uuid.UUID
	Permission string
}

// MintResult carries the one-time plaintext alongside the stored record.
type MintResult struct {
	Token *domain.AccessToken
	// Plaintext is returned exactly once and is not recoverable afterwards.
	Plaintext string
}

// Mint creates a token for the given user, scoped to the given grants.
//
// Authority check: every requested grant is validated against the *minter's*
// own access. A token must never convey access its creator did not have,
// otherwise minting becomes a privilege-escalation primitive. Resolve
// re-checks at use time as well, because authority can be revoked after
// minting — mint-time validation alone would leave a token outliving the
// access that justified it.
func (s *Service) Mint(ctx context.Context, p MintParams) (*MintResult, error) {
	if p.Name == "" {
		return nil, apperror.ErrBadRequest.WithDetail("token name is required")
	}
	if len(p.Grants) == 0 {
		// A token with no grants can reach nothing, so creating one is
		// almost certainly a caller mistake. Refusing is friendlier than
		// issuing a credential that silently fails on first use.
		return nil, apperror.ErrBadRequest.WithDetail("at least one instance grant is required")
	}

	expiresAt, err := s.resolveExpiry(p.ExpiresAt)
	if err != nil {
		return nil, err
	}

	for _, g := range p.Grants {
		if g.Permission != domain.TokenPermissionRead && g.Permission != domain.TokenPermissionWrite {
			return nil, apperror.ErrBadRequest.WithDetail(
				fmt.Sprintf("invalid permission %q: must be 'read' or 'write'", g.Permission))
		}
		if err := s.assertMinterCanGrant(ctx, p.UserID, g.InstanceID); err != nil {
			return nil, err
		}
		// The token is filed under p.OrgID, and every org-scoped read —
		// List, Get, Revoke — trusts that column. A grant pointing at an
		// instance in a different org would therefore be invisible and
		// unrevokable from the org that actually owns the data, while
		// remaining live. Refuse rather than create that orphan.
		instOrg, err := s.orgIDForInstance(ctx, g.InstanceID)
		if err != nil {
			return nil, err
		}
		if instOrg != p.OrgID {
			return nil, apperror.ErrInstanceNotFound
		}
	}

	gen, err := Generate()
	if err != nil {
		return nil, err
	}

	tok := &domain.AccessToken{
		ID:          uuid.New(),
		OrgID:       p.OrgID,
		UserID:      p.UserID,
		Name:        p.Name,
		TokenPrefix: gen.Prefix,
		TokenHash:   gen.Hash,
		ExpiresAt:   expiresAt,
	}

	err = s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(tok).Exec(ctx); err != nil {
			return fmt.Errorf("insert token: %w", err)
		}
		grants := make([]domain.AccessTokenGrant, 0, len(p.Grants))
		for _, g := range p.Grants {
			grants = append(grants, domain.AccessTokenGrant{
				ID:         uuid.New(),
				TokenID:    tok.ID,
				InstanceID: g.InstanceID,
				Permission: g.Permission,
			})
		}
		if _, err := tx.NewInsert().Model(&grants).Exec(ctx); err != nil {
			return fmt.Errorf("insert grants: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "access_token",
		EntityID:   tok.ID,
		Action:     "mint",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
	})

	return &MintResult{Token: tok, Plaintext: gen.Plaintext}, nil
}

// resolveExpiry applies the default and enforces the cap.
func (s *Service) resolveExpiry(requested time.Time) (time.Time, error) {
	now := s.now()
	if requested.IsZero() {
		return now.Add(DefaultTTL), nil
	}
	if !requested.After(now) {
		return time.Time{}, apperror.ErrBadRequest.WithDetail("expiry must be in the future")
	}
	if requested.After(now.Add(MaxTTL)) {
		return time.Time{}, apperror.ErrBadRequest.WithDetail(
			fmt.Sprintf("expiry exceeds the maximum lifetime of %d days", int(MaxTTL.Hours()/24)))
	}
	return requested, nil
}

// assertMinterCanGrant verifies the minting user has access to the instance.
func (s *Service) assertMinterCanGrant(ctx context.Context, userID, instanceID uuid.UUID) error {
	orgID, err := s.orgIDForInstance(ctx, instanceID)
	if err != nil {
		return err
	}
	ok, _, err := s.org.IsMember(ctx, orgID, userID)
	if err != nil {
		return fmt.Errorf("check minter membership: %w", err)
	}
	if !ok {
		// Not-found rather than forbidden, matching assertInstanceAccess:
		// distinguishing the two would let a caller enumerate which instance
		// UUIDs exist by diffing the responses.
		return apperror.ErrInstanceNotFound
	}
	return nil
}

// orgIDForInstance resolves instance → workspace → org in one query.
func (s *Service) orgIDForInstance(ctx context.Context, instanceID uuid.UUID) (uuid.UUID, error) {
	var orgID uuid.UUID
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Column("w.org_id").
		Where("si.id = ?", instanceID).
		Scan(ctx, &orgID)
	if errors.Is(err, sql.ErrNoRows) {
		return uuid.Nil, apperror.ErrInstanceNotFound
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("resolve instance org: %w", err)
	}
	return orgID, nil
}

// Resolve authenticates a plaintext token.
//
// Every failure returns ErrTokenInvalid. Reporting *why* — unknown, expired,
// revoked, membership lost — would tell a caller which of their guesses named
// a real token, so the reason is logged rather than returned.
func (s *Service) Resolve(ctx context.Context, plaintext string) (*Resolved, error) {
	if plaintext == "" {
		return nil, apperror.ErrTokenInvalid
	}

	key := cacheKey(plaintext)
	if cached, ok := s.cacheGet(key); ok {
		return cached, nil
	}

	lookup := LookupPrefix(plaintext)
	var candidates []domain.AccessToken
	err := s.db.NewSelect().
		Model(&candidates).
		Where("token_prefix = ?", lookup).
		Where("revoked_at IS NULL").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load token candidates: %w", err)
	}

	// Usually exactly one row. Iterating handles prefix collisions, which are
	// possible but vanishingly rare.
	for i := range candidates {
		tok := &candidates[i]

		match, err := Verify(plaintext, tok.TokenHash)
		if err != nil {
			// A corrupt stored hash is a server fault. Log it loudly and
			// skip the row — it must not be reported to the caller as a bad
			// token, or corruption would masquerade as user error.
			slog.ErrorContext(ctx, "access token: stored hash is unreadable",
				"token_id", tok.ID, "error", err)
			continue
		}
		if !match {
			continue
		}

		if !tok.IsUsable(s.now()) {
			slog.InfoContext(ctx, "access token rejected",
				"token_id", tok.ID,
				"revoked", tok.IsRevoked(),
				"expired", tok.IsExpired(s.now()))
			return nil, apperror.ErrTokenInvalid
		}

		resolved, err := s.loadGrants(ctx, tok)
		if err != nil {
			return nil, err
		}

		s.cachePut(key, resolved)
		s.touchAsync(tok.ID)
		return resolved, nil
	}

	return nil, apperror.ErrTokenInvalid
}

// loadGrants loads a token's grants and re-validates the owner's authority.
//
// Re-validation at use time is what makes grants a narrowing rather than a
// standing privilege: if the owner loses membership of the org owning a
// granted instance, that grant must stop working immediately, without anyone
// remembering to revoke the token.
func (s *Service) loadGrants(ctx context.Context, tok *domain.AccessToken) (*Resolved, error) {
	var grants []domain.AccessTokenGrant
	err := s.db.NewSelect().
		Model(&grants).
		Where("token_id = ?", tok.ID).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load token grants: %w", err)
	}

	live := make([]domain.AccessTokenGrant, 0, len(grants))
	for _, g := range grants {
		orgID, err := s.orgIDForInstance(ctx, g.InstanceID)
		if err != nil {
			if errors.Is(err, apperror.ErrInstanceNotFound) {
				// The instance was deleted. The FK cascade should have
				// removed the grant, so this is belt-and-braces.
				continue
			}
			return nil, err
		}
		ok, _, err := s.org.IsMember(ctx, orgID, tok.UserID)
		if err != nil {
			return nil, fmt.Errorf("re-check owner membership: %w", err)
		}
		if !ok {
			slog.InfoContext(ctx, "access token grant dropped: owner lost membership",
				"token_id", tok.ID, "instance_id", g.InstanceID)
			continue
		}
		live = append(live, g)
	}

	if len(live) == 0 {
		// Every grant evaporated. The token authenticates but can reach
		// nothing, which is indistinguishable from invalid for the caller
		// and clearer to treat as such.
		slog.InfoContext(ctx, "access token has no live grants", "token_id", tok.ID)
		return nil, apperror.ErrTokenInvalid
	}

	return &Resolved{
		TokenID: tok.ID,
		UserID:  tok.UserID,
		OrgID:   tok.OrgID,
		Grants:  live,
	}, nil
}

// Revoke marks a token unusable and purges its cache entry.
//
// orgID scopes the revocation. It is a parameter rather than something the
// caller is trusted to have checked beforehand: a token id is an opaque UUID
// that says nothing about its owner, so an unscoped Revoke would let an admin
// of one org revoke another org's token by id alone. Requiring the org here
// makes that impossible to get wrong at a call site.
func (s *Service) Revoke(ctx context.Context, orgID, tokenID uuid.UUID) error {
	now := s.now()
	res, err := s.db.NewUpdate().
		Model((*domain.AccessToken)(nil)).
		Set("revoked_at = ?", now).
		Where("id = ?", tokenID).
		Where("org_id = ?", orgID).
		Where("revoked_at IS NULL").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("revoke token: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("revoke token rows: %w", err)
	}
	if n == 0 {
		// No such token, already revoked, or owned by another org. All three
		// mean "not an active token you can revoke"; reporting not-found for
		// all of them avoids confirming the existence of tokens the caller
		// cannot see.
		return apperror.ErrTokenNotFound
	}

	// Purge every cache entry for this token id.
	//
	// Keyed by token digest, which we cannot derive from an id, so this is a
	// scan.
	// The cache holds at most one entry per active token and expires in 60s,
	// so the scan is cheap and bounded.
	s.purgeToken(tokenID)

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "access_token",
		EntityID:   tokenID,
		Action:     "revoke",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
	})
	return nil
}

// List returns an org's tokens, newest first.
//
// The hash never leaves this package in serialised form — domain.AccessToken
// carries `json:"-"` on TokenHash — but the struct still holds it in memory.
// Callers must not log a token record wholesale.
func (s *Service) List(ctx context.Context, orgID uuid.UUID) ([]domain.AccessToken, error) {
	var tokens []domain.AccessToken
	err := s.db.NewSelect().
		Model(&tokens).
		Relation("Grants").
		Where("at.org_id = ?", orgID).
		Order("at.created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list access tokens: %w", err)
	}
	return tokens, nil
}

// Get returns one token by id, scoped to an org.
func (s *Service) Get(ctx context.Context, orgID, tokenID uuid.UUID) (*domain.AccessToken, error) {
	tok := new(domain.AccessToken)
	err := s.db.NewSelect().
		Model(tok).
		Relation("Grants").
		Where("at.id = ?", tokenID).
		Where("at.org_id = ?", orgID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrTokenNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get access token: %w", err)
	}
	return tok, nil
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

// cacheKey derives the cache key from a token.
//
// The key is a SHA-256 digest rather than the token itself: the cache is a
// long-lived in-memory map, and filling it with live plaintext credentials
// would put them in any heap dump or core file. SHA-256 is appropriate here
// where Argon2id is not — this is a lookup key derived from 128 bits of
// entropy we generated, not a password defence against offline guessing.
func cacheKey(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return string(sum[:])
}

func (s *Service) cacheGet(key string) (*Resolved, bool) {
	s.mu.RLock()
	e, ok := s.cache[key]
	s.mu.RUnlock()
	if !ok || s.now().After(e.expiresAt) {
		return nil, false
	}
	return e.resolved, true
}

func (s *Service) cachePut(key string, r *Resolved) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[key] = cacheEntry{resolved: r, expiresAt: s.now().Add(CacheTTL)}
}

func (s *Service) purgeToken(tokenID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, e := range s.cache {
		if e.resolved != nil && e.resolved.TokenID == tokenID {
			delete(s.cache, k)
		}
	}
}

// touchAsync records last_used_at without blocking the request.
//
// Its purpose is letting a human answer "is this token still in use?" before
// revoking it — not precise accounting. A failed update is therefore logged
// and dropped rather than failing the authentication that triggered it.
//
// Deliberately uses context.Background(): the request context is cancelled as
// soon as the response is written, which would abort this update most of the
// time.
func (s *Service) touchAsync(tokenID uuid.UUID) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := s.db.NewUpdate().
			Model((*domain.AccessToken)(nil)).
			Set("last_used_at = ?", time.Now()).
			Where("id = ?", tokenID).
			Exec(ctx)
		if err != nil {
			slog.WarnContext(ctx, "access token: last_used_at update failed",
				"token_id", tokenID, "error", err)
		}
	}()
}
