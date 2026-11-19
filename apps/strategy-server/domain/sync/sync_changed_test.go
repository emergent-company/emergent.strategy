package sync_test

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func artifactPayload(key string) map[string]any {
	if key == "north_star" {
		return map[string]any{"north_star": map[string]any{"organization": "Acme"}}
	}
	return map[string]any{"name": key, "status": "draft"}
}

// importedInstance imports an instance linked to a repo the way the CLI and the
// GitHub import do: initial payloads under an import context, then the index.
func importedInstance(t *testing.T, db *bun.DB, keys ...string) (uuid.UUID, *strategy.Service) {
	t.Helper()
	ctx := newCtx()
	orgID := seedTestOrg(t, db)
	ws, err := workspace.NewService(db).CreateWorkspace(ctx, "sync-changed-"+uuid.NewString()[:8], nil, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	repo := "test-org/strategy"
	payloads := make(map[string]any, len(keys))
	for _, k := range keys {
		payloads[k] = artifactPayload(k)
	}
	importCtx := audit.ContextWithSource(context.Background(), audit.SourceImport)
	inst, err := instance.NewService(db).ImportInstance(importCtx, instance.ImportParams{
		WorkspaceID: ws.ID, Name: "Changed Only", GithubRepo: &repo, InitialPayloads: payloads,
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}
	strat := strategy.NewService(db)
	if _, err := strat.BackfillIndex(importCtx, inst.ID); err != nil {
		t.Fatalf("BackfillIndex: %v", err)
	}
	return inst.ID, strat
}

// editArtifact commits a described change to one artifact, as an MCP client does.
func editArtifact(t *testing.T, svc *strategy.Service, instID uuid.UUID, key, description string) {
	t.Helper()
	ctx := audit.ContextWithSource(context.Background(), audit.SourceMCP)
	payload := artifactPayload(key)
	payload["edited"] = description
	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID: instID, ArtifactType: inferType(key), ArtifactKey: key,
		Action: domain.MutationActionUpdate, Payload: payload,
	})
	if err != nil {
		t.Fatalf("Stage %s: %v", key, err)
	}
	if err := svc.DescribeBatch(ctx, batchID, "test-agent", description); err != nil {
		t.Fatalf("DescribeBatch: %v", err)
	}
	if _, err := svc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch %s: %v", key, err)
	}
}

func inferType(key string) string {
	if key == "north_star" {
		return "north_star"
	}
	return "feature"
}

func pushedPaths(w *mockRepoWriter) []string {
	paths := make([]string, 0, len(w.committedFiles))
	for _, f := range w.committedFiles {
		paths = append(paths, f.Path)
	}
	return paths
}

func hasPathFor(paths []string, key string) bool {
	for _, p := range paths {
		if strings.Contains(p, key) {
			return true
		}
	}
	return false
}

func TestSyncToGithub_WritesOnlyArtifactsChangedSinceImport(t *testing.T) {
	db := database.TestDB(t)
	svc, writer, _, _ := newTestSyncService(t, db)
	instID, strat := importedInstance(t, db, "north_star", "fd-001", "fd-002", "fd-003")
	editArtifact(t, strat, instID, "fd-002", "Sharpen the problem statement")

	result, err := svc.SyncToGithub(newCtx(), syncdom.SyncParams{InstanceID: instID})
	if err != nil {
		t.Fatalf("SyncToGithub: %v", err)
	}

	paths := pushedPaths(writer)
	if len(paths) != 1 || !hasPathFor(paths, "fd-002") {
		t.Fatalf("pushed %v, want only the edited fd-002: unchanged files must stay as they are in the repository, comments included", paths)
	}
	if result.ArtifactCount != 1 || result.UnchangedCount != 3 {
		t.Errorf("counts = %d changed, %d unchanged, want 1 and 3", result.ArtifactCount, result.UnchangedCount)
	}
	if len(writer.createdPRs) != 1 {
		t.Fatalf("PRs = %d, want 1", len(writer.createdPRs))
	}
	body := writer.createdPRs[0].body
	if !strings.Contains(body, "Sharpen the problem statement") || !strings.Contains(body, "fd-002") {
		t.Errorf("PR body does not list the batch description and the changed artifact:\n%s", body)
	}
	if strings.Contains(body, "fd-001") || strings.Contains(body, "fd-003") {
		t.Errorf("PR body names unchanged artifacts:\n%s", body)
	}
}

func TestSyncToGithub_NothingChangedOpensNoPullRequest(t *testing.T) {
	db := database.TestDB(t)
	svc, writer, _, _ := newTestSyncService(t, db)
	instID, _ := importedInstance(t, db, "north_star", "fd-001")

	result, err := svc.SyncToGithub(newCtx(), syncdom.SyncParams{InstanceID: instID})
	if err != nil {
		t.Fatalf("SyncToGithub: %v", err)
	}

	if result.Status != "no_changes" || result.ArtifactCount != 0 || result.UnchangedCount != 2 {
		t.Errorf("result = %+v, want status no_changes, 0 changed, 2 unchanged", result)
	}
	if len(writer.createdBranches) != 0 || len(writer.createdPRs) != 0 || len(writer.committedFiles) != 0 {
		t.Errorf("wrote to the repository: branches %v, PRs %d, files %d", writer.createdBranches, len(writer.createdPRs), len(writer.committedFiles))
	}
	logs, err := svc.GetSyncHistory(newCtx(), instID)
	if err != nil {
		t.Fatalf("GetSyncHistory: %v", err)
	}
	if len(logs) != 0 {
		t.Errorf("sync log has %d entries, want none for a sync that wrote nothing", len(logs))
	}
}

