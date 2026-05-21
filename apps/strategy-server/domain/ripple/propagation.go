package ripple

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// AffectedArtifact describes a single artifact impacted by a change.
type AffectedArtifact struct {
	ArtifactKey  string `json:"artifact_key"`
	ArtifactType string `json:"artifact_type"`
	Name         string `json:"name,omitempty"`
	Track        string `json:"track,omitempty"`
	Relationship string `json:"relationship"` // how it connects to the changed artifact
	Direction    string `json:"direction"`    // "downstream" or "upstream"
	StaleDays    int    `json:"stale_days"`   // days since this artifact was updated after the change
	UpdatedAt    string `json:"updated_at"`   // ISO timestamp of last update
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
	ChangedKey          string               `json:"changed_key"`
	ChangedType         string               `json:"changed_type"`
	AffectedArtifacts   []AffectedArtifact   `json:"affected_artifacts"`
	OrphanedPaths       []OrphanedPath       `json:"orphaned_paths"`
	UntestedAssumptions []UntestedAssumption `json:"untested_assumptions"`
	CriticalCount       int                  `json:"critical_count"`
	WarningCount        int                  `json:"warning_count"`
	InfoCount           int                  `json:"info_count"`
}

// AnalyzeStructuralRipple walks the relationship graph from a changed artifact
// and identifies all connected artifacts that may need attention.
// mem is optional: when non-nil, multi-hop co-reference traversal uses Memory
// Expand() instead of per-target SQL queries. When nil, falls back to SQL.
func AnalyzeStructuralRipple(ctx context.Context, db *bun.DB, mem *memory.Client, instanceID uuid.UUID, changedKey, changedType string) (*StructuralRippleReport, error) {
	report := &StructuralRippleReport{
		ChangedKey:  changedKey,
		ChangedType: changedType,
	}

	// Get the changed artifact's updated_at as the baseline.
	// The changed key may be an artifact row or a relationship target (like a
	// value model path) that has no artifact row. Both are valid.
	var changeTime time.Time
	var changedArtifact domain.StrategyArtifact
	err := db.NewSelect().Model(&changedArtifact).
		Where("sa.instance_id = ?", instanceID).
		Where("sa.artifact_key = ?", changedKey).
		Where("sa.status = ?", domain.ArtifactStatusActive).
		Scan(ctx)
	if err != nil {
		// Not found as an artifact — use current time as change baseline.
		// This happens for relationship targets like value model paths.
		changeTime = time.Now()
	} else {
		changeTime = changedArtifact.UpdatedAt
	}

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
			Where("sa.artifact_key IN (?)", bun.List(keys)).
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
		var staleDays int
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

	// Multi-hop propagation: when the changed artifact references intermediate
	// nodes (like assumptions), find other artifacts that also reference those
	// nodes. This is critical for AIM → READY/FIRE ripple.
	//
	// Example: assessment_report validates_assumption asm-001
	//          fd-003 tests_assumption asm-001
	//          → fd-003 should get a ripple signal because asm-001's status changed.
	//
	// When a Memory client is available, use Expand() for BFS traversal — one
	// API call instead of N SQL queries (one per upstream relationship target).
	// Falls back to SQL if Memory is unavailable or the object is not indexed.
	alreadyAffected := make(map[string]bool, len(report.AffectedArtifacts))
	for _, a := range report.AffectedArtifacts {
		alreadyAffected[a.ArtifactKey] = true
	}

	transitiveAffected, memUsed := multiHopTransitive(ctx, db, mem, instanceID, changedKey, upstreamRels, artifactMap, alreadyAffected, changeTime)
	slog.Debug("ripple: multi-hop traversal",
		"instance_id", instanceID, "changed_key", changedKey,
		"transitive_count", len(transitiveAffected), "memory_used", memUsed)
	report.AffectedArtifacts = append(report.AffectedArtifacts, transitiveAffected...)

	// Classify severity.
	for _, a := range report.AffectedArtifacts {
		switch {
		case a.Direction == "downstream" && a.StaleDays > 0:
			report.WarningCount++
		case a.Direction == "transitive" && a.StaleDays > 0:
			report.WarningCount++
		default:
			report.InfoCount++
		}
	}

	return report, nil
}

// multiHopTransitive finds artifacts that co-reference the same intermediate
// nodes as the changed artifact (2-hop propagation). Uses Memory Expand() when
// available; falls back to per-target SQL queries.
// Returns the list of newly discovered transitive artifacts and a bool
// indicating whether Memory was used (true) or SQL (false).
func multiHopTransitive(
	ctx context.Context,
	db *bun.DB,
	mem *memory.Client,
	instanceID uuid.UUID,
	changedKey string,
	upstreamRels []domain.StrategyRelationship,
	artifactMap map[string]*domain.StrategyArtifact,
	alreadyAffected map[string]bool,
	changeTime time.Time,
) ([]AffectedArtifact, bool) {
	if len(upstreamRels) == 0 {
		return nil, false
	}

	// Try Memory path: Expand from the changed artifact with depth=2 to find
	// all nodes within 2 hops, then filter to those not already affected.
	if mem != nil {
		affected, ok := multiHopViaMemory(ctx, mem, db, instanceID, changedKey, alreadyAffected, artifactMap, changeTime)
		if ok {
			return affected, true
		}
		slog.Debug("ripple: Memory expand unavailable or object not indexed, falling back to SQL",
			"changed_key", changedKey)
	}

	// SQL fallback: per-target co-reference queries (original approach).
	return multiHopViaSQL(ctx, db, instanceID, changedKey, upstreamRels, artifactMap, alreadyAffected, changeTime), false
}

