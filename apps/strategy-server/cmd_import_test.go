package main

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// 9.16: what the import command writes to Memory carries the owner stamp in
// both layers. Before the fence the command decomposed the directory itself and
// wrote unprefixed, unlabelled objects that any other instance could read.
func TestImportIngest_WritesStampedObjectsOfBothLayersOnly(t *testing.T) {
	db := database.TestDB(t)
	mem := memtest.New(t)
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
