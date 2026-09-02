package aimadk_test

// Real restart-resume proof.
//
// Every other test in this package proves the engine's *logic* is correct —
// construct fresh engines, call Start(), assert on outcomes, all inside one
// Go runtime. None of them prove the thing B4f actually asks for: that a run
// driven by a process which crashed — no Stop(), no cancel(), no deferred
// cleanup of any kind — resumes correctly when a genuinely different process
// starts.
//
// That property cannot be tested by discarding an *ADKEngine value in-process
// and constructing a new one. The old value's drive() goroutine keeps running
// — Go does not garbage-collect live goroutines — and it would keep writing
// to the same database rows the "recovery" engine is trying to read,
// corrupting the test rather than proving anything. The only way to get a
// driving goroutine to genuinely stop with zero graceful-shutdown code having
// run is to put it in a separate OS process and send it a signal that cannot
// be caught.
//
// This uses Go's standard "re-exec the test binary as a helper process"
// pattern (the same one used by the os/exec package's own tests):
// TestMain checks an environment variable and, if set, runs helper logic
// instead of the normal test suite. The parent test spawns os.Args[0] — the
// already-compiled test binary — with that variable set, waits for the
// helper to report it has reached a human gate, then calls Process.Kill(),
// which sends SIGKILL on Unix: immediate, uncatchable, no deferred function
// in the helper ever runs.

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimadk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// restartProofHelperEnv, when set, tells TestMain this process invocation is
// the helper, not the normal test suite.
const restartProofHelperEnv = "ADK_RESTART_PROOF_HELPER"

// restartProofDBEnv carries the throwaway database name from parent to
// helper. The parent creates and migrates it before spawning the helper, so
// the helper only ever connects — running goose from two processes
// concurrently would be needless contention on its advisory lock for no
// benefit here.
const restartProofDBEnv = "ADK_RESTART_PROOF_DB"

// restartProofReadyFileEnv carries the path the helper writes RUN_ID and
// INSTANCE_ID into once the run is paused at its gate. A file, not a stdout
// pipe: polling a file the parent can read at its own pace is simpler and
// more robust than coordinating concurrent reads of a subprocess's stdout.
const restartProofReadyFileEnv = "ADK_RESTART_PROOF_READY_FILE"

// restartProofWorkflowName is registered identically by both the helper and
// the parent's post-kill recovery engine. Neither process shares any Go
// value with the other — this proves a fresh process only needs to know how
// to build the same graph by name; the persisted session and run-metadata
// carry everything else.
const restartProofWorkflowName = "restart_proof_cycle"

func TestMain(m *testing.M) {
	if os.Getenv(restartProofHelperEnv) != "" {
		runRestartProofHelper()
		return // unreached: runRestartProofHelper blocks forever on success
	}
	os.Exit(m.Run())
}

// restartProofWorkflow is a two-step workflow — one human gate, one step
// after it — registrable against ADKEngine via CycleSteps() and satisfying
// orchestration.Workflow for the interface's sake, exactly like the e2e
// suite's noopWorkflow.
type restartProofWorkflow struct{}

func (restartProofWorkflow) Name() string                             { return restartProofWorkflowName }
func (restartProofWorkflow) Steps() []orchestration.Step              { return nil }
func (restartProofWorkflow) ConcurrencyKey(*orchestration.Run) string { return "" }
func (restartProofWorkflow) CycleSteps() []aim.Step {
	return []aim.Step{
		{
			Name:      "draft",
			HumanGate: true,
			Run: func(context.Context, aim.StepInput) (aim.StepOutput, error) {
				return aim.StepOutput{Step: "draft", BatchID: "restart-proof-batch"}, nil
			},
		},
		{
			Name: "apply",
			Run: func(context.Context, aim.StepInput) (aim.StepOutput, error) {
				return aim.StepOutput{Step: "apply"}, nil
			},
		},
	}
}