// multiHopViaMemory uses Memory Expand() to find 2-hop transitively affected artifacts.
// Returns (results, true) on success; (nil, false) if the object isn't indexed or expand fails.
func multiHopViaMemory(
	ctx context.Context,
	mem *memory.Client,
	db *bun.DB,
	instanceID uuid.UUID,
	changedKey string,
	alreadyAffected map[string]bool,
	artifactMap map[string]*domain.StrategyArtifact,
	changeTime time.Time,
) ([]AffectedArtifact, bool) {
	// Look up the Memory object ID for the changed artifact.
	obj, err := mem.GetObjectByKey(ctx, changedKey)
	if err != nil || obj == nil {
		return nil, false // not indexed — fall back
	}

	// BFS expand with depth=2 to capture co-referencing nodes.
	expand, err := mem.Expand(ctx, memory.ExpandRequest{
		RootIDs:  []string{obj.StableID()},
		MaxDepth: 2,
		MaxNodes: 200,
	})
	if err != nil {
		slog.Debug("ripple: Memory Expand failed", "changed_key", changedKey, "err", err)
		return nil, false
	}

	// Collect artifact keys from the expanded objects.
	var affected []AffectedArtifact
	for _, expandedObj := range expand.Objects {
		key := expandedObj.Key
		if key == "" || key == changedKey || alreadyAffected[key] {
			continue
		}
		// Only include artifacts that exist in this instance.
		a := artifactMap[key]
		if a == nil {
			// Load on demand.
			loaded := new(domain.StrategyArtifact)
			loadErr := db.NewSelect().Model(loaded).
				Where("sa.instance_id = ?", instanceID).
				Where("sa.artifact_key = ?", key).
				Where("sa.status = ?", domain.ArtifactStatusActive).
				Scan(ctx)
			if loadErr != nil {
				continue
			}
			a = loaded
		}

		staleDays := 0
		if a.UpdatedAt.Before(changeTime) {
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
		affected = append(affected, AffectedArtifact{
			ArtifactKey:  a.ArtifactKey,
			ArtifactType: a.ArtifactType,
			Name:         name,
			Track:        track,
			Relationship: "transitive (memory expand)",
			Direction:    "transitive",
			StaleDays:    staleDays,
			UpdatedAt:    a.UpdatedAt.Format(time.RFC3339),
		})
		alreadyAffected[key] = true
	}
	return affected, true
}

// multiHopViaSQL is the original SQL-based co-reference traversal.
// For each upstream relationship target, it finds other source artifacts
// that point at the same target.
func multiHopViaSQL(
	ctx context.Context,
	db *bun.DB,
	instanceID uuid.UUID,
	changedKey string,
	upstreamRels []domain.StrategyRelationship,
	artifactMap map[string]*domain.StrategyArtifact,
	alreadyAffected map[string]bool,
	changeTime time.Time,
) []AffectedArtifact {
	var affected []AffectedArtifact
	for _, r := range upstreamRels {
		var coTargetRels []domain.StrategyRelationship
		err := db.NewSelect().Model(&coTargetRels).
			Where("sr.instance_id = ?", instanceID).
			Where("sr.target_key = ?", r.TargetKey).
			Where("sr.source_key != ?", changedKey).
			Scan(ctx)
		if err != nil {
			continue
		}

		for _, coRel := range coTargetRels {
			if alreadyAffected[coRel.SourceKey] {
				continue
			}

			a := artifactMap[coRel.SourceKey]
			if a == nil {
				loaded := new(domain.StrategyArtifact)
				loadErr := db.NewSelect().Model(loaded).
					Where("sa.instance_id = ?", instanceID).
					Where("sa.artifact_key = ?", coRel.SourceKey).
					Where("sa.status = ?", domain.ArtifactStatusActive).
					Scan(ctx)
				if loadErr != nil {
					continue
				}
				a = loaded
			}

			staleDays := 0
			if a.UpdatedAt.Before(changeTime) {
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
			affected = append(affected, AffectedArtifact{
				ArtifactKey:  a.ArtifactKey,
				ArtifactType: a.ArtifactType,
				Name:         name,
				Track:        track,
				Relationship: fmt.Sprintf("co-references %s via %s", r.TargetKey, coRel.Relationship),
				Direction:    "transitive",
				StaleDays:    staleDays,
				UpdatedAt:    a.UpdatedAt.Format(time.RFC3339),
			})
			alreadyAffected[coRel.SourceKey] = true
		}
	}
	return affected
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

	// Signals for stale downstream and transitive artifacts.
	for _, a := range report.AffectedArtifacts {
		if (a.Direction != "downstream" && a.Direction != "transitive") || a.StaleDays == 0 {
			continue
		}
		severity := domain.SignalSeverityInfo
		if a.StaleDays > 14 {
			severity = domain.SignalSeverityWarning
		}
		if a.StaleDays > 30 {
			severity = domain.SignalSeverityCritical
		}

		var desc, suggestion string
		if a.Direction == "transitive" {
			desc = fmt.Sprintf("%s (%s) may need review — it %s which was affected by changes to %s. Last updated %d days ago.",
				a.ArtifactKey, a.ArtifactType, a.Relationship, report.ChangedKey, a.StaleDays)
			suggestion = fmt.Sprintf("Review %s — a shared dependency was updated by %s. Check if the artifact's content still aligns with the updated context.", a.ArtifactKey, report.ChangedKey)
		} else {
			desc = fmt.Sprintf("%s (%s) has not been updated in %d days since %s changed. Relationship: %s.",
				a.ArtifactKey, a.ArtifactType, a.StaleDays, report.ChangedKey, a.Relationship)
			suggestion = fmt.Sprintf("Review %s for alignment with recent changes to %s.", a.ArtifactKey, report.ChangedKey)
		}

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
