package instance_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

// seedHeldArtifact gives an instance an artifact whose latest mutation came from
// source, as the server holds it after an import or an edit.
func seedHeldArtifact(t *testing.T, db *bun.DB, inst uuid.UUID, key, source, status, payload string) {
	t.Helper()
	ctx := context.Background()
	mid := uuid.New()
	if _, err := db.ExecContext(ctx,
		`INSERT INTO strategy_mutations (id, instance_id, artifact_type, artifact_key, action, payload, status, source)
		 VALUES (?, ?, 'feature', ?, 'create', ?::jsonb, 'committed', ?)`,
		mid, inst, key, payload, source); err != nil {
		t.Fatalf("seed mutation %s: %v", key, err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO strategy_artifacts (id, instance_id, artifact_type, artifact_key, status, payload, mutation_id)
		 VALUES (?, ?, 'feature', ?, ?, ?::jsonb, ?)`,
		uuid.New(), inst, key, status, payload, mid); err != nil {
		t.Fatalf("seed artifact %s: %v", key, err)
	}
}

func previewInstance(t *testing.T) (*bun.DB, *instance.Service, uuid.UUID) {
	t.Helper()
	db := database.TestDB(t)
	svc := instance.NewService(db)
	ctx := newCtx()
	wsID := createWorkspace(t, db, workspace.NewService(db), ctx, "diff-"+uuid.NewString()[:8])
	inst, err := svc.ImportInstance(ctx, instance.ImportParams{WorkspaceID: wsID, Name: "Diff"})
	if err != nil {
		t.Fatalf("ImportInstance: %v", err)
	}
	return db, svc, inst.ID
}

func TestPreviewReimport_ClassifiesEachArtifact(t *testing.T) {
	db, svc, inst := previewInstance(t)
	seedHeldArtifact(t, db, inst, "a-same-import", "import", "active", `{"v":1}`)
	seedHeldArtifact(t, db, inst, "b-source-moved", "import", "active", `{"v":1}`)
	seedHeldArtifact(t, db, inst, "c-gone-from-source", "import", "active", `{"v":1}`)
	seedHeldArtifact(t, db, inst, "d-edited-here", "mcp", "active", `{"v":"edited"}`)
	seedHeldArtifact(t, db, inst, "e-created-here", "mcp", "active", `{"v":1}`)
	seedHeldArtifact(t, db, inst, "f-edited-same-as-source", "web", "active", `{"v":2}`)
	seedHeldArtifact(t, db, inst, "z-archived", "mcp", "archived", `{"v":1}`)
	if _, err := db.ExecContext(context.Background(),
		`INSERT INTO strategy_mutations (id, instance_id, artifact_type, artifact_key, action, payload, status, source, batch_id)
		 VALUES (?, ?, 'feature', 'staged-one', 'create', '{}'::jsonb, 'staged', 'mcp', ?)`,
		uuid.New(), inst, uuid.New()); err != nil {
		t.Fatalf("seed staged: %v", err)
	}

	source := map[string]any{
		"a-same-import":           map[string]any{"v": 1},
		"b-source-moved":          map[string]any{"v": 2},
		"d-edited-here":           map[string]any{"v": "from source"},
		"f-edited-same-as-source": map[string]any{"v": 2},
		"g-new-in-source":         map[string]any{"v": 1},
	}

	diff, err := svc.PreviewReimport(newCtx(), inst, source)
	if err != nil {
		t.Fatalf("PreviewReimport: %v", err)
	}

	check := func(name string, got, want []string) {
		t.Helper()
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s = %v, want %v", name, got, want)
		}
	}
	check("added", diff.Added, []string{"g-new-in-source"})
	check("removed", diff.Removed, []string{"c-gone-from-source", "e-created-here"})
	check("changed", diff.Changed, []string{"b-source-moved", "d-edited-here"})
	check("lost", diff.Lost, []string{"d-edited-here", "e-created-here"})
	if diff.Unchanged != 2 {
		t.Errorf("unchanged = %d, want 2 (a-same-import and f-edited-same-as-source)", diff.Unchanged)
	}
	if diff.StagedMutations != 1 {
		t.Errorf("staged mutations = %d, want 1", diff.StagedMutations)
	}
	if !diff.WouldLoseWork() {
		t.Error("WouldLoseWork = false, want true: edits made on the server would be replaced")
	}
}

// What an earlier import wrote is the source's own content. Replacing or removing
// it loses nothing, whatever the source now says.
func TestPreviewReimport_OnlyImportedContentLosesNothing(t *testing.T) {
	db, svc, inst := previewInstance(t)
	seedHeldArtifact(t, db, inst, "a", "import", "active", `{"v":1}`)
	seedHeldArtifact(t, db, inst, "b", "import", "active", `{"v":1}`)

	diff, err := svc.PreviewReimport(newCtx(), inst, map[string]any{"a": map[string]any{"v": 9}})
	if err != nil {
		t.Fatalf("PreviewReimport: %v", err)
	}

	if len(diff.Changed) != 1 || len(diff.Removed) != 1 {
		t.Fatalf("changed %v, removed %v, want one each", diff.Changed, diff.Removed)
	}
	if diff.WouldLoseWork() {
		t.Errorf("WouldLoseWork = true (lost %v), want false: only imported content is replaced", diff.Lost)
	}
}

// A number in a source file and the same number read back from the database
// must compare equal, or every re-import would report every artifact changed.
func TestPreviewReimport_SameContentIsUnchangedWhateverItsGoType(t *testing.T) {
	db, svc, inst := previewInstance(t)
	seedHeldArtifact(t, db, inst, "a", "import", "active", `{"count":3,"ratio":0.5,"tags":["x","y"],"nested":{"on":true}}`)

	diff, err := svc.PreviewReimport(newCtx(), inst, map[string]any{
		"a": map[string]any{"count": 3, "ratio": 0.5, "tags": []any{"x", "y"}, "nested": map[string]any{"on": true}},
	})
	if err != nil {
		t.Fatalf("PreviewReimport: %v", err)
	}
	if diff.Unchanged != 1 || len(diff.Changed) != 0 {
		t.Errorf("unchanged = %d, changed = %v, want 1 and none", diff.Unchanged, diff.Changed)
	}
}
