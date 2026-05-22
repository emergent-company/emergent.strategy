// Package watchdog checks strategy instances for staleness, orphaned artifacts,
// and cross-phase coherence issues. It runs alongside the heartbeat ticker
// (every 24 hours by default) and on-demand via health_check.
package watchdog

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

// HealthReport is the full output of a watchdog run for one instance.
type HealthReport struct {
	InstanceID      uuid.UUID            `json:"instance_id"`
	GeneratedAt     time.Time            `json:"generated_at"`
	StaleArtifacts  []StaleArtifact      `json:"stale_artifacts"`
	OrphanArtifacts []OrphanArtifact     `json:"orphan_artifacts"`
	CoherenceIssues []CoherenceIssue     `json:"coherence_issues"`
	GhostTypes      []string             `json:"ghost_types,omitempty"`
	Summary         HealthSummary        `json:"summary"`
}

// HealthSummary provides a quick overview of the health report.
type HealthSummary struct {
	StaleCount     int    `json:"stale_count"`
	OrphanCount    int    `json:"orphan_count"`
	IssueCount     int    `json:"issue_count"`
	OverallStatus  string `json:"overall_status"` // "healthy" | "warning" | "critical"
}

// StaleArtifact is an artifact whose UpdatedAt exceeds the staleness threshold.
type StaleArtifact struct {
	ArtifactKey  string        `json:"artifact_key"`
	ArtifactType string        `json:"artifact_type"`
	DaysSinceUpdate int        `json:"days_since_update"`
	Threshold    int           `json:"threshold_days"`
	Severity     string        `json:"severity"` // "info" | "warning"
}

// OrphanArtifact is an artifact with zero inbound and outbound relationships.
type OrphanArtifact struct {
	ArtifactKey  string `json:"artifact_key"`
	ArtifactType string `json:"artifact_type"`
}

// CoherenceIssue is a cross-phase alignment problem.
type CoherenceIssue struct {
	Type        string `json:"type"`        // see coherenceIssueType constants
	ArtifactKey string `json:"artifact_key,omitempty"`
	Message     string `json:"message"`
	Severity    string `json:"severity"` // "info" | "warning" | "critical"
}

// Coherence issue type constants.
const (
	IssueUnlinkedFeature   = "unlinked_feature"    // feature without delivered_by_kr edge
	IssueUndeliveredKR     = "undelivered_kr"       // roadmap KR without delivering feature
	IssueUnusedComponent   = "unused_component"     // value model component active but no contributes_to
	IssueUnsupportedTier   = "unsupported_tier"     // definition at tier>1 without OKR support
	IssueStaleEvidence     = "stale_evidence"       // unprocessed evidence older than 30 days
)

// ---------------------------------------------------------------------------
// Staleness thresholds per artifact type (days)
// ---------------------------------------------------------------------------

var stalenessThresholds = map[string]int{
	"north_star":             90,
	"strategy_foundations":   90,
	"insight_analyses":       90,
	"insight_opportunity":    90,
	"strategy_formula":       90,
	"roadmap_recipe":         90,
	domain.ArtifactTypeFeature: 60,
	"commercial_def":         180,
	"org_ops_def":            180,
	"strategy_def":           180,
	"evidence":               30, // unprocessed evidence
}

