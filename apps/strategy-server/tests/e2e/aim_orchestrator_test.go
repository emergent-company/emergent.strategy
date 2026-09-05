// Package e2e contains integration tests for the AIM cycle orchestrator HTTP endpoints.
// Tests run against a real Postgres database (via database.TestDB) and an httptest
// server with the full Echo + handler stack. No live server, Chrome, or LLM required.
//
// Run: go test ./tests/e2e/... -v -timeout 60s
package e2e

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	strategydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimdbos"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	internaldom "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/handler"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

// testEnv bundles a test database, Echo server, orchestration engine, and a
// seeded strategy instance. Every test gets an isolated environment.
type testEnv struct {
	DB         *bun.DB
	Echo       *echo.Echo
	Engine     orchestration.EngineAPI
	InstanceID uuid.UUID
	BaseURL    string // e.g. "/strategies/<uuid>"
}

// noopWorkflow is a workflow whose steps complete instantly without doing any
// real work. It satisfies orchestration.Workflow (Name()) and ADKEngine's
// structural cast (CycleSteps()).
type noopWorkflow struct {
	name  string
	cycle []aim.Step
}

func (w *noopWorkflow) Name() string           { return w.name }
func (w *noopWorkflow) CycleSteps() []aim.Step { return w.cycle }

// newNoopWorkflow creates a workflow with steps that complete instantly.
// Two human gates in sequence, not one: a real AIM cycle has four, and a
// fixture with only one gate cannot exercise a step correctly identifying
// which gate is currently open once more than one has been opened and
// cleared. That gap let a real bug through this exact test file's coverage —
// found only by clicking through the browser, because every fixture here had
// at most one gate. See TestMultiGateRun_BothGatesResumeCorrectly, the test
// this shape exists to support.
func newNoopWorkflow(name string) *noopWorkflow {
	batch1, batch2 := uuid.New().String(), uuid.New().String()
	return &noopWorkflow{
		name: name,
		cycle: []aim.Step{
			{
				Name:      "draft_assessment",
				HumanGate: true,
				Run: func(_ context.Context, _ aim.StepInput) (aim.StepOutput, error) {
					return aim.StepOutput{
						Step:    "draft_assessment",
						BatchID: batch1,
						Meta:    map[string]any{"llm_used": false},
					}, nil
				},
			},
			{
				Name:      "draft_calibration",
				HumanGate: true,
				Run: func(_ context.Context, _ aim.StepInput) (aim.StepOutput, error) {
					return aim.StepOutput{
						Step:    "draft_calibration",
						BatchID: batch2,
						Meta:    map[string]any{"llm_used": false},
					}, nil
				},
			},
			{
				Name: "snapshot",
				Run: func(_ context.Context, _ aim.StepInput) (aim.StepOutput, error) {
					return aim.StepOutput{Step: "snapshot"}, nil
				},
			},
		},
	}
}

// newFlakySnapshotWorkflow is newNoopWorkflow's shape, except its final
// ungated step fails on its first invocation and succeeds on every one
// after — the scenario retry exists for. count lets a test assert directly
// on how many times each step actually ran, including the gated ones ahead
// of it, which retry must never re-execute.
func newFlakySnapshotWorkflow(name string, gate1Runs, gate2Runs, snapshotRuns *atomic.Int32) *noopWorkflow {
	batch1, batch2 := uuid.New().String(), uuid.New().String()
	return &noopWorkflow{
		name: name,
		cycle: []aim.Step{
			{
				Name:      "draft_assessment",
				HumanGate: true,
				Run: func(_ context.Context, _ aim.StepInput) (aim.StepOutput, error) {
					gate1Runs.Add(1)
					return aim.StepOutput{Step: "draft_assessment", BatchID: batch1}, nil
				},
			},
			{
				Name:      "draft_calibration",
				HumanGate: true,
				Run: func(_ context.Context, _ aim.StepInput) (aim.StepOutput, error) {
					gate2Runs.Add(1)
					return aim.StepOutput{Step: "draft_calibration", BatchID: batch2}, nil
				},
			},
			{
				Name: "snapshot",
				Run: func(_ context.Context, _ aim.StepInput) (aim.StepOutput, error) {
					if snapshotRuns.Add(1) == 1 {
						return aim.StepOutput{}, errE2ESnapshotFailure
					}
					return aim.StepOutput{Step: "snapshot"}, nil
				},
			},
		},
	}
}

