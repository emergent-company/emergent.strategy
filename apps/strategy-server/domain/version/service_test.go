package version_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func newCtx() context.Context {
	ctx := context.Background()
	return audit.ContextWithSource(ctx, audit.SourceSystem)
}

// seedInstance creates a workspace and instance with 2 committed artifacts.
func seedInstance(t *testing.T) (context.Context, *strategy.Service, *version.Service, uuid.UUID) {
	t.Helper()
	db := database.TestDB(t)
	ctx := newCtx()

	wsSvc := workspace.NewService(db)
	instSvc := instance.NewService(db)
	stratSvc := strategy.NewService(db)
	verSvc := version.NewService(db)

	ws, err := wsSvc.CreateWorkspace(ctx, "ver-test-org", nil)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID,
		Name:        "Version Test",
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	// Stage and commit a north_star artifact.
	batchID, err := stratSvc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       "create",
		Payload:      map[string]any{"north_star": map[string]any{"vision": "test vision"}},
	})
	if err != nil {
		t.Fatalf("Stage north_star: %v", err)
	}
	if _, err := stratSvc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}

	// Stage and commit a feature.
	batchID, err = stratSvc.Stage(ctx, strategy.StageParams{
		InstanceID:   inst.ID,
		ArtifactType: "feature",
		ArtifactKey:  "fd-001",
		Action:       "create",
		Payload:      map[string]any{"name": "Test Feature", "status": "draft"},
	})
	if err != nil {
		t.Fatalf("Stage feature: %v", err)
	}
	if _, err := stratSvc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}

	return ctx, stratSvc, verSvc, inst.ID
}

func TestPublish(t *testing.T) {
	ctx, _, verSvc, instID := seedInstance(t)

	ver, err := verSvc.Publish(ctx, instID, "v1", "Initial publish")
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}

	if ver.Version != 1 {
		t.Errorf("version=%d, want 1", ver.Version)
	}
	if ver.Status != "published" {
		t.Errorf("status=%q, want published", ver.Status)
	}
	if ver.Label == nil || *ver.Label != "v1" {
		t.Error("label should be 'v1'")
	}

	// Verify snapshot contents.
	var snap version.Snapshot
	if err := json.Unmarshal(ver.Snapshot, &snap); err != nil {
		t.Fatalf("unmarshal snapshot: %v", err)
	}
	if snap.Metadata.ArtifactCount != 2 {
		t.Errorf("artifact_count=%d, want 2", snap.Metadata.ArtifactCount)
	}
	if _, ok := snap.Artifacts["north_star"]; !ok {
		t.Error("snapshot missing north_star")
	}
	if _, ok := snap.Artifacts["fd-001"]; !ok {
		t.Error("snapshot missing fd-001")
	}
}

func TestPublish_VersionIncrement(t *testing.T) {
	ctx, _, verSvc, instID := seedInstance(t)

	v1, err := verSvc.Publish(ctx, instID, "v1", "")
	if err != nil {
		t.Fatalf("Publish v1: %v", err)
	}
	if v1.Version != 1 {
		t.Fatalf("v1.Version=%d, want 1", v1.Version)
	}

	v2, err := verSvc.Publish(ctx, instID, "v2", "")
	if err != nil {
		t.Fatalf("Publish v2: %v", err)
	}
	if v2.Version != 2 {
		t.Fatalf("v2.Version=%d, want 2", v2.Version)
	}

	// v1 should be superseded.
	v1Refreshed, err := verSvc.Get(ctx, instID, v1.ID)
	if err != nil {
		t.Fatalf("Get v1: %v", err)
	}
	if v1Refreshed.Status != "superseded" {
		t.Errorf("v1 status=%q, want superseded", v1Refreshed.Status)
	}

	// v2 should reference v1 as parent.
	if v2.ParentVersionID == nil || *v2.ParentVersionID != v1.ID {
		t.Error("v2 should have v1 as parent")
	}
}

