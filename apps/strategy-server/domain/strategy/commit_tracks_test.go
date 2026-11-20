package strategy_test

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

const codeValidationFailed = 112004

func roadmapWithTracks(tracks ...string) map[string]any {
	t := map[string]any{}
	for _, name := range tracks {
		t[name] = map[string]any{"track_objective": "x", "okrs": []any{}}
	}
	return map[string]any{"roadmap": map[string]any{"id": "roadmap-1", "tracks": t}}
}

func stageRoadmap(t *testing.T, payload any) (*strategy.Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	ctx := newCtx()
	ws, err := workspace.NewService(db).CreateWorkspace(ctx, "tracks-"+uuid.NewString()[:8], nil, seedTestOrg(t, db))
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	inst, err := instance.NewService(db).ImportInstance(ctx, instance.ImportParams{WorkspaceID: ws.ID, Name: "Roadmap Tracks"})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}
	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID: inst.ID, ArtifactType: "roadmap_recipe", ArtifactKey: "roadmap_recipe",
		Action: "update", Payload: payload,
	})
	if err != nil {
		t.Fatalf("Stage: %v", err)
	}
	return svc, inst.ID, batchID
}

// A roadmap without a required track would replace the stored one and drop that
// track's Key Results from every view. The schema requires all four, so the
// commit is refused and says which are missing; the batch stays staged.
func TestCommitBatch_RefusesARoadmapMissingARequiredTrack(t *testing.T) {
	svc, instID, batchID := stageRoadmap(t, roadmapWithTracks("strategy", "org_ops", "commercial"))
	ctx := newCtx()

	_, err := svc.CommitBatch(ctx, batchID)

	ae := apperror.AsAppError(err)
	if ae == nil || ae.Code != codeValidationFailed {
		t.Fatalf("err = %v, want a validation failure (%d)", err, codeValidationFailed)
	}
	if !strings.Contains(ae.Error(), "product") || strings.Contains(ae.Error(), "strategy,") {
		t.Errorf("error = %q, want it to name exactly the missing track: product", ae.Error())
	}
	if !strings.Contains(ae.Error(), "confirm_missing_tracks") {
		t.Errorf("error = %q, want it to say how to confirm", ae.Error())
	}
	if _, err := svc.GetCurrentArtifact(ctx, instID, "roadmap_recipe"); apperror.AsAppError(err) == nil {
		t.Error("the roadmap was committed although the commit was refused")
	}
	// Nothing was promoted, so the batch is still there to be confirmed.
	if n, err := svc.CommitBatchAllowingMissingTracks(ctx, batchID); err != nil || n != 1 {
		t.Errorf("confirmed commit: n=%d err=%v, want 1 and no error: the refusal must leave the batch staged", n, err)
	}
}

func TestCommitBatch_NamesEveryMissingTrack(t *testing.T) {
	svc, _, batchID := stageRoadmap(t, map[string]any{"roadmap": map[string]any{"id": "roadmap-1"}})

	_, err := svc.CommitBatch(newCtx(), batchID)

	ae := apperror.AsAppError(err)
	if ae == nil || ae.Code != codeValidationFailed {
		t.Fatalf("err = %v, want a validation failure", err)
	}
	for _, track := range []string{"product", "strategy", "org_ops", "commercial"} {
		if !strings.Contains(ae.Error(), track) {
			t.Errorf("error = %q, want %s named", ae.Error(), track)
		}
	}
}

func TestCommitBatch_CommitsARoadmapWithAllTracks(t *testing.T) {
	svc, instID, batchID := stageRoadmap(t, roadmapWithTracks("product", "strategy", "org_ops", "commercial"))
	ctx := newCtx()

	if n, err := svc.CommitBatch(ctx, batchID); err != nil || n != 1 {
		t.Fatalf("n=%d err=%v, want 1 and no error", n, err)
	}
	if _, err := svc.GetCurrentArtifact(ctx, instID, "roadmap_recipe"); err != nil {
		t.Errorf("committed roadmap not readable: %v", err)
	}
}

func TestCommitBatchAllowingMissingTracks_CommitsTheRoadmapAsGiven(t *testing.T) {
	svc, instID, batchID := stageRoadmap(t, roadmapWithTracks("strategy", "org_ops", "commercial"))
	ctx := newCtx()

	if n, err := svc.CommitBatchAllowingMissingTracks(ctx, batchID); err != nil || n != 1 {
		t.Fatalf("n=%d err=%v, want 1 and no error", n, err)
	}
	if _, err := svc.GetCurrentArtifact(ctx, instID, "roadmap_recipe"); err != nil {
		t.Errorf("confirmed roadmap not readable: %v", err)
	}
}

// Only a roadmap create or update is checked. Another artifact type, and an archive, commit as before.
func TestCommitBatch_OnlyChecksRoadmapCreatesAndUpdates(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	ctx := newCtx()
	ws, err := workspace.NewService(db).CreateWorkspace(ctx, "tracks-other-"+uuid.NewString()[:8], nil, seedTestOrg(t, db))
	if err != nil {
		t.Fatal(err)
	}
	inst, err := instance.NewService(db).ImportInstance(ctx, instance.ImportParams{WorkspaceID: ws.ID, Name: "Other"})
	if err != nil {
		t.Fatal(err)
	}
	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID: inst.ID, ArtifactType: "north_star", ArtifactKey: "north_star",
		Action: "create", Payload: map[string]string{"vision": "v"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID: inst.ID, ArtifactType: "roadmap_recipe", ArtifactKey: "roadmap_recipe",
		Action: "archive", Payload: map[string]any{}, BatchID: &batchID,
	}); err != nil {
		t.Fatal(err)
	}

	if n, err := svc.CommitBatch(ctx, batchID); err != nil || n != 2 {
		t.Errorf("n=%d err=%v, want both committed: an archive has no tracks to lose", n, err)
	}
}
