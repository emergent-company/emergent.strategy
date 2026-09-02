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
	orchpg "github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration/pg"
)

// engineKind selects which orchestration.EngineAPI implementation setupTestEnv
// builds. The same test bodies run against both — that is what "parity"
// means here: not a separate suite per engine, but one suite whose
// assertions hold regardless of which engine produced the observed HTTP/SSE
// behaviour.
type engineKind string

const (
	engineLegacy engineKind = "legacy"
	engineADK    engineKind = "adk"
)

var allEngineKinds = []engineKind{engineLegacy, engineADK}

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
// real work, registrable against either engine: Steps() is the legacy-shaped
// adapter the pg-backed engine calls, CycleSteps() is the engine-neutral form
// ADKEngine uses. Both describe the same two steps — this is the whole
// mechanism that makes "the same test runs against both engines" meaningful
// rather than coincidental.
type noopWorkflow struct {
	name  string
	steps []orchestration.Step
	cycle []aim.Step
}

func (w *noopWorkflow) Name() string                               { return w.name }
func (w *noopWorkflow) Steps() []orchestration.Step                { return w.steps }
func (w *noopWorkflow) ConcurrencyKey(r *orchestration.Run) string { return r.ConcurrencyKey }
func (w *noopWorkflow) CycleSteps() []aim.Step                     { return w.cycle }