// runRestartProofHelper is the entire body of the crashing process. It must
// reach the gate and then stop doing anything gracefully — no Stop(), no
// signal handling, nothing that would make its death look like a clean
// shutdown.
func runRestartProofHelper() {
	dbName := os.Getenv(restartProofDBEnv)
	readyFile := os.Getenv(restartProofReadyFileEnv)
	if dbName == "" || readyFile == "" {
		fmt.Fprintln(os.Stderr, "helper: missing required env vars")
		os.Exit(2)
	}

	db := mustOpenDB(dbName)
	ctx := context.Background()

	store := aimadk.NewRunStore(db)
	sessions := adk.NewSessionStore(db)
	engine := aimadk.NewADKEngine(store, sessions, aimadk.ADKEngineConfig{AppName: "restart-proof"})
	engine.Register(restartProofWorkflow{})

	if err := engine.Start(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "helper: start:", err)
		os.Exit(2)
	}

	instanceID := uuid.New()
	run, err := engine.StartRun(ctx, restartProofWorkflowName, instanceID.String(), nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, "helper: start run:", err)
		os.Exit(2)
	}

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		got, err := engine.GetRun(ctx, run.ID)
		if err == nil && got.Status == orchestration.StatusAwaitingHuman {
			content := fmt.Sprintf("RUN_ID=%s\nINSTANCE_ID=%s\n", run.ID, instanceID)
			if err := os.WriteFile(readyFile, []byte(content), 0o600); err != nil {
				fmt.Fprintln(os.Stderr, "helper: write ready file:", err)
				os.Exit(2)
			}
			// Deliberately no Stop(), no signal handling, no cleanup of any
			// kind from here on. The parent's Process.Kill() ends this
			// process; nothing below is meant to run.
			//
			// A scheduled sleep, not select{}: by this point drive() has
			// already exited (an ADK run's driving goroutine does not block
			// waiting for a gate — see ADKEngine's doc comment), so the main
			// goroutine blocking with no pending event is exactly what Go's
			// runtime deadlock detector looks for, and it would crash this
			// process with "fatal error: all goroutines are asleep" before
			// the parent ever got to send a real SIGKILL. A pending timer
			// counts as an event the runtime could still wake for, so it does
			// not trigger the detector.
			time.Sleep(time.Hour)
			return
		}
		time.Sleep(20 * time.Millisecond)
	}

	fmt.Fprintln(os.Stderr, "helper: run never reached awaiting_human")
	os.Exit(2)
}

// mustOpenDB connects without running migrations — the parent already has,
// against the same database name.
func mustOpenDB(dbName string) *bun.DB {
	dsn := fmt.Sprintf("postgres://strategy:strategy@localhost:5433/%s?sslmode=disable", dbName)
	sqldb := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(dsn)))
	return bun.NewDB(sqldb, pgdialect.New())
}

// TestADKEngine_SurvivesRealProcessKill is B4f: proof that a run paused at a
// human gate survives its driving process being killed with no chance to run
// cleanup code, and that a completely separate process recovers it correctly.
func TestADKEngine_SurvivesRealProcessKill(t *testing.T) {
	if testing.Short() {
		t.Skip("spawns a real subprocess and sends it SIGKILL; skipped in -short")
	}

	dbName := createThrowawayDB(t)
	db := mustOpenDB(dbName)
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	readyFile := filepath.Join(t.TempDir(), "ready")

	cmd := exec.Command(os.Args[0])
	cmd.Env = append(os.Environ(),
		restartProofHelperEnv+"=1",
		restartProofDBEnv+"="+dbName,
		restartProofReadyFileEnv+"="+readyFile,
	)
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		t.Fatalf("start helper process: %v", err)
	}

	// The helper is killed unconditionally below, on every exit path,
	// including a t.Fatalf from this goroutine — leaving it running would
	// leak a process that keeps mutating the (dropped) throwaway database.
	killed := false
	killHelper := func() {
		if killed {
			return
		}
		killed = true
		if err := cmd.Process.Kill(); err != nil {
			t.Errorf("kill helper process: %v", err)
		}
		waitErr := cmd.Wait()
		// A killed process reports a non-nil Wait error carrying the signal.
		// If this were ever nil, the helper would have exited on its own —
		// meaning the test proved nothing about surviving an actual kill.
		if waitErr == nil {
			t.Error("helper process exited cleanly instead of being killed; this test would prove nothing")
		} else {
			t.Logf("helper process ended as expected: %v", waitErr)
		}
	}
	defer killHelper()

	runID, _ := waitForReadyFile(t, readyFile, 10*time.Second)

	// The actual crash: SIGKILL, not a graceful stop. No deferred function in
	// the helper — including any that would call Stop() — ever runs.
	killHelper()

	// Before recovering anything: does the gate's own durability hold, with
	// no engine involved at all yet? This isolates "did the kill corrupt the
	// row" from "does resume work".
	store := aimadk.NewRunStore(db)
	stillWaiting, err := store.GetByID(t.Context(), runID)
	if err != nil {
		t.Fatalf("get run after kill: %v", err)
	}
	if stillWaiting.Status != orchestration.StatusAwaitingHuman {
		t.Fatalf("run status after kill = %q, want awaiting_human", stillWaiting.Status)
	}
	if stillWaiting.Steps[0].BatchID != "restart-proof-batch" {
		t.Errorf("staged batch id lost across the crash: %+v", stillWaiting.Steps[0])
	}

	// Recovery: a fresh engine, in a different process than the one that
	// drove the run, sharing no Go value with it — only the database and the
	// workflow's name. This is exactly what cmd_serve.go does on every real
	// restart: register the workflow fresh, call Start(), and let stored
	// state carry the rest.
	sessions := adk.NewSessionStore(db)
	recovery := aimadk.NewADKEngine(store, sessions, aimadk.ADKEngineConfig{AppName: "restart-proof"})
	recovery.Register(restartProofWorkflow{})

	if err := recovery.Start(t.Context()); err != nil {
		t.Fatalf("recovery engine start: %v", err)
	}
	defer func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = recovery.Stop(stopCtx)
	}()

	// Start() must not have marked this run failed: it is awaiting_human, not
	// pending/running, and ADK needs no in-memory recovery for that state —
	// see MarkStaleFailed's doc comment.
	untouched, err := recovery.GetRun(t.Context(), runID)
	if err != nil {
		t.Fatalf("get run after recovery engine start: %v", err)
	}
	if untouched.Status != orchestration.StatusAwaitingHuman {
		t.Fatalf("recovery engine's Start() touched an awaiting_human run: now %q", untouched.Status)
	}

	if err := recovery.Resume(t.Context(), runID, true); err != nil {
		t.Fatalf("resume after crash: %v", err)
	}

	done := awaitEngineStatus(t, recovery, runID, orchestration.StatusCompleted)
	if stepIn(t, done, "apply").Status != "done" {
		t.Errorf("apply did not run after resume: %+v", done.Steps)
	}
	if stepIn(t, done, "draft").GateOutcome != orchestration.GateCommitted {
		t.Errorf("draft's GateOutcome = %q, want committed", stepIn(t, done, "draft").GateOutcome)
	}
}

