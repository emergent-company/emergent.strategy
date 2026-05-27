package strategy_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ── integration helpers ───────────────────────────────────────────────────────

func seedInstance(t *testing.T, db *bun.DB) (uuid.UUID, *strategy.Service) {
	t.Helper()
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	orgID := seedTestOrg(t, db)
	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	svc := strategy.NewService(db)

	ws, err := wsSvc.CreateWorkspace(ctx, "align-test-"+uuid.New().String()[:8], nil, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Align Test",
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}
	return inst.ID, svc
}

// commitArtifact stages and commits a single artifact for testing.
func commitArtifact(t *testing.T, db *bun.DB, instID uuid.UUID, artType, artKey string, payload any) {
	t.Helper()
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	svc := strategy.NewService(db)

	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID:   instID,
		ArtifactType: artType,
		ArtifactKey:  artKey,
		Action:       domain.MutationActionCreate,
		Payload:      payload,
	})
	if err != nil {
		t.Fatalf("Stage %q: %v", artKey, err)
	}
	if _, err := svc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch %q: %v", artKey, err)
	}
}

// ── AlignPortfolio: no roadmap ────────────────────────────────────────────────

func TestAlignPortfolio_NoRoadmap(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	result, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}
	if !result.NoRoadmap {
		t.Error("expected NoRoadmap=true when no roadmap exists")
	}
	if result.KRsWithTargets != 0 {
		t.Errorf("expected 0 KRs with targets, got %d", result.KRsWithTargets)
	}
}

// ── AlignPortfolio: roadmap with no KR targets ────────────────────────────────

func TestAlignPortfolio_NoKRTargets(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	roadmap := map[string]any{
		"roadmap": map[string]any{
			"tracks": map[string]any{
				"strategy": map[string]any{
					"okrs": []any{
						map[string]any{
							"objective": "Grow market share",
							"key_results": []any{
								map[string]any{"description": "Reach 10k users"},
							},
						},
					},
				},
			},
		},
	}
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe", roadmap)

	result, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}
	if result.KRsWithTargets != 0 {
		t.Errorf("expected 0 KRs with targets, got %d", result.KRsWithTargets)
	}
	if result.TracksChanged != 0 {
		t.Errorf("expected 0 tracks changed, got %d", result.TracksChanged)
	}
}

// ── AlignPortfolio: activates targeted components ────────────────────────────

func TestAlignPortfolio_ActivatesTargetedComponents(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	// Seed a roadmap with one KR targeting a specific L3 component.
	roadmap := buildRoadmapWithKRTarget("strategy", "l1-vision.l2-brand.l3-messaging", "emerging")
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe", roadmap)

	// Seed a value model with that L3 component initially inactive.
	vm := buildValueModel("strategy", []l3Component{
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-messaging", active: false},
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-positioning", active: false},
	})
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.strategy", vmWithName(vm, "Strategy"))

	// Run alignment.
	result, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}

	if result.KRsWithTargets != 1 {
		t.Errorf("expected 1 KR with target, got %d", result.KRsWithTargets)
	}
	if result.TracksChanged != 1 {
		t.Errorf("expected 1 track changed, got %d", result.TracksChanged)
	}
	if result.TotalActivated != 1 {
		t.Errorf("expected 1 activated, got %d", result.TotalActivated)
	}

	// Verify committed payload reflects the activation.
	committed, err := svc.GetCurrentArtifact(ctx, instID, "value_model.strategy")
	if err != nil {
		t.Fatalf("GetCurrentArtifact: %v", err)
	}

	var updated map[string]any
	if err := json.Unmarshal(committed, &updated); err != nil {
		t.Fatalf("unmarshal committed: %v", err)
	}

	// Walk the layers to verify l3-messaging is now active and l3-positioning is not.
	l3Messaging := findL3(updated, "l3-messaging")
	if l3Messaging == nil {
		t.Fatal("l3-messaging not found in committed payload")
	}
	if active, _ := l3Messaging["active"].(bool); !active {
		t.Error("l3-messaging should be active after alignment")
	}

	l3Positioning := findL3(updated, "l3-positioning")
	if l3Positioning == nil {
		t.Fatal("l3-positioning not found in committed payload")
	}
	if active, _ := l3Positioning["active"].(bool); active {
		t.Error("l3-positioning should NOT be active (not targeted by any KR)")
	}
}

