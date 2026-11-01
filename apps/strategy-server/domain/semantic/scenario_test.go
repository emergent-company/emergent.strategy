package semantic_test

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

func scenarioFixture(t *testing.T) (*semantic.Service, *memtest.Server) {
	t.Helper()
	mem := memtest.New(t)
	return semantic.NewService(semantic.Config{URL: mem.URL, Project: "p", Token: "t"}), mem
}

func isNotFound(err error) bool {
	ae := apperror.AsAppError(err)
	return ae != nil && ae.Code == apperror.ErrScenarioNotFound.Code
}

func TestScenario_RunCreatesBranchUnderTheInstancePrefix(t *testing.T) {
	svc, mem := scenarioFixture(t)
	inst := uuid.New()
	id, err := svc.RunScenario(context.Background(), inst.String(), "drop fd-002", "")
	if err != nil {
		t.Fatal(err)
	}
	if id == "" {
		t.Fatal("no scenario id")
	}
	bs := mem.Branches()
	if len(bs) != 1 || !strings.HasPrefix(bs[0].Name, memory.ScenarioBranchPrefix(inst)) {
		t.Errorf("branches = %+v, want one named with the instance prefix", bs)
	}
}

// A branch belonging to another instance must look like a branch that does not
// exist, for every scenario operation, and must not be touched.
func TestScenario_AnotherInstancesBranchIsInvisibleAndUntouched(t *testing.T) {
	svc, mem := scenarioFixture(t)
	ctx := context.Background()
	mine, theirs := uuid.New(), uuid.New()
	foreign := mem.AddBranch(memory.ScenarioBranchPrefix(theirs) + "secret")

	if _, err := svc.EvaluateScenario(ctx, foreign, mine.String()); !isNotFound(err) {
		t.Errorf("EvaluateScenario on a foreign branch: %v, want scenario not found", err)
	}
	if _, err := svc.CommitScenario(ctx, foreign, mine.String()); !isNotFound(err) {
		t.Errorf("CommitScenario on a foreign branch: %v, want scenario not found", err)
	}
	if err := svc.DiscardScenario(ctx, mine.String(), foreign); !isNotFound(err) {
		t.Errorf("DiscardScenario on a foreign branch: %v, want scenario not found", err)
	}

	if len(mem.Branches()) != 1 {
		t.Error("the foreign branch was deleted")
	}
	if n := mem.Count("DELETE", "/api/graph/branches/"); n != 0 {
		t.Errorf("%d branch deletes were sent", n)
	}
	if n := mem.Count("POST", "/api/graph/branches/"); n != 0 {
		t.Errorf("%d branch merges were sent for a foreign branch", n)
	}
}

func TestScenario_BranchWithoutTheScenarioPrefixIsNotMine(t *testing.T) {
	svc, mem := scenarioFixture(t)
	inst := uuid.New()
	other := mem.AddBranch("main-experiment")
	if err := svc.DiscardScenario(context.Background(), inst.String(), other); !isNotFound(err) {
		t.Errorf("DiscardScenario on an unprefixed branch: %v, want scenario not found", err)
	}
}

func TestScenario_UnknownBranchIsNotFound(t *testing.T) {
	svc, _ := scenarioFixture(t)
	if _, err := svc.EvaluateScenario(context.Background(), "br-missing", uuid.NewString()); !isNotFound(err) {
		t.Errorf("EvaluateScenario on a missing branch: %v, want scenario not found", err)
	}
}