func TestList(t *testing.T) {
	ctx, _, verSvc, instID := seedInstance(t)

	// Empty list.
	versions, err := verSvc.List(ctx, instID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(versions) != 0 {
		t.Errorf("expected 0 versions, got %d", len(versions))
	}

	// After publish.
	if _, err := verSvc.Publish(ctx, instID, "v1", ""); err != nil {
		t.Fatalf("Publish: %v", err)
	}
	versions, err = verSvc.List(ctx, instID)
	if err != nil {
		t.Fatalf("List after publish: %v", err)
	}
	if len(versions) != 1 {
		t.Fatalf("expected 1 version, got %d", len(versions))
	}
	if versions[0].ArtifactCount != 2 {
		t.Errorf("artifact_count=%d, want 2", versions[0].ArtifactCount)
	}
}

func TestDiff(t *testing.T) {
	ctx, stratSvc, verSvc, instID := seedInstance(t)

	// Publish v1 with 2 artifacts.
	v1, err := verSvc.Publish(ctx, instID, "v1", "")
	if err != nil {
		t.Fatalf("Publish v1: %v", err)
	}

	// Add a third artifact and publish v2.
	batchID, err := stratSvc.Stage(ctx, strategy.StageParams{
		InstanceID:   instID,
		ArtifactType: "feature",
		ArtifactKey:  "fd-002",
		Action:       "create",
		Payload:      map[string]any{"name": "New Feature"},
	})
	if err != nil {
		t.Fatalf("Stage: %v", err)
	}
	if _, err := stratSvc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}

	v2, err := verSvc.Publish(ctx, instID, "v2", "")
	if err != nil {
		t.Fatalf("Publish v2: %v", err)
	}

	diff, err := verSvc.Diff(ctx, instID, v1.ID, v2.ID)
	if err != nil {
		t.Fatalf("Diff: %v", err)
	}
	if len(diff.Added) != 1 {
		t.Errorf("added=%d, want 1", len(diff.Added))
	}
	if len(diff.Added) > 0 && diff.Added[0].ArtifactKey != "fd-002" {
		t.Errorf("added[0]=%q, want fd-002", diff.Added[0].ArtifactKey)
	}
	if len(diff.Removed) != 0 {
		t.Errorf("removed=%d, want 0", len(diff.Removed))
	}
	t.Logf("diff summary: %s", diff.Summary)
}

func TestRestore(t *testing.T) {
	ctx, stratSvc, verSvc, instID := seedInstance(t)

	// Publish v1 with 2 artifacts.
	v1, err := verSvc.Publish(ctx, instID, "v1", "")
	if err != nil {
		t.Fatalf("Publish v1: %v", err)
	}

	// Add artifact and publish v2.
	batchID, err := stratSvc.Stage(ctx, strategy.StageParams{
		InstanceID:   instID,
		ArtifactType: "feature",
		ArtifactKey:  "fd-002",
		Action:       "create",
		Payload:      map[string]any{"name": "Extra Feature"},
	})
	if err != nil {
		t.Fatalf("Stage: %v", err)
	}
	if _, err := stratSvc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}
	if _, err := verSvc.Publish(ctx, instID, "v2", ""); err != nil {
		t.Fatalf("Publish v2: %v", err)
	}

	// Restore to v1.
	restored, err := verSvc.Restore(ctx, instID, v1.ID)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if restored.Version != 3 {
		t.Errorf("restored version=%d, want 3", restored.Version)
	}
	if restored.Status != "restored" {
		t.Errorf("restored status=%q, want restored", restored.Status)
	}

	// Verify artifacts match v1 (2 artifacts, not 3).
	artifacts, err := stratSvc.ListCurrentArtifacts(ctx, instID, "")
	if err != nil {
		t.Fatalf("ListCurrentArtifacts: %v", err)
	}
	if len(artifacts) != 2 {
		t.Errorf("after restore: %d artifacts, want 2", len(artifacts))
	}

	t.Logf("restored version: %d, label: %v", restored.Version, restored.Label)
}
