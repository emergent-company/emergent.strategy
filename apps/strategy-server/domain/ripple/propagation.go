package ripple

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// AffectedArtifact describes a single artifact impacted by a change.
type AffectedArtifact struct {
	ArtifactKey  string `json:"artifact_key"`
	ArtifactType string `json:"artifact_type"`
	Name         string `json:"name,omitempty"`
	Track        string `json:"track,omitempty"`
	Relationship string `json:"relationship"`    // how it connects to the changed artifact
	Direction    string `json:"direction"`        // "downstream" or "upstream"
	StaleDays    int    `json:"stale_days"`       // days since this artifact was updated after the change
	UpdatedAt    string `json:"updated_at"`       // ISO timestamp of last update
}

// OrphanedPath describes a value model path with no contributing features.
type OrphanedPath struct {
	ValuePath    string `json:"value_path"`
	ArtifactKey  string `json:"artifact_key"`
	ArtifactType string `json:"artifact_type"`
}

// UntestedAssumption describes an assumption with no features testing it.
type UntestedAssumption struct {
	AssumptionKey string `json:"assumption_key"`
	Description   string `json:"description,omitempty"`
}

// StructuralRippleReport is the result of structural ripple analysis.
type StructuralRippleReport struct {
	ChangedKey           string              `json:"changed_key"`
	ChangedType          string              `json:"changed_type"`
	AffectedArtifacts    []AffectedArtifact  `json:"affected_artifacts"`
	OrphanedPaths        []OrphanedPath      `json:"orphaned_paths"`
	UntestedAssumptions  []UntestedAssumption `json:"untested_assumptions"`
	CriticalCount        int                 `json:"critical_count"`
	WarningCount         int                 `json:"warning_count"`
	InfoCount            int                 `json:"info_count"`
}