func TestSyncToGithub_FullWritesEverything(t *testing.T) {
	db := database.TestDB(t)
	svc, writer, _, _ := newTestSyncService(t, db)
	instID, strat := importedInstance(t, db, "north_star", "fd-001", "fd-002")
	editArtifact(t, strat, instID, "fd-002", "One change")

	result, err := svc.SyncToGithub(newCtx(), syncdom.SyncParams{InstanceID: instID, Full: true})
	if err != nil {
		t.Fatalf("SyncToGithub: %v", err)
	}

	if len(writer.committedFiles) != 3 || result.ArtifactCount != 3 || result.UnchangedCount != 0 {
		t.Errorf("pushed %d files (%+v), want all 3 for a full export", len(writer.committedFiles), result)
	}
}

func TestSyncToGithub_NeverImportedInstancePushesEverything(t *testing.T) {
	db := database.TestDB(t)
	svc, writer, _, _ := newTestSyncService(t, db)
	instID, strat := importedInstance(t, db)
	editArtifact(t, strat, instID, "fd-001", "Authored on the server")
	editArtifact(t, strat, instID, "fd-002", "Authored on the server")

	if _, err := svc.SyncToGithub(newCtx(), syncdom.SyncParams{InstanceID: instID}); err != nil {
		t.Fatalf("SyncToGithub: %v", err)
	}

	paths := pushedPaths(writer)
	if len(paths) != 2 || !hasPathFor(paths, "fd-001") || !hasPathFor(paths, "fd-002") {
		t.Errorf("pushed %v, want both authored artifacts: nothing in the repository came from an import", paths)
	}
}

func TestSyncToGithub_MergedSyncMovesTheBaseline(t *testing.T) {
	db := database.TestDB(t)
	svc, writer, reader, _ := newTestSyncService(t, db)
	instID, strat := importedInstance(t, db, "north_star", "fd-001", "fd-002", "fd-003")

	editArtifact(t, strat, instID, "fd-002", "First change")
	if _, err := svc.SyncToGithub(newCtx(), syncdom.SyncParams{InstanceID: instID}); err != nil {
		t.Fatalf("first sync: %v", err)
	}

	reader.getPRStateResult = "merged"
	writer.committedFiles = nil
	editArtifact(t, strat, instID, "fd-003", "Second change")
	if _, err := svc.SyncToGithub(newCtx(), syncdom.SyncParams{InstanceID: instID}); err != nil {
		t.Fatalf("second sync: %v", err)
	}

	paths := pushedPaths(writer)
	if len(paths) != 1 || !hasPathFor(paths, "fd-003") {
		t.Errorf("second sync pushed %v, want only fd-003: fd-002 is already in the repository", paths)
	}
}

func TestSyncToGithub_UnmergedSyncIsRepeated(t *testing.T) {
	db := database.TestDB(t)
	svc, writer, _, _ := newTestSyncService(t, db)
	instID, strat := importedInstance(t, db, "north_star", "fd-001", "fd-002", "fd-003")

	editArtifact(t, strat, instID, "fd-002", "First change")
	if _, err := svc.SyncToGithub(newCtx(), syncdom.SyncParams{InstanceID: instID}); err != nil {
		t.Fatalf("first sync: %v", err)
	}

	writer.committedFiles = nil
	editArtifact(t, strat, instID, "fd-003", "Second change")
	if _, err := svc.SyncToGithub(newCtx(), syncdom.SyncParams{InstanceID: instID}); err != nil {
		t.Fatalf("second sync: %v", err)
	}

	paths := pushedPaths(writer)
	if len(paths) != 2 || !hasPathFor(paths, "fd-002") || !hasPathFor(paths, "fd-003") {
		t.Errorf("second sync pushed %v, want fd-002 and fd-003: the first PR is not merged, so its change is not in the repository", paths)
	}
}

func TestSyncAfterAIMCycle_WritesOnlyChangedArtifacts(t *testing.T) {
	db := database.TestDB(t)
	svc, writer, _, _ := newTestSyncService(t, db)
	instID, strat := importedInstance(t, db, "north_star", "fd-001", "fd-002")
	editArtifact(t, strat, instID, "fd-001", "AIM cycle adjustment")

	svc.SyncAfterAIMCycle(newCtx(), instID, 3, "persevere", uuid.New())

	paths := pushedPaths(writer)
	if len(paths) != 1 || !hasPathFor(paths, "fd-001") {
		t.Fatalf("pushed %v, want only the changed fd-001", paths)
	}
	if len(writer.createdPRs) != 1 || !strings.Contains(writer.createdPRs[0].body, "AIM cycle adjustment") {
		t.Errorf("PR body should list the batch description, PRs: %+v", writer.createdPRs)
	}
}
