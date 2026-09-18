package instance

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Consumer repositories answer "which strategy instance does this repo use?".
//
// An EPF instance has one home (StrategyInstance.GithubRepo — where sync reads
// from and pushes to) but many consumers, because the instance is mounted as a
// submodule into sibling repos. Those are different facts and they are stored
// separately; see migration 042 for why conflating them was actively harmful.

// How a repo slug matched an instance in FindByRepo.
const (
	// RepoMatchHome — the repo is the instance's source of truth.
	RepoMatchHome = "home"
	// RepoMatchConsumer — the repo mounts the instance but does not own it.
	RepoMatchConsumer = "consumer"
)

// RepoMatch is one instance resolved from a repository slug.
type RepoMatch struct {
	Instance *domain.StrategyInstance `json:"instance"`

	// MatchType is RepoMatchHome or RepoMatchConsumer.
	MatchType string `json:"match_type"`

	// BasePath is where the instance sits inside the matched repo — the
	// instance's github_base_path for a home match, the consumer row's
	// base_path for a consumer match.
	BasePath string `json:"base_path"`
}

// FindByRepo returns every instance reachable from a repository slug, checking
// both the home column and the consumer table.
//
// It returns a slice, not a single instance, and that is deliberate: nothing
// constrains a repo to one instance. A monorepo can legitimately mount several,
// and github_repo has never had a unique constraint. Collapsing that to "the
// first one" silently picks a winner, which is the class of bug this whole
// change exists to remove. Callers that need exactly one must say so.
//
// basePath narrows the result to a specific mount point. An empty basePath
// means "any mount point" rather than "the root", because a caller that knows
// only its repo slug should not have to guess a path to get an answer.
func (s *Service) FindByRepo(ctx context.Context, githubRepo, basePath string) ([]RepoMatch, error) {
	githubRepo = strings.TrimSpace(githubRepo)
	if githubRepo == "" {
		return nil, apperror.ErrBadRequest.WithDetail("github_repo is required")
	}

	var matches []RepoMatch
	seen := make(map[uuid.UUID]bool)

	// Home matches.
	var homes []*domain.StrategyInstance
	homeQ := s.db.NewSelect().
		Model(&homes).
		Where("github_repo = ? AND deleted_at IS NULL", githubRepo).
		OrderExpr("created_at ASC, id ASC")
	if basePath != "" {
		homeQ = homeQ.Where("COALESCE(github_base_path, '') = ?", basePath)
	}
	if err := homeQ.Scan(ctx); err != nil {
		return nil, fmt.Errorf("find instances by home repo: %w", err)
	}
	for _, inst := range homes {
		seen[inst.ID] = true
		matches = append(matches, RepoMatch{
			Instance:  inst,
			MatchType: RepoMatchHome,
			BasePath:  derefString(inst.GithubBasePath),
		})
	}

	// Consumer matches. The soft-delete filter is applied by the database via
	// the EXISTS subquery, so a consumer row pointing at a deleted instance is
	// never returned (and never resurrects one).
	var consumerRows []*domain.InstanceConsumerRepo
	consumerQ := s.db.NewSelect().
		Model(&consumerRows).
		Where("icr.github_repo = ?", githubRepo).
		Where("EXISTS (SELECT 1 FROM strategy_instances si WHERE si.id = icr.instance_id AND si.deleted_at IS NULL)").
		OrderExpr("icr.created_at ASC, icr.id ASC")
	if basePath != "" {
		consumerQ = consumerQ.Where("icr.base_path = ?", basePath)
	}
	if err := consumerQ.Scan(ctx); err != nil {
		return nil, fmt.Errorf("find instances by consumer repo: %w", err)
	}

	for _, row := range consumerRows {
		if seen[row.InstanceID] {
			// Already reported as a home match, which is the stronger claim.
			continue
		}
		inst, err := s.GetInstance(ctx, row.InstanceID)
		if err != nil {
			return nil, fmt.Errorf("load instance %s for consumer repo %s: %w", row.InstanceID, githubRepo, err)
		}
		seen[row.InstanceID] = true
		matches = append(matches, RepoMatch{
			Instance:  inst,
			MatchType: RepoMatchConsumer,
			BasePath:  row.BasePath,
		})
	}

	return matches, nil
}