// AnalyzeStructuralRipple walks the relationship graph from a changed artifact
// and identifies all connected artifacts that may need attention.
func AnalyzeStructuralRipple(ctx context.Context, db *bun.DB, instanceID uuid.UUID, changedKey, changedType string) (*StructuralRippleReport, error) {
	report := &StructuralRippleReport{
		ChangedKey:  changedKey,
		ChangedType: changedType,
	}

	// Get the changed artifact's updated_at as the baseline.
	var changedArtifact domain.StrategyArtifact
	err := db.NewSelect().Model(&changedArtifact).
		Where("sa.instance_id = ?", instanceID).
		Where("sa.artifact_key = ?", changedKey).
		Where("sa.status = ?", domain.ArtifactStatusActive).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("get changed artifact %s: %w", changedKey, err)
	}
	changeTime := changedArtifact.UpdatedAt

	// Find downstream artifacts: things that reference the changed artifact.
	// These are relationships where target_key = changedKey (others point AT this artifact).
	var downstreamRels []domain.StrategyRelationship
	err = db.NewSelect().Model(&downstreamRels).
		Where("sr.instance_id = ?", instanceID).
		Where("sr.target_key = ?", changedKey).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("find downstream relationships: %w", err)
	}

	// Find upstream artifacts: things the changed artifact references.
	var upstreamRels []domain.StrategyRelationship
	err = db.NewSelect().Model(&upstreamRels).
		Where("sr.instance_id = ?", instanceID).
		Where("sr.source_key = ?", changedKey).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("find upstream relationships: %w", err)
	}

	// Collect all connected artifact keys to look up their metadata.
	keySet := make(map[string]bool)
	for _, r := range downstreamRels {
		keySet[r.SourceKey] = true
	}
	for _, r := range upstreamRels {
		keySet[r.TargetKey] = true
	}

	// Load metadata for all connected artifacts.
	artifactMap := make(map[string]*domain.StrategyArtifact)
	if len(keySet) > 0 {
		keys := make([]string, 0, len(keySet))
		for k := range keySet {
			keys = append(keys, k)
		}
		var artifacts []*domain.StrategyArtifact
		err = db.NewSelect().Model(&artifacts).
			Where("sa.instance_id = ?", instanceID).
			Where("sa.artifact_key IN (?)", bun.In(keys)).
			Where("sa.status = ?", domain.ArtifactStatusActive).
			Scan(ctx)
		if err != nil {
			return nil, fmt.Errorf("load connected artifacts: %w", err)
		}
		for _, a := range artifacts {
			artifactMap[a.ArtifactKey] = a
		}
	}

	// Build affected list from downstream (things referencing the changed artifact).
	for _, r := range downstreamRels {
		a := artifactMap[r.SourceKey]
		if a == nil {
			continue
		}
		staleDays := int(time.Since(a.UpdatedAt).Hours() / 24)
		if a.UpdatedAt.After(changeTime) {
			staleDays = 0 // updated after the change — not stale
		} else {
			staleDays = int(changeTime.Sub(a.UpdatedAt).Hours() / 24)
		}
		name := ""
		if a.Name != nil {
			name = *a.Name
		}
		track := ""
		if a.Track != nil {
			track = *a.Track
		}
		report.AffectedArtifacts = append(report.AffectedArtifacts, AffectedArtifact{
			ArtifactKey:  a.ArtifactKey,
			ArtifactType: a.ArtifactType,
			Name:         name,
			Track:        track,
			Relationship: r.Relationship,
			Direction:    "downstream",
			StaleDays:    staleDays,
			UpdatedAt:    a.UpdatedAt.Format(time.RFC3339),
		})
	}

	// Build affected list from upstream (things the changed artifact references).
	for _, r := range upstreamRels {
		a := artifactMap[r.TargetKey]
		if a == nil {
			continue
		}
		name := ""
		if a.Name != nil {
			name = *a.Name
		}
		track := ""
		if a.Track != nil {
			track = *a.Track
		}
		report.AffectedArtifacts = append(report.AffectedArtifacts, AffectedArtifact{
			ArtifactKey:  a.ArtifactKey,
			ArtifactType: a.ArtifactType,
			Name:         name,
			Track:        track,
			Relationship: r.Relationship,
			Direction:    "upstream",
			StaleDays:    0, // upstream is not "stale" relative to the change
			UpdatedAt:    a.UpdatedAt.Format(time.RFC3339),
		})
	}

	// Classify severity.
	for _, a := range report.AffectedArtifacts {
		if a.Direction == "downstream" && a.StaleDays > 0 {
			report.WarningCount++
		} else {
			report.InfoCount++
		}
	}

	return report, nil
}

// AnalyzeCoherence runs a full structural coherence check on an instance.
// Unlike AnalyzeStructuralRipple (which starts from a specific change),
// this checks the entire graph for orphaned paths, untested assumptions,
// and stale downstream artifacts.
func AnalyzeCoherence(ctx context.Context, db *bun.DB, instanceID uuid.UUID) (*StructuralRippleReport, error) {
	report := &StructuralRippleReport{
		ChangedKey:  "",
		ChangedType: "coherence_check",
	}

	// 1. Find orphaned value model paths: value model artifacts with no
	//    contributes_to relationships pointing at them.
	var valueModelArtifacts []*domain.StrategyArtifact
	err := db.NewSelect().Model(&valueModelArtifacts).
		Where("sa.instance_id = ?", instanceID).
		Where("sa.artifact_type = ?", domain.ArtifactTypeValueModel).
		Where("sa.status = ?", domain.ArtifactStatusActive).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load value models: %w", err)
	}
	for _, vm := range valueModelArtifacts {
		var count int
		count, err = db.NewSelect().TableExpr("strategy_relationships").
			Where("instance_id = ?", instanceID).
			Where("target_key = ?", vm.ArtifactKey).
			Where("relationship = ?", domain.RelContributesTo).
			Count(ctx)
		if err != nil {
			return nil, fmt.Errorf("count contributes_to for %s: %w", vm.ArtifactKey, err)
		}
		if count == 0 {
			report.OrphanedPaths = append(report.OrphanedPaths, OrphanedPath{
				ValuePath:    vm.ArtifactKey,
				ArtifactKey:  vm.ArtifactKey,
				ArtifactType: vm.ArtifactType,
			})
			report.WarningCount++
		}
	}

	// 2. Find untested assumptions: roadmap assumptions with no
	//    tests_assumption relationships.
	var assumptionRels []domain.StrategyRelationship
	err = db.NewSelect().Model(&assumptionRels).
		Where("sr.instance_id = ?", instanceID).
		Where("sr.relationship = ?", domain.RelTestsAssumption).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load tests_assumption rels: %w", err)
	}
	testedAssumptions := make(map[string]bool)
	for _, r := range assumptionRels {
		testedAssumptions[r.TargetKey] = true
	}

	// Look at all target_keys of type "assumption" in any relationship.
	// If an assumption appears as a target but has no tests_assumption source, it's untested.
	var allAssumptionTargets []struct {
		TargetKey string `bun:"target_key"`
	}
	err = db.NewSelect().TableExpr("strategy_relationships").
		ColumnExpr("DISTINCT target_key").
		Where("instance_id = ?", instanceID).
		Where("target_type = ?", "assumption").
		Scan(ctx, &allAssumptionTargets)
	if err != nil {
		return nil, fmt.Errorf("load assumption targets: %w", err)
	}
	for _, at := range allAssumptionTargets {
		if !testedAssumptions[at.TargetKey] {
			report.UntestedAssumptions = append(report.UntestedAssumptions, UntestedAssumption{
				AssumptionKey: at.TargetKey,
			})
			report.WarningCount++
		}
	}

	return report, nil
}

