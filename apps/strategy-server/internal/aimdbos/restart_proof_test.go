package aimdbos_test

// Real restart-resume proof, and a deploy-survival proof — the two DBOS
// kill criteria from harden-aim-execution/decision.md that this codebase
// had already answered for ADK (internal/aimadk/restart_proof_test.go) and
// had explicitly not yet answered for DBOS at the time that decision was
// written. Both are answered here directly, not assumed.
//
// Method note, same as ADK's: a driving goroutine cannot be proven to
// survive a crash by discarding an in-process Go value and constructing a
// new one — the old goroutine keeps running and would corrupt the test.
// The only genuine proof is a separate OS process, killed with a signal it
// cannot catch. See internal/aimadk/restart_proof_test.go's own comment for
// the full reasoning; it applies unchanged here.

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
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimdbos"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

const restartProofHelperEnv = "AIMDBOS_RESTART_PROOF_HELPER"
const restartProofDBEnv = "AIMDBOS_RESTART_PROOF_DB"
const restartProofReadyFileEnv = "AIMDBOS_RESTART_PROOF_READY_FILE"
const restartProofAppVersionEnv = "AIMDBOS_RESTART_PROOF_APP_VERSION"
const restartProofWorkflowName = "restart_proof_cycle"

func TestMain(m *testing.M) {
	if os.Getenv(restartProofHelperEnv) != "" {
		runRestartProofHelper()
		return // unreached: runRestartProofHelper blocks forever on success
	}
	os.Exit(m.Run())
}

type restartProofWorkflow struct{}

func (restartProofWorkflow) Name() string { return restartProofWorkflowName }
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
// reach the gate — i.e. block inside cycleWorkflow's dbos.Recv call — and
// then stop doing anything gracefully.
func runRestartProofHelper() {
	dbName := os.Getenv(restartProofDBEnv)
	readyFile := os.Getenv(restartProofReadyFileEnv)
	appVersion := os.Getenv(restartProofAppVersionEnv)
	if dbName == "" || readyFile == "" {
		fmt.Fprintln(os.Stderr, "helper: missing required env vars")
		os.Exit(2)
	}

	dsn := testDSNFor(dbName)
	db := mustOpenBunDB(dsn)
	ctx := context.Background()

	if appVersion == "" {
		appVersion = "restart-proof-v1" // default when the deploy-survival test does not override it
	}

	store := aimdbos.NewRunStore(db)
	engine, err := aimdbos.NewDBOSEngine(store, aimdbos.DBOSEngineConfig{
		AppName:            "restart-proof",
		DatabaseURL:        dsn,
		ApplicationVersion: appVersion,
		AbandonGatesAfter:  time.Hour,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "helper: new engine:", err)
		os.Exit(2)
	}
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
			content := fmt.Sprintf("RUN_ID=%s\n", run.ID)
			if err := os.WriteFile(readyFile, []byte(content), 0o600); err != nil {
				fmt.Fprintln(os.Stderr, "helper: write ready file:", err)
				os.Exit(2)
			}
			// Deliberately no Stop(), no signal handling, no cleanup. A
			// scheduled sleep, not select{}: the workflow's own goroutine is
			// blocked in Recv (a real pending DB wait, per design.md's probe
			// 4), which counts as a live goroutine, but this main-goroutine
			// sleep avoids relying on that fact for the process to stay up
			// long enough to be killed.
			time.Sleep(time.Hour)
			return
		}
		time.Sleep(20 * time.Millisecond)
	}

	fmt.Fprintln(os.Stderr, "helper: run never reached awaiting_human")
	os.Exit(2)
}

func testDSNFor(dbName string) string {
	return fmt.Sprintf("postgres://strategy:strategy@localhost:5433/%s?sslmode=disable", dbName)
}

func mustOpenBunDB(dsn string) *bun.DB {
	sqldb := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(dsn)))
	return bun.NewDB(sqldb, pgdialect.New())
}

