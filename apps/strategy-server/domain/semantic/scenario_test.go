package semantic_test

import (
	"context"
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
	svc, mem := scenarioFixture(t)
	ctx := context.Background()
	inst := uuid.New()
	id, err := svc.RunScenario(ctx, inst.String(), "what if", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.EvaluateScenario(ctx, id, inst.String()); err != nil {
		t.Fatalf("evaluate own branch: %v", err)
	}
	if err := svc.DiscardScenario(ctx, inst.String(), id); err != nil {
		t.Fatalf("discard own branch: %v", err)
	}
	if len(mem.Branches()) != 0 {
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
