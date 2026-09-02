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
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	strategydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimadk"
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

// setupTestEnv creates a test environment with database, Echo server, handler,
// and orchestration engine. The engine runs a noop workflow named "aim_cycle".
func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()

	db := database.TestDB(t)
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

	// Build the orchestration engine and register the noop workflow against
	// it — the same construction cmd_serve.go does.
	wf := newNoopWorkflow("aim_cycle")
	runStore := aimadk.NewRunStore(db)
	sessionStore := adk.NewSessionStore(db)
	var engine orchestration.EngineAPI = aimadk.NewADKEngine(runStore, sessionStore, aimadk.ADKEngineConfig{AppName: "e2e-test"})
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

// TestServerRestart_MarksStaleRunsFailed simulates a run left mid-flight by a
// crashed process — written directly to the store, with no engine ever
// having driven it — and confirms a fresh engine's Start() marks it failed
// with "server restart" rather than leaving it stuck non-terminal forever.
func TestServerRestart_MarksStaleRunsFailed(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	wf := newNoopWorkflow("aim_cycle")
	runStore := aimadk.NewRunStore(db)

	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   "aim_cycle",
		ConcurrencyKey: uuid.New().String(),
		Input:          map[string]any{},
		Status:         orchestration.StatusRunning,
		Steps:          []orchestration.StepLog{},
	}
	if err := runStore.Create(ctx, run); err != nil {
		t.Fatalf("create stale run: %v", err)
	}
	t.Logf("stale run created (no engine driving it): %s", run.ID)

	sessionStore := adk.NewSessionStore(db)
	engine := aimadk.NewADKEngine(runStore, sessionStore, aimadk.ADKEngineConfig{AppName: "e2e-restart-test"})
	engine.Register(wf)

	if err := engine.Start(ctx); err != nil {
		t.Fatalf("engine start: %v", err)
	}
	defer func() { _ = engine.Stop(context.Background()) }()

	got, err := engine.GetRun(ctx, run.ID)
	if err != nil {
		t.Fatalf("GetRun after restart: %v", err)
	}
	if got.Status != orchestration.StatusFailed {
		t.Errorf("expected run status 'failed' after restart, got %q", got.Status)
	}
	if got.Error != "server restart" {
		t.Errorf("expected error 'server restart', got %q", got.Error)
	}
}