// ── AlignPortfolio: no-op on second run (idempotent after first pass) ─────────

func TestAlignPortfolio_NoOp(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	roadmap := buildRoadmapWithKRTarget("strategy", "l1-vision.l2-brand.l3-messaging", "")
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe", roadmap)

	// Start with l3-messaging inactive — first run will activate it and write notes.
	vm := buildValueModel("strategy", []l3Component{
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-messaging", active: false},
	})
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.strategy", vmWithName(vm, "Strategy"))

	// First run — should activate l3-messaging and write activation_notes.
	result, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio (1st run): %v", err)
	}
	if result.TracksProcessed != 1 {
		t.Errorf("expected 1 track processed, got %d", result.TracksProcessed)
	}
	if result.TracksChanged != 1 {
		t.Errorf("expected 1 track changed on first run, got %d", result.TracksChanged)
	}

	// Second run — state already matches (active flag + activation_notes both correct).
	result2, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio (2nd run): %v", err)
	}
	if result2.TracksChanged != 0 {
		t.Errorf("expected 0 tracks changed on second run (no-op), got %d", result2.TracksChanged)
	}
}

// ── AlignPortfolio: structural preservation ───────────────────────────────────

func TestAlignPortfolio_StructuralPreservation(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	roadmap := buildRoadmapWithKRTarget("strategy", "l1-vision.l2-brand.l3-messaging", "")
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe", roadmap)

	// Value model with extra fields that must be preserved.
	vm := map[string]any{
		"name":        "Strategy",
		"description": "This is the strategy value model",
		"layers": []any{
			map[string]any{
				"id":   "l1-vision",
				"name": "Vision & Mission",
				"custom_field": "must be preserved",
				"components": []any{
					map[string]any{
						"id":   "l2-brand",
						"name": "Brand",
						"components": []any{}, // note: canonical uses sub_components, but we handle either
						"sub_components": []any{
							map[string]any{
								"id":     "l3-messaging",
								"name":   "Messaging",
								"uvp":    "Clear differentiated message",
								"active": false,
							},
						},
					},
				},
			},
		},
	}
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.strategy", vmWithName(vm, "Strategy"))

	_, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}

	committed, err := svc.GetCurrentArtifact(ctx, instID, "value_model.strategy")
	if err != nil {
		t.Fatalf("GetCurrentArtifact: %v", err)
	}

	var updated map[string]any
	if err := json.Unmarshal(committed, &updated); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Description must be preserved.
	if desc, _ := updated["description"].(string); desc != "This is the strategy value model" {
		t.Errorf("description was modified: %q", desc)
	}

	// Layer custom_field must be preserved.
	layers, _ := updated["layers"].([]any)
	if len(layers) == 0 {
		t.Fatal("layers missing")
	}
	l1, _ := layers[0].(map[string]any)
	if cf, _ := l1["custom_field"].(string); cf != "must be preserved" {
		t.Errorf("custom_field was lost: %q", cf)
	}

	// L3 UVP must be preserved.
	l3 := findL3(updated, "l3-messaging")
	if l3 == nil {
		t.Fatal("l3-messaging missing")
	}
	if uvp, _ := l3["uvp"].(string); uvp != "Clear differentiated message" {
		t.Errorf("UVP was lost: %q", uvp)
	}
}

// ── AlignPortfolio: upward propagation ───────────────────────────────────────

func TestAlignPortfolio_UpwardPropagation(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	roadmap := buildRoadmapWithKRTarget("strategy", "l1-vision.l2-brand.l3-messaging", "")
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe", roadmap)

	// Start with everything inactive.
	vm := buildValueModel("strategy", []l3Component{
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-messaging", active: false},
	})
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.strategy", vmWithName(vm, "Strategy"))

	_, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}

	committed, err := svc.GetCurrentArtifact(ctx, instID, "value_model.strategy")
	if err != nil {
		t.Fatalf("GetCurrentArtifact: %v", err)
	}

	var updated map[string]any
	if err := json.Unmarshal(committed, &updated); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	layers, _ := updated["layers"].([]any)
	if len(layers) == 0 {
		t.Fatal("no layers")
	}
	l1, _ := layers[0].(map[string]any)
	// L1 should now be active (propagated from l3-messaging).
	if active, _ := l1["active"].(bool); !active {
		t.Error("L1 should be active (propagated up from active L3)")
	}

	components, _ := l1["components"].([]any)
	if len(components) == 0 {
		t.Fatal("no components in L1")
	}
	l2, _ := components[0].(map[string]any)
	// L2 should also be active.
	if active, _ := l2["active"].(bool); !active {
		t.Error("L2 should be active (propagated up from active L3)")
	}
}