// ListConsumerRepos returns the registered consumers of an instance.
func (s *Service) ListConsumerRepos(ctx context.Context, instanceID uuid.UUID) ([]*domain.InstanceConsumerRepo, error) {
	var rows []*domain.InstanceConsumerRepo
	err := s.db.NewSelect().
		Model(&rows).
		Where("instance_id = ?", instanceID).
		OrderExpr("github_repo ASC, base_path ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list consumer repos: %w", err)
	}
	return rows, nil
}

// RegisterConsumerRepoParams describes a consumer link to create or refresh.
type RegisterConsumerRepoParams struct {
	InstanceID uuid.UUID
	GithubRepo string // "owner/repo"
	BasePath   string // path within the consuming repo; "" = repo root
	Note       *string
}

// RegisterConsumerRepo records that a repository consumes an instance. It is
// idempotent on (instance, repo, base_path) so a client can call it on every
// startup without accumulating rows.
func (s *Service) RegisterConsumerRepo(ctx context.Context, p RegisterConsumerRepoParams) (*domain.InstanceConsumerRepo, error) {
	slug := strings.TrimSpace(p.GithubRepo)
	if err := validateRepoSlug(slug); err != nil {
		return nil, err
	}

	// Fail loudly on an unknown instance rather than leaving the FK to produce
	// an opaque driver error.
	if _, err := s.GetInstance(ctx, p.InstanceID); err != nil {
		return nil, err
	}

	row := &domain.InstanceConsumerRepo{
		InstanceID: p.InstanceID,
		GithubRepo: slug,
		BasePath:   strings.Trim(strings.TrimSpace(p.BasePath), "/"),
		Note:       p.Note,
		CreatedBy:  audit.ActorFromContext(ctx),
	}

	_, err := s.db.NewInsert().
		Model(row).
		On("CONFLICT (instance_id, github_repo, base_path) DO UPDATE").
		Set("note = EXCLUDED.note").
		Set("updated_at = NOW()").
		Returning("*").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("register consumer repo: %w", err)
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_instance",
		EntityID:   p.InstanceID,
		Action:     "register_consumer_repo",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
		Details: map[string]any{
			"github_repo": row.GithubRepo,
			"base_path":   row.BasePath,
		},
	})

	return row, nil
}

// UnregisterConsumerRepo removes a consumer link. Removing a link that does not
// exist is not an error — the caller's intent (this repo should not be listed)
// is satisfied either way.
func (s *Service) UnregisterConsumerRepo(ctx context.Context, instanceID uuid.UUID, githubRepo, basePath string) error {
	res, err := s.db.NewDelete().
		Model((*domain.InstanceConsumerRepo)(nil)).
		Where("instance_id = ? AND github_repo = ? AND base_path = ?",
			instanceID, strings.TrimSpace(githubRepo), strings.Trim(strings.TrimSpace(basePath), "/")).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("unregister consumer repo: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_instance",
		EntityID:   instanceID,
		Action:     "unregister_consumer_repo",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    audit.ActorFromContext(ctx),
		Details: map[string]any{
			"github_repo": githubRepo,
			"base_path":   basePath,
		},
	})
	return nil
}

// validateRepoSlug enforces the "owner/repo" shape used everywhere a GitHub
// repository is stored.
func validateRepoSlug(slug string) error {
	parts := strings.SplitN(slug, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" || strings.Contains(parts[1], "/") {
		return apperror.ErrBadRequest.WithDetail("github_repo must be in the format owner/repo")
	}
	return nil
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
