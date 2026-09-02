package aimadk_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimadk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

func newRunStore(t *testing.T) *aimadk.RunStore {
	t.Helper()
	return aimadk.NewRunStore(database.TestDB(t))
}

func newRun(workflow, concurrencyKey string, status orchestration.RunStatus) *orchestration.Run {
	return &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   workflow,
		ConcurrencyKey: concurrencyKey,
		Input:          map[string]any{"instance_id": concurrencyKey},
		Status:         status,
		Steps:          []orchestration.StepLog{},
	}
}

func TestRunStore_CreateAndGetByID_RoundTrips(t *testing.T) {
	store := newRunStore(t)
	run := newRun("aim_cycle", "instance-1", orchestration.StatusRunning)
	run.CurrentStep = "draft_assessment"

	if err := store.Create(t.Context(), run); err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := store.GetByID(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.WorkflowName != "aim_cycle" || got.ConcurrencyKey != "instance-1" {
		t.Errorf("got %+v, want workflow=aim_cycle key=instance-1", got)
	}
	if got.CurrentStep != "draft_assessment" {
		t.Errorf("CurrentStep = %q, want draft_assessment", got.CurrentStep)
	}
	if got.Input["instance_id"] != "instance-1" {
		t.Errorf("Input round-trip lost instance_id: %+v", got.Input)
	}
}

// TestRunStore_Create_EnforcesOneActiveRunAsAConstraint is the property this
// store exists to add over the legacy engine: StartRun there checks for an
// active run and inserts as two separate operations, so two concurrent starts
// can both pass the check. Here the database rejects the second insert
// outright — there is no window in which both can succeed.
func TestRunStore_Create_EnforcesOneActiveRunAsAConstraint(t *testing.T) {
	store := newRunStore(t)

	first := newRun("aim_cycle", "instance-1", orchestration.StatusRunning)
	if err := store.Create(t.Context(), first); err != nil {
		t.Fatalf("create first: %v", err)
	}

	second := newRun("aim_cycle", "instance-1", orchestration.StatusPending)
	err := store.Create(t.Context(), second)
	if !errors.Is(err, orchestration.ErrAlreadyActive) {
		t.Fatalf("create second: err = %v, want ErrAlreadyActive", err)
	}
}

// TestRunStore_Create_TerminalRunDoesNotBlockANewOne is the other half of the
// constraint: it must be scoped to non-terminal statuses, or every instance
// could only ever run one cycle in its lifetime.
func TestRunStore_Create_TerminalRunDoesNotBlockANewOne(t *testing.T) {
	store := newRunStore(t)

	done := newRun("aim_cycle", "instance-1", orchestration.StatusCompleted)
	if err := store.Create(t.Context(), done); err != nil {
		t.Fatalf("create completed run: %v", err)
	}

	next := newRun("aim_cycle", "instance-1", orchestration.StatusRunning)
	if err := store.Create(t.Context(), next); err != nil {
		t.Fatalf("create next run after a completed one: %v", err)
	}
}

// TestRunStore_Create_DifferentInstancesDoNotCollide guards against an overly
// broad constraint — the unique index must be scoped per concurrency key, not
// global to the workflow.
func TestRunStore_Create_DifferentInstancesDoNotCollide(t *testing.T) {
	store := newRunStore(t)

	if err := store.Create(t.Context(), newRun("aim_cycle", "instance-1", orchestration.StatusRunning)); err != nil {
		t.Fatalf("create for instance-1: %v", err)
	}
	if err := store.Create(t.Context(), newRun("aim_cycle", "instance-2", orchestration.StatusRunning)); err != nil {
		t.Fatalf("create for instance-2: %v", err)
	}
}

func TestRunStore_UpdateStatus_PersistsStepsIncludingGateFields(t *testing.T) {
	store := newRunStore(t)
	run := newRun("aim_cycle", "instance-1", orchestration.StatusRunning)
	if err := store.Create(t.Context(), run); err != nil {
		t.Fatalf("create: %v", err)
	}

	opened := time.Now().UTC().Truncate(time.Second)
	steps := []orchestration.StepLog{{
		Name:         "draft_assessment",
		Status:       "awaiting_human",
		BatchID:      "batch-1",
		GateOpenedAt: &opened,
	}}

	err := store.UpdateStatus(t.Context(), run.ID, orchestration.StatusAwaitingHuman, "draft_assessment", "", steps)
	if err != nil {
		t.Fatalf("update status: %v", err)
	}

	got, err := store.GetByID(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != orchestration.StatusAwaitingHuman {
		t.Errorf("Status = %q, want awaiting_human", got.Status)
	}
	if len(got.Steps) != 1 {
		t.Fatalf("got %d steps, want 1", len(got.Steps))
	}
	if got.Steps[0].GateOpenedAt == nil || !got.Steps[0].GateOpenedAt.Equal(opened) {
		t.Errorf("GateOpenedAt = %v, want %v", got.Steps[0].GateOpenedAt, opened)
	}
	if got.Steps[0].BatchID != "batch-1" {
		t.Errorf("BatchID = %q, want batch-1", got.Steps[0].BatchID)
	}
}

func TestRunStore_List_NewestFirst(t *testing.T) {
	store := newRunStore(t)

	first := newRun("aim_cycle", "instance-1", orchestration.StatusCompleted)
	if err := store.Create(t.Context(), first); err != nil {
		t.Fatalf("create first: %v", err)
	}
	second := newRun("aim_cycle", "instance-1", orchestration.StatusCompleted)
	if err := store.Create(t.Context(), second); err != nil {
		t.Fatalf("create second: %v", err)
	}

	runs, err := store.List(t.Context(), "aim_cycle", "instance-1")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(runs) != 2 {
		t.Fatalf("got %d runs, want 2", len(runs))
	}
	if runs[0].ID != second.ID {
		t.Errorf("first result = %s, want the more recently created run %s", runs[0].ID, second.ID)
	}
}

func TestRunStore_ActiveRun_NilWhenNoneActive(t *testing.T) {
	store := newRunStore(t)

	active, err := store.ActiveRun(t.Context(), "aim_cycle", "instance-1")
	if err != nil {
		t.Fatalf("active run: %v", err)
	}
	if active != nil {
		t.Errorf("active = %+v, want nil", active)
	}
}

func TestRunStore_ActiveRun_FindsNonTerminalRun(t *testing.T) {
	store := newRunStore(t)
	run := newRun("aim_cycle", "instance-1", orchestration.StatusAwaitingHuman)
	if err := store.Create(t.Context(), run); err != nil {
		t.Fatalf("create: %v", err)
	}

	active, err := store.ActiveRun(t.Context(), "aim_cycle", "instance-1")
	if err != nil {
		t.Fatalf("active run: %v", err)
	}
	if active == nil || active.ID != run.ID {
		t.Errorf("active = %+v, want %s", active, run.ID)
	}
}

func TestRunStore_FindRunByBatch_MatchesOnlyOpenGate(t *testing.T) {
	store := newRunStore(t)
	run := newRun("aim_cycle", "instance-1", orchestration.StatusAwaitingHuman)
	run.Steps = []orchestration.StepLog{
		{Name: "draft_assessment", Status: "done", BatchID: "batch-old"}, // cleared already
		{Name: "draft_calibration", Status: "awaiting_human", BatchID: "batch-current"},
	}
	if err := store.Create(t.Context(), run); err != nil {
		t.Fatalf("create: %v", err)
	}

	found, err := store.FindRunByBatch(t.Context(), "batch-current")
	if err != nil {
		t.Fatalf("find by batch: %v", err)
	}
	if found == nil || found.ID != run.ID {
		t.Fatalf("found = %+v, want run %s", found, run.ID)
	}

	// A batch id from an earlier, already-cleared step must not match — that
	// would resume the wrong step.
	stale, err := store.FindRunByBatch(t.Context(), "batch-old")
	if err != nil {
		t.Fatalf("find by stale batch: %v", err)
	}
	if stale != nil {
		t.Errorf("stale batch matched run %s; a cleared step's batch id must not resolve", stale.ID)
	}
}

func TestRunStore_FindRunByBatch_NilWhenNoMatch(t *testing.T) {
	store := newRunStore(t)
	found, err := store.FindRunByBatch(t.Context(), "no-such-batch")
	if err != nil {
		t.Fatalf("find by batch: %v", err)
	}
	if found != nil {
		t.Errorf("found = %+v, want nil", found)
	}
}

// TestRunStore_FindAbandonedGates_UsesSharedLogic is a thin wiring check —
// the clock-fallback behaviour itself is tested once, against
// orchestration.FindAbandonedGates directly, not duplicated here.
func TestRunStore_FindAbandonedGates_UsesSharedLogic(t *testing.T) {
	store := newRunStore(t)

	old := time.Now().UTC().Add(-100 * 24 * time.Hour)
	run := newRun("aim_cycle", "instance-1", orchestration.StatusAwaitingHuman)
	run.Steps = []orchestration.StepLog{
		{Name: "draft_assessment", Status: "awaiting_human", GateOpenedAt: &old},
	}
	if err := store.Create(t.Context(), run); err != nil {
		t.Fatalf("create: %v", err)
	}

	abandoned, err := store.FindAbandonedGates(t.Context(), 60*24*time.Hour, time.Now().UTC())
	if err != nil {
		t.Fatalf("find abandoned gates: %v", err)
	}
	if len(abandoned) != 1 || abandoned[0].Run.ID != run.ID {
		t.Fatalf("abandoned = %+v, want exactly run %s", abandoned, run.ID)
	}
}

// TestRunStore_ToleratesNullSteps covers the row shape the dev database
// actually had: seven rows with steps as JSON null rather than an array,
// predating this store but sharing the same orchestration.StepLog decode
// path used here.
func TestRunStore_ToleratesNullSteps(t *testing.T) {
	store := newRunStore(t)
	run := newRun("aim_cycle", "instance-1", orchestration.StatusAwaitingHuman)
	run.Steps = nil // encodes as JSON null via orchestration.Run's own marshalling path
	if err := store.Create(t.Context(), run); err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := store.GetByID(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(got.Steps) != 0 {
		t.Errorf("Steps = %+v, want empty", got.Steps)
	}
}

// TestRunStore_Create_TrueConcurrencyStillEnforcesOne drives the constraint
// with real concurrent goroutines rather than two sequential calls, because
// the property being claimed is that no window exists in which both could
// succeed — a sequential test alone would not distinguish that from "whoever
// checked first happened to win," which is exactly the legacy engine's race.
func TestRunStore_Create_TrueConcurrencyStillEnforcesOne(t *testing.T) {
	store := newRunStore(t)

	const attempts = 8
	var wg sync.WaitGroup
	results := make(chan error, attempts)

	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- store.Create(t.Context(), newRun("aim_cycle", "instance-1", orchestration.StatusRunning))
		}()
	}
	wg.Wait()
	close(results)

	var succeeded, rejected int
	for err := range results {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, orchestration.ErrAlreadyActive):
			rejected++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}

	if succeeded != 1 {
		t.Errorf("succeeded = %d, want exactly 1 (got %d rejected)", succeeded, rejected)
	}
	if succeeded+rejected != attempts {
		t.Errorf("accounted for %d of %d attempts", succeeded+rejected, attempts)
	}
}