// ── AlignPortfolio: unresolvable path ────────────────────────────────────────

func TestAlignPortfolio_UnresolvablePath(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	// KR targets a path that doesn't exist in the value model.
	roadmap := buildRoadmapWithKRTarget("strategy", "l1-vision.l2-brand.l3-nonexistent", "")
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe", roadmap)

	vm := buildValueModel("strategy", []l3Component{
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-messaging", active: false},
	})
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.strategy", vmWithName(vm, "Strategy"))

	result, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}

	// Operation should succeed (no error).
	// Unresolvable path should be reported.
	if len(result.UnresolvablePaths) == 0 {
		t.Error("expected at least one unresolvable path")
	}
	found := false
	for _, p := range result.UnresolvablePaths {
		if p == "l1-vision.l2-brand.l3-nonexistent" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected unresolvable path 'l1-vision.l2-brand.l3-nonexistent', got %v", result.UnresolvablePaths)
	}
}

// ── RunConsistencyCheck: stale run cleanup ────────────────────────────────────

func TestConsistencyCheck_StaleRunCleanup(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	// Insert a skill run that started 15 minutes ago (beyond the 10-min timeout).
	staleStarted := time.Now().UTC().Add(-15 * time.Minute)
	runID := uuid.New()
	_, err := db.ExecContext(ctx,
		"INSERT INTO skill_runs (id, instance_id, skill_name, status, trigger, started_at, created_at) "+
			"VALUES (?, ?, ?, ?, ?, ?, NOW())",
		runID, instID, "test-skill", "running", "manual", staleStarted)
	if err != nil {
		t.Fatalf("insert stale run: %v", err)
	}

	result, err := svc.RunConsistencyCheck(ctx, instID)
	if err != nil {
		t.Fatalf("RunConsistencyCheck: %v", err)
	}

	if result.StaleRunsCleaned != 1 {
		t.Errorf("expected 1 stale run cleaned, got %d", result.StaleRunsCleaned)
	}

	// Verify the run was actually marked as failed in the DB.
	var status string
	if err := db.NewSelect().TableExpr("skill_runs").
		ColumnExpr("status").Where("id = ?", runID).
		Scan(ctx, &status); err != nil {
		t.Fatalf("query run status: %v", err)
	}
	if status != "failed" {
		t.Errorf("expected run status 'failed', got %q", status)
	}
}

// ── RunConsistencyCheck: recent run not cleaned ────────────────────────────────

func TestConsistencyCheck_RecentRunNotCleaned(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	// Insert a skill run that started 3 minutes ago (within timeout).
	recentStarted := time.Now().UTC().Add(-3 * time.Minute)
	runID := uuid.New()
	_, err := db.ExecContext(ctx,
		"INSERT INTO skill_runs (id, instance_id, skill_name, status, trigger, started_at, created_at) "+
			"VALUES (?, ?, ?, ?, ?, ?, NOW())",
		runID, instID, "test-skill", "running", "manual", recentStarted)
	if err != nil {
		t.Fatalf("insert recent run: %v", err)
	}

	result, err := svc.RunConsistencyCheck(ctx, instID)
	if err != nil {
		t.Fatalf("RunConsistencyCheck: %v", err)
	}

	if result.StaleRunsCleaned != 0 {
		t.Errorf("expected 0 stale runs cleaned (run is recent), got %d", result.StaleRunsCleaned)
	}

	// Run should still be in 'running' state.
	var status string
	if err := db.NewSelect().TableExpr("skill_runs").
		ColumnExpr("status").Where("id = ?", runID).
		Scan(ctx, &status); err != nil {
		t.Fatalf("query run status: %v", err)
	}
	if status != "running" {
		t.Errorf("expected run still 'running', got %q", status)
	}
}

// ── AIM workflow: align_portfolio step is no-op without aligner ───────────────

