package main

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	strategysvc "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// 9.16: what the import command writes to Memory carries the owner stamp in
// both layers. Before the fence the command decomposed the directory itself and
// wrote unprefixed, unlabelled objects that any other instance could read.
func TestImportIngest_WritesStampedObjectsOfBothLayersOnly(t *testing.T) {
	db := database.TestDB(t)
	mem := memtest.New(t)
	ctx := context.Background()

	inst := seedNorthStarInstance(t, db)

	svc := newImportIngester(db, mem.Client(t))
	if err := svc.ReingestInstance(ctx, inst); err != nil {
		t.Fatalf("reingest: %v", err)
	}

	objs := mem.Objects()
	decomposed := 0
	for _, o := range objs {
		if !strings.HasPrefix(o.Key, inst.String()[:8]+"/") {
			t.Errorf("object %q is not prefixed with the instance", o.Key)
		}
		if got, _ := o.Properties["instance_id"].(string); got != inst.String() {
			t.Errorf("object %q instance_id = %q", o.Key, got)
		}
		owned := false
		for _, l := range o.Labels {
			if l == "instance:"+inst.String() {
				owned = true
			}
			if l == "layer:decomposed" {
				decomposed++
			}
		}
		if !owned {
			t.Errorf("object %q lacks the owner label: %v", o.Key, o.Labels)
		}
	}
	if decomposed == 0 {
		t.Errorf("no decomposed objects written (%d objects in total); the import command must ingest both layers", len(objs))
	}
}

// seedNorthStarInstance inserts an instance with one north_star artifact, which
// decomposes into more than one object.
func seedNorthStarInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	org, ws, inst := uuid.New(), uuid.New(), uuid.New()
	for _, q := range []string{
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES ('" + org.String() + "', 'o', 'o-" + org.String()[:8] + "', now(), now())",
		"INSERT INTO workspaces (id, github_owner, org_id) VALUES ('" + ws.String() + "', 'ws-" + ws.String()[:8] + "', '" + org.String() + "')",
		"INSERT INTO strategy_instances (id, workspace_id, name) VALUES ('" + inst.String() + "', '" + ws.String() + "', 'imported')",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	payload := `{"north_star":{"purpose":{"statement":"Help Acme decide"},"vision":{"vision_statement":"Beat Rivalco"}}}`
	mid := uuid.New()
	for _, q := range []string{
		"INSERT INTO strategy_mutations (id, instance_id, artifact_type, artifact_key, action, payload, status, source) VALUES ('" + mid.String() + "', '" + inst.String() + "', 'north_star', 'north_star', 'create', '" + payload + "', 'committed', 'system')",
		"INSERT INTO strategy_artifacts (id, instance_id, artifact_type, artifact_key, status, payload, mutation_id) VALUES (gen_random_uuid(), '" + inst.String() + "', 'north_star', 'north_star', 'active', '" + payload + "', '" + mid.String() + "')",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	return inst
}

// ---------------------------------------------------------------------------
// --dry-run and the re-import guard (WP-003 3.2)
// ---------------------------------------------------------------------------

func writeInstanceDir(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for rel, content := range files {
		p := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
			t.Fatalf("write %s: %v", rel, err)
		}
	}
	return dir
}

const importNorthStar = "north_star:\n  organization: Acme\n  purpose:\n    statement: Help Acme decide\n"

func importFeature(name string) string {
	return "id: fd-001\nname: " + name + "\nstatus: draft\n"
}

func importConfig(dir string, dryRun, force bool) *config.Config {
	return &config.Config{Import: &config.ImportCmd{
		InstancePath: dir, GithubOwner: "acme", InstanceName: "Acme",
		DryRun: dryRun, Force: force,
	}}
}

// seedImportActor creates the system user the import command attributes new orgs
// to; a fresh test database does not have it.
func seedImportActor(t *testing.T, db *bun.DB) {
	t.Helper()
	ctx := context.Background()
	if _, err := user.NewService(db).EnsureUser(ctx, "import-actor", "import@local", "Import Actor"); err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	if _, err := db.NewUpdate().TableExpr("users").
		Set("id = ?", uuid.MustParse("00000000-0000-0000-0000-000000000001")).
		Where("sub = ?", "import-actor").Exec(ctx); err != nil {
		t.Fatalf("set actor id: %v", err)
	}
}

func countTable(t *testing.T, db *bun.DB, table string) int {
	t.Helper()
	var n int
	if err := db.NewRaw("SELECT count(*) FROM "+table).Scan(context.Background(), &n); err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return n
}

func TestImport_DryRunOnANewInstanceCreatesNothing(t *testing.T) {
	db := database.TestDB(t)
	dir := writeInstanceDir(t, map[string]string{
		"READY/00_north_star.yaml":             importNorthStar,
		"FIRE/feature_definitions/fd-001.yaml": importFeature("One"),
	})

	var out bytes.Buffer
	if err := importInstance(context.Background(), db, importConfig(dir, true, false), &out); err != nil {
		t.Fatalf("dry run: %v", err)
	}

	for _, table := range []string{"orgs", "workspaces", "strategy_instances", "strategy_mutations", "strategy_artifacts"} {
		if n := countTable(t, db, table); n != 0 {
			t.Errorf("%s has %d rows after a dry run, want 0", table, n)
		}
	}
	if !strings.Contains(out.String(), "new instance") {
		t.Errorf("output does not say a new instance would be created:\n%s", out.String())
	}
}