// TestDBOSEngine_SurvivesRealProcessKill is kill criterion 1
// (decision.md): a run parked at a human gate survives its driving process
// being killed with no chance to run cleanup code, and a completely
// separate process recovers it correctly.
func TestDBOSEngine_SurvivesRealProcessKill(t *testing.T) {
	if testing.Short() {
		t.Skip("spawns a real subprocess and sends it SIGKILL; skipped in -short")
	}

	dbName := createThrowawayDB(t)
	dsn := testDSNFor(dbName)
	db := mustOpenBunDB(dsn)
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
		if waitErr == nil {
			t.Error("helper process exited cleanly instead of being killed; this test would prove nothing")
		} else {
			t.Logf("helper process ended as expected: %v", waitErr)
		}
	}
	defer killHelper()

	runID := waitForReadyFile(t, readyFile, 10*time.Second)

	// The actual crash: SIGKILL. No deferred function in the helper —
	// including any that would call Stop() — ever runs.
	killHelper()

	// Before recovering anything: does the gate's own durability hold, with
	// no engine involved yet? Isolates "did the kill corrupt the row" from
	// "does resume work".
	store := aimdbos.NewRunStore(db)
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
	// drove the run, sharing no Go value with it — only the database and
	// the workflow's name. This is exactly what cmd_serve.go does on every
	// real restart.
	recovery, err := aimdbos.NewDBOSEngine(store, aimdbos.DBOSEngineConfig{
		AppName:            "restart-proof",
		DatabaseURL:        dsn,
		ApplicationVersion: "restart-proof-v1", // same version the helper used — no deploy happened
		AbandonGatesAfter:  time.Hour,
	})
	if err != nil {
		t.Fatalf("new recovery engine: %v", err)
	}
	recovery.Register(restartProofWorkflow{})

	if err := recovery.Start(t.Context()); err != nil {
		t.Fatalf("recovery engine start: %v", err)
	}
	defer func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = recovery.Stop(stopCtx)
	}()

	// Start() (DBOS's own Launch) must not have disturbed this run: still
	// awaiting_human, not failed.
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

// TestDBOSEngine_SurvivesDeployAcrossAnOpenGate is kill criterion 2
// (decision.md) — the one named "most likely to fail": does a multi-week
// park survive a deploy of new application code?
//
// The answer is conditional, and this test proves the condition that makes
// it pass: **strategy-server must pin ApplicationVersion to a stable,
// explicit string and never leave it at DBOS's default.** Confirmed by
// direct probe (design.md): DBOS's default, when ApplicationVersion is
// unset, hashes the *entire compiled binary*
// (computeApplicationVersion → getBinaryHash, in DBOS's own source) — not
// just this package's code — so leaving it at that default would change
// the version, and strand every open gate, on literally any deploy of
// strategy-server, including ones that touch nothing under domain/aim.
//
// This test simulates the realistic case: a deploy that does not change
// the AIM cycle's own shape keeps the same pinned ApplicationVersion, and
// must recover normally — DBOSEngine sets this from config, not from
// DBOS's default, which is what DBOSEngineConfig.ApplicationVersion's own
// doc comment requires. The companion test below,
// TestDBOSEngine_ApplicationVersionChange_OrphansOpenGate, proves and
// documents the failure mode this one is designed to avoid.
func TestDBOSEngine_SurvivesDeployAcrossAnOpenGate(t *testing.T) {
	if testing.Short() {
		t.Skip("spawns a real subprocess and sends it SIGKILL; skipped in -short")
	}

	dbName := createThrowawayDB(t)
	dsn := testDSNFor(dbName)
	db := mustOpenBunDB(dsn)
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	readyFile := filepath.Join(t.TempDir(), "ready")

	const pinnedVersion = "aim-cycle-shape-v1"

	cmd := exec.Command(os.Args[0])
	cmd.Env = append(os.Environ(),
		restartProofHelperEnv+"=1",
		restartProofDBEnv+"="+dbName,
		restartProofReadyFileEnv+"="+readyFile,
		restartProofAppVersionEnv+"="+pinnedVersion,
	)
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		t.Fatalf("start helper process: %v", err)
	}

	killed := false
	killHelper := func() {
		if killed {
			return
		}
		killed = true
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}
	defer killHelper()

	runID := waitForReadyFile(t, readyFile, 10*time.Second)
	killHelper()

	store := aimdbos.NewRunStore(db)

	// The "deploy": a brand new process, same pinned version — representing
	// a strategy-server release that did not change AIM's own step shape.
	recovery, err := aimdbos.NewDBOSEngine(store, aimdbos.DBOSEngineConfig{
		AppName:            "restart-proof",
		DatabaseURL:        dsn,
		ApplicationVersion: pinnedVersion,
		AbandonGatesAfter:  time.Hour,
	})
	if err != nil {
		t.Fatalf("new recovery engine: %v", err)
	}
	recovery.Register(restartProofWorkflow{})

	if err := recovery.Start(t.Context()); err != nil {
		t.Fatalf("recovery engine start: %v", err)
	}
	defer func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = recovery.Stop(stopCtx)
	}()

	stillWaiting, err := recovery.GetRun(t.Context(), runID)
	if err != nil {
		t.Fatalf("get run after the simulated deploy: %v", err)
	}
	if stillWaiting.Status != orchestration.StatusAwaitingHuman {
		t.Fatalf("run status after the simulated deploy = %q, want awaiting_human", stillWaiting.Status)
	}

	if err := recovery.Resume(t.Context(), runID, true); err != nil {
		t.Fatalf("resume after the simulated deploy: %v — kill criterion 2 has failed", err)
	}

	done := awaitEngineStatus(t, recovery, runID, orchestration.StatusCompleted)
	if stepIn(t, done, "apply").Status != "done" {
		t.Errorf("apply did not run after resume: %+v", done.Steps)
	}
}