func TestAlignPortfolio_Idempotent(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	roadmap := buildRoadmapWithKRTarget("strategy", "l1-vision.l2-brand.l3-messaging", "")
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe", roadmap)

	vm := buildValueModel("strategy", []l3Component{
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-messaging", active: false},
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-other", active: true},
	})
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.strategy", vmWithName(vm, "Strategy"))

	// First run — should activate l3-messaging and deactivate l3-other.
	r1, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio (1): %v", err)
	}
	if r1.TracksChanged != 1 {
		t.Errorf("first run: expected 1 changed, got %d", r1.TracksChanged)
	}

	// Second run — state already matches KR targets, so no-op.
	r2, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio (2): %v", err)
	}
	if r2.TracksChanged != 0 {
		t.Errorf("second run: expected 0 changed (idempotent), got %d", r2.TracksChanged)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

type l3Component struct {
	l1ID   string
	l2ID   string
	l3ID   string
	active bool
}

// buildValueModel constructs a minimal value model payload for testing.
// Groups components by (l1ID, l2ID).
func buildValueModel(_ string, comps []l3Component) map[string]any {
	// Group by l1 → l2 → l3s
	type l2Key struct{ l1, l2 string }
	l2Groups := make(map[l2Key][]l3Component)
	l1Order := []string{}
	l1Seen := map[string]bool{}

	for _, c := range comps {
		k := l2Key{c.l1ID, c.l2ID}
		l2Groups[k] = append(l2Groups[k], c)
		if !l1Seen[c.l1ID] {
			l1Order = append(l1Order, c.l1ID)
			l1Seen[c.l1ID] = true
		}
	}

	var layers []any
	for _, l1ID := range l1Order {
		// Collect L2 IDs under this L1.
		l2Order := []string{}
		l2Seen := map[string]bool{}
		for _, c := range comps {
			if c.l1ID != l1ID {
				continue
			}
			if !l2Seen[c.l2ID] {
				l2Order = append(l2Order, c.l2ID)
				l2Seen[c.l2ID] = true
			}
		}

		var components []any
		for _, l2ID := range l2Order {
			k := l2Key{l1ID, l2ID}
			var subs []any
			for _, c := range l2Groups[k] {
				subs = append(subs, map[string]any{
					"id":     c.l3ID,
					"name":   c.l3ID,
					"active": c.active,
				})
			}
			components = append(components, map[string]any{
				"id":             l2ID,
				"name":           l2ID,
				"active":         false,
				"sub_components": subs,
			})
		}

		layers = append(layers, map[string]any{
			"id":         l1ID,
			"name":       l1ID,
			"active":     false,
			"components": components,
		})
	}

	return map[string]any{"layers": layers}
}

// vmWithTrackName sets the "track_name" field on the vm for track keying.
// Value models use "track_name" (not "name") as the canonical track identifier.
// The index extracts this into the strategy_artifacts.name column for lookup.
func vmWithName(vm map[string]any, trackName string) map[string]any {
	vm["track_name"] = trackName
	return vm
}

// buildRoadmapWithKRTarget builds a minimal roadmap payload with one KR that
// has a value_model_target pointing to the given component path.
func buildRoadmapWithKRTarget(track, componentPath, targetMaturity string) map[string]any {
	vmt := map[string]any{
		"track":          track,
		"component_path": componentPath,
	}
	if targetMaturity != "" {
		vmt["target_maturity"] = targetMaturity
	}
	return map[string]any{
		"roadmap": map[string]any{
			"tracks": map[string]any{
				track: map[string]any{
					"okrs": []any{
						map[string]any{
							"objective": "Test objective",
							"key_results": []any{
								map[string]any{
									"id":                 "kr-001",
									"description":        "Test KR",
									"value_model_target": vmt,
								},
							},
						},
					},
				},
			},
		},
	}
}

// findL3 walks the value model layers/components/sub_components to find a component by ID.
func findL3(vm map[string]any, id string) map[string]any {
	layers, _ := vm["layers"].([]any)
	for _, lv := range layers {
		l, _ := lv.(map[string]any)
		comps, _ := l["components"].([]any)
		for _, cv := range comps {
			c, _ := cv.(map[string]any)
			subs, _ := c["sub_components"].([]any)
			for _, sv := range subs {
				s, _ := sv.(map[string]any)
				if sid, _ := s["id"].(string); sid == id {
					return s
				}
			}
		}
	}
	return nil
}