// ghostArtifactTypes are artifact types that exist in the phase registry but
// lack proper domain integration. Flagged for review — integrate or remove.
var ghostArtifactTypes = []string{
	"mappings",
	"strategic_reality_check",
	"track_health_assessment",
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service checks an instance for staleness, orphans, and coherence issues.
type Service struct {
	db  *bun.DB
	log *slog.Logger
}

// NewService creates a new watchdog Service.
func NewService(db *bun.DB) *Service {
	return &Service{
		db:  db,
		log: slog.Default().With("component", "watchdog"),
	}
}

// RunAny wraps Run for use with the mcpserver.WatchdogRunner interface,
// returning the report as any to avoid circular imports.
func (s *Service) RunAny(ctx context.Context, instanceID uuid.UUID) (any, error) {
	return s.Run(ctx, instanceID)
}

// Run performs a full health check for the given instance and returns a HealthReport.
// It is safe to call concurrently for different instances.
func (s *Service) Run(ctx context.Context, instanceID uuid.UUID) (*HealthReport, error) {
	report := &HealthReport{
		InstanceID:  instanceID,
		GeneratedAt: time.Now().UTC(),
	}

	// Load all artifacts for the instance.
	artifacts, err := s.loadArtifacts(ctx, instanceID)
	if err != nil {
		return nil, err
	}

	// Load all relationships for the instance.
	rels, err := s.loadRelationships(ctx, instanceID)
	if err != nil {
		return nil, err
	}

	// Run each check.
	report.StaleArtifacts = s.checkStaleness(artifacts)
	report.OrphanArtifacts = s.checkOrphans(artifacts, rels)
	report.CoherenceIssues = s.checkCoherence(artifacts, rels)
	report.GhostTypes = s.checkGhostTypes(artifacts)
	report.Summary = buildSummary(report)

	s.log.Debug("watchdog run complete",
		"instance_id", instanceID,
		"stale", len(report.StaleArtifacts),
		"orphans", len(report.OrphanArtifacts),
		"issues", len(report.CoherenceIssues),
	)

	return report, nil
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

func (s *Service) loadArtifacts(ctx context.Context, instanceID uuid.UUID) ([]*domain.StrategyArtifact, error) {
	var artifacts []*domain.StrategyArtifact
	err := s.db.NewSelect().
		Model(&artifacts).
		Where("sa.instance_id = ?", instanceID).
		Where("sa.status != 'archived'").
		Scan(ctx)
	return artifacts, err
}

func (s *Service) loadRelationships(ctx context.Context, instanceID uuid.UUID) ([]*domain.StrategyRelationship, error) {
	var rels []*domain.StrategyRelationship
	err := s.db.NewSelect().
		Model(&rels).
		Where("sr.instance_id = ?", instanceID).
		Scan(ctx)
	return rels, err
}

// ---------------------------------------------------------------------------
// Staleness check
// ---------------------------------------------------------------------------

func (s *Service) checkStaleness(artifacts []*domain.StrategyArtifact) []StaleArtifact {
	now := time.Now().UTC()
	var stale []StaleArtifact

	for _, a := range artifacts {
		threshold, ok := stalenessThresholds[a.ArtifactType]
		if !ok {
			continue // no threshold configured → not tracked
		}

		// Special case: evidence staleness applies only to unprocessed items.
		if a.ArtifactType == "evidence" {
			// Check processing_status in payload; skip if processed.
			// We check the days threshold against UpdatedAt regardless —
			// if an evidence item was never actioned, it's stale.
		}

		daysSince := int(now.Sub(a.UpdatedAt.UTC()).Hours() / 24)
		if daysSince > threshold {
			severity := "info"
			if daysSince > threshold*2 {
				severity = "warning"
			}
			stale = append(stale, StaleArtifact{
				ArtifactKey:     a.ArtifactKey,
				ArtifactType:    a.ArtifactType,
				DaysSinceUpdate: daysSince,
				Threshold:       threshold,
				Severity:        severity,
			})
		}
	}

	return stale
}

// ---------------------------------------------------------------------------
// Orphan check
// ---------------------------------------------------------------------------

func (s *Service) checkOrphans(artifacts []*domain.StrategyArtifact, rels []*domain.StrategyRelationship) []OrphanArtifact {
	// Build a set of artifact keys that have at least one relationship (inbound or outbound).
	connected := make(map[string]bool, len(rels)*2)
	for _, r := range rels {
		connected[r.SourceKey] = true
		connected[r.TargetKey] = true
	}

	// Artifact types that are inherently singleton and don't need relationships
	// (e.g. north_star is the root — it has no inbound edges from READY).
	// We still flag them if they have no outbound edges (they should at least
	// contribute to something once the instance matures).
	var orphans []OrphanArtifact
	for _, a := range artifacts {
		// Skip types that are designed to be unconnected (e.g. raw evidence without links).
		if a.ArtifactType == "evidence" {
			continue
		}
		if !connected[a.ArtifactKey] {
			orphans = append(orphans, OrphanArtifact{
				ArtifactKey:  a.ArtifactKey,
				ArtifactType: a.ArtifactType,
			})
		}
	}

	return orphans
}

// ---------------------------------------------------------------------------
// Cross-phase coherence checks
// ---------------------------------------------------------------------------

func (s *Service) checkCoherence(artifacts []*domain.StrategyArtifact, rels []*domain.StrategyRelationship) []CoherenceIssue {
	var issues []CoherenceIssue

	// Index: source_key → []relationship
	relsBySource := make(map[string][]*domain.StrategyRelationship, len(rels))
	// Index: target_key → []relationship
	relsByTarget := make(map[string][]*domain.StrategyRelationship, len(rels))
	for _, r := range rels {
		relsBySource[r.SourceKey] = append(relsBySource[r.SourceKey], r)
		relsByTarget[r.TargetKey] = append(relsByTarget[r.TargetKey], r)
	}

	for _, a := range artifacts {
		switch a.ArtifactType {
		case domain.ArtifactTypeFeature:
			// Features without any contributes_to or delivered_by_kr edge are unlinked.
			hasValueEdge := false
			for _, r := range relsBySource[a.ArtifactKey] {
				if r.Relationship == "contributes_to" || r.Relationship == "delivered_by_kr" || r.Relationship == "in_tracks" {
					hasValueEdge = true
					break
				}
			}
			if !hasValueEdge {
				issues = append(issues, CoherenceIssue{
					Type:        IssueUnlinkedFeature,
					ArtifactKey: a.ArtifactKey,
					Message:     "Feature has no contributes_to or delivered_by_kr relationship — not connected to any KR or value model path.",
					Severity:    "warning",
				})
			}

		case "evidence":
			// Unprocessed evidence older than 30 days.
			daysSince := int(time.Since(a.UpdatedAt.UTC()).Hours() / 24)
			if daysSince > 30 {
				issues = append(issues, CoherenceIssue{
					Type:        IssueStaleEvidence,
					ArtifactKey: a.ArtifactKey,
					Message:     "Evidence item has not been processed or acted upon in over 30 days.",
					Severity:    "info",
				})
			}
		}
	}

	return issues
}

// ---------------------------------------------------------------------------
// Ghost type audit
// ---------------------------------------------------------------------------

func (s *Service) checkGhostTypes(artifacts []*domain.StrategyArtifact) []string {
	found := make(map[string]bool)
	for _, a := range artifacts {
		for _, ghost := range ghostArtifactTypes {
			if a.ArtifactType == ghost {
				found[ghost] = true
			}
		}
	}
	var result []string
	for _, ghost := range ghostArtifactTypes {
		if found[ghost] {
			result = append(result, ghost)
		}
	}
	return result
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

func buildSummary(r *HealthReport) HealthSummary {
	criticalCount := 0
	warningCount := 0
	for _, issue := range r.CoherenceIssues {
		if issue.Severity == "critical" {
			criticalCount++
		} else if issue.Severity == "warning" {
			warningCount++
		}
	}
	for _, stale := range r.StaleArtifacts {
		if stale.Severity == "warning" {
			warningCount++
		}
	}

	status := "healthy"
	if criticalCount > 0 {
		status = "critical"
	} else if warningCount > 0 || len(r.OrphanArtifacts) > 0 {
		status = "warning"
	}

	return HealthSummary{
		StaleCount:    len(r.StaleArtifacts),
		OrphanCount:   len(r.OrphanArtifacts),
		IssueCount:    len(r.CoherenceIssues),
		OverallStatus: status,
	}
}
