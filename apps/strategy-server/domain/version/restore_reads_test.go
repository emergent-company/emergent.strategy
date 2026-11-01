package version_test

import (
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// After a restore and the ingest it triggers, what a client reads is the
// restored version and nothing from the state it replaced (AC5).
func TestRestore_ReadsShowTheRestoredVersionOnly(t *testing.T) {
	ctx, stratSvc, verSvc, instID := seedInstance(t)
	db := stratSvc.DB()
	mem := memtest.New(t)
	ing := ingest.NewService(db, mem.Client(t))
	sem := semantic.NewService(semantic.Config{URL: mem.URL, Project: "p", Token: "t"}).
		WithManifestSource(ingest.NewManifestStore(db))

	readKeys := func() string {
		t.Helper()
		out, err := sem.SearchStrategyScoped(context.Background(), instID.String(), "anything", 100)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		var ks []string
		for _, r := range out.Results {
			if r.Layer == "artifact" {
				ks = append(ks, r.ArtifactKey)
			}
		}
		sort.Strings(ks)
		return strings.Join(ks, ",")
	}
	reingest := func() {
		t.Helper()
		if _, err := db.ExecContext(ctx, "UPDATE strategy_instances SET memory_dirty_since = now(), memory_change_seq = memory_change_seq + 1 WHERE id = ?", instID); err != nil {
			t.Fatal(err)
		}
		if err := ing.ReingestInstance(ctx, instID); err != nil {
			t.Fatalf("ingest: %v", err)
		}
	}

	reingest()
	v1, err := verSvc.Publish(ctx, instID, "v1", "")
	if err != nil {
		t.Fatal(err)
	}
	want := readKeys()
	if !strings.Contains(want, "fd-001") {
		t.Fatalf("the seeded feature is not readable: %q", want)
	}

	if _, err := stratSvc.CommitAuto(ctx, strategy.CommitAutoParams{
		InstanceID: instID, ArtifactType: "feature", ArtifactKey: "fd-002", Action: "create",
		Payload: map[string]any{"name": "Added after v1", "status": "draft"},
	}); err != nil {
		t.Fatal(err)
	}
	reingest()
	if got := readKeys(); !strings.Contains(got, "fd-002") {
		t.Fatalf("the added feature is not readable before the restore: %q", got)
	}

	if _, err := verSvc.Restore(ctx, instID, v1.ID); err != nil {
		t.Fatal(err)
	}
	reingest()
	if got := readKeys(); got != want {
		t.Errorf("after the restore the reads show %q, want exactly the version-1 artifacts %q", got, want)
	}
}
