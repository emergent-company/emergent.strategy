package strategy

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
)

// Finding severities used by the integrity report. They mirror the verdict
// package's values; the report stays free of that dependency.
const (
	severityWarning = "warning"
	severityInfo    = "info"
)

// IntegrityFinding is one advisory observation about framework content in an
// instance. The rule id is public: consumers baseline on (key, rule).
type IntegrityFinding struct {
	Severity string `json:"severity"`
	Key      string `json:"key,omitempty"`
	Rule     string `json:"rule"`
	Message  string `json:"message"`
}

// IntegrityReport says how much of an instance is unmodified framework content.
type IntegrityReport struct {
	// Counts is the number of artifacts per integrity class. Authored artifacts
	// are not counted.
	Counts map[string]int `json:"counts"`
	// Scanned is how many artifacts were examined, so a clean report can be told
	// from one that examined nothing.
	Scanned  int                `json:"scanned"`
	Findings []IntegrityFinding `json:"findings"`
	// Source says what the classification matched against, including when only
	// the current embedded content was available.
	Source string `json:"source,omitempty"`
}

// ReportIntegrity classifies every current artifact of an instance and returns
// advisory findings. Canonical definitions are aggregated per track as info:
// they are expected to be present and must not dominate the report. Unmodified
// templates and the product value model at its packaged default are warnings.
func (s *Service) ReportIntegrity(ctx context.Context, instanceID uuid.UUID) (*IntegrityReport, error) {
	var rows []struct {
		ArtifactKey    string  `bun:"artifact_key"`
		Track          *string `bun:"track"`
		IntegrityClass *string `bun:"integrity_class"`
		IntegrityRef   *string `bun:"integrity_ref"`
	}
	if err := s.db.NewSelect().
		Model((*domain.StrategyArtifact)(nil)).
		Column("artifact_key", "track", "integrity_class", "integrity_ref").
		Where("instance_id = ? AND status != ?", instanceID, domain.ArtifactStatusArchived).
		OrderExpr("artifact_key").
		Scan(ctx, &rows); err != nil {
		return nil, fmt.Errorf("scan artifacts for integrity: %w", err)
	}

	rep := &IntegrityReport{Counts: map[string]int{}, Scanned: len(rows), Findings: []IntegrityFinding{}}
	if c := s.activeClassifier(); c != nil {
		rep.Source = c.Summary()
	}

	definitionsByTrack := map[string]int{}
	for _, r := range rows {
		class := deref(r.IntegrityClass)
		if class == "" {
			continue
		}
		rep.Counts[class]++
		ref := deref(r.IntegrityRef)

		switch integrity.Class(class) {
		case integrity.ClassCanonicalReference:
			track := deref(r.Track)
			if track == "" {
				track = "unspecified"
			}
			definitionsByTrack[track]++
		case integrity.ClassUnmodifiedTemplate:
			rep.Findings = append(rep.Findings, IntegrityFinding{
				Severity: severityWarning, Key: r.ArtifactKey, Rule: integrity.ClassUnmodifiedTemplate.RuleID(),
				Message: fmt.Sprintf("%s is an unmodified framework template (%s). It holds sample content, not this company's strategy; author it or remove it.", r.ArtifactKey, ref),
			})
		case integrity.ClassPackagedDefault:
			severity := severityInfo
			if strings.Contains(strings.ToLower(r.ArtifactKey), "product") || deref(r.Track) == "product" {
				severity = severityWarning
			}
			rep.Findings = append(rep.Findings, IntegrityFinding{
				Severity: severity, Key: r.ArtifactKey, Rule: integrity.ClassPackagedDefault.RuleID(),
				Message: fmt.Sprintf("%s is the packaged default value model (%s), not a value model this company defined.", r.ArtifactKey, ref),
			})
		}
	}

	tracks := make([]string, 0, len(definitionsByTrack))
	for t := range definitionsByTrack {
		tracks = append(tracks, t)
	}
	sort.Strings(tracks)
	for _, t := range tracks {
		n := definitionsByTrack[t]
		rep.Findings = append(rep.Findings, IntegrityFinding{
			Severity: severityInfo, Rule: integrity.ClassCanonicalReference.RuleID(),
			Message: fmt.Sprintf("%d unmodified canonical definitions in the %s track are installed in this instance. They are framework reference, not company decisions, and are excluded from strategy reads.", n, t),
		})
	}
	return rep, nil
}
