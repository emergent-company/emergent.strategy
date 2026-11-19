package strategy_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// seedAlignable gives an instance one Key Result that targets a component which
// is currently inactive, so an alignment run has one component to activate.
func seedAlignable(t *testing.T, db *bun.DB) (uuid.UUID, *strategy.Service) {
	t.Helper()
	instID, svc := seedInstance(t, db)
	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe",
		buildRoadmapWithKRTarget("strategy", "l1-vision.l2-brand.l3-messaging", "emerging"))
	vm := buildValueModel("strategy", []l3Component{
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-messaging", active: false},
		{l1ID: "l1-vision", l2ID: "l2-brand", l3ID: "l3-positioning", active: false},
	})
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.strategy", vmWithName(vm, "Strategy"))
	return instID, svc
}

func mustMap(t *testing.T, raw json.RawMessage) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return m
}

func messagingIsActive(t *testing.T, svc *strategy.Service, instID uuid.UUID) bool {
	t.Helper()
	raw, err := svc.GetCurrentArtifact(context.Background(), instID, "value_model.strategy")
	if err != nil {
		t.Fatalf("GetCurrentArtifact: %v", err)
	}
	l3 := findL3(mustMap(t, raw), "l3-messaging")
	if l3 == nil {
		t.Fatal("l3-messaging not found")
	}
	active, _ := l3["active"].(bool)
	return active
}

func TestAlignPortfolio_RecordsWhatItChanged(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedAlignable(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	if rec, err := svc.LastAlignment(ctx, instID); err != nil || rec != nil {
		t.Fatalf("before any alignment: record = %+v, err = %v, want none", rec, err)
	}

	before := time.Now().Add(-time.Second)
	if _, err := svc.AlignPortfolio(ctx, instID); err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}

	rec, err := svc.LastAlignment(ctx, instID)
	if err != nil || rec == nil {
		t.Fatalf("LastAlignment = %+v, err = %v, want a record of the change", rec, err)
	}
	if rec.AppliedAt.Before(before) {
		t.Errorf("AppliedAt = %v, want a time during this run", rec.AppliedAt)
	}
	if rec.TotalActivated != 1 || rec.TotalDeactivated != 0 || rec.TracksChanged != 1 {
		t.Errorf("record = %+v, want 1 activated, 0 deactivated, 1 track changed", rec)
	}
	if rec.KRsFound != 1 || rec.KRsWithTargets != 1 || rec.KRsByGroup["okrs"] != 1 {
		t.Errorf("record considered %d Key Results (%d with targets) in groups %v, want 1, 1 and okrs=1",
			rec.KRsFound, rec.KRsWithTargets, rec.KRsByGroup)
	}
	for _, want := range []string{"Portfolio alignment", "1 activated", "1 Key Result"} {
		if !strings.Contains(rec.Summary, want) {
			t.Errorf("summary %q lacks %q", rec.Summary, want)
		}
	}

	// The summary travels with the mutation, so a sync PR and the history show it.
	var desc string
	if err := db.NewRaw(`SELECT batch_description FROM strategy_mutations
		WHERE instance_id = ? AND artifact_key = 'value_model.strategy' AND source = 'system' AND action = 'update'`, instID).
		Scan(ctx, &desc); err != nil {
		t.Fatalf("read batch description: %v", err)
	}
	if desc != rec.Summary {
		t.Errorf("mutation batch_description = %q, want %q", desc, rec.Summary)
	}

	// A run that changes nothing leaves the record alone.
	if _, err := svc.AlignPortfolio(ctx, instID); err != nil {
		t.Fatalf("second AlignPortfolio: %v", err)
	}
	again, _ := svc.LastAlignment(ctx, instID)
	if again == nil || !again.AppliedAt.Equal(rec.AppliedAt) {
		t.Errorf("a no-op run replaced the record: %+v -> %+v", rec, again)
	}
}

func TestRunConsistencyCheck_SkipsAlignmentWhenTheInstanceTurnsItOff(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedAlignable(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	if !svc.AlignmentAutomatic(ctx, instID) {
		t.Fatal("AlignmentAutomatic = false by default, want true")
	}
	commitArtifact(t, db, instID, domain.ArtifactTypeAIMTriggerConfig, "aim_trigger_config",
		map[string]any{"skip_align_portfolio": true})
	if svc.AlignmentAutomatic(ctx, instID) {
		t.Fatal("AlignmentAutomatic = true after skip_align_portfolio, want false")
	}

	result, err := svc.RunConsistencyCheck(ctx, instID)
	if err != nil {
		t.Fatalf("RunConsistencyCheck: %v", err)
	}

	if !result.AlignmentSkipped {
		t.Error("AlignmentSkipped = false, want true")
	}
	if messagingIsActive(t, svc, instID) {
		t.Error("the heartbeat's consistency check changed the value model although the instance turned alignment off")
	}
	if rec, _ := svc.LastAlignment(ctx, instID); rec != nil {
		t.Errorf("a record exists (%+v) for an alignment that did not run", rec)
	}
}

func TestRunConsistencyCheck_AlignsByDefault(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedAlignable(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	result, err := svc.RunConsistencyCheck(ctx, instID)
	if err != nil {
		t.Fatalf("RunConsistencyCheck: %v", err)
	}

	if result.AlignmentSkipped || !messagingIsActive(t, svc, instID) {
		t.Errorf("skipped = %v, active = %v, want an instance that never opted out to be aligned",
			result.AlignmentSkipped, messagingIsActive(t, svc, instID))
	}
}

// Turning off the automatic runs does not take the operation away: an explicit
// call (the align-portfolio skill) still works.
func TestAlignPortfolio_ExplicitRunIgnoresTheOffSwitch(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedAlignable(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	commitArtifact(t, db, instID, domain.ArtifactTypeAIMTriggerConfig, "aim_trigger_config",
		map[string]any{"skip_align_portfolio": true})

	if _, err := svc.AlignPortfolio(ctx, instID); err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}

	if !messagingIsActive(t, svc, instID) {
		t.Error("an explicit AlignPortfolio did nothing although the instance turned off only the automatic runs")
	}
}
