package sync_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

var importedNorthStar = map[string]any{"north_star": map[string]any{"organization": "Acme"}}

func commitAuthored(t *testing.T, svc *strategy.Service, source audit.Source, instID uuid.UUID, key string) {
	t.Helper()
	ctx := audit.ContextWithSource(context.Background(), source)
	batchID, err := svc.Stage(ctx, strategy.StageParams{
		InstanceID:   instID,
		ArtifactType: "north_star",
		ArtifactKey:  key,
		Action:       domain.MutationActionCreate,
		Payload:      importedNorthStar,
	})
	if err != nil {
		t.Fatalf("Stage as %s: %v", source, err)
	}
	if _, err := svc.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("CommitBatch as %s: %v", source, err)
	}
}

// An imported instance holds exactly what its source holds. Its own import
// mutations must not read as unpushed local work, or every fresh import
// reports server_ahead and the import tool refuses to run.
func TestDetermineSyncState_ImportMutationsAreNotLocalChanges(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	svc, _, _, _ := newTestSyncService(t, db)

	orgID := seedTestOrg(t, db)
	ws, _ := workspace.NewService(db).CreateWorkspace(ctx, "import-state-org", nil, orgID)
	repo := "test-org/strategy"
	importCtx := audit.ContextWithSource(context.Background(), audit.SourceImport)
	inst, err := instance.NewService(db).ImportInstance(importCtx, instance.ImportParams{
		WorkspaceID:     ws.ID,
		Name:            "Import State",
		GithubRepo:      &repo,
		InitialPayloads: map[string]any{"north_star": importedNorthStar},
	})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}

	var imported int
	if err := db.NewSelect().TableExpr("strategy_mutations").ColumnExpr("COUNT(*)").
		Where("instance_id = ? AND source = ?", inst.ID, domain.MutationSourceImport).
		Scan(ctx, &imported); err != nil || imported == 0 {
		t.Fatalf("import mutations = %d (err %v), want at least one: the test needs a real import", imported, err)
	}

	result, err := svc.DetermineSyncState(ctx, inst.ID, "")
	if err != nil {
		t.Fatalf("DetermineSyncState: %v", err)
	}
	if result.HasLocalChanges {
		t.Errorf("HasLocalChanges = true after an import, want false")
	}
	if result.State != syncdom.SyncStateGithubAhead {
		t.Errorf("state = %q, want github_ahead (imported, never synced, nothing authored)", result.State)
	}
}

func TestDetermineSyncState_AuthoredMutationsAreLocalChanges(t *testing.T) {
	for _, source := range []audit.Source{audit.SourceMCP, audit.SourceWeb, audit.SourceMCPToken} {
		t.Run(string(source), func(t *testing.T) {
			db := database.TestDB(t)
			ctx := newCtx()

			svc, _, _, _ := newTestSyncService(t, db)
			stratSvc := strategy.NewService(db)

			orgID := seedTestOrg(t, db)
			ws, _ := workspace.NewService(db).CreateWorkspace(ctx, "authored-state-org", nil, orgID)
			repo := "test-org/strategy"
			importCtx := audit.ContextWithSource(context.Background(), audit.SourceImport)
			inst, err := instance.NewService(db).ImportInstance(importCtx, instance.ImportParams{
				WorkspaceID:     ws.ID,
				Name:            "Authored State",
				GithubRepo:      &repo,
				InitialPayloads: map[string]any{"north_star": importedNorthStar},
			})
			if err != nil {
				t.Fatalf("ImportInstance: %v", err)
			}

			commitAuthored(t, stratSvc, source, inst.ID, "north_star_edit")

			var authored int
			if err := db.NewSelect().TableExpr("strategy_mutations").ColumnExpr("COUNT(*)").
				Where("instance_id = ? AND source = ? AND status = ?", inst.ID, string(source), domain.MutationStatusCommitted).
				Scan(ctx, &authored); err != nil || authored == 0 {
				t.Fatalf("committed %s mutations = %d (err %v), want at least one", source, authored, err)
			}

			result, err := svc.DetermineSyncState(ctx, inst.ID, "")
			if err != nil {
				t.Fatalf("DetermineSyncState: %v", err)
			}
			if !result.HasLocalChanges || result.State != syncdom.SyncStateServerAhead {
				t.Errorf("state = %q, local changes = %v, want server_ahead with local changes after a %s edit",
					result.State, result.HasLocalChanges, source)
			}
		})
	}
}
