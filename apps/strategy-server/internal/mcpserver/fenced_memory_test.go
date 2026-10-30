package mcpserver_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// fencedSvc wires the services the way cmd_serve does for Memory: the semantic
// service reads behind the manifest the ingest writes. mem nil means Memory is
// not configured.
func fencedSvc(t *testing.T, mem *memtest.Server) mcpserver.Services {
	t.Helper()
	db := database.TestDB(t)
	packSvc := pack.NewService(db)
	instSvc := instance.NewService(db)
	instSvc.WithPackEnsurer(packSvc)
	cfg := semantic.Config{}
	if mem != nil {
		cfg = semantic.Config{URL: mem.URL, Project: "test-project", Token: "test-token"}
	}
	return mcpserver.Services{
		Workspace: workspace.NewService(db),
		Instance:  instSvc,
		Strategy:  strategy.NewService(db),
		Pack:      packSvc,
		App:       appdom.NewService(db),
		Semantic:  semantic.NewService(cfg).WithManifestSource(ingest.NewManifestStore(db)),
		Org:       orgdom.NewService(db),
	}
}

func exec(t *testing.T, svc mcpserver.Services, q string, args ...any) {
	t.Helper()
	if _, err := svc.Strategy.DB().ExecContext(context.Background(), q, args...); err != nil {
		t.Fatalf("exec %q: %v", q, err)
	}
}

// markReady records an empty, ingested manifest for an instance, so semantic
// reads run against whatever the test puts into Memory with putObject.
func markReady(t *testing.T, svc mcpserver.Services, inst uuid.UUID) {
	t.Helper()
	exec(t, svc, "UPDATE strategy_instances SET memory_generation = 1 WHERE id = ?", inst)
}

// putObject writes an object into the fake Memory as the ingest would write it
// for inst, and adds it to the instance's manifest.
func putObject(t *testing.T, svc mcpserver.Services, mem *memtest.Server, inst uuid.UUID, typ, key, layer string, props map[string]any) {
	t.Helper()
	scoped := ingest.ScopedKey(inst, key)
	p := map[string]any{"instance_id": inst.String()}
	for k, v := range props {
		p[k] = v
	}
	labels := []string{"layer:" + layer, "instance:" + inst.String()}
	if class, ok := props["integrity_class"].(string); ok {
		labels = append(labels, "integrity:"+class)
	}
	mem.AddObject(memory.Object{Type: typ, Key: scoped, Labels: labels, Properties: p})
	exec(t, svc, "INSERT INTO memory_projection (instance_id, kind, key) VALUES (?, 'object', ?) ON CONFLICT DO NOTHING", inst, scoped)
}

// putForeign writes an object of another instance into the fake Memory.
func putForeign(mem *memtest.Server, other uuid.UUID, typ, key string, props map[string]any) {
	p := map[string]any{"instance_id": other.String()}
	for k, v := range props {
		p[k] = v
	}
	mem.AddObject(memory.Object{Type: typ, Key: ingest.ScopedKey(other, key),
		Labels: []string{"layer:artifact", "instance:" + other.String()}, Properties: p})
}

// searchCalls counts the searches the fake Memory received.
func searchCalls(mem *memtest.Server) int { return mem.Count("POST", "/api/graph/search") }

// putRelationship writes a relationship between two objects of the instance into
// the fake Memory and its manifest.
func putRelationship(t *testing.T, svc mcpserver.Services, mem *memtest.Server, inst uuid.UUID, typ, from, to string) {
	t.Helper()
	fromKey, toKey := ingest.ScopedKey(inst, from), ingest.ScopedKey(inst, to)
	fromObj, toObj := mem.ObjectByKey(fromKey), mem.ObjectByKey(toKey)
	if fromObj == nil || toObj == nil {
		t.Fatalf("putRelationship %s %s -> %s: an end is not in Memory", typ, from, to)
	}
	if _, err := mem.Client(t).UpsertRelationship(context.Background(), memory.UpsertRelationshipRequest{
		Type: typ, FromID: fromObj.StableID(), ToID: toObj.StableID(),
		Properties: map[string]any{"instance_id": inst.String()},
	}); err != nil {
		t.Fatal(err)
	}
	exec(t, svc, "INSERT INTO memory_projection (instance_id, kind, key) VALUES (?, 'relationship', ?) ON CONFLICT DO NOTHING",
		inst, ingest.RelationshipKey(typ, fromKey, toKey))
}
