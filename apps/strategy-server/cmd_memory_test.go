package main

import (
	"context"
	"slices"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

func TestRunMemory_NeedsASubcommand(t *testing.T) {
	err := runMemory(&config.Config{Memory: &config.MemoryCmd{}})
	if err == nil || !strings.Contains(err.Error(), "sweep") {
		t.Errorf("err = %v, want a message naming the sweep command", err)
	}
}

func TestRunMemory_SweepRefusesToRunWithoutMemory(t *testing.T) {
	cfg := &config.Config{Memory: &config.MemoryCmd{Sweep: &config.MemorySweepCmd{Apply: true}}}
	err := runMemory(cfg)
	if err == nil || !strings.Contains(err.Error(), "EPF_MEMORY_URL") {
		t.Errorf("err = %v, want a message naming the missing Memory settings", err)
	}
}

func TestRunMemory_VerifyRefusesToRunWithoutMemory(t *testing.T) {
	cfg := &config.Config{Memory: &config.MemoryCmd{Verify: &config.MemoryVerifyCmd{Repair: true}}}
	err := runMemory(cfg)
	if err == nil || !strings.Contains(err.Error(), "EPF_MEMORY_URL") {
		t.Errorf("err = %v, want a message naming the missing Memory settings", err)
	}
}

func TestRunMemory_NeedsASubcommandNamesBoth(t *testing.T) {
	err := runMemory(&config.Config{Memory: &config.MemoryCmd{}})
	if err == nil || !strings.Contains(err.Error(), "sweep") || !strings.Contains(err.Error(), "verify") {
		t.Errorf("err = %v, want a message naming sweep and verify", err)
	}
}

func TestPrintVerifyReport_NamesWhatIsWrongAndHowToFixIt(t *testing.T) {
	rep := &ingest.VerifyReport{Instances: []ingest.InstanceVerification{
		{InstanceID: "11111111-1111-1111-1111-111111111111", Name: "alpha", Status: ingest.VerifyOK, Manifest: 10, InMemory: 10},
		{InstanceID: "22222222-2222-2222-2222-222222222222", Name: "beta", Status: ingest.VerifyMismatch, Manifest: 10, InMemory: 7, Missing: 3, MissingSample: []string{"2222/fd-001"}},
		{InstanceID: "33333333-3333-3333-3333-333333333333", Name: "gamma", Status: ingest.VerifySkipped, SkipReason: ingest.VerifySkipDirty},
	}}
	var b strings.Builder
	printVerifyReport(&b, rep, "proj")
	out := b.String()
	for _, want := range []string{"alpha", "beta", "gamma", "mismatch", "dirty", "2222/fd-001", "--repair"} {
		if !strings.Contains(out, want) {
			t.Errorf("report lacks %q:\n%s", want, out)
		}
	}
}

// A repair from the command must rebuild both layers. A service without the
// exporter ingests the artifact layer only, so the manifest would shrink to it
// and the decomposed objects would be left behind as extras.
func TestVerifyRepair_FromTheCommandKeepsBothLayers(t *testing.T) {
	db := database.TestDB(t)
	mem := memtest.New(t)
	ctx := context.Background()
	inst := seedNorthStarInstance(t, db)
	if err := newImportIngester(db, mem.Client(t)).ReingestInstance(ctx, inst); err != nil {
		t.Fatalf("reingest: %v", err)
	}
	var victim *memory.Object
	for _, o := range mem.Objects() {
		if slices.Contains(o.Labels, "layer:decomposed") {
			victim = &o
			break
		}
	}
	if victim == nil {
		t.Fatal("setup: no decomposed object to remove")
	}
	if err := mem.Client(t).DeleteObject(ctx, victim.StableID(), memory.DeleteObjectRequest{Reason: "test"}); err != nil {
		t.Fatalf("delete: %v", err)
	}
	manifest := func() int {
		n, err := db.NewSelect().TableExpr("memory_projection").Where("instance_id = ? AND kind = 'object'", inst).Count(ctx)
		if err != nil {
			t.Fatalf("count manifest: %v", err)
		}
		return n
	}
	before := manifest()

	if err := runVerify(newMemoryService(db, mem.Client(t)), true, "test"); err != nil {
		t.Fatalf("repair: %v", err)
	}
	if mem.ObjectByKey(victim.Key) == nil {
		t.Errorf("the deleted object %q was not restored", victim.Key)
	}
	if after := manifest(); after != before {
		t.Errorf("manifest holds %d objects after the repair, %d before: the decomposed layer was dropped", after, before)
	}
	if err := runVerify(newMemoryService(db, mem.Client(t)), false, "test"); err != nil {
		t.Errorf("verify after repair: %v", err)
	}
}