func TestScenario_OwnBranchCanBeEvaluatedAndDiscarded(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	inst := w.instance(t, "own")
	w.artifact(t, inst, "feature", "fd-001_a", map[string]any{"name": "a"})
	w.ingestInstance(t, inst)
	id, err := w.sem.RunScenario(ctx, inst.String(), "what if", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.sem.EvaluateScenario(ctx, id, inst.String()); err != nil {
		t.Fatalf("evaluate own branch: %v", err)
	}
	if err := w.sem.DiscardScenario(ctx, inst.String(), id); err != nil {
		t.Fatalf("discard own branch: %v", err)
	}
	if len(w.mem.Branches()) != 0 {
		t.Error("own branch not deleted")
	}
}

// Memory merges for real only when the body says execute:true, and the target
// is the branch in the URL. Until a real commit exists that merges only the
// instance's own objects, commit_scenario must never ask for it: a real merge
// would copy another instance's objects into main.
func TestScenario_CommitNeverRequestsAnExecutedMerge(t *testing.T) {
	svc, mem := scenarioFixture(t)
	ctx := context.Background()
	inst := uuid.New()
	id, err := svc.RunScenario(ctx, inst.String(), "what if", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CommitScenario(ctx, id, inst.String()); err != nil {
		t.Fatal(err)
	}
	merges := 0
	for _, r := range mem.Requests() {
		if r.Method == "POST" && strings.HasSuffix(r.Path, "/merge") {
			merges++
			if strings.Contains(r.Body, `"execute":true`) || strings.Contains(r.Body, `"execute": true`) {
				t.Errorf("merge request asked for execution: %s", r.Body)
			}
		}
	}
	if merges != 1 {
		t.Errorf("merge requests = %d, want 1", merges)
	}
}

// A branch shows the whole project through it, other instances' objects
// included (checked against a real Memory: a fresh branch lists main's objects
// of every instance). Evaluating one instance's scenario may name only that
// instance's own nodes, by the keys its owner knows them by.
func TestScenario_EvaluateNamesOnlyTheInstancesOwnNodes(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	mine, theirs := w.instance(t, "mine"), w.instance(t, "theirs")
	w.artifact(t, mine, "feature", "fd-001_mine", map[string]any{"name": "mine"})
	w.artifact(t, mine, "feature", "fd-002_mine", map[string]any{"name": "mine too"})
	w.artifact(t, theirs, "feature", "fd-001_theirs", map[string]any{"name": "theirs"})
	w.ingestInstance(t, mine)
	w.ingestInstance(t, theirs)

	id, err := w.sem.RunScenario(ctx, mine.String(), "what if", "")
	if err != nil {
		t.Fatal(err)
	}
	out, err := w.sem.EvaluateScenario(ctx, id, mine.String())
	if err != nil {
		t.Fatal(err)
	}
	nodes, _ := out["affected_nodes"].([]string)
	sort.Strings(nodes)
	if got := strings.Join(nodes, ","); got != "fd-001_mine,fd-002_mine" {
		t.Errorf("affected_nodes = %v, want only this instance's fd-001_mine, fd-002_mine", nodes)
	}
	for _, n := range nodes {
		if strings.Contains(n, "theirs") {
			t.Errorf("another instance's node %q is named", n)
		}
	}
}

// Past one page of objects the old fixed limit of 100 silently cut the list.
func TestScenario_EvaluateListsEveryNodeOfTheInstance(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	inst := w.instance(t, "big")
	const n = 250
	for i := 0; i < n; i++ {
		w.artifact(t, inst, "feature", fmt.Sprintf("fd-%03d_x", i), map[string]any{"name": "x"})
	}
	w.ingestInstance(t, inst)

	id, err := w.sem.RunScenario(ctx, inst.String(), "what if", "")
	if err != nil {
		t.Fatal(err)
	}
	out, err := w.sem.EvaluateScenario(ctx, id, inst.String())
	if err != nil {
		t.Fatal(err)
	}
	if nodes, _ := out["affected_nodes"].([]string); len(nodes) != n {
		t.Errorf("affected_nodes has %d entries, want %d", len(nodes), n)
	}
}

// An instance that has no projection yet has no graph to evaluate against.
func TestScenario_EvaluateOfAnInstanceNotYetIngestedIsNotReady(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	inst := w.instance(t, "fresh")
	id, err := w.sem.RunScenario(ctx, inst.String(), "what if", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.sem.EvaluateScenario(ctx, id, inst.String()); !errors.Is(err, semantic.ErrGraphNotReady) {
		t.Errorf("err = %v, want ErrGraphNotReady", err)
	}
}