// GenerateSignalsFromRipple creates signal objects from a structural ripple report.
// Does NOT persist them — caller must use Service.CreateSignals.
func GenerateSignalsFromRipple(instanceID uuid.UUID, report *StructuralRippleReport) []*domain.RippleSignal {
	var signals []*domain.RippleSignal

	// Signals for stale downstream artifacts.
	for _, a := range report.AffectedArtifacts {
		if a.Direction != "downstream" || a.StaleDays == 0 {
			continue
		}
		severity := domain.SignalSeverityInfo
		if a.StaleDays > 14 {
			severity = domain.SignalSeverityWarning
		}
		if a.StaleDays > 30 {
			severity = domain.SignalSeverityCritical
		}
		desc := fmt.Sprintf("%s (%s) has not been updated in %d days since %s changed. Relationship: %s.",
			a.ArtifactKey, a.ArtifactType, a.StaleDays, report.ChangedKey, a.Relationship)
		suggestion := fmt.Sprintf("Review %s for alignment with recent changes to %s.", a.ArtifactKey, report.ChangedKey)

		signals = append(signals, &domain.RippleSignal{
			InstanceID:  instanceID,
			SignalType:  domain.SignalTypePropagation,
			Severity:    severity,
			SourceKey:   report.ChangedKey,
			TargetKey:   a.ArtifactKey,
			Description: desc,
			Suggestion:  &suggestion,
		})
	}

	// Signals for orphaned value paths.
	for _, o := range report.OrphanedPaths {
		desc := fmt.Sprintf("Value model path %s has no features contributing to it. Either remove the path or create features that deliver this value.", o.ValuePath)
		signals = append(signals, &domain.RippleSignal{
			InstanceID:  instanceID,
			SignalType:  domain.SignalTypeOrphan,
			Severity:    domain.SignalSeverityWarning,
			SourceKey:   o.ArtifactKey,
			TargetKey:   o.ValuePath,
			Description: desc,
		})
	}

	// Signals for untested assumptions.
	for _, u := range report.UntestedAssumptions {
		desc := fmt.Sprintf("Assumption %s has no features testing it. Strategic bets should be validated through features with tests_assumption relationships.", u.AssumptionKey)
		signals = append(signals, &domain.RippleSignal{
			InstanceID:  instanceID,
			SignalType:  domain.SignalTypeStaleness,
			Severity:    domain.SignalSeverityWarning,
			SourceKey:   u.AssumptionKey,
			TargetKey:   u.AssumptionKey,
			Description: desc,
		})
	}

	return signals
}
