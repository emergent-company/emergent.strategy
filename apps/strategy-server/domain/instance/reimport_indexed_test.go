package instance_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark/changemarktest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func countRows(t *testing.T, db *bun.DB, table string, inst uuid.UUID) int {
	t.Helper()
	var n int
	if err := db.NewRaw("SELECT count(*) FROM "+table+" WHERE instance_id = ?", inst).Scan(context.Background(), &n); err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return n
}

func seededInstance(t *testing.T) (*bun.DB, *instance.Service, uuid.UUID, *changemarktest.Recorder) {
	t.Helper()
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "ri-"+uuid.NewString()[:8])
	inst, err := svc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID:     wsID,
		Name:            "Acme",
		InitialPayloads: map[string]any{"north_star": map[string]any{"v": "old"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	// An index row the previous import derived.
	if _, err := db.ExecContext(ctx, `INSERT INTO strategy_artifacts (id, instance_id, artifact_type, artifact_key, status, payload, mutation_id)
		SELECT ?, instance_id, artifact_type, artifact_key, 'active', payload, id FROM strategy_mutations WHERE instance_id = ?`,
		uuid.New(), inst.ID); err != nil {
		t.Fatalf("seed artifact: %v", err)
	}
	marker, rec := changemarktest.New(db)
	svc.WithChangeMarker(marker)
	changemarktest.Reset(t, db, inst.ID)
	return db, svc, inst.ID, rec
}

// If rebuilding the index fails, the import must not have happened at all: the
// old artifacts and mutations stay, and nothing is marked or announced.
func TestReimportArtifactsIndexed_AFailingIndexReplacesNothing(t *testing.T) {
	db, svc, inst, rec := seededInstance(t)
	mutations, artifacts := countRows(t, db, "strategy_mutations", inst), countRows(t, db, "strategy_artifacts", inst)
	if mutations == 0 || artifacts == 0 {
		t.Fatalf("setup: %d mutations, %d artifacts", mutations, artifacts)
	}

	boom := errors.New("index failed")
	err := svc.ReimportArtifactsIndexed(newCtx(), inst, map[string]any{"a": map[string]any{"v": 1}, "b": map[string]any{"v": 2}},
		func(context.Context, bun.Tx) error { return boom })
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want the index error", err)
	}

	if got := countRows(t, db, "strategy_mutations", inst); got != mutations {
		t.Errorf("mutations: %d, want the previous %d", got, mutations)
	}
	if got := countRows(t, db, "strategy_artifacts", inst); got != artifacts {
		t.Errorf("artifacts: %d, want the previous %d", got, artifacts)
	}
	if s := changemarktest.Load(t, db, inst); s.Dirty != nil || s.Seq != 0 || rec.Count(inst) != 0 {
		t.Errorf("a rolled-back import marked or notified: %+v notified=%d", s, rec.Count(inst))
	}
}

// While the index is being rebuilt, a reader on another connection must still
// see the previous artifacts, never an empty instance; the announcement comes
// only after the commit.
func TestReimportArtifactsIndexed_ReadersSeeThePreviousStateUntilCommit(t *testing.T) {
	db, svc, inst, rec := seededInstance(t)
	before := countRows(t, db, "strategy_artifacts", inst)

	var during, notifiedDuring int
	err := svc.ReimportArtifactsIndexed(newCtx(), inst, map[string]any{"north_star": map[string]any{"v": "new"}},
		func(ctx context.Context, tx bun.Tx) error {
			during = countRows(t, db, "strategy_artifacts", inst) // another connection
			notifiedDuring = rec.Count(inst)
			_, err := tx.ExecContext(ctx, `INSERT INTO strategy_artifacts (id, instance_id, artifact_type, artifact_key, status, payload, mutation_id)
				SELECT ?, instance_id, artifact_type, artifact_key, 'active', payload, id FROM strategy_mutations WHERE instance_id = ?`,
				uuid.New(), inst)
			return err
		})
	if err != nil {
		t.Fatal(err)
	}
	if during != before {
		t.Errorf("a reader saw %d artifacts mid-import, want the previous %d", during, before)
	}
	if notifiedDuring != 0 {
		t.Errorf("the instance was announced %d times before the commit", notifiedDuring)
	}
	if rec.Count(inst) != 1 {
		t.Errorf("announced %d times after the commit, want once", rec.Count(inst))
	}
	if s := changemarktest.Load(t, db, inst); s.Dirty == nil || s.Seq != 1 {
		t.Errorf("not marked exactly once: %+v", s)
	}
	if got := countRows(t, db, "strategy_artifacts", inst); got != 1 {
		t.Errorf("artifacts after the import: %d, want the 1 rebuilt", got)
	}
}