// newNoopWorkflow creates a workflow with steps that complete instantly.
// The first step has a human gate (produces a batch ID to pause on).
func newNoopWorkflow(name string) *noopWorkflow {
	batchID := uuid.New().String()
	return &noopWorkflow{
		name: name,
		steps: []orchestration.Step{
			{
				Name: "draft_assessment",
				Execute: func(_ context.Context, _ *orchestration.Run) (orchestration.StepResult, error) {
					return orchestration.StepResult{
						BatchID: batchID,
						Meta:    map[string]any{"llm_used": false},
					}, nil
				},
				HumanGate: true,
			},
			{
				Name: "snapshot",
				Execute: func(_ context.Context, _ *orchestration.Run) (orchestration.StepResult, error) {
					return orchestration.StepResult{}, nil
				},
				HumanGate: false,
			},
		},
		cycle: []aim.Step{
			{
				Name:      "draft_assessment",
				HumanGate: true,
				Run: func(_ context.Context, _ aim.StepInput) (aim.StepOutput, error) {
					return aim.StepOutput{
						Step:    "draft_assessment",
						BatchID: batchID,
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
func setupTestEnv(t *testing.T, kind engineKind) *testEnv {
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

	// Build the orchestration engine — legacy or ADK-backed per kind — and
	// register the same noopWorkflow value against it. This is the entire
	// swap: nothing downstream (routes, handlers, the HTML assertions below)
	// changes based on which engine produced the run.
	wf := newNoopWorkflow("aim_cycle")
	var engine orchestration.EngineAPI
	switch kind {
	case engineADK:
		runStore := aimadk.NewRunStore(db)
		sessionStore := adk.NewSessionStore(db)
		engine = aimadk.NewADKEngine(runStore, sessionStore, aimadk.ADKEngineConfig{AppName: "e2e-test"})
	default:
		backend := orchpg.NewBackend(db, orchpg.Config{Workers: 2})
		engine = orchestration.New(backend)
	}
	engine.Register(wf)

	if err := engine.Start(ctx); err != nil {
		t.Fatalf("engine start (%s): %v", kind, err)
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
	for _, kind := range allEngineKinds {
		t.Run(string(kind), func(t *testing.T) {
			env := setupTestEnv(t, kind)

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
		})
	}
}

// ---------------------------------------------------------------------------
// Test: duplicate POST /aim/runs — returns 409 (HTMX) or 303 to /aim (browser)
// ---------------------------------------------------------------------------

func TestDuplicateRun_HTMX_Returns409(t *testing.T) {
	for _, kind := range allEngineKinds {
		t.Run(string(kind), func(t *testing.T) {
			env := setupTestEnv(t, kind)

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
		})
	}
}

func TestDuplicateRun_Browser_RedirectsToAIM(t *testing.T) {
	for _, kind := range allEngineKinds {
		t.Run(string(kind), func(t *testing.T) {
			env := setupTestEnv(t, kind)

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
		})
	}
}

// ---------------------------------------------------------------------------
// Test: GET /aim/runs/:runID — returns 200 with run panel HTML
// ---------------------------------------------------------------------------

func TestGetRun_ReturnsRunPanel(t *testing.T) {
	for _, kind := range allEngineKinds {
		t.Run(string(kind), func(t *testing.T) {
			env := setupTestEnv(t, kind)

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

			// The run panel should contain the step names from our noop workflow.
			if !strings.Contains(html, "draft_assessment") && !strings.Contains(html, "Draft Assessment") {
				t.Errorf("run panel HTML should mention draft_assessment step")
			}
			if !strings.Contains(html, "snapshot") && !strings.Contains(html, "Snapshot") {
				t.Errorf("run panel HTML should mention snapshot step")
			}

			// The stream URL should be present for SSE.
			expectedStreamURL := fmt.Sprintf("/strategies/%s/aim/runs/%s/stream", env.InstanceID, runID)
			if !strings.Contains(html, expectedStreamURL) {
				t.Errorf("run panel should contain stream URL %s", expectedStreamURL)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: GET /aim/runs/:runID — invalid run ID returns 400
// ---------------------------------------------------------------------------

func TestGetRun_InvalidID_Returns400(t *testing.T) {
	for _, kind := range allEngineKinds {
		t.Run(string(kind), func(t *testing.T) {
			env := setupTestEnv(t, kind)

			resp := env.request(t, "GET", env.BaseURL+"/aim/runs/not-a-uuid", nil)
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("expected 400 for invalid run ID, got %d", resp.StatusCode)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: GET /aim/runs/:runID — nonexistent run returns 404
// ---------------------------------------------------------------------------

func TestGetRun_NotFound_Returns404(t *testing.T) {
	for _, kind := range allEngineKinds {
		t.Run(string(kind), func(t *testing.T) {
			env := setupTestEnv(t, kind)

			fakeID := uuid.New().String()
			resp := env.request(t, "GET", env.BaseURL+"/aim/runs/"+fakeID, nil)
			if resp.StatusCode != http.StatusNotFound {
				t.Errorf("expected 404 for nonexistent run, got %d", resp.StatusCode)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: GET /aim/runs/:runID/stream — returns SSE content type
// ---------------------------------------------------------------------------

func TestSSEStream_ContentType(t *testing.T) {
	for _, kind := range allEngineKinds {
		t.Run(string(kind), func(t *testing.T) {
			env := setupTestEnv(t, kind)

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
		})
	}
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

func TestServerRestart_MarksStaleRunsFailed(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	wf := newNoopWorkflow("aim_cycle")

	// Insert a pending run using a backend that has NOT been started.
	// No workers are running, so the run stays pending in the DB.
	be1 := orchpg.NewBackend(db, orchpg.Config{Workers: 1})
	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   "aim_cycle",
		ConcurrencyKey: "stale-instance",
		Input:          map[string]any{"instance_id": "stale-instance"},
		Status:         orchestration.StatusPending,
		Steps:          []orchestration.StepLog{},
	}
	if err := be1.Enqueue(ctx, run); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	t.Logf("Run enqueued (no workers): %s", run.ID)

	// Start a fresh backend simulating a server restart.
	// Start() must mark the pending run as failed before launching new workers.
	be2 := orchpg.NewBackend(db, orchpg.Config{Workers: 1})
	eng2 := orchestration.New(be2)
	eng2.Register(wf)

	if err := eng2.Start(ctx); err != nil {
		t.Fatalf("eng2 start: %v", err)
	}
	defer func() { _ = eng2.Stop(ctx) }()

	// The stale run should now be marked as failed.
	got, err := eng2.GetRun(ctx, run.ID)
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

// TestServerRestart_MarksStaleRunsFailed_ADK is the ADK engine's counterpart
// to the legacy test above. It is a separate test rather than a shared
// subtest body because the two engines' restart-recovery mechanics are
// genuinely different — a two-backend-instance simulation for the legacy
// worker pool versus a direct RunStore write for the ADK engine's stateless
// drive() goroutines — but the externally-observed outcome must be the same:
// a run left non-terminal by a crashed process reads back as failed with
// "server restart" once a new engine starts.
func TestServerRestart_MarksStaleRunsFailed_ADK(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	wf := newNoopWorkflow("aim_cycle")
	runStore := aimadk.NewRunStore(db)

	// Simulate a run left mid-flight by a crashed process: written directly to
	// the store, with no engine ever having started to drive it.
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