// TestDBOSEngine_ApplicationVersionChange_OrphansOpenGate documents,
// deliberately, the failure mode TestDBOSEngine_SurvivesDeployAcrossAnOpenGate
// is designed to avoid — this is not a bug being tolerated, it is the exact
// boundary of kill criterion 2, verified rather than assumed.
//
// Confirmed by direct probe: when a workflow parked in Recv is revived
// under a *different* ApplicationVersion, DBOS's automatic Launch-time
// recovery does not pick it up, and even an explicit dbos.ResumeWorkflow
// call only advances its status from PENDING to ENQUEUED — it is never
// actually dequeued and executed, with no error surfaced anywhere. Silence,
// not a clean failure, is what an ApplicationVersion mismatch produces.
//
// The operational consequence, to be handled procedurally (not solved in
// code by this change): changing the AIM cycle's own step shape requires
// bumping ApplicationVersion, and doing so requires first confirming no run
// is parked at a gate — the "blue-green: drain before deploying" cost
// harden-aim-execution/decision.md named as DBOS's central risk. This test
// exists so that cost is never rediscovered by surprise in production.
func TestDBOSEngine_ApplicationVersionChange_OrphansOpenGate(t *testing.T) {
	if testing.Short() {
		t.Skip("spawns a real subprocess and sends it SIGKILL; skipped in -short")
	}

	dbName := createThrowawayDB(t)
	dsn := testDSNFor(dbName)
	db := mustOpenBunDB(dsn)
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
		restartProofAppVersionEnv+"=aim-cycle-shape-v1",
	)
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		t.Fatalf("start helper process: %v", err)
	}

	killed := false
	killHelper := func() {
		if killed {
			return
		}
		killed = true
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}
	defer killHelper()

	runID := waitForReadyFile(t, readyFile, 10*time.Second)
	killHelper()

	store := aimdbos.NewRunStore(db)

	// A DIFFERENT version — an AIM-shape change deployed without draining
	// first.
	recovery, err := aimdbos.NewDBOSEngine(store, aimdbos.DBOSEngineConfig{
		AppName:            "restart-proof",
		DatabaseURL:        dsn,
		ApplicationVersion: "aim-cycle-shape-v2",
		AbandonGatesAfter:  time.Hour,
	})
	if err != nil {
		t.Fatalf("new recovery engine: %v", err)
	}
	recovery.Register(restartProofWorkflow{})
	if err := recovery.Start(t.Context()); err != nil {
		t.Fatalf("recovery engine start (v2) failed to launch at all: %v", err)
	}
	defer func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = recovery.Stop(stopCtx)
	}()

	// aim_cycle_runs (this engine's own bookkeeping) still correctly shows
	// awaiting_human — that row is version-independent, it is DBOS's own
	// workflow that is now unreachable.
	stillWaiting, err := recovery.GetRun(t.Context(), runID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if stillWaiting.Status != orchestration.StatusAwaitingHuman {
		t.Fatalf("run status = %q, want awaiting_human (aim_cycle_runs is version-independent)", stillWaiting.Status)
	}

	// Resume does not error — Send is a durable write that always
	// succeeds regardless of whether anything is listening — but the run
	// must not complete, because nothing under v2 will ever execute a
	// workflow instance recorded under v1.
	if err := recovery.Resume(t.Context(), runID, true); err != nil {
		t.Fatalf("resume: %v (expected to succeed without error, then go nowhere)", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		got, err := recovery.GetRun(t.Context(), runID)
		if err == nil && got.Status == orchestration.StatusCompleted {
			t.Fatal("run completed despite an ApplicationVersion mismatch — the orphaning this test documents no longer reproduces; if DBOS fixed this, update design.md and DBOSEngineConfig's doc comment, this is good news")
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Log("confirmed: an ApplicationVersion change stranded the parked run, as documented — this is why ApplicationVersion must only change with a drain procedure")
}

func createThrowawayDB(t *testing.T) string {
	t.Helper()

	dbName := fmt.Sprintf("strategy_test_dbosrestartproof_%06d", rand.Intn(1_000_000)) //nolint:gosec

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

func waitForReadyFile(t *testing.T, path string, timeout time.Duration) uuid.UUID {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		content, err := os.ReadFile(path)
		if err == nil {
			var runIDStr string
			if _, scanErr := fmt.Sscanf(string(content), "RUN_ID=%s\n", &runIDStr); scanErr == nil {
				runID, err := uuid.Parse(runIDStr)
				if err != nil {
					t.Fatalf("ready file has invalid run id %q: %v", runIDStr, err)
				}
				return runID
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("helper process never reached its gate within %s (no ready file at %s)", timeout, path)
	return uuid.Nil
}