// createThrowawayDB mirrors database.TestDB's create/drop dance, but returns
// the name rather than a connection: the helper subprocess needs to open its
// own connection to the same database, which database.TestDB has no way to
// express since it is scoped to a single in-process *testing.T.
func createThrowawayDB(t *testing.T) string {
	t.Helper()

	dbName := fmt.Sprintf("strategy_test_restartproof_%06d", rand.Intn(1_000_000)) //nolint:gosec

	maintenanceDSN := "postgres://strategy:strategy@localhost:5433/postgres?sslmode=disable"
	maintenanceSQL := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(maintenanceDSN)))
	t.Cleanup(func() { _ = maintenanceSQL.Close() })

	if _, err := maintenanceSQL.Exec(fmt.Sprintf(`DROP DATABASE IF EXISTS %q WITH (FORCE)`, dbName)); err != nil {
		t.Fatalf("drop old database %q: %v", dbName, err)
	}
	if _, err := maintenanceSQL.Exec(fmt.Sprintf(`CREATE DATABASE %q OWNER strategy`, dbName)); err != nil {
		t.Fatalf("create database %q: %v", dbName, err)
	}
	t.Cleanup(func() {
		_, _ = maintenanceSQL.Exec(fmt.Sprintf(`DROP DATABASE IF EXISTS %q WITH (FORCE)`, dbName))
	})

	return dbName
}

// waitForReadyFile polls for the helper's ready file and parses RUN_ID.
func waitForReadyFile(t *testing.T, path string, timeout time.Duration) (runID uuid.UUID, instanceID uuid.UUID) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		content, err := os.ReadFile(path)
		if err == nil {
			var runIDStr, instanceIDStr string
			if _, scanErr := fmt.Sscanf(string(content), "RUN_ID=%s\nINSTANCE_ID=%s\n", &runIDStr, &instanceIDStr); scanErr == nil {
				runID, err := uuid.Parse(runIDStr)
				if err != nil {
					t.Fatalf("ready file has invalid run id %q: %v", runIDStr, err)
				}
				instanceID, err := uuid.Parse(instanceIDStr)
				if err != nil {
					t.Fatalf("ready file has invalid instance id %q: %v", instanceIDStr, err)
				}
				return runID, instanceID
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("helper process never reached its gate within %s (no ready file at %s)", timeout, path)
	return uuid.Nil, uuid.Nil
}