func TestImport_DryRunReportsTheDiffAndChangesNothing(t *testing.T) {
	db := database.TestDB(t)
	seedImportActor(t, db)
	ctx := context.Background()
	dir := writeInstanceDir(t, map[string]string{
		"READY/00_north_star.yaml":             importNorthStar,
		"FIRE/feature_definitions/fd-001.yaml": importFeature("One"),
	})
	if err := importInstance(ctx, db, importConfig(dir, false, false), io.Discard); err != nil {
		t.Fatalf("first import: %v", err)
	}

	changed := writeInstanceDir(t, map[string]string{
		"READY/00_north_star.yaml":             importNorthStar,
		"FIRE/feature_definitions/fd-001.yaml": importFeature("One, renamed"),
		"FIRE/feature_definitions/fd-002.yaml": "id: fd-002\nname: Two\nstatus: draft\n",
	})
	mutations, artifacts := countTable(t, db, "strategy_mutations"), countTable(t, db, "strategy_artifacts")

	var out bytes.Buffer
	if err := importInstance(ctx, db, importConfig(changed, true, false), &out); err != nil {
		t.Fatalf("dry run: %v", err)
	}

	if got := countTable(t, db, "strategy_mutations"); got != mutations {
		t.Errorf("mutations %d -> %d, want unchanged", mutations, got)
	}
	if got := countTable(t, db, "strategy_artifacts"); got != artifacts {
		t.Errorf("artifacts %d -> %d, want unchanged", artifacts, got)
	}
	for _, want := range []string{"fd-002", "fd-001", "1 added", "1 changed", "1 unchanged"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("output lacks %q:\n%s", want, out.String())
		}
	}
}

func authorEdit(t *testing.T, db *bun.DB, key string) {
	t.Helper()
	var inst struct {
		ID uuid.UUID `bun:"instance_id"`
	}
	if err := db.NewRaw("SELECT instance_id FROM strategy_artifacts WHERE artifact_key = ?", key).Scan(context.Background(), &inst); err != nil {
		t.Fatalf("find %s: %v", key, err)
	}
	ctx := audit.ContextWithSource(context.Background(), audit.SourceMCP)
	svc := strategysvc.NewService(db)
	batch, err := svc.Stage(ctx, strategysvc.StageParams{
		InstanceID: inst.ID, ArtifactType: "feature", ArtifactKey: key,
		Action: domain.MutationActionUpdate, Payload: map[string]any{"id": key, "name": "Edited on the server", "status": "draft"},
	})
	if err != nil {
		t.Fatalf("Stage: %v", err)
	}
	if _, err := svc.CommitBatch(ctx, batch); err != nil {
		t.Fatalf("CommitBatch: %v", err)
	}
}

func heldName(t *testing.T, db *bun.DB, key string) string {
	t.Helper()
	var name string
	if err := db.NewRaw("SELECT payload->>'name' FROM strategy_artifacts WHERE artifact_key = ?", key).Scan(context.Background(), &name); err != nil {
		t.Fatalf("read %s: %v", key, err)
	}
	return name
}

func TestImport_ReimportRefusesToDiscardServerEditsWithoutForce(t *testing.T) {
	db := database.TestDB(t)
	seedImportActor(t, db)
	ctx := context.Background()
	dir := writeInstanceDir(t, map[string]string{
		"READY/00_north_star.yaml":             importNorthStar,
		"FIRE/feature_definitions/fd-001.yaml": importFeature("One"),
	})
	if err := importInstance(ctx, db, importConfig(dir, false, false), io.Discard); err != nil {
		t.Fatalf("first import: %v", err)
	}
	authorEdit(t, db, "fd-001")

	err := importInstance(ctx, db, importConfig(dir, false, false), io.Discard)

	if err == nil || !strings.Contains(err.Error(), "--force") || !strings.Contains(err.Error(), "fd-001") {
		t.Fatalf("err = %v, want a refusal that names fd-001 and --force", err)
	}
	if got := heldName(t, db, "fd-001"); got != "Edited on the server" {
		t.Errorf("fd-001 name = %q, want the server edit to survive a refused import", got)
	}

	if err := importInstance(ctx, db, importConfig(dir, false, true), io.Discard); err != nil {
		t.Fatalf("forced import: %v", err)
	}
	if got := heldName(t, db, "fd-001"); got != "One" {
		t.Errorf("fd-001 name = %q after --force, want the source's value", got)
	}
}

func TestImport_ReimportOverImportedContentNeedsNoForce(t *testing.T) {
	db := database.TestDB(t)
	seedImportActor(t, db)
	ctx := context.Background()
	dir := writeInstanceDir(t, map[string]string{
		"READY/00_north_star.yaml":             importNorthStar,
		"FIRE/feature_definitions/fd-001.yaml": importFeature("One"),
	})
	if err := importInstance(ctx, db, importConfig(dir, false, false), io.Discard); err != nil {
		t.Fatalf("first import: %v", err)
	}

	moved := writeInstanceDir(t, map[string]string{
		"READY/00_north_star.yaml":             importNorthStar,
		"FIRE/feature_definitions/fd-001.yaml": importFeature("One, moved in the source"),
	})
	if err := importInstance(ctx, db, importConfig(moved, false, false), io.Discard); err != nil {
		t.Fatalf("re-import of a moved source: %v", err)
	}
	if got := heldName(t, db, "fd-001"); got != "One, moved in the source" {
		t.Errorf("fd-001 name = %q, want the source's new value", got)
	}
}