var errE2ESnapshotFailure = fmt.Errorf("snapshot: transient e2e test failure")

// setupTestEnv creates a test environment with database, Echo server, handler,
// and orchestration engine. The engine runs a noop workflow named "aim_cycle".
func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	return setupTestEnvWithWorkflow(t, newNoopWorkflow("aim_cycle"))
}

// setupTestEnvWithWorkflow is setupTestEnv parameterised on the workflow, so
// tests that need non-default step behaviour (e.g. a step that fails once,
// for retry coverage) do not have to duplicate the database/handler wiring.
func setupTestEnvWithWorkflow(t *testing.T, wf *noopWorkflow) *testEnv {
	t.Helper()

	db, dsn := database.TestDBWithDSN(t)
	ctx := context.Background()
	log := slog.Default()

	// Seed an org, workspace, and instance.
	orgID := uuid.New()
	_, err := db.ExecContext(ctx,
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "E2E Org", "e2e-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}

	wsID := uuid.New()
	_, err = db.NewInsert().Model(&internaldom.Workspace{
		ID:          wsID,
		GithubOwner: "e2e-ws-" + wsID.String()[:8],
		OrgID:       orgID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	_, err = db.NewInsert().Model(&internaldom.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "E2E Test Instance",
		Status:      internaldom.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}

	// Build the orchestration engine and register the workflow against it —
	// the same construction cmd_serve.go does.
	runStore := aimdbos.NewRunStore(db)
	engineImpl, err := aimdbos.NewDBOSEngine(runStore, aimdbos.DBOSEngineConfig{
		AppName:            "e2e-test",
		DatabaseURL:        dsn,
		ApplicationVersion: "e2e-test-v1",
		AbandonGatesAfter:  time.Hour,
	})
	if err != nil {
		t.Fatalf("new engine: %v", err)
	}
	var engine orchestration.EngineAPI = engineImpl
	engine.Register(wf)

	if err := engine.Start(ctx); err != nil {
		t.Fatalf("engine start: %v", err)
	}
	t.Cleanup(func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = engine.Stop(stopCtx)
	})

	// Build handler with just the services needed for AIM orchestrator endpoints.
	strategySvc := strategydom.NewService(db)
	semanticSvc := semantic.NewService(semantic.Config{})

	webHandler := handler.New(db, log, semanticSvc).
		WithStrategy(strategySvc).
		WithOrchestration(engine)

	e := echo.New()
	e.HideBanner = true
	webHandler.RegisterRoutes(e)

	return &testEnv{
		DB:         db,
		Echo:       e,
		Engine:     engine,
		InstanceID: instID,
		BaseURL:    "/strategies/" + instID.String(),
	}
}

// startHTTPServer creates an httptest.Server from the Echo instance.
// Used for tests that need real HTTP transport (e.g., SSE streaming).
func (env *testEnv) startHTTPServer(t *testing.T) *httptest.Server {
	t.Helper()
	ts := httptest.NewServer(env.Echo)
	t.Cleanup(ts.Close)
	return ts
}

// request issues an HTTP request against the Echo server and returns the response.
func (env *testEnv) request(t *testing.T, method, path string, headers map[string]string) *http.Response {
	t.Helper()

	// Use Echo's test server.
	server := env.Echo.Server
	_ = server // not used directly — we call ServeHTTP

	req, err := http.NewRequest(method, path, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	rec := newResponseRecorder()
	env.Echo.ServeHTTP(rec, req)

	resp := rec.Result()
	// Close the synthesized response body at test end so callers don't each
	// have to (satisfies bodyclose; the body is an in-memory reader).
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

// responseRecorder wraps http.ResponseWriter to capture status, headers, and body.
type responseRecorder struct {
	statusCode int
	header     http.Header
	body       *strings.Builder
}

func newResponseRecorder() *responseRecorder {
	return &responseRecorder{
		header: make(http.Header),
		body:   &strings.Builder{},
	}
}

func (r *responseRecorder) Header() http.Header  { return r.header }
func (r *responseRecorder) WriteHeader(code int) { r.statusCode = code }
func (r *responseRecorder) Write(b []byte) (int, error) {
	if r.statusCode == 0 {
		r.statusCode = 200
	}
	return r.body.Write(b)
}
func (r *responseRecorder) Flush() {} // no-op for SSE test

func (r *responseRecorder) Result() *http.Response {
	if r.statusCode == 0 {
		r.statusCode = 200
	}
	return &http.Response{
		StatusCode: r.statusCode,
		Header:     r.header,
		Body:       io.NopCloser(strings.NewReader(r.body.String())),
	}
}

// ---------------------------------------------------------------------------
// Test: POST /aim/runs — starts a run and redirects to run panel
// ---------------------------------------------------------------------------

func TestStartRun_RedirectsToRunPanel(t *testing.T) {
	env := setupTestEnv(t)

	resp := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)

	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("expected 303 redirect, got %d", resp.StatusCode)
	}

	loc := resp.Header.Get("Location")
	if !strings.Contains(loc, "/aim/runs/") {
		t.Errorf("redirect should point to /aim/runs/:runID, got Location: %s", loc)
	}

	// Verify the run exists in the engine.
	runID := loc[strings.LastIndex(loc, "/")+1:]
	parsedID, err := uuid.Parse(runID)
	if err != nil {
		t.Fatalf("redirect location contains invalid run ID %q: %v", runID, err)
	}

	run, err := env.Engine.GetRun(context.Background(), parsedID)
	if err != nil {
		t.Fatalf("GetRun: %v", err)
	}
	if run.WorkflowName != "aim_cycle" {
		t.Errorf("expected workflow aim_cycle, got %s", run.WorkflowName)
	}
}

// ---------------------------------------------------------------------------
// Test: duplicate POST /aim/runs — returns 409 (HTMX) or 303 to /aim (browser)
// ---------------------------------------------------------------------------

func TestDuplicateRun_HTMX_Returns409(t *testing.T) {
	env := setupTestEnv(t)

	// Start first run.
	resp1 := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)
	if resp1.StatusCode != http.StatusSeeOther {
		t.Fatalf("first POST: expected 303, got %d", resp1.StatusCode)
	}

	// Wait for the run to be picked up by the worker.
	time.Sleep(100 * time.Millisecond)

	// Second run with HX-Request header — should get 409.
	resp2 := env.request(t, "POST", env.BaseURL+"/aim/runs", map[string]string{
		"HX-Request": "true",
	})

	if resp2.StatusCode != http.StatusConflict {
		t.Errorf("HTMX duplicate POST: expected 409 Conflict, got %d", resp2.StatusCode)
	}
}

func TestDuplicateRun_Browser_RedirectsToAIM(t *testing.T) {
	env := setupTestEnv(t)

	// Start first run.
	resp1 := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)
	if resp1.StatusCode != http.StatusSeeOther {
		t.Fatalf("first POST: expected 303, got %d", resp1.StatusCode)
	}

	// Wait for the run to be picked up by the worker.
	time.Sleep(100 * time.Millisecond)

	// Second run without HX-Request header — should redirect to /aim.
	resp2 := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)

	if resp2.StatusCode != http.StatusSeeOther {
		t.Fatalf("browser duplicate POST: expected 303, got %d", resp2.StatusCode)
	}

	loc := resp2.Header.Get("Location")
	expectedRedirect := "/strategies/" + env.InstanceID.String() + "/aim"
	if loc != expectedRedirect {
		t.Errorf("expected redirect to %s, got %s", expectedRedirect, loc)
	}
}

// ---------------------------------------------------------------------------
// Test: GET /aim/runs/:runID — returns 200 with run panel HTML
// ---------------------------------------------------------------------------

func TestGetRun_ReturnsRunPanel(t *testing.T) {
	env := setupTestEnv(t)

	// Start a run.
	resp := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("start run: expected 303, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	runID := loc[strings.LastIndex(loc, "/")+1:]

	// Wait for the worker to pick up the run and execute the first step.
	time.Sleep(500 * time.Millisecond)

	// GET the run panel.
	panelResp := env.request(t, "GET", env.BaseURL+"/aim/runs/"+runID, nil)
	if panelResp.StatusCode != http.StatusOK {
		t.Fatalf("GET run panel: expected 200, got %d", panelResp.StatusCode)
	}

	body, _ := io.ReadAll(panelResp.Body)
	html := string(body)

	// The run panel should contain every step name from our noop workflow,
	// including draft_calibration — which has not executed yet at this point
	// (the run is paused at draft_assessment's gate). This is the exact
	// placeholder-pre-population behaviour fixed earlier: a not-yet-run step
	// must still render, or a run paused at the first of several gates would
	// silently hide the rest of the pipeline from the reviewer.
	for _, want := range []struct{ raw, human string }{
		{"draft_assessment", "Draft Assessment"},
		{"draft_calibration", "Draft Calibration"},
		{"snapshot", "Snapshot"},
	} {
		if !strings.Contains(html, want.raw) && !strings.Contains(html, want.human) {
			t.Errorf("run panel HTML should mention %s step", want.raw)
		}
	}

	// The stream URL should be present for SSE.
	expectedStreamURL := fmt.Sprintf("/strategies/%s/aim/runs/%s/stream", env.InstanceID, runID)
	if !strings.Contains(html, expectedStreamURL) {
		t.Errorf("run panel should contain stream URL %s", expectedStreamURL)
	}
}

// ---------------------------------------------------------------------------
// Test: GET /aim/runs/:runID — invalid run ID returns 400
// ---------------------------------------------------------------------------

func TestGetRun_InvalidID_Returns400(t *testing.T) {
	env := setupTestEnv(t)

	resp := env.request(t, "GET", env.BaseURL+"/aim/runs/not-a-uuid", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid run ID, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Test: GET /aim/runs/:runID — nonexistent run returns 404
// ---------------------------------------------------------------------------

func TestGetRun_NotFound_Returns404(t *testing.T) {
	env := setupTestEnv(t)

	fakeID := uuid.New().String()
	resp := env.request(t, "GET", env.BaseURL+"/aim/runs/"+fakeID, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 for nonexistent run, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Test: GET /aim/runs/:runID/stream — returns SSE content type
// ---------------------------------------------------------------------------

func TestSSEStream_ContentType(t *testing.T) {
	env := setupTestEnv(t)

	// Start a run so we have a valid runID.
	resp := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("start run: expected 303, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	runID := loc[strings.LastIndex(loc, "/")+1:]

	// Wait for worker to pick up the run.
	time.Sleep(200 * time.Millisecond)

	// The SSE handler enters an infinite polling loop, so we can't call it via
	// ServeHTTP synchronously. Instead, use an httptest.Server and a short-timeout
	// HTTP client that reads only the headers + first bytes.
	ts := env.startHTTPServer(t)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", ts.URL+env.BaseURL+"/aim/runs/"+runID+"/stream", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{}
	sseResp, err := client.Do(req)
	if err != nil {
		// Context timeout is expected — the SSE stream runs forever.
		// We should have gotten the headers before the timeout.
		t.Logf("SSE request ended (expected for stream): %v", err)
		return
	}
	defer sseResp.Body.Close()

	ct := sseResp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/event-stream") {
		t.Errorf("SSE endpoint should return Content-Type: text/event-stream, got %q", ct)
	}
	if sseResp.StatusCode != http.StatusOK {
		t.Errorf("SSE endpoint should return 200, got %d", sseResp.StatusCode)
	}

	// Read a few bytes to confirm the server is sending data.
	buf := make([]byte, 64)
	n, _ := io.ReadAtLeast(sseResp.Body, buf, 1)
	if n > 0 {
		t.Logf("SSE stream sent %d bytes: %q", n, string(buf[:n]))
	}
	t.Logf("SSE endpoint OK — Content-Type: %s", ct)
}

// ---------------------------------------------------------------------------
// Test: resuming two sequential human gates
// ---------------------------------------------------------------------------

// TestMultiGateRun_BothGatesResumeCorrectly exists because no other test in
// this file ever calls Resume at all, at any gate count. A run being
// resumable was simply never covered at this layer.
//
// It also pins the exact bug found by manual testing: a gate that cleared did
// not have its Status flipped away from "awaiting_human", so once a second
// gate opened, the code that finds "the currently open gate" kept finding the
// first, already-resolved one instead — and resumed it with a stale interrupt
// id, which ADK correctly rejected. One gate could never reveal this; it
// needs two, resumed in sequence, through the same engine construction
// setupTestEnv gives the real HTTP handlers — not a synthetic engine built
// just for a unit test.
func TestMultiGateRun_BothGatesResumeCorrectly(t *testing.T) {
	env := setupTestEnv(t)
	ctx := context.Background()

	resp := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("start run: expected 303, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	runID, err := uuid.Parse(loc[strings.LastIndex(loc, "/")+1:])
	if err != nil {
		t.Fatalf("redirect location contains invalid run ID %q: %v", loc, err)
	}

	// First gate.
	run := awaitRunStep(t, env, runID, orchestration.StatusAwaitingHuman, "draft_assessment")
	batch1 := run.Steps[0].BatchID
	if batch1 == "" {
		t.Fatal("first gate opened with no batch id")
	}

	if err := env.Engine.Resume(ctx, runID, true); err != nil {
		t.Fatalf("resume first gate: %v", err)
	}

	// Second gate. Polling for status alone would be ambiguous: the run was
	// already awaiting_human once, and Resume returns before the engine's
	// first post-resume write lands, so a poll landing in that window could
	// catch the FIRST gate's now-stale status. Waiting for CurrentStep too
	// pins it to the second gate specifically — see awaitRunStep.
	run = awaitRunStep(t, env, runID, orchestration.StatusAwaitingHuman, "draft_calibration")
	batch2 := run.Steps[1].BatchID
	if batch2 == "" {
		t.Fatal("second gate opened with no batch id")
	}
	if batch2 == batch1 {
		t.Fatal("second gate has the same batch id as the first — steps are not being distinguished")
	}
	// The exact field the real bug leaves wrong: the first gate must have
	// been closed out, not left open forever.
	if got := run.Steps[0].Status; got != "done" {
		t.Fatalf("first gate's Status = %q after it cleared, want done", got)
	}

	if err := env.Engine.Resume(ctx, runID, true); err != nil {
		t.Fatalf("resume second gate: %v", err)
	}

	run = awaitRunStatus(t, env, runID, orchestration.StatusCompleted)
	for _, name := range []string{"draft_assessment", "draft_calibration", "snapshot"} {
		found := false
		for _, s := range run.Steps {
			if s.Name == name {
				found = true
				if s.Status != "done" {
					t.Errorf("%s.Status = %q, want done", name, s.Status)
				}
			}
		}
		if !found {
			t.Errorf("step %q missing from completed run", name)
		}
	}
	if run.Steps[0].GateOutcome != orchestration.GateCommitted {
		t.Errorf("draft_assessment.GateOutcome = %q, want committed", run.Steps[0].GateOutcome)
	}
	if run.Steps[1].GateOutcome != orchestration.GateCommitted {
		t.Errorf("draft_calibration.GateOutcome = %q, want committed", run.Steps[1].GateOutcome)
	}
}

// awaitRunStatus polls until the run reaches want.
func awaitRunStatus(t *testing.T, env *testEnv, runID uuid.UUID, want orchestration.RunStatus) *orchestration.Run {
	t.Helper()
	return awaitRunStep(t, env, runID, want, "")
}

// awaitRunStep polls until the run reaches wantStatus, and — when wantStep is
// non-empty — CurrentStep == wantStep too. The combined check disambiguates a
// status the run can revisit more than once (awaiting_human, once per gate)
// from an earlier, now-stale occurrence of the same status.
func awaitRunStep(t *testing.T, env *testEnv, runID uuid.UUID, wantStatus orchestration.RunStatus, wantStep string) *orchestration.Run {
	t.Helper()

	deadline := time.Now().Add(10 * time.Second)
	var lastStatus orchestration.RunStatus
	var lastStep string
	for time.Now().Before(deadline) {
		run, err := env.Engine.GetRun(context.Background(), runID)
		if err == nil {
			lastStatus, lastStep = run.Status, run.CurrentStep
			if run.Status == wantStatus && (wantStep == "" || run.CurrentStep == wantStep) {
				return run
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("run %s never reached status=%s step=%q (last status=%q step=%q)",
		runID, wantStatus, wantStep, lastStatus, lastStep)
	return nil
}

// ---------------------------------------------------------------------------
// Test: POST /aim/runs/:runID/retry — through the real handler path
// ---------------------------------------------------------------------------

// TestRetryRun_HandlerPath_SkipsCompletedGatedStepsAndSucceeds exists because
// prior to harden-aim-execution Part A2, retry had zero coverage at any
// layer — this file never called the retry endpoint at all. It exercises the
// actual HTTP route (handler_aim_orchestrator.go's handleRetryAIMRun), not
// just the engine method underneath it, and specifically covers the case the
// engine-level tests in internal/aimadk cannot: that a real request through
// Echo's routing and redirect handling reaches Retry and the run resumes
// correctly on the other side.
func TestRetryRun_HandlerPath_SkipsCompletedGatedStepsAndSucceeds(t *testing.T) {
	var gate1Runs, gate2Runs, snapshotRuns atomic.Int32
	wf := newFlakySnapshotWorkflow("aim_cycle", &gate1Runs, &gate2Runs, &snapshotRuns)
	env := setupTestEnvWithWorkflow(t, wf)
	ctx := context.Background()

	resp := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("start run: expected 303, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	runID, err := uuid.Parse(loc[strings.LastIndex(loc, "/")+1:])
	if err != nil {
		t.Fatalf("redirect location contains invalid run ID %q: %v", loc, err)
	}

	awaitRunStep(t, env, runID, orchestration.StatusAwaitingHuman, "draft_assessment")
	if err := env.Engine.Resume(ctx, runID, true); err != nil {
		t.Fatalf("resume gate one: %v", err)
	}

	awaitRunStep(t, env, runID, orchestration.StatusAwaitingHuman, "draft_calibration")
	if err := env.Engine.Resume(ctx, runID, true); err != nil {
		t.Fatalf("resume gate two: %v", err)
	}

	awaitRunStatus(t, env, runID, orchestration.StatusFailed)
	if got := gate1Runs.Load(); got != 1 {
		t.Fatalf("draft_assessment ran %d times before the failure, want 1", got)
	}
	if got := gate2Runs.Load(); got != 1 {
		t.Fatalf("draft_calibration ran %d times before the failure, want 1", got)
	}
	if got := snapshotRuns.Load(); got != 1 {
		t.Fatalf("snapshot ran %d times before the failure, want 1", got)
	}

	// The actual thing under test: POST the real retry route, not
	// env.Engine.Retry directly.
	retryResp := env.request(t, "POST", env.BaseURL+"/aim/runs/"+runID.String()+"/retry", nil)
	if retryResp.StatusCode != http.StatusSeeOther {
		body, _ := io.ReadAll(retryResp.Body)
		t.Fatalf("retry: expected 303, got %d: %s", retryResp.StatusCode, body)
	}
	retryLoc := retryResp.Header.Get("Location")
	wantLoc := fmt.Sprintf("/strategies/%s/aim/runs/%s", env.InstanceID, runID)
	if retryLoc != wantLoc {
		t.Errorf("retry redirect Location = %q, want %q", retryLoc, wantLoc)
	}

	awaitRunStatus(t, env, runID, orchestration.StatusCompleted)

	if got := gate1Runs.Load(); got != 1 {
		t.Errorf("draft_assessment ran %d times after retry through the HTTP handler, want still 1", got)
	}
	if got := gate2Runs.Load(); got != 1 {
		t.Errorf("draft_calibration ran %d times after retry through the HTTP handler, want still 1", got)
	}
	if got := snapshotRuns.Load(); got != 2 {
		t.Errorf("snapshot ran %d times total, want 2 (the original failure plus the retry)", got)
	}
}

// TestRetryRun_HandlerPath_NonFailedRun_ReturnsConflict pins the handler's
// error translation for the one Retry precondition that is easy to hit by
// accident: retrying a run that is not (or no longer) failed. The handler
// must surface this as 409, not a raw 500 — matching handleStartAIMRun's own
// conflict handling for the equivalent "already active" case.
func TestRetryRun_HandlerPath_NonFailedRun_ReturnsConflict(t *testing.T) {
	env := setupTestEnv(t) // default noop workflow — completes without failing

	resp := env.request(t, "POST", env.BaseURL+"/aim/runs", nil)
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("start run: expected 303, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	runID := loc[strings.LastIndex(loc, "/")+1:]

	awaitRunStep(t, env, mustParseUUID(t, runID), orchestration.StatusAwaitingHuman, "draft_assessment")

	// The run is awaiting_human, not failed — retry must be refused.
	retryResp := env.request(t, "POST", env.BaseURL+"/aim/runs/"+runID+"/retry", map[string]string{
		"HX-Request": "true",
	})
	if retryResp.StatusCode != http.StatusConflict {
		t.Errorf("retry on a non-failed run: expected 409, got %d", retryResp.StatusCode)
	}
}

func mustParseUUID(t *testing.T, s string) uuid.UUID {
	t.Helper()
	id, err := uuid.Parse(s)
	if err != nil {
		t.Fatalf("invalid uuid %q: %v", s, err)
	}
	return id
}

// ---------------------------------------------------------------------------
// Test: POST /aim/runs without orchestration engine — returns 503
// ---------------------------------------------------------------------------

func TestStartRun_NoEngine_Returns503(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	log := slog.Default()

	// Seed instance.
	orgID := uuid.New()
	_, err := db.ExecContext(ctx,
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "No-Engine Org", "ne-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}

	wsID := uuid.New()
	_, err = db.NewInsert().Model(&internaldom.Workspace{
		ID:          wsID,
		GithubOwner: "ne-ws-" + wsID.String()[:8],
		OrgID:       orgID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	_, err = db.NewInsert().Model(&internaldom.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "No Engine Instance",
		Status:      internaldom.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}

	// Handler without orchestration engine.
	semanticSvc := semantic.NewService(semantic.Config{})
	strategySvc := strategydom.NewService(db)
	webHandler := handler.New(db, log, semanticSvc).WithStrategy(strategySvc)
	// Note: WithOrchestration NOT called.

	e := echo.New()
	e.HideBanner = true
	webHandler.RegisterRoutes(e)

	// POST /aim/runs should return 503.
	req, _ := http.NewRequest("POST", "/strategies/"+instID.String()+"/aim/runs", nil)
	rec := newResponseRecorder()
	e.ServeHTTP(rec, req)
	resp := rec.Result()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when orchestration engine is nil, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Test: server restart marks stale runs as failed
// ---------------------------------------------------------------------------

// Server-restart recovery is intentionally NOT tested here the way it was
// for the ADK engine (a fabricated stale row + in-process Start() call).
// DBOSEngine's recovery model is categorically different — see its Start()
// doc comment: DBOS actually resumes a genuinely-interrupted workflow on
// Launch, rather than marking a stale row failed, so there is nothing
// analogous to assert against a *fabricated* row that no real DBOS
// workflow ever backed. Constructing two DBOSEngine instances against the
// same database within one test process (to simulate "a fresh engine after
// a crash") does not prove anything either — unlike a real process
// restart, the "crashed" engine's own DBOS context is still alive in the
// same process and can race with the "recovery" one.
//
// The real proof is internal/aimdbos/restart_proof_test.go's
// TestDBOSEngine_SurvivesRealProcessKill, which spawns a genuine subprocess
// and sends it SIGKILL — the same reasoning internal/aimadk's equivalent
// test documented for why an in-process simulation cannot substitute for
// an actual crash.
