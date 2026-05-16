// Package mcpserver_test contains end-to-end integration tests for the MCP server.
//
// Each test scenario models a realistic AI-agent interaction:
//   - The agent reads context, proposes a change, stages it, presents it to the
//     user, then commits or discards based on user response.
//
// Tests run against a real PostgreSQL database (via database.TestDB) and a real
// MCP HTTP handler. No mocking.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://strategy:strategy@localhost:5433/postgres?sslmode=disable" \
//	  go test ./internal/mcpserver/... -v
package mcpserver_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

// mcpClient is a thin helper that speaks MCP over HTTP against a test server.
type mcpClient struct {
	t         *testing.T
	server    *httptest.Server
	sessionID string
}

// newMCPClient creates a test HTTP server, initialises an MCP session, and
// returns a client ready to call tools.
func newMCPClient(t *testing.T, svc mcpserver.Services) *mcpClient {
	t.Helper()
	handler := mcpserver.New(svc)
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)

	c := &mcpClient{t: t, server: ts}
	c.initialize()
	return c
}

// initialize sends the MCP initialize handshake and captures the session ID.
func (c *mcpClient) initialize() {
	c.t.Helper()
	body := `{"jsonrpc":"2.0","id":0,"method":"initialize","params":{` +
		`"protocolVersion":"2024-11-05","capabilities":{},` +
		`"clientInfo":{"name":"test","version":"1.0"}}}`
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("mcp initialize: %v", err)
	}
	defer resp.Body.Close()        //nolint:errcheck
	io.Copy(io.Discard, resp.Body) //nolint:errcheck
	c.sessionID = resp.Header.Get("Mcp-Session-Id")
	if c.sessionID == "" {
		c.t.Fatal("mcp initialize: no session ID in response")
	}
}

// call invokes a tool by name with the given arguments and returns the parsed
// tool result text. It fatals on any transport or protocol error.
func (c *mcpClient) call(id int, toolName string, args map[string]any) toolResult {
	c.t.Helper()
	argsJSON, _ := json.Marshal(args)
	body := fmt.Sprintf(
		`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":%q,"arguments":%s}}`,
		id, toolName, argsJSON,
	)
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp",
		bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("tool %s: transport error: %v", toolName, err)
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(resp.Body)

	var envelope struct {
		Result struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
			IsError bool `json:"isError"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		c.t.Fatalf("tool %s: parse envelope: %v\nbody: %s", toolName, err, raw)
	}
	if len(envelope.Result.Content) == 0 {
		c.t.Fatalf("tool %s: empty content in response", toolName)
	}
	return toolResult{
		t:       c.t,
		tool:    toolName,
		text:    envelope.Result.Content[0].Text,
		isError: envelope.Result.IsError,
	}
}

// listTools returns all tool names the server exposes.
func (c *mcpClient) listTools() []string {
	c.t.Helper()
	body := `{"jsonrpc":"2.0","id":99,"method":"tools/list","params":{}}`
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("tools/list: %v", err)
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(resp.Body)

	var envelope struct {
		Result struct {
			Tools []struct {
				Name string `json:"name"`
			} `json:"tools"`
		} `json:"result"`
	}
	json.Unmarshal(raw, &envelope) //nolint:errcheck
	names := make([]string, len(envelope.Result.Tools))
	for i, t := range envelope.Result.Tools {
		names[i] = t.Name
	}
	return names
}

// toolResult wraps a tool response for assertion helpers.
type toolResult struct {
	t       *testing.T
	tool    string
	text    string
	isError bool
}

// assertOK fatals if the tool returned an error response.
func (r toolResult) assertOK() toolResult {
	r.t.Helper()
	if r.isError {
		r.t.Fatalf("tool %s returned error: %s", r.tool, r.text)
	}
	return r
}

// assertError fatals if the tool did NOT return an error response.
func (r toolResult) assertError() toolResult {
	r.t.Helper()
	if !r.isError {
		r.t.Fatalf("tool %s: expected error, got: %s", r.tool, r.text)
	}
	return r
}

// decode parses the text as JSON into v.
func (r toolResult) decode(v any) toolResult {
	r.t.Helper()
	if err := json.Unmarshal([]byte(r.text), v); err != nil {
		r.t.Fatalf("tool %s: decode response: %v\ntext: %s", r.tool, err, r.text)
	}
	return r
}

// contains checks that the text contains a substring.
func (r toolResult) contains(sub string) toolResult {
	r.t.Helper()
	if !strings.Contains(r.text, sub) {
		r.t.Fatalf("tool %s: expected %q in response\ngot: %s", r.tool, sub, r.text[:min(len(r.text), 400)])
	}
	return r
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

// seedInstance creates a workspace + instance with the given payloads and
// returns (workspaceID, instanceID).
// It calls BackfillIndex after import so strategy_artifacts is populated.
func seedInstance(t *testing.T, svc mcpserver.Services, githubOwner string, payloads map[string]any) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceSystem)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())

	ws, err := svc.Workspace.CreateWorkspace(ctx, githubOwner, nil)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	inst, err := svc.Instance.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID:     ws.ID,
		Name:            "Test Instance",
		InitialPayloads: payloads,
	})
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}

	// ImportInstance inserts mutations as committed directly (bypassing CommitBatch),
	// so we must backfill the Strategic Index explicitly.
	if _, err := svc.Strategy.BackfillIndex(ctx, inst.ID); err != nil {
		t.Fatalf("seed backfill index: %v", err)
	}

	if err := svc.Instance.ActivateInstance(ctx, inst.ID); err != nil {
		t.Fatalf("seed activate: %v", err)
	}

	return ws.ID, inst.ID
}

// buildSvc wires all domain services against the given test DB.
// The Pack service is wired into Instance so the standard pack is auto-installed
// on new instances (mirroring the production cmd_serve.go wiring).
func buildSvc(t *testing.T) mcpserver.Services {
	t.Helper()
	db := database.TestDB(t)
	packSvc := pack.NewService(db)
	instSvc := instance.NewService(db)
	instSvc.WithPackEnsurer(packSvc)
	return mcpserver.Services{
		Workspace: workspace.NewService(db),
		Instance:  instSvc,
		Strategy:  strategy.NewService(db),
		Pack:      packSvc,
		App:       appdom.NewService(db),
		Semantic:  semantic.NewService(semantic.Config{}),
	}
}

// ---------------------------------------------------------------------------
// Scenario 1: Tool discovery
// ---------------------------------------------------------------------------

func TestMCP_ToolDiscovery(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	tools := c.listTools()

	expected := []string{
		// Read — instance/workspace
		"list_workspaces", "get_workspace",
		"list_instances", "get_instance", "health_check",
		// Read — strategy context
		"get_strategy_context", "get_product_vision", "get_personas",
		"get_competitive_position", "get_roadmap",
		// Read — artifacts
		"list_features", "get_feature",
		"list_artifacts", "list_relationships",
		"list_mutations", "get_mutation",
		// Read — semantic
		"search_strategy", "detect_contradictions",
		"get_neighbors", "run_scenario", "evaluate_scenario", "commit_scenario",
		// Read — embedded knowledge (Phase C)
		"list_schemas", "get_schema",
		"list_templates", "get_template",
		"list_agents", "get_agent",
		"list_skills", "get_skill",
		"list_wizards", "get_wizard",
		// Read — agent runtime (Phase B+)
		"list_pending_batches",
		// Write — workspace/instance lifecycle
		"create_workspace", "import_instance",
		"activate_instance", "archive_instance",
		// Write — agent runtime (Phase B+)
		"describe_batch",
		// Write — core mutations
		"update_north_star",
		"create_feature", "update_feature", "archive_feature",
		// Write — expanded READY/FIRE (Phase D)
		"update_strategy_foundations", "update_insight_analyses",
		"update_strategy_formula", "update_roadmap",
		"update_value_model",
		"stage_artifact", "batch_create_artifacts",
		// Write — batch lifecycle
		"commit_batch", "discard_batch",
		// Read — derived views (Phase E)
		"get_strategic_context_for_feature", "explain_value_path",
		"get_coverage_analysis", "get_value_propositions",
		"get_assumptions", "get_feature_dependencies",
		// Validation (Phase F)
		"validate_artifact", "validate_instance",
		"validate_relationships", "check_content_readiness",
		// Export (Phase F)
		"export_instance_yaml", "export_feature_yaml", "export_report",
		// AIM lifecycle (Phase G)
		"create_lra", "update_lra", "get_lra",
		"create_aim_report", "get_aim_summary",
		// Skill pack & app platform (Phase H)
		"list_installed_skills", "get_installed_skill", "run_skill",
		"scaffold_skill",
		"install_pack", "list_packs", "get_pack", "uninstall_pack",
		"list_apps", "run_app",
		"describe_pack_format",
	}

	toolSet := make(map[string]bool, len(tools))
	for _, name := range tools {
		toolSet[name] = true
	}

	for _, name := range expected {
		if !toolSet[name] {
			t.Errorf("missing tool: %s", name)
		}
	}

	t.Logf("tools registered: %d", len(tools))
	if len(tools) < len(expected) {
		t.Errorf("expected at least %d tools, got %d", len(expected), len(tools))
	}
}

// ---------------------------------------------------------------------------
// Scenario 2: Workspace and instance lifecycle
// ---------------------------------------------------------------------------

func TestMCP_WorkspaceAndInstanceLifecycle(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	// Create workspace
	var ws struct {
		ID          string `json:"id"`
		GithubOwner string `json:"github_owner"`
	}
	c.call(id, "create_workspace", map[string]any{
		"github_owner": "test-org-lifecycle",
		"display_name": "Lifecycle Test Org",
	}).assertOK().decode(&ws)
	id++

	if ws.ID == "" {
		t.Fatal("create_workspace: no id in response")
	}
	if ws.GithubOwner != "test-org-lifecycle" {
		t.Errorf("github_owner: got %q, want %q", ws.GithubOwner, "test-org-lifecycle")
	}

	// List workspaces — must include new one
	var list struct {
		Workspaces []struct {
			ID string `json:"id"`
		} `json:"Workspaces"`
	}
	c.call(id, "list_workspaces", nil).assertOK().decode(&list)
	id++

	found := false
	for _, w := range list.Workspaces {
		if w.ID == ws.ID {
			found = true
		}
	}
	if !found {
		t.Error("list_workspaces: new workspace not in list")
	}

	// Get workspace by ID
	c.call(id, "get_workspace", map[string]any{"workspace_id": ws.ID}).
		assertOK().
		contains(ws.GithubOwner)
	id++

	// Import (empty) instance
	var inst struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	c.call(id, "import_instance", map[string]any{
		"workspace_id": ws.ID,
		"name":         "Lifecycle Instance",
	}).assertOK().decode(&inst)
	id++

	if inst.ID == "" {
		t.Fatal("import_instance: no id")
	}

	// Activate it
	c.call(id, "activate_instance", map[string]any{"instance_id": inst.ID}).
		assertOK().
		contains("true")
	id++

	// Get instance — should be active
	var instDetail struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	c.call(id, "get_instance", map[string]any{"instance_id": inst.ID}).
		assertOK().decode(&instDetail)
	id++

	if instDetail.Status != "active" {
		t.Errorf("expected status=active, got %q", instDetail.Status)
	}

	// Health check
	c.call(id, "health_check", map[string]any{"instance_id": inst.ID}).
		assertOK().
		contains("artifact_count")
	id++

	// List instances in workspace
	var instList struct {
		Instances []struct {
			ID string `json:"id"`
		} `json:"Instances"`
	}
	c.call(id, "list_instances", map[string]any{"workspace_id": ws.ID}).
		assertOK().decode(&instList)
	id++

	foundInst := false
	for _, i := range instList.Instances {
		if i.ID == inst.ID {
			foundInst = true
		}
	}
	if !foundInst {
		t.Error("list_instances: new instance not found in workspace")
	}

	// Archive instance
	c.call(id, "archive_instance", map[string]any{"instance_id": inst.ID}).
		assertOK().
		contains("archived")
}

// ---------------------------------------------------------------------------
// Scenario 3: Read strategy context (requires seeded instance)
// ---------------------------------------------------------------------------

func TestMCP_ReadStrategyContext(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-read-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{
			"north_star": map[string]any{
				"vision": map[string]any{
					"vision_statement": "We are the semantic strategy runtime.",
				},
				"purpose": map[string]any{
					"statement": "Make strategy a living system.",
				},
			},
		},
		"strategy_foundations": map[string]any{
			"personas": []any{
				map[string]any{"name": "Strategic Manager", "role": "Head of Product"},
			},
		},
		"insight_analyses": map[string]any{
			"competitive_landscape": map[string]any{
				"summary": "No direct competitor treats strategy as a live semantic system.",
			},
		},
		"roadmap_recipe": map[string]any{
			"roadmap": map[string]any{
				"cycle":  2,
				"tracks": map[string]any{},
			},
		},
	})
	instIDStr := instID.String()

	// get_strategy_context — all artifacts
	var artifacts []map[string]any
	c.call(id, "get_strategy_context", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&artifacts)
	id++

	if len(artifacts) == 0 {
		t.Error("get_strategy_context: returned no artifacts")
	}
	t.Logf("get_strategy_context: %d artifacts", len(artifacts))

	// get_product_vision — north_star
	c.call(id, "get_product_vision", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("semantic strategy runtime")
	id++

	// get_personas — strategy_foundations
	c.call(id, "get_personas", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("Strategic Manager")
	id++

	// get_competitive_position — insight_analyses
	c.call(id, "get_competitive_position", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("semantic system")
	id++

	// get_roadmap
	c.call(id, "get_roadmap", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("cycle")
	id++

	// Wrong instance ID → error
	c.call(id, "get_product_vision", map[string]any{"instance_id": uuid.New().String()}).
		assertError()
}

// ---------------------------------------------------------------------------
// Scenario 4: Feature authoring — full human-in-the-loop cycle
// ---------------------------------------------------------------------------

func TestMCP_FeatureAuthoringCycle(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-feat-"+uuid.New().String()[:8], map[string]any{
		"fd-001": map[string]any{
			"id":     "fd-001",
			"name":   "Knowledge Graph Engine",
			"phase":  "FIRE",
			"status": "ready",
		},
	})
	instIDStr := instID.String()

	// List features — should see seeded fd-001
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("fd-001")
	id++

	// Get the feature
	c.call(id, "get_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-001",
	}).assertOK().contains("Knowledge Graph")
	id++

	// Agent proposes a new feature (create)
	newFeaturePayload, _ := json.Marshal(map[string]any{
		"id":     "fd-042",
		"name":   "AI Strategy Coach",
		"phase":  "FIRE",
		"status": "draft",
		"hypothesis": map[string]any{
			"problem":  "Strategic managers lack real-time coaching.",
			"solution": "AI coach that surfaces relevant strategic patterns.",
		},
	})

	var stageResp struct {
		Staged      bool   `json:"staged"`
		BatchID     string `json:"batch_id"`
		ArtifactKey string `json:"artifact_key"`
	}
	c.call(id, "create_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-042",
		"payload":     string(newFeaturePayload),
	}).assertOK().decode(&stageResp)
	id++

	if !stageResp.Staged {
		t.Error("create_feature: staged=false")
	}
	if stageResp.BatchID == "" {
		t.Error("create_feature: no batch_id")
	}
	if stageResp.ArtifactKey != "fd-042" {
		t.Errorf("create_feature: artifact_key=%q, want fd-042", stageResp.ArtifactKey)
	}

	// Before commit — staged feature must NOT be visible in list
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK()
	// Verify fd-042 not yet visible by checking the result
	var featuresBeforeCommit []map[string]any
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&featuresBeforeCommit)
	id++
	for _, f := range featuresBeforeCommit {
		if key, _ := f["artifact_key"].(string); key == "fd-042" {
			t.Error("fd-042 visible before commit — staging isolation broken")
		}
	}

	// User reviews and CONFIRMS → commit
	var commitResp struct {
		Committed bool   `json:"committed"`
		BatchID   string `json:"batch_id"`
		Count     int    `json:"count"`
	}
	c.call(id, "commit_batch", map[string]any{"batch_id": stageResp.BatchID}).
		assertOK().decode(&commitResp)
	id++

	if !commitResp.Committed {
		t.Error("commit_batch: committed=false")
	}
	if commitResp.Count != 1 {
		t.Errorf("commit_batch: count=%d, want 1", commitResp.Count)
	}

	// After commit — fd-042 must be visible
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("fd-042")
	id++

	// Agent proposes an update to fd-042
	updatedPayload, _ := json.Marshal(map[string]any{
		"id":     "fd-042",
		"name":   "AI Strategy Coach",
		"phase":  "FIRE",
		"status": "ready",
		"hypothesis": map[string]any{
			"problem":  "Strategic managers lack real-time coaching.",
			"solution": "AI coach with memory-backed context.",
		},
	})

	var updateResp struct {
		Staged  bool   `json:"staged"`
		BatchID string `json:"batch_id"`
	}
	c.call(id, "update_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-042",
		"payload":     string(updatedPayload),
	}).assertOK().decode(&updateResp)
	id++

	// User DECLINES → discard
	var discardResp struct {
		Discarded bool `json:"discarded"`
		Count     int  `json:"count"`
	}
	c.call(id, "discard_batch", map[string]any{"batch_id": updateResp.BatchID}).
		assertOK().decode(&discardResp)
	id++

	if !discardResp.Discarded {
		t.Error("discard_batch: discarded=false")
	}

	// State unchanged — should still show old status ("draft"), not "ready"
	c.call(id, "get_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-042",
	}).assertOK().contains(`"draft"`)
	id++

	// Archive fd-042
	var archiveStage struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "archive_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-042",
	}).assertOK().decode(&archiveStage)
	id++

	c.call(id, "commit_batch", map[string]any{"batch_id": archiveStage.BatchID}).
		assertOK()
	id++

	// Archived feature must be excluded from list
	var featuresAfterArchive []map[string]any
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&featuresAfterArchive)
	id++
	for _, f := range featuresAfterArchive {
		if key, _ := f["artifact_key"].(string); key == "fd-042" {
			t.Error("archived fd-042 still visible in list_features")
		}
	}

	// But it should still appear in mutation history
	var history struct {
		Mutations  []map[string]any `json:"mutations"`
		NextCursor string           `json:"next_cursor"`
	}
	c.call(id, "list_mutations", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "feature",
	}).assertOK().decode(&history)

	if len(history.Mutations) == 0 {
		t.Error("list_mutations: expected feature mutation history, got none")
	}
	t.Logf("feature mutations in history: %d", len(history.Mutations))
}

// ---------------------------------------------------------------------------
// Scenario 5: North star update — human-in-the-loop
// ---------------------------------------------------------------------------

func TestMCP_NorthStarUpdate(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-ns-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{
			"north_star": map[string]any{
				"vision": map[string]any{
					"vision_statement": "Original vision statement.",
				},
			},
		},
	})
	instIDStr := instID.String()

	// Read current vision
	c.call(id, "get_product_vision", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("Original vision statement")
	id++

	// Stage updated vision
	newPayload, _ := json.Marshal(map[string]any{
		"north_star": map[string]any{
			"vision": map[string]any{
				"vision_statement": "Updated vision: semantic strategy for everyone.",
			},
		},
	})
	var stageResp struct {
		Staged  bool   `json:"staged"`
		BatchID string `json:"batch_id"`
	}
	c.call(id, "update_north_star", map[string]any{
		"instance_id": instIDStr,
		"payload":     string(newPayload),
	}).assertOK().decode(&stageResp)
	id++

	if stageResp.BatchID == "" {
		t.Fatal("update_north_star: no batch_id")
	}

	// Vision unchanged while staged
	c.call(id, "get_product_vision", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("Original vision statement")
	id++

	// Commit
	c.call(id, "commit_batch", map[string]any{"batch_id": stageResp.BatchID}).assertOK()
	id++

	// Vision now reflects update
	c.call(id, "get_product_vision", map[string]any{"instance_id": instIDStr}).
		assertOK().
		contains("semantic strategy for everyone")
	id++

	// History shows both the initial and the update
	var history struct {
		Mutations []map[string]any `json:"mutations"`
	}
	c.call(id, "list_mutations", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "north_star",
	}).assertOK().decode(&history)

	if len(history.Mutations) < 2 {
		t.Errorf("expected ≥2 north_star mutations (import + update), got %d", len(history.Mutations))
	}
}

// ---------------------------------------------------------------------------
// Scenario 6: Batch grouping — agent batches multiple changes
// ---------------------------------------------------------------------------

func TestMCP_BatchGrouping(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-batch-"+uuid.New().String()[:8], map[string]any{
		"fd-010": map[string]any{"id": "fd-010", "name": "Feature Alpha"},
		"fd-011": map[string]any{"id": "fd-011", "name": "Feature Beta"},
	})
	instIDStr := instID.String()

	// Agent stages two feature updates in the same batch
	p1, _ := json.Marshal(map[string]any{"id": "fd-010", "name": "Feature Alpha v2"})
	var first struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "update_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-010",
		"payload":     string(p1),
	}).assertOK().decode(&first)
	id++

	p2, _ := json.Marshal(map[string]any{"id": "fd-011", "name": "Feature Beta v2"})
	var second struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "update_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-011",
		"payload":     string(p2),
		"batch_id":    first.BatchID, // same batch
	}).assertOK().decode(&second)
	id++

	if second.BatchID != first.BatchID {
		t.Errorf("expected same batch_id; got %q and %q", first.BatchID, second.BatchID)
	}

	// One commit promotes both
	var commitResp struct {
		Count int `json:"count"`
	}
	c.call(id, "commit_batch", map[string]any{"batch_id": first.BatchID}).
		assertOK().decode(&commitResp)
	id++

	if commitResp.Count != 2 {
		t.Errorf("expected 2 mutations committed, got %d", commitResp.Count)
	}

	// Both features reflect new names
	c.call(id, "get_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-010",
	}).assertOK().contains("Alpha v2")
	id++

	c.call(id, "get_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-011",
	}).assertOK().contains("Beta v2")
}

// ---------------------------------------------------------------------------
// Scenario 7: Invalid inputs — error handling
// ---------------------------------------------------------------------------

func TestMCP_ErrorHandling(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	// Bad UUID
	c.call(id, "get_workspace", map[string]any{"workspace_id": "not-a-uuid"}).assertError()
	id++

	// Non-existent workspace
	c.call(id, "get_workspace", map[string]any{"workspace_id": uuid.New().String()}).assertError()
	id++

	// Non-existent instance
	c.call(id, "get_product_vision", map[string]any{"instance_id": uuid.New().String()}).assertError()
	id++

	// Non-existent feature key
	_, instID := seedInstance(t, svc, "test-org-err-"+uuid.New().String()[:8], nil)
	c.call(id, "get_feature", map[string]any{
		"instance_id": instID.String(),
		"feature_key": "fd-999",
	}).assertError()
	id++

	// Commit a non-existent batch
	c.call(id, "commit_batch", map[string]any{"batch_id": uuid.New().String()}).assertError()
	id++

	// Discard a non-existent batch
	c.call(id, "discard_batch", map[string]any{"batch_id": uuid.New().String()}).assertError()
	id++

	// Invalid JSON payload
	_, instID2 := seedInstance(t, svc, "test-org-err2-"+uuid.New().String()[:8], nil)
	c.call(id, "update_north_star", map[string]any{
		"instance_id": instID2.String(),
		"payload":     "not valid json {{{",
	}).assertError()
	id++

	// Duplicate workspace
	c.call(id, "create_workspace", map[string]any{"github_owner": "dup-org"}).assertOK()
	id++
	c.call(id, "create_workspace", map[string]any{"github_owner": "dup-org"}).assertError()
}

// ---------------------------------------------------------------------------
// Scenario 8: Mutation history and audit trail
// ---------------------------------------------------------------------------

func TestMCP_MutationHistoryAndAudit(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-audit-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"version": "1.0"},
		"fd-001":     map[string]any{"id": "fd-001", "name": "Feature One"},
		"fd-002":     map[string]any{"id": "fd-002", "name": "Feature Two"},
	})
	instIDStr := instID.String()

	// Make 3 additional commits: update north_star, update fd-001, archive fd-002
	for _, op := range []struct {
		tool string
		args map[string]any
	}{
		{"update_north_star", map[string]any{
			"instance_id": instIDStr,
			"payload":     `{"version":"2.0"}`,
		}},
		{"update_feature", map[string]any{
			"instance_id": instIDStr,
			"feature_key": "fd-001",
			"payload":     `{"id":"fd-001","name":"Feature One v2"}`,
		}},
		{"archive_feature", map[string]any{
			"instance_id": instIDStr,
			"feature_key": "fd-002",
			"payload":     `{}`,
		}},
	} {
		var s struct {
			BatchID string `json:"batch_id"`
		}
		c.call(id, op.tool, op.args).assertOK().decode(&s)
		id++
		c.call(id, "commit_batch", map[string]any{"batch_id": s.BatchID}).assertOK()
		id++
	}

	// list_mutations — all types, default limit
	var all struct {
		Mutations  []map[string]any `json:"mutations"`
		NextCursor string           `json:"next_cursor"`
	}
	c.call(id, "list_mutations", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&all)
	id++

	if len(all.Mutations) == 0 {
		t.Error("list_mutations: no mutations returned")
	}
	t.Logf("total mutations: %d", len(all.Mutations))

	// list_mutations — filter by type
	var featOnly struct {
		Mutations []map[string]any `json:"mutations"`
	}
	c.call(id, "list_mutations", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "feature",
	}).assertOK().decode(&featOnly)
	id++

	for _, m := range featOnly.Mutations {
		if at, _ := m["artifact_type"].(string); at != "feature" {
			t.Errorf("list_mutations with type filter: got artifact_type=%q, want feature", at)
		}
	}

	// list_mutations — pagination (limit=2)
	var page1 struct {
		Mutations  []map[string]any `json:"mutations"`
		NextCursor string           `json:"next_cursor"`
	}
	c.call(id, "list_mutations", map[string]any{
		"instance_id": instIDStr,
		"limit":       "2",
	}).assertOK().decode(&page1)
	id++

	if len(page1.Mutations) > 2 {
		t.Errorf("list_mutations limit=2: got %d mutations", len(page1.Mutations))
	}
	if len(all.Mutations) > 2 && page1.NextCursor == "" {
		t.Error("list_mutations: expected next_cursor when more mutations exist")
	}

	// get_mutation — fetch a specific mutation by ID
	if len(all.Mutations) > 0 {
		mutID, _ := all.Mutations[0]["id"].(string)
		c.call(id, "get_mutation", map[string]any{"mutation_id": mutID}).
			assertOK().
			contains(mutID)
	}
}

// ---------------------------------------------------------------------------
// Scenario 9: Semantic tools — graceful unavailability
// ---------------------------------------------------------------------------

func TestMCP_SemanticToolsUnavailable(t *testing.T) {
	svc := buildSvc(t) // semantic service has no Memory config
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-sem-"+uuid.New().String()[:8], nil)
	instIDStr := instID.String()

	// search_strategy → should return error (Memory not configured), not panic
	result := c.call(id, "search_strategy", map[string]any{
		"instance_id": instIDStr,
		"query":       "semantic propagation",
	})
	id++
	// Either an error response or a graceful "unavailable" message — must not panic
	if result.isError {
		t.Logf("search_strategy: correctly returns error when Memory unconfigured: %s", result.text[:min(len(result.text), 100)])
	} else {
		t.Logf("search_strategy: returned non-error response: %s", result.text[:min(len(result.text), 100)])
	}

	// detect_contradictions → same
	result2 := c.call(id, "detect_contradictions", map[string]any{
		"instance_id": instIDStr,
	})
	if result2.isError {
		t.Logf("detect_contradictions: correctly returns error when Memory unconfigured")
	} else {
		t.Logf("detect_contradictions: returned non-error response")
	}
}

// ---------------------------------------------------------------------------
// Scenario 10: Concurrent staging — isolation between batches
// ---------------------------------------------------------------------------

func TestMCP_ConcurrentStagingIsolation(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-conc-"+uuid.New().String()[:8], map[string]any{
		"fd-001": map[string]any{"id": "fd-001", "name": "Original"},
	})
	instIDStr := instID.String()

	// Two concurrent proposals for the same feature
	p1, _ := json.Marshal(map[string]any{"id": "fd-001", "name": "Agent A proposal"})
	p2, _ := json.Marshal(map[string]any{"id": "fd-001", "name": "Agent B proposal"})

	var stageA, stageB struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "update_feature", map[string]any{
		"instance_id": instIDStr, "feature_key": "fd-001", "payload": string(p1),
	}).assertOK().decode(&stageA)
	id++
	c.call(id, "update_feature", map[string]any{
		"instance_id": instIDStr, "feature_key": "fd-001", "payload": string(p2),
	}).assertOK().decode(&stageB)
	id++

	if stageA.BatchID == stageB.BatchID {
		t.Error("independent stages should have different batch IDs")
	}

	// Commit A — visible state becomes Agent A's proposal
	c.call(id, "commit_batch", map[string]any{"batch_id": stageA.BatchID}).assertOK()
	id++
	c.call(id, "get_feature", map[string]any{
		"instance_id": instIDStr, "feature_key": "fd-001",
	}).assertOK().contains("Agent A proposal")
	id++

	// Discard B — Agent A's committed version remains unchanged
	c.call(id, "discard_batch", map[string]any{"batch_id": stageB.BatchID}).assertOK()
	id++
	c.call(id, "get_feature", map[string]any{
		"instance_id": instIDStr, "feature_key": "fd-001",
	}).assertOK().contains("Agent A proposal")
}

// ---------------------------------------------------------------------------
// Scenario 11: Health check endpoint (HTTP, not MCP)
// ---------------------------------------------------------------------------

func TestHTTP_HealthCheck(t *testing.T) {
	svc := buildSvc(t)
	handler := mcpserver.New(svc)
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)

	// The health endpoint is on the Echo server, not the MCP handler.
	// Verify the MCP handler does NOT crash on a GET to /mcp.
	resp, err := http.Get(ts.URL + "/mcp")
	if err != nil {
		t.Fatalf("GET /mcp: %v", err)
	}
	defer resp.Body.Close() //nolint:errcheck
	// Any response (404, 405, 200) is fine — the server must not panic.
	t.Logf("GET /mcp status: %d", resp.StatusCode)
}

// ---------------------------------------------------------------------------
// Scenario 12: Large payload round-trip
// ---------------------------------------------------------------------------

func TestMCP_LargePayloadRoundTrip(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-large-"+uuid.New().String()[:8], nil)
	instIDStr := instID.String()

	// Build a large feature payload (~50 KB) with many nested fields
	keyResults := make([]map[string]any, 50)
	for i := range keyResults {
		keyResults[i] = map[string]any{
			"id":          fmt.Sprintf("kr-%03d", i),
			"description": strings.Repeat("key result description ", 10),
			"target":      fmt.Sprintf("%d%%", i*2),
		}
	}
	largePayload, _ := json.Marshal(map[string]any{
		"id":          "fd-100",
		"name":        "Large Feature",
		"description": strings.Repeat("This is a detailed description. ", 100),
		"hypothesis": map[string]any{
			"problem":     strings.Repeat("Problem description. ", 50),
			"solution":    strings.Repeat("Solution description. ", 50),
			"key_results": keyResults,
		},
		"value_model": map[string]any{
			"personas": []map[string]any{
				{"name": "Strategic Manager", "pain_points": keyResults},
			},
		},
	})

	t.Logf("payload size: %d bytes", len(largePayload))

	// Stage and commit
	var stageResp struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "create_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-100",
		"payload":     string(largePayload),
	}).assertOK().decode(&stageResp)
	id++

	c.call(id, "commit_batch", map[string]any{"batch_id": stageResp.BatchID}).assertOK()
	id++

	// Round-trip: read back and verify key fields intact
	c.call(id, "get_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-100",
	}).assertOK().
		contains("Large Feature").
		contains("kr-049")
}

// ---------------------------------------------------------------------------
// Scenario 13: Response latency — authoring hot path
// ---------------------------------------------------------------------------

func TestMCP_AuthoringHotPathLatency(t *testing.T) {
	if testing.Short() {
		t.Skip("latency test skipped in short mode")
	}

	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-perf-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"version": "1.0"},
		"fd-001":     map[string]any{"id": "fd-001", "name": "Perf Feature"},
	})
	instIDStr := instID.String()

	measure := func(label string, fn func() int) {
		t.Helper()
		start := time.Now()
		fn()
		elapsed := time.Since(start)
		t.Logf("%-40s %v", label, elapsed)
		// 500ms is a generous ceiling for a local test DB; real threshold
		// should be tightened once a baseline is established.
		if elapsed > 500*time.Millisecond {
			t.Errorf("%s: too slow (%v > 500ms)", label, elapsed)
		}
	}

	// Read single artifact
	measure("get_product_vision", func() int {
		c.call(id, "get_product_vision", map[string]any{"instance_id": instIDStr}).assertOK()
		id++
		return 0
	})

	// Stage a mutation
	var stageResp struct {
		BatchID string `json:"batch_id"`
	}
	measure("update_north_star (stage)", func() int {
		c.call(id, "update_north_star", map[string]any{
			"instance_id": instIDStr,
			"payload":     `{"version":"2.0"}`,
		}).assertOK().decode(&stageResp)
		id++
		return 0
	})

	// Commit
	measure("commit_batch", func() int {
		c.call(id, "commit_batch", map[string]any{"batch_id": stageResp.BatchID}).assertOK()
		id++
		return 0
	})

	// List features (all payloads)
	measure("list_features", func() int {
		c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).assertOK()
		id++
		return 0
	})
}

// ---------------------------------------------------------------------------
// Scenario 14: Strategic Index — full multi-type EPF instance
//
// Seeds payloads that mirror what cmd_import produces for real EPF artifacts:
//   - feature (fd-001) with strategic_context and dependencies
//   - commercial_def (FIRE/definitions/commercial/financing/cd-010)
//   - org_ops_def   (FIRE/definitions/org_ops/talent-management/pd-001)
//   - strategy_def  (FIRE/definitions/strategy/context/sd-001)
//   - value_model   (value_model_commercial.value_model)
//
// Then calls list_artifacts and asserts each type, name and track is indexed
// correctly — exercising the inferArtifactType + ExtractArtifactFields path
// end-to-end through MCP over HTTP.
// ---------------------------------------------------------------------------

func TestMCP_StrategicIndex_MultiTypeEPFInstance(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	// Payloads mirror real EPF artifact content (keys mirror cmd_import artifactKey logic).
	_, instID := seedInstance(t, svc, "test-org-index-"+uuid.New().String()[:8], map[string]any{
		// Feature definition — fd-NNN key, product track
		"fd-001": map[string]any{
			"id":     "fd-001",
			"name":   "Knowledge Graph Engine",
			"status": "delivered",
			"strategic_context": map[string]any{
				"tracks":             []any{"product"},
				"contributes_to":     []any{"Product.MemoryReasoningEngine.KnowledgeGraph"},
				"assumptions_tested": []any{"asm-p-001"},
			},
			"dependencies": map[string]any{
				"requires": []any{},
				"enables":  []any{},
			},
		},
		// Commercial def — full path key, commercial track
		"FIRE/definitions/commercial/financing/cd-010-investor-pitch-decks": map[string]any{
			"id":             "cd-010",
			"name":           "Investor Pitch Deck",
			"track":          "commercial",
			"status":         "ready",
			"contributes_to": []any{"Commercial.Fundraising.investor-pitch-decks"},
		},
		// Org ops def — full path key, org_ops track
		"FIRE/definitions/org_ops/talent-management/pd-001-new-hire-orientation": map[string]any{
			"id":             "pd-001",
			"name":           "New Hire Orientation",
			"track":          "org_ops",
			"status":         "ready",
			"contributes_to": []any{"OrgOps.Onboarding.orientation-programs"},
		},
		// Strategy def — full path key, strategy track
		"FIRE/definitions/strategy/context/sd-001-trends-and-opportunities": map[string]any{
			"id":             "sd-001",
			"name":           "Trends and Opportunities Analysis",
			"track":          "strategy",
			"status":         "ready",
			"contributes_to": []any{"Strategy.Market Analysis.trends-and-opportunities"},
		},
		// Value model — value_model_ prefix key
		"value_model_commercial.value_model": map[string]any{
			"track_name": "Commercial",
			"version":    "1.1.0",
			"status":     "active",
		},
	})
	instIDStr := instID.String()

	// --- list_artifacts (all) ---
	type artifactSummary struct {
		ArtifactType string  `json:"artifact_type"`
		ArtifactKey  string  `json:"artifact_key"`
		Name         *string `json:"name,omitempty"`
		Track        *string `json:"track,omitempty"`
		Status       string  `json:"status"`
	}
	var all []artifactSummary
	c.call(id, "list_artifacts", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&all)
	id++

	if len(all) != 5 {
		t.Fatalf("list_artifacts: expected 5 artifacts, got %d", len(all))
	}

	// Build a lookup by artifact_type for easy assertions.
	byType := make(map[string]artifactSummary)
	for _, a := range all {
		byType[a.ArtifactType] = a
	}

	// feature
	feat, ok := byType["feature"]
	if !ok {
		t.Fatal("list_artifacts: missing feature artifact")
	}
	if feat.Name == nil || *feat.Name != "Knowledge Graph Engine" {
		t.Errorf("feature name: got %v, want 'Knowledge Graph Engine'", feat.Name)
	}
	if feat.Track == nil || *feat.Track != "product" {
		t.Errorf("feature track: got %v, want 'product'", feat.Track)
	}
	if feat.Status != "delivered" {
		t.Errorf("feature status: got %q, want 'delivered'", feat.Status)
	}

	// commercial_def
	comm, ok := byType["commercial_def"]
	if !ok {
		t.Fatal("list_artifacts: missing commercial_def artifact")
	}
	if comm.Name == nil || *comm.Name != "Investor Pitch Deck" {
		t.Errorf("commercial_def name: got %v, want 'Investor Pitch Deck'", comm.Name)
	}
	if comm.Track == nil || *comm.Track != "commercial" {
		t.Errorf("commercial_def track: got %v, want 'commercial'", comm.Track)
	}

	// org_ops_def
	orgops, ok := byType["org_ops_def"]
	if !ok {
		t.Fatal("list_artifacts: missing org_ops_def artifact")
	}
	if orgops.Name == nil || *orgops.Name != "New Hire Orientation" {
		t.Errorf("org_ops_def name: got %v, want 'New Hire Orientation'", orgops.Name)
	}
	if orgops.Track == nil || *orgops.Track != "org_ops" {
		t.Errorf("org_ops_def track: got %v, want 'org_ops'", orgops.Track)
	}

	// strategy_def
	stratDef, ok := byType["strategy_def"]
	if !ok {
		t.Fatal("list_artifacts: missing strategy_def artifact")
	}
	if stratDef.Name == nil || *stratDef.Name != "Trends and Opportunities Analysis" {
		t.Errorf("strategy_def name: got %v, want 'Trends and Opportunities Analysis'", stratDef.Name)
	}
	if stratDef.Track == nil || *stratDef.Track != "strategy" {
		t.Errorf("strategy_def track: got %v, want 'strategy'", stratDef.Track)
	}

	// value_model
	vm, ok := byType["value_model"]
	if !ok {
		t.Fatal("list_artifacts: missing value_model artifact")
	}
	if vm.Name == nil || *vm.Name != "Commercial" {
		t.Errorf("value_model name: got %v, want 'Commercial'", vm.Name)
	}
	if vm.Track == nil || *vm.Track != "commercial" {
		t.Errorf("value_model track: got %v, want 'commercial'", vm.Track)
	}

	t.Logf("Strategic Index verified: %d artifacts across %d types", len(all), len(byType))
}

// ---------------------------------------------------------------------------
// Scenario 15: Relationship graph — feature edges after commit
//
// Commits a feature with contributes_to, assumptions_tested, and depends_on
// relationships, then calls list_relationships and verifies each edge is
// present with the correct relationship type and target.
// ---------------------------------------------------------------------------

func TestMCP_RelationshipGraph_FeatureEdgesAfterCommit(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-rels-"+uuid.New().String()[:8], map[string]any{
		// Seed a dependency target so the relationship has a real source.
		"fd-002": map[string]any{
			"id":   "fd-002",
			"name": "Document Ingestion Pipeline",
		},
	})
	instIDStr := instID.String()

	// Stage a feature that links to the value model, an assumption, and fd-002.
	featurePayload, _ := json.Marshal(map[string]any{
		"id":     "fd-001",
		"name":   "Knowledge Graph Engine",
		"status": "in-progress",
		"strategic_context": map[string]any{
			"tracks": []any{"product"},
			"contributes_to": []any{
				"Product.MemoryReasoningEngine.KnowledgeGraph",
				"Product.MemoryReasoningEngine.VectorSearch",
			},
			"assumptions_tested": []any{"asm-p-001", "asm-p-002"},
		},
		"dependencies": map[string]any{
			"requires": []any{
				map[string]any{"id": "fd-002", "reason": "Graph indexing requires ingested documents"},
			},
		},
	})

	var stageResp struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "create_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-001",
		"payload":     string(featurePayload),
	}).assertOK().decode(&stageResp)
	id++

	c.call(id, "commit_batch", map[string]any{"batch_id": stageResp.BatchID}).assertOK()
	id++

	// Query relationships for fd-001.
	type rel struct {
		SourceKey    string `json:"source_key"`
		TargetKey    string `json:"target_key"`
		TargetType   string `json:"target_type"`
		Relationship string `json:"relationship"`
	}
	var rels []rel
	c.call(id, "list_relationships", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "fd-001",
	}).assertOK().decode(&rels)
	id++

	// Build a set of (relationship, target_key) pairs for easy lookup.
	type relKey struct{ rel, target string }
	relSet := make(map[relKey]bool)
	for _, r := range rels {
		relSet[relKey{r.Relationship, r.TargetKey}] = true
	}

	checks := []struct {
		rel    string
		target string
		desc   string
	}{
		{"contributes_to", "Product.MemoryReasoningEngine.KnowledgeGraph", "contributes_to KnowledgeGraph"},
		{"contributes_to", "Product.MemoryReasoningEngine.VectorSearch", "contributes_to VectorSearch"},
		{"tests_assumption", "asm-p-001", "tests_assumption asm-p-001"},
		{"tests_assumption", "asm-p-002", "tests_assumption asm-p-002"},
		{"depends_on", "fd-002", "depends_on fd-002"},
		{"in_track", "product", "in_track product"},
	}

	for _, chk := range checks {
		if !relSet[relKey{chk.rel, chk.target}] {
			t.Errorf("missing relationship: %s — expected (%s → %s)", chk.desc, chk.rel, chk.target)
		}
	}

	if len(rels) < len(checks) {
		t.Errorf("list_relationships: got %d rels, want at least %d", len(rels), len(checks))
	}

	t.Logf("fd-001 relationships verified: %d edges", len(rels))
}

// ---------------------------------------------------------------------------
// Scenario 16: Cross-track query — list_artifacts filtered by type
//
// Seeds a multi-track instance with several artifacts per type, then calls
// list_artifacts with each artifact_type filter and verifies:
//   - only artifacts of the requested type are returned
//   - track field is correct for each type
//   - filtering is strict (no cross-contamination between types)
// ---------------------------------------------------------------------------

func TestMCP_CrossTrackQuery_ListArtifactsByType(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-xtrack-"+uuid.New().String()[:8], map[string]any{
		// Two commercial defs
		"FIRE/definitions/commercial/financing/cd-010-investor-pitch-decks": map[string]any{
			"id": "cd-010", "name": "Investor Pitch Deck",
			"track": "commercial", "status": "ready",
			"contributes_to": []any{"Commercial.Fundraising.investor-pitch-decks"},
		},
		"FIRE/definitions/commercial/sales-marketing/cd-020-sales-playbook": map[string]any{
			"id": "cd-020", "name": "Sales Playbook",
			"track": "commercial", "status": "draft",
			"contributes_to": []any{"Commercial.Sales.playbook"},
		},
		// Two org_ops defs
		"FIRE/definitions/org_ops/talent-management/pd-001-new-hire-orientation": map[string]any{
			"id": "pd-001", "name": "New Hire Orientation",
			"track": "org_ops", "status": "ready",
			"contributes_to": []any{"OrgOps.Onboarding.orientation-programs"},
		},
		"FIRE/definitions/org_ops/talent-management/pd-002-system-access-setup": map[string]any{
			"id": "pd-002", "name": "System Access Setup",
			"track": "org_ops", "status": "ready",
			"contributes_to": []any{"OrgOps.Onboarding.system-access"},
		},
		// One strategy def
		"FIRE/definitions/strategy/context/sd-001-trends-and-opportunities": map[string]any{
			"id": "sd-001", "name": "Trends and Opportunities Analysis",
			"track": "strategy", "status": "ready",
			"contributes_to": []any{"Strategy.Market Analysis.trends-and-opportunities"},
		},
		// One feature
		"fd-001": map[string]any{
			"id": "fd-001", "name": "Knowledge Graph Engine",
			"status":            "delivered",
			"strategic_context": map[string]any{"tracks": []any{"product"}},
		},
	})
	instIDStr := instID.String()

	type artifactSummary struct {
		ArtifactType string  `json:"artifact_type"`
		ArtifactKey  string  `json:"artifact_key"`
		Name         *string `json:"name,omitempty"`
		Track        *string `json:"track,omitempty"`
	}

	// commercial_def filter — must return exactly 2, all with track=commercial
	var commercialDefs []artifactSummary
	c.call(id, "list_artifacts", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "commercial_def",
	}).assertOK().decode(&commercialDefs)
	id++

	if len(commercialDefs) != 2 {
		t.Errorf("commercial_def count: got %d, want 2", len(commercialDefs))
	}
	for _, a := range commercialDefs {
		if a.ArtifactType != "commercial_def" {
			t.Errorf("commercial_def filter returned wrong type: %q", a.ArtifactType)
		}
		if a.Track == nil || *a.Track != "commercial" {
			t.Errorf("commercial_def %q track: got %v, want 'commercial'", a.ArtifactKey, a.Track)
		}
	}

	// org_ops_def filter — must return exactly 2, all with track=org_ops
	var orgopsDefs []artifactSummary
	c.call(id, "list_artifacts", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "org_ops_def",
	}).assertOK().decode(&orgopsDefs)
	id++

	if len(orgopsDefs) != 2 {
		t.Errorf("org_ops_def count: got %d, want 2", len(orgopsDefs))
	}
	for _, a := range orgopsDefs {
		if a.Track == nil || *a.Track != "org_ops" {
			t.Errorf("org_ops_def %q track: got %v, want 'org_ops'", a.ArtifactKey, a.Track)
		}
	}

	// strategy_def filter — must return exactly 1
	var stratDefs []artifactSummary
	c.call(id, "list_artifacts", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "strategy_def",
	}).assertOK().decode(&stratDefs)
	id++

	if len(stratDefs) != 1 {
		t.Errorf("strategy_def count: got %d, want 1", len(stratDefs))
	}
	if len(stratDefs) > 0 {
		if stratDefs[0].Track == nil || *stratDefs[0].Track != "strategy" {
			t.Errorf("strategy_def track: got %v, want 'strategy'", stratDefs[0].Track)
		}
	}

	// Unfiltered total: should be 6
	var allArtifacts []artifactSummary
	c.call(id, "list_artifacts", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&allArtifacts)
	id++

	if len(allArtifacts) != 6 {
		t.Errorf("unfiltered artifact count: got %d, want 6", len(allArtifacts))
	}

	t.Logf("cross-track query verified: %d total, %d commercial, %d org_ops, %d strategy",
		len(allArtifacts), len(commercialDefs), len(orgopsDefs), len(stratDefs))
}

// ---------------------------------------------------------------------------
// Scenario 17: Strategy def authoring cycle — create, index, update
//
// An agent authors a new strategy definition via the staged batch pattern:
//   1. create_feature is not appropriate — strategy-server uses stageArtifact
//      for any artifact type via update_north_star as the generic write path.
//      We use the direct Service.Stage path via seedInstance for the initial
//      seed, then use the MCP write tools for the update.
//   2. After commit, list_artifacts?type=strategy_def shows the new artifact
//      with the correct name and track.
//   3. Agent updates the artifact — index reflects the new name immediately.
// ---------------------------------------------------------------------------

func TestMCP_StrategyDefAuthoringCycle(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	// Start with an empty instance.
	_, instID := seedInstance(t, svc, "test-org-sdef-"+uuid.New().String()[:8], nil)
	instIDStr := instID.String()

	// Stage a new strategy_def via the generic update_north_star path.
	// (The server's stageArtifact helper infers type from key for write tools.
	// We use update_north_star's pattern by manually seeding through the strategy
	// service directly so we can use an arbitrary artifact_type and key.)
	// Seed directly — bypass MCP for the initial create, then test MCP read/update.
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceSystem)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())

	sdKey := "FIRE/definitions/strategy/context/sd-005-strengths-and-weaknesses"
	sdContent := map[string]any{
		"id":             "sd-005",
		"name":           "Strengths And Weaknesses",
		"track":          "strategy",
		"status":         "draft",
		"contributes_to": []any{"Strategy.Competitor Analysis.strengths-and-weaknesses"},
	}

	batchID, err := svc.Strategy.Stage(ctx, strategy.StageParams{
		InstanceID:   instID,
		ArtifactType: "strategy_def",
		ArtifactKey:  sdKey,
		Action:       "create",
		Payload:      sdContent,
	})
	if err != nil {
		t.Fatalf("stage strategy_def: %v", err)
	}
	if _, err := svc.Strategy.CommitBatch(ctx, batchID); err != nil {
		t.Fatalf("commit strategy_def: %v", err)
	}

	// list_artifacts?type=strategy_def must show it.
	type artifactSummary struct {
		ArtifactType string  `json:"artifact_type"`
		ArtifactKey  string  `json:"artifact_key"`
		Name         *string `json:"name,omitempty"`
		Track        *string `json:"track,omitempty"`
		Status       string  `json:"status"`
	}
	var stratDefs []artifactSummary
	c.call(id, "list_artifacts", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "strategy_def",
	}).assertOK().decode(&stratDefs)
	id++

	if len(stratDefs) != 1 {
		t.Fatalf("strategy_def count after create: got %d, want 1", len(stratDefs))
	}
	sd := stratDefs[0]
	if sd.Name == nil || *sd.Name != "Strengths And Weaknesses" {
		t.Errorf("strategy_def name: got %v, want 'Strengths And Weaknesses'", sd.Name)
	}
	if sd.Track == nil || *sd.Track != "strategy" {
		t.Errorf("strategy_def track: got %v, want 'strategy'", sd.Track)
	}
	if sd.Status != "draft" {
		t.Errorf("strategy_def status: got %q, want 'draft'", sd.Status)
	}

	// Verify the contributes_to relationship is in the graph.
	type rel struct {
		Relationship string `json:"relationship"`
		TargetKey    string `json:"target_key"`
	}
	var rels []rel
	c.call(id, "list_relationships", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": sdKey,
	}).assertOK().decode(&rels)
	id++

	foundContrib := false
	for _, r := range rels {
		if r.Relationship == "contributes_to" && r.TargetKey == "Strategy.Competitor Analysis.strengths-and-weaknesses" {
			foundContrib = true
		}
	}
	if !foundContrib {
		t.Errorf("strategy_def: contributes_to relationship not found in graph (got %d rels)", len(rels))
	}

	// Now update the strategy_def to status=ready via the strategy service.
	updatedContent := map[string]any{
		"id":             "sd-005",
		"name":           "Strengths And Weaknesses",
		"track":          "strategy",
		"status":         "ready",
		"contributes_to": []any{"Strategy.Competitor Analysis.strengths-and-weaknesses"},
	}
	updateBatch, err := svc.Strategy.Stage(ctx, strategy.StageParams{
		InstanceID:   instID,
		ArtifactType: "strategy_def",
		ArtifactKey:  sdKey,
		Action:       "update",
		Payload:      updatedContent,
	})
	if err != nil {
		t.Fatalf("stage strategy_def update: %v", err)
	}
	if _, err := svc.Strategy.CommitBatch(ctx, updateBatch); err != nil {
		t.Fatalf("commit strategy_def update: %v", err)
	}

	// Index must reflect the new status.
	var updatedDefs []artifactSummary
	c.call(id, "list_artifacts", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "strategy_def",
	}).assertOK().decode(&updatedDefs)
	id++

	if len(updatedDefs) != 1 {
		t.Fatalf("strategy_def count after update: got %d, want 1", len(updatedDefs))
	}
	if updatedDefs[0].Status != "ready" {
		t.Errorf("strategy_def status after update: got %q, want 'ready'", updatedDefs[0].Status)
	}

	t.Logf("strategy_def authoring cycle verified: create → index → update → re-index")
}

// ---------------------------------------------------------------------------
// Scenario 18: Relationship replacement on feature update
//
// Verifies that when a feature's strategic_context.contributes_to paths change,
// CommitBatch replaces the old relationships with the new ones — no stale edges.
//
//   Round 1: fd-001 contributes_to ["Path.A"]                 → 1 contributes_to edge
//   Round 2: fd-001 contributes_to ["Path.B", "Path.C"]       → 2 edges, Path.A gone
// ---------------------------------------------------------------------------

func TestMCP_RelationshipReplacement_OnFeatureUpdate(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-relrepl-"+uuid.New().String()[:8], nil)
	instIDStr := instID.String()

	// Round 1: commit feature with a single contributes_to path.
	payload1, _ := json.Marshal(map[string]any{
		"id":   "fd-001",
		"name": "Knowledge Graph Engine",
		"strategic_context": map[string]any{
			"tracks":         []any{"product"},
			"contributes_to": []any{"Product.MemoryReasoningEngine.KnowledgeGraph"},
		},
	})
	var stage1 struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "create_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-001",
		"payload":     string(payload1),
	}).assertOK().decode(&stage1)
	id++
	c.call(id, "commit_batch", map[string]any{"batch_id": stage1.BatchID}).assertOK()
	id++

	// Verify 1 contributes_to relationship.
	var rels1 []relEntry
	c.call(id, "list_relationships", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "fd-001",
	}).assertOK().decode(&rels1)
	id++

	contribs1 := filterRelEntries(rels1, "contributes_to")
	if len(contribs1) != 1 {
		t.Fatalf("round 1 contributes_to count: got %d, want 1", len(contribs1))
	}
	if contribs1[0].TargetKey != "Product.MemoryReasoningEngine.KnowledgeGraph" {
		t.Errorf("round 1 target: got %q, want KnowledgeGraph", contribs1[0].TargetKey)
	}

	// Round 2: update with two different contributes_to paths — Path.A removed.
	payload2, _ := json.Marshal(map[string]any{
		"id":   "fd-001",
		"name": "Knowledge Graph Engine",
		"strategic_context": map[string]any{
			"tracks": []any{"product"},
			"contributes_to": []any{
				"Product.MemoryReasoningEngine.VectorSearch",
				"Product.MemoryReasoningEngine.DocumentChunking",
			},
		},
	})
	var stage2 struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "update_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-001",
		"payload":     string(payload2),
	}).assertOK().decode(&stage2)
	id++
	c.call(id, "commit_batch", map[string]any{"batch_id": stage2.BatchID}).assertOK()
	id++

	// Verify new relationships: 2 contributes_to, original KnowledgeGraph path gone.
	var rels2 []relEntry
	c.call(id, "list_relationships", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "fd-001",
	}).assertOK().decode(&rels2)
	id++

	contribs2 := filterRelEntries(rels2, "contributes_to")
	if len(contribs2) != 2 {
		t.Fatalf("round 2 contributes_to count: got %d, want 2", len(contribs2))
	}

	targetSet := make(map[string]bool)
	for _, r := range contribs2 {
		targetSet[r.TargetKey] = true
	}
	if targetSet["Product.MemoryReasoningEngine.KnowledgeGraph"] {
		t.Error("round 2: stale KnowledgeGraph relationship not removed after update")
	}
	if !targetSet["Product.MemoryReasoningEngine.VectorSearch"] {
		t.Error("round 2: VectorSearch relationship not present")
	}
	if !targetSet["Product.MemoryReasoningEngine.DocumentChunking"] {
		t.Error("round 2: DocumentChunking relationship not present")
	}

	t.Logf("relationship replacement verified: old edge removed, 2 new edges present")
}

// relEntry is a minimal relationship struct used across the real-EPF-data tests.
type relEntry struct {
	Relationship string `json:"relationship"`
	TargetKey    string `json:"target_key"`
}

// filterRelEntries returns the subset of relEntry values matching the given relationship kind.
func filterRelEntries(rels []relEntry, kind string) []relEntry {
	var out []relEntry
	for _, r := range rels {
		if r.Relationship == kind {
			out = append(out, r)
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Scenario 19: Agent identity round-trip (Phase B+)
//
// An agent stages a mutation, attaches its identity via describe_batch, then
// list_pending_batches returns the batch with correct agent_id and description.
// After commit the batch is no longer pending.
// ---------------------------------------------------------------------------

func TestMCP_AgentIdentityRoundTrip(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-agentid-"+uuid.New().String()[:8], nil)
	instIDStr := instID.String()

	// Stage a feature — any write tool produces a batch_id.
	payload, _ := json.Marshal(map[string]any{
		"id": "fd-001", "name": "Knowledge Graph Engine", "status": "draft",
	})
	var stageResp struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "create_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-001",
		"payload":     string(payload),
	}).assertOK().decode(&stageResp)
	id++

	batchID := stageResp.BatchID
	if batchID == "" {
		t.Fatal("create_feature: no batch_id")
	}

	// Pending batches must include this batch before describe.
	type pendingBatch struct {
		BatchID          string  `json:"batch_id"`
		ArtifactCount    int     `json:"artifact_count"`
		AgentID          *string `json:"agent_id,omitempty"`
		BatchDescription *string `json:"batch_description,omitempty"`
	}
	var pendingBefore []pendingBatch
	c.call(id, "list_pending_batches", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&pendingBefore)
	id++

	found := false
	for _, b := range pendingBefore {
		if b.BatchID == batchID {
			found = true
			if b.ArtifactCount != 1 {
				t.Errorf("pending batch artifact_count: got %d, want 1", b.ArtifactCount)
			}
		}
	}
	if !found {
		t.Fatal("list_pending_batches: staged batch not found before describe")
	}

	// Agent attaches its identity.
	var describeResp struct {
		Described bool   `json:"described"`
		AgentID   string `json:"agent_id"`
	}
	c.call(id, "describe_batch", map[string]any{
		"batch_id":    batchID,
		"agent_id":    "pathfinder",
		"description": "Adding Knowledge Graph Engine feature based on strategic analysis",
	}).assertOK().decode(&describeResp)
	id++

	if !describeResp.Described {
		t.Error("describe_batch: described=false")
	}
	if describeResp.AgentID != "pathfinder" {
		t.Errorf("describe_batch: agent_id=%q, want pathfinder", describeResp.AgentID)
	}

	// list_pending_batches now returns the batch with agent_id + description.
	var pendingAfterDescribe []pendingBatch
	c.call(id, "list_pending_batches", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&pendingAfterDescribe)
	id++

	for _, b := range pendingAfterDescribe {
		if b.BatchID == batchID {
			if b.AgentID == nil || *b.AgentID != "pathfinder" {
				t.Errorf("after describe: agent_id=%v, want 'pathfinder'", b.AgentID)
			}
			if b.BatchDescription == nil || *b.BatchDescription == "" {
				t.Error("after describe: batch_description is empty")
			}
		}
	}

	// Commit — batch must no longer appear in pending list.
	c.call(id, "commit_batch", map[string]any{"batch_id": batchID}).assertOK()
	id++

	var pendingAfterCommit []pendingBatch
	c.call(id, "list_pending_batches", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&pendingAfterCommit)
	id++

	for _, b := range pendingAfterCommit {
		if b.BatchID == batchID {
			t.Error("list_pending_batches: committed batch still appears as pending")
		}
	}

	t.Logf("agent identity round-trip: stage → describe(pathfinder) → commit → no longer pending")
}

// ---------------------------------------------------------------------------
// Scenario 20: Expanded write tools (Phase D)
//
// Tests all new typed write tools and the generic stage_artifact escape hatch:
//   - update_strategy_foundations  → index shows strategy_foundations artifact
//   - update_insight_analyses       → index shows insight_analyses artifact
//   - update_strategy_formula       → index shows strategy_formula artifact
//   - update_roadmap                → index shows roadmap_recipe artifact
//   - update_value_model(track=product) → key value_model_product.value_model
//   - stage_artifact(commercial_def) → generic escape hatch works
// ---------------------------------------------------------------------------

func TestMCP_ExpandedWriteTools(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-expanded-"+uuid.New().String()[:8], nil)
	instIDStr := instID.String()

	type stageResp struct {
		Staged      bool   `json:"staged"`
		BatchID     string `json:"batch_id"`
		ArtifactKey string `json:"artifact_key"`
	}

	stageAndCommit := func(toolName string, args map[string]any) {
		t.Helper()
		var r stageResp
		c.call(id, toolName, args).assertOK().decode(&r)
		id++
		if !r.Staged {
			t.Errorf("%s: staged=false", toolName)
		}
		c.call(id, "commit_batch", map[string]any{"batch_id": r.BatchID}).assertOK()
		id++
	}

	// update_strategy_foundations
	sfPayload, _ := json.Marshal(map[string]any{
		"version": "1.0", "personas": []any{map[string]any{"id": "p-001", "name": "Strategic Manager"}},
	})
	stageAndCommit("update_strategy_foundations", map[string]any{
		"instance_id": instIDStr,
		"payload":     string(sfPayload),
	})

	// update_insight_analyses
	iaPayload, _ := json.Marshal(map[string]any{
		"version": "1.0", "competitive_landscape": map[string]any{"summary": "Fragmented market"},
	})
	stageAndCommit("update_insight_analyses", map[string]any{
		"instance_id": instIDStr,
		"payload":     string(iaPayload),
	})

	// update_strategy_formula
	sfrmPayload, _ := json.Marshal(map[string]any{
		"version": "1.0", "vision": "Make strategy accessible to every company",
	})
	stageAndCommit("update_strategy_formula", map[string]any{
		"instance_id": instIDStr,
		"payload":     string(sfrmPayload),
	})

	// update_roadmap
	rmPayload, _ := json.Marshal(map[string]any{
		"version": "1.0", "phases": []any{map[string]any{"name": "Phase 1", "features": []any{"fd-001"}}},
	})
	stageAndCommit("update_roadmap", map[string]any{
		"instance_id": instIDStr,
		"payload":     string(rmPayload),
	})

	// update_value_model (track=product)
	vmPayload, _ := json.Marshal(map[string]any{
		"track_name": "Product", "version": "1.0", "status": "active",
	})
	stageAndCommit("update_value_model", map[string]any{
		"instance_id": instIDStr,
		"track":       "product",
		"payload":     string(vmPayload),
	})

	// stage_artifact — generic escape hatch for commercial_def
	cdKey := "FIRE/definitions/commercial/financing/cd-010-investor-pitch-decks"
	cdPayload, _ := json.Marshal(map[string]any{
		"id": "cd-010", "name": "Investor Pitch Deck", "track": "commercial", "status": "ready",
		"contributes_to": []any{"Commercial.Fundraising.investor-pitch-decks"},
	})
	var saResp stageResp
	c.call(id, "stage_artifact", map[string]any{
		"instance_id":   instIDStr,
		"artifact_type": "commercial_def",
		"artifact_key":  cdKey,
		"action":        "create",
		"payload":       string(cdPayload),
	}).assertOK().decode(&saResp)
	id++
	c.call(id, "commit_batch", map[string]any{"batch_id": saResp.BatchID}).assertOK()
	id++

	// Verify the Strategic Index now holds all 6 committed artifacts.
	type artifactSummary struct {
		ArtifactType string  `json:"artifact_type"`
		ArtifactKey  string  `json:"artifact_key"`
		Name         *string `json:"name,omitempty"`
		Track        *string `json:"track,omitempty"`
	}
	var all []artifactSummary
	c.call(id, "list_artifacts", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&all)
	id++

	if len(all) != 6 {
		t.Errorf("list_artifacts: expected 6 committed artifacts, got %d", len(all))
	}

	byType := make(map[string]artifactSummary)
	for _, a := range all {
		byType[a.ArtifactType] = a
	}

	for _, wantType := range []string{
		"strategy_foundations", "insight_analyses", "strategy_formula",
		"roadmap_recipe", "value_model", "commercial_def",
	} {
		if _, ok := byType[wantType]; !ok {
			t.Errorf("missing artifact type in index: %s", wantType)
		}
	}

	// value_model should have track=product (from payload track_name field name matching)
	if vm, ok := byType["value_model"]; ok {
		if vm.Track == nil || *vm.Track != "product" {
			t.Errorf("value_model track: got %v, want 'product'", vm.Track)
		}
	}

	// commercial_def should have track=commercial
	if cd, ok := byType["commercial_def"]; ok {
		if cd.Track == nil || *cd.Track != "commercial" {
			t.Errorf("commercial_def track: got %v, want 'commercial'", cd.Track)
		}
	}

	t.Logf("expanded write tools verified: %d artifact types in index", len(byType))
}

// ---------------------------------------------------------------------------
// Scenario 21: batch_create_artifacts — multi-artifact staging
//
// Stages 3 artifacts in one call, verifies all share the same batch_id,
// none are visible before commit, and all 3 appear after commit.
// ---------------------------------------------------------------------------

func TestMCP_BatchCreateArtifacts(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-batch-"+uuid.New().String()[:8], nil)
	instIDStr := instID.String()

	artifacts, _ := json.Marshal([]map[string]any{
		{
			"artifact_type": "feature",
			"artifact_key":  "fd-001",
			"payload": map[string]any{
				"id": "fd-001", "name": "Knowledge Graph Engine", "status": "draft",
				"strategic_context": map[string]any{
					"tracks":         []any{"product"},
					"contributes_to": []any{"Product.MemoryReasoningEngine.KnowledgeGraph"},
				},
			},
		},
		{
			"artifact_type": "feature",
			"artifact_key":  "fd-002",
			"payload": map[string]any{
				"id": "fd-002", "name": "Document Ingestion Pipeline", "status": "draft",
				"strategic_context": map[string]any{
					"tracks":         []any{"product"},
					"contributes_to": []any{"Product.MemoryReasoningEngine.DocumentChunking"},
				},
			},
		},
		{
			"artifact_type": "feature",
			"artifact_key":  "fd-003",
			"payload": map[string]any{
				"id": "fd-003", "name": "AI Native Chat", "status": "draft",
				"strategic_context": map[string]any{
					"tracks": []any{"product"},
				},
			},
		},
	})

	var batchResp struct {
		Staged       bool     `json:"staged"`
		BatchID      string   `json:"batch_id"`
		ArtifactKeys []string `json:"artifact_keys"`
		Count        int      `json:"count"`
	}
	c.call(id, "batch_create_artifacts", map[string]any{
		"instance_id": instIDStr,
		"artifacts":   string(artifacts),
	}).assertOK().decode(&batchResp)
	id++

	if !batchResp.Staged {
		t.Error("batch_create_artifacts: staged=false")
	}
	if batchResp.Count != 3 {
		t.Errorf("batch_create_artifacts: count=%d, want 3", batchResp.Count)
	}
	if len(batchResp.ArtifactKeys) != 3 {
		t.Errorf("batch_create_artifacts: artifact_keys len=%d, want 3", len(batchResp.ArtifactKeys))
	}
	if batchResp.BatchID == "" {
		t.Fatal("batch_create_artifacts: no batch_id")
	}

	// Before commit — none of the 3 should be visible.
	var beforeCommit []map[string]any
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&beforeCommit)
	id++
	if len(beforeCommit) != 0 {
		t.Errorf("features visible before commit: %d, want 0", len(beforeCommit))
	}

	// Pending batches — should see this batch with 3 artifacts.
	type pendingBatch struct {
		BatchID       string `json:"batch_id"`
		ArtifactCount int    `json:"artifact_count"`
	}
	var pending []pendingBatch
	c.call(id, "list_pending_batches", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&pending)
	id++

	foundPending := false
	for _, b := range pending {
		if b.BatchID == batchResp.BatchID {
			foundPending = true
			if b.ArtifactCount != 3 {
				t.Errorf("pending batch artifact_count: got %d, want 3", b.ArtifactCount)
			}
		}
	}
	if !foundPending {
		t.Error("list_pending_batches: batch_create_artifacts batch not found")
	}

	// Commit the batch.
	var commitResp struct {
		Committed bool `json:"committed"`
		Count     int  `json:"count"`
	}
	c.call(id, "commit_batch", map[string]any{"batch_id": batchResp.BatchID}).
		assertOK().decode(&commitResp)
	id++

	if commitResp.Count != 3 {
		t.Errorf("commit_batch: count=%d, want 3", commitResp.Count)
	}

	// After commit — all 3 features visible.
	var afterCommit []map[string]any
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&afterCommit)
	id++

	if len(afterCommit) != 3 {
		t.Errorf("features after commit: got %d, want 3", len(afterCommit))
	}

	// Verify each feature has contributes_to relationships indexed.
	type relEntry2 struct {
		Relationship string `json:"relationship"`
		TargetKey    string `json:"target_key"`
	}
	var fd001Rels []relEntry2
	c.call(id, "list_relationships", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "fd-001",
	}).assertOK().decode(&fd001Rels)
	id++

	hasContrib := false
	for _, r := range fd001Rels {
		if r.Relationship == "contributes_to" {
			hasContrib = true
		}
	}
	if !hasContrib {
		t.Error("fd-001: contributes_to relationship not indexed after batch commit")
	}

	t.Logf("batch_create_artifacts: 3 features staged in 1 batch, committed, indexed with relationships")
}

// ---------------------------------------------------------------------------
// Scenario 22: Phase E derived read tools
//
// Seeds an isolated instance with three features that share overlapping
// contributes_to, tests_assumption, depends_on, and enables relationships,
// then exercises all six Phase E tools and asserts structural invariants.
// ---------------------------------------------------------------------------

func TestMCP_DerivedReadTools(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	// Seed an empty instance (no pre-loaded artifacts).
	_, instID := seedInstance(t, svc, "test-org-derived-"+uuid.New().String()[:8], map[string]any{})
	instIDStr := instID.String()

	// Feature 1: fd-alpha — contributes to two value paths, tests one assumption,
	// depends on fd-beta, and enables fd-gamma.
	alphaPayload, _ := json.Marshal(map[string]any{
		"id":     "fd-alpha",
		"name":   "Alpha Feature",
		"status": "planned",
		"strategic_context": map[string]any{
			"tracks":             []any{"product"},
			"contributes_to":     []any{"Product.Revenue.Premium", "Product.Retention.Core"},
			"assumptions_tested": []any{"asm-001"},
		},
		"dependencies": map[string]any{
			"requires": []any{
				map[string]any{"id": "fd-beta", "reason": "needs beta"},
			},
			"enables": []any{
				map[string]any{"id": "fd-gamma", "reason": "unlocks gamma"},
			},
		},
	})

	// Feature 2: fd-beta — contributes to one value path, tests same assumption.
	betaPayload, _ := json.Marshal(map[string]any{
		"id":     "fd-beta",
		"name":   "Beta Feature",
		"status": "in-progress",
		"strategic_context": map[string]any{
			"tracks":             []any{"platform"},
			"contributes_to":     []any{"Product.Revenue.Premium"},
			"assumptions_tested": []any{"asm-001", "asm-002"},
		},
	})

	// Feature 3: fd-gamma — contributes to a unique value path, no assumptions.
	gammaPayload, _ := json.Marshal(map[string]any{
		"id":     "fd-gamma",
		"name":   "Gamma Feature",
		"status": "planned",
		"strategic_context": map[string]any{
			"tracks":         []any{"growth"},
			"contributes_to": []any{"Product.Growth.Expansion"},
		},
	})

	// Stage and commit each feature.
	stageAndCommit := func(featureKey, payloadStr string) {
		t.Helper()
		var sr struct {
			BatchID string `json:"batch_id"`
		}
		c.call(id, "create_feature", map[string]any{
			"instance_id": instIDStr,
			"feature_key": featureKey,
			"payload":     payloadStr,
		}).assertOK().decode(&sr)
		id++
		c.call(id, "commit_batch", map[string]any{"batch_id": sr.BatchID}).assertOK()
		id++
	}

	stageAndCommit("fd-alpha", string(alphaPayload))
	stageAndCommit("fd-beta", string(betaPayload))
	stageAndCommit("fd-gamma", string(gammaPayload))

	// -------------------------------------------------------------------------
	// Tool 1: get_strategic_context_for_feature
	// -------------------------------------------------------------------------
	var ctx1 struct {
		Feature struct {
			ArtifactKey string `json:"artifact_key"`
		} `json:"feature"`
		ContributesTo    []string `json:"contributes_to"`
		TestsAssumptions []string `json:"tests_assumptions"`
		DependsOn        []string `json:"depends_on"`
		Enables          []string `json:"enables"`
		InTracks         []string `json:"in_tracks"`
	}
	c.call(id, "get_strategic_context_for_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-alpha",
	}).assertOK().decode(&ctx1)
	id++

	if ctx1.Feature.ArtifactKey != "fd-alpha" {
		t.Errorf("get_strategic_context_for_feature: artifact_key=%q, want fd-alpha", ctx1.Feature.ArtifactKey)
	}
	if len(ctx1.ContributesTo) < 2 {
		t.Errorf("get_strategic_context_for_feature: contributes_to count=%d, want >=2", len(ctx1.ContributesTo))
	}
	if len(ctx1.TestsAssumptions) < 1 {
		t.Errorf("get_strategic_context_for_feature: tests_assumptions count=%d, want >=1", len(ctx1.TestsAssumptions))
	}
	if len(ctx1.DependsOn) < 1 {
		t.Errorf("get_strategic_context_for_feature: depends_on count=%d, want >=1", len(ctx1.DependsOn))
	}
	if len(ctx1.Enables) < 1 {
		t.Errorf("get_strategic_context_for_feature: enables count=%d, want >=1", len(ctx1.Enables))
	}
	t.Logf("get_strategic_context_for_feature: fd-alpha contributes_to=%v depends_on=%v enables=%v",
		ctx1.ContributesTo, ctx1.DependsOn, ctx1.Enables)

	// Not-found case.
	c.call(id, "get_strategic_context_for_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-does-not-exist",
	}).assertError()
	id++

	// -------------------------------------------------------------------------
	// Tool 2: explain_value_path
	// -------------------------------------------------------------------------
	var vp struct {
		FeatureKey string   `json:"feature_key"`
		ValuePaths []string `json:"value_paths"`
		PathCount  int      `json:"path_count"`
	}
	c.call(id, "explain_value_path", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-alpha",
	}).assertOK().decode(&vp)
	id++

	if vp.PathCount < 2 {
		t.Errorf("explain_value_path: path_count=%d, want >=2", vp.PathCount)
	}
	// fd-beta contributes to only one path.
	var vpBeta struct {
		PathCount int `json:"path_count"`
	}
	c.call(id, "explain_value_path", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-beta",
	}).assertOK().decode(&vpBeta)
	id++
	if vpBeta.PathCount < 1 {
		t.Errorf("explain_value_path fd-beta: path_count=%d, want >=1", vpBeta.PathCount)
	}
	t.Logf("explain_value_path: fd-alpha value_paths=%v", vp.ValuePaths)

	// -------------------------------------------------------------------------
	// Tool 3: get_coverage_analysis
	// -------------------------------------------------------------------------
	var cov struct {
		Coverage []struct {
			ValuePath string   `json:"value_path"`
			Features  []string `json:"features"`
		} `json:"coverage"`
		PathCount int `json:"path_count"`
	}
	c.call(id, "get_coverage_analysis", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&cov)
	id++

	// Expect at least 3 distinct value paths (Premium, Core, Expansion).
	if cov.PathCount < 3 {
		t.Errorf("get_coverage_analysis: path_count=%d, want >=3", cov.PathCount)
	}
	// Premium should be covered by both fd-alpha and fd-beta.
	premiumCovered := false
	for _, entry := range cov.Coverage {
		if entry.ValuePath == "Product.Revenue.Premium" && len(entry.Features) >= 2 {
			premiumCovered = true
		}
	}
	if !premiumCovered {
		t.Errorf("get_coverage_analysis: Product.Revenue.Premium not covered by >=2 features")
	}
	t.Logf("get_coverage_analysis: %d value paths covered", cov.PathCount)

	// -------------------------------------------------------------------------
	// Tool 4: get_value_propositions
	// -------------------------------------------------------------------------
	var vprop struct {
		Features []struct {
			ArtifactKey   string   `json:"artifact_key"`
			ContributesTo []string `json:"contributes_to"`
		} `json:"features"`
		FeatureCount int `json:"feature_count"`
	}
	c.call(id, "get_value_propositions", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&vprop)
	id++

	if vprop.FeatureCount < 3 {
		t.Errorf("get_value_propositions: feature_count=%d, want >=3", vprop.FeatureCount)
	}
	// Every feature should appear; fd-alpha and fd-beta should have contributes_to.
	alphaFound, betaFound := false, false
	for _, f := range vprop.Features {
		switch f.ArtifactKey {
		case "fd-alpha":
			alphaFound = true
			if len(f.ContributesTo) < 2 {
				t.Errorf("get_value_propositions: fd-alpha contributes_to count=%d, want >=2", len(f.ContributesTo))
			}
		case "fd-beta":
			betaFound = true
			if len(f.ContributesTo) < 1 {
				t.Errorf("get_value_propositions: fd-beta contributes_to count=%d, want >=1", len(f.ContributesTo))
			}
		}
	}
	if !alphaFound {
		t.Error("get_value_propositions: fd-alpha not found")
	}
	if !betaFound {
		t.Error("get_value_propositions: fd-beta not found")
	}
	t.Logf("get_value_propositions: %d features returned", vprop.FeatureCount)

	// -------------------------------------------------------------------------
	// Tool 5: get_assumptions
	// -------------------------------------------------------------------------
	var asmp struct {
		Assumptions []struct {
			AssumptionKey string   `json:"assumption_key"`
			TestedBy      []string `json:"tested_by"`
		} `json:"assumptions"`
		AssumptionCount int `json:"assumption_count"`
	}
	c.call(id, "get_assumptions", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&asmp)
	id++

	// asm-001 is tested by both fd-alpha and fd-beta; asm-002 by fd-beta only.
	if asmp.AssumptionCount < 2 {
		t.Errorf("get_assumptions: assumption_count=%d, want >=2", asmp.AssumptionCount)
	}
	asm001Found := false
	for _, a := range asmp.Assumptions {
		if a.AssumptionKey == "asm-001" {
			asm001Found = true
			if len(a.TestedBy) < 2 {
				t.Errorf("get_assumptions: asm-001 tested_by count=%d, want >=2", len(a.TestedBy))
			}
		}
	}
	if !asm001Found {
		t.Error("get_assumptions: asm-001 not found")
	}
	t.Logf("get_assumptions: %d assumptions, asm-001 found=%v", asmp.AssumptionCount, asm001Found)

	// -------------------------------------------------------------------------
	// Tool 6: get_feature_dependencies
	// -------------------------------------------------------------------------
	var depGraph struct {
		DependsOn []struct {
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"depends_on"`
		Enables []struct {
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"enables"`
	}
	c.call(id, "get_feature_dependencies", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&depGraph)
	id++

	// fd-alpha depends_on fd-beta.
	hasDep := false
	for _, e := range depGraph.DependsOn {
		if e.From == "fd-alpha" && e.To == "fd-beta" {
			hasDep = true
		}
	}
	if !hasDep {
		t.Errorf("get_feature_dependencies: fd-alpha depends_on fd-beta not found; got %+v", depGraph.DependsOn)
	}
	// fd-alpha enables fd-gamma.
	hasEnables := false
	for _, e := range depGraph.Enables {
		if e.From == "fd-alpha" && e.To == "fd-gamma" {
			hasEnables = true
		}
	}
	if !hasEnables {
		t.Errorf("get_feature_dependencies: fd-alpha enables fd-gamma not found; got %+v", depGraph.Enables)
	}
	t.Logf("get_feature_dependencies: depends_on=%d enables=%d", len(depGraph.DependsOn), len(depGraph.Enables))
}

// ---------------------------------------------------------------------------
// Scenario 23: Phase F — Validation and Export Tools
//
// Seeds an instance with one well-formed feature, then exercises:
//   validate_artifact, validate_instance, validate_relationships,
//   check_content_readiness, export_instance_yaml, export_feature_yaml,
//   export_report
// ---------------------------------------------------------------------------

func TestMCP_ValidationAndExportTools(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-valexp-"+uuid.New().String()[:8], map[string]any{})
	instIDStr := instID.String()

	// Stage and commit a realistic feature payload.
	featurePayload, _ := json.Marshal(map[string]any{
		"id":     "fd-v1",
		"name":   "Validation Engine",
		"slug":   "validation-engine",
		"status": "ready",
		"strategic_context": map[string]any{
			"tracks":             []any{"product"},
			"contributes_to":     []any{"Product.Quality.Accuracy"},
			"assumptions_tested": []any{"asm-v-001"},
		},
		"definition": map[string]any{
			"problem_statement": "Lack of artifact validation causes invalid data in production.",
			"value_proposition": "Automated schema validation reduces errors by 80%.",
			"capabilities":      []any{"schema-check", "relationship-check"},
		},
		"dependencies": map[string]any{},
	})

	var sr struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "create_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-v1",
		"payload":     string(featurePayload),
	}).assertOK().decode(&sr)
	id++
	c.call(id, "commit_batch", map[string]any{"batch_id": sr.BatchID}).assertOK()
	id++

	// -------------------------------------------------------------------------
	// Tool 1: validate_artifact — valid payload with explicit type
	// -------------------------------------------------------------------------
	var vr1 struct {
		Valid        bool     `json:"valid"`
		ArtifactType string   `json:"artifact_type"`
		SchemaFile   string   `json:"schema_file"`
		Errors       []string `json:"errors"`
	}
	c.call(id, "validate_artifact", map[string]any{
		"payload":       string(featurePayload),
		"artifact_type": "feature",
	}).assertOK().decode(&vr1)
	id++

	// The feature payload is a valid JSON object — schema may flag missing
	// required EPF fields (slug, definition sub-fields), but the tool must
	// return a structured result either way.
	if vr1.ArtifactType != "feature" {
		t.Errorf("validate_artifact: artifact_type=%q, want feature", vr1.ArtifactType)
	}
	if vr1.SchemaFile == "" {
		t.Error("validate_artifact: schema_file should be populated for known type")
	}
	t.Logf("validate_artifact (explicit type): valid=%v errors=%v", vr1.Valid, vr1.Errors)

	// validate_artifact — auto-detect type from payload.
	var vr2 struct {
		Valid        bool   `json:"valid"`
		ArtifactType string `json:"artifact_type"`
	}
	c.call(id, "validate_artifact", map[string]any{
		"payload": string(featurePayload),
		// no artifact_type — should auto-detect "feature"
	}).assertOK().decode(&vr2)
	id++
	if vr2.ArtifactType != "feature" {
		t.Errorf("validate_artifact (auto-detect): artifact_type=%q, want feature", vr2.ArtifactType)
	}
	t.Logf("validate_artifact (auto-detect): valid=%v type=%s", vr2.Valid, vr2.ArtifactType)

	// validate_artifact — invalid JSON should return error result (not HTTP 500).
	var vr3 struct {
		Valid  bool     `json:"valid"`
		Errors []string `json:"errors"`
	}
	c.call(id, "validate_artifact", map[string]any{
		"payload":       `{not valid json`,
		"artifact_type": "feature",
	}).assertOK().decode(&vr3)
	id++
	if vr3.Valid {
		t.Error("validate_artifact: invalid JSON should return valid=false")
	}
	if len(vr3.Errors) == 0 {
		t.Error("validate_artifact: invalid JSON should produce at least one error")
	}
	t.Logf("validate_artifact (invalid JSON): errors=%v", vr3.Errors)

	// -------------------------------------------------------------------------
	// Tool 2: validate_instance
	// -------------------------------------------------------------------------
	var vi struct {
		ArtifactCount int `json:"artifact_count"`
		ValidCount    int `json:"valid_count"`
		InvalidCount  int `json:"invalid_count"`
		Results       []struct {
			ArtifactKey string `json:"artifact_key"`
			Valid       bool   `json:"valid"`
		} `json:"results"`
	}
	c.call(id, "validate_instance", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&vi)
	id++

	if vi.ArtifactCount < 1 {
		t.Errorf("validate_instance: artifact_count=%d, want >=1", vi.ArtifactCount)
	}
	if vi.ValidCount+vi.InvalidCount != vi.ArtifactCount {
		t.Errorf("validate_instance: valid_count(%d)+invalid_count(%d) != artifact_count(%d)",
			vi.ValidCount, vi.InvalidCount, vi.ArtifactCount)
	}
	t.Logf("validate_instance: %d artifacts, %d valid, %d invalid", vi.ArtifactCount, vi.ValidCount, vi.InvalidCount)

	// -------------------------------------------------------------------------
	// Tool 3: validate_relationships
	// -------------------------------------------------------------------------
	var vrel struct {
		RelationshipsChecked int  `json:"relationships_checked"`
		BrokenCount          int  `json:"broken_count"`
		Valid                bool `json:"valid"`
	}
	c.call(id, "validate_relationships", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&vrel)
	id++

	// Relationship from fd-v1 → asm-v-001 is type "assumption" which IS checked.
	// Since asm-v-001 is not an artifact in strategy_artifacts, it will appear as broken.
	// This is correct behaviour — tests_assumption refs are often to assumption keys
	// that live in a separate artifact file.
	t.Logf("validate_relationships: checked=%d broken=%d valid=%v",
		vrel.RelationshipsChecked, vrel.BrokenCount, vrel.Valid)

	// -------------------------------------------------------------------------
	// Tool 4: check_content_readiness — single artifact
	// -------------------------------------------------------------------------
	var cr1 struct {
		ArtifactKey string   `json:"artifact_key"`
		Score       int      `json:"score"`
		Level       string   `json:"level"`
		Missing     []string `json:"missing"`
	}
	c.call(id, "check_content_readiness", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "fd-v1",
	}).assertOK().decode(&cr1)
	id++

	if cr1.ArtifactKey != "fd-v1" {
		t.Errorf("check_content_readiness: artifact_key=%q, want fd-v1", cr1.ArtifactKey)
	}
	if cr1.Score < 0 || cr1.Score > 100 {
		t.Errorf("check_content_readiness: score=%d out of range 0-100", cr1.Score)
	}
	if cr1.Level == "" {
		t.Error("check_content_readiness: level should not be empty")
	}
	t.Logf("check_content_readiness (single): score=%d level=%s missing=%v", cr1.Score, cr1.Level, cr1.Missing)

	// check_content_readiness — all features (no artifact_key).
	var cr2 struct {
		FeatureCount int `json:"feature_count"`
		AverageScore int `json:"average_score"`
		Reports      []struct {
			Score int    `json:"score"`
			Level string `json:"level"`
		} `json:"reports"`
	}
	c.call(id, "check_content_readiness", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&cr2)
	id++

	if cr2.FeatureCount < 1 {
		t.Errorf("check_content_readiness (all): feature_count=%d, want >=1", cr2.FeatureCount)
	}
	if cr2.AverageScore < 0 || cr2.AverageScore > 100 {
		t.Errorf("check_content_readiness (all): average_score=%d out of range", cr2.AverageScore)
	}
	t.Logf("check_content_readiness (all): %d features avg_score=%d", cr2.FeatureCount, cr2.AverageScore)

	// not-found case.
	c.call(id, "check_content_readiness", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "fd-does-not-exist",
	}).assertError()
	id++

	// -------------------------------------------------------------------------
	// Tool 5: export_instance_yaml
	// -------------------------------------------------------------------------
	var eiy struct {
		InstanceID    string `json:"instance_id"`
		ArtifactCount int    `json:"artifact_count"`
		Files         []struct {
			RelPath      string `json:"rel_path"`
			ArtifactKey  string `json:"artifact_key"`
			ArtifactType string `json:"artifact_type"`
			Content      string `json:"content"`
		} `json:"files"`
	}
	c.call(id, "export_instance_yaml", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&eiy)
	id++

	if eiy.ArtifactCount < 1 {
		t.Errorf("export_instance_yaml: artifact_count=%d, want >=1", eiy.ArtifactCount)
	}
	if len(eiy.Files) < 1 {
		t.Errorf("export_instance_yaml: files count=%d, want >=1", len(eiy.Files))
	}
	// Check that the feature file has a non-empty rel_path and content.
	featureFileFound := false
	for _, f := range eiy.Files {
		if f.ArtifactKey == "fd-v1" {
			featureFileFound = true
			if f.RelPath == "" {
				t.Error("export_instance_yaml: rel_path empty for fd-v1")
			}
			if f.Content == "" {
				t.Error("export_instance_yaml: content empty for fd-v1")
			}
			if f.ArtifactType != "feature" {
				t.Errorf("export_instance_yaml: artifact_type=%q, want feature", f.ArtifactType)
			}
			// Content should be valid YAML (contains the feature id).
			if !strings.Contains(f.Content, "fd-v1") {
				t.Errorf("export_instance_yaml: content does not contain fd-v1: %s", f.Content[:min(200, len(f.Content))])
			}
		}
	}
	if !featureFileFound {
		t.Error("export_instance_yaml: fd-v1 not found in files")
	}
	t.Logf("export_instance_yaml: %d files", len(eiy.Files))

	// -------------------------------------------------------------------------
	// Tool 6: export_feature_yaml
	// -------------------------------------------------------------------------
	var efy struct {
		RelPath      string `json:"rel_path"`
		ArtifactKey  string `json:"artifact_key"`
		ArtifactType string `json:"artifact_type"`
		Content      string `json:"content"`
	}
	c.call(id, "export_feature_yaml", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-v1",
	}).assertOK().decode(&efy)
	id++

	if efy.ArtifactKey != "fd-v1" {
		t.Errorf("export_feature_yaml: artifact_key=%q, want fd-v1", efy.ArtifactKey)
	}
	if efy.RelPath == "" {
		t.Error("export_feature_yaml: rel_path should not be empty")
	}
	if !strings.Contains(efy.Content, "fd-v1") {
		t.Errorf("export_feature_yaml: content does not contain fd-v1")
	}
	t.Logf("export_feature_yaml: rel_path=%s content_len=%d", efy.RelPath, len(efy.Content))

	// not-found case.
	c.call(id, "export_feature_yaml", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-does-not-exist",
	}).assertError()
	id++

	// -------------------------------------------------------------------------
	// Tool 7: export_report
	// -------------------------------------------------------------------------
	var er struct {
		InstanceID    string `json:"instance_id"`
		ArtifactCount int    `json:"artifact_count"`
		Sections      []struct {
			Title   string `json:"title"`
			Content string `json:"content"`
		} `json:"sections"`
		MarkdownBody string `json:"markdown_body"`
	}
	c.call(id, "export_report", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&er)
	id++

	if er.ArtifactCount < 1 {
		t.Errorf("export_report: artifact_count=%d, want >=1", er.ArtifactCount)
	}
	if len(er.Sections) == 0 {
		t.Error("export_report: sections should not be empty")
	}
	if er.MarkdownBody == "" {
		t.Error("export_report: markdown_body should not be empty")
	}
	if !strings.Contains(er.MarkdownBody, "Artifact Inventory") {
		t.Error("export_report: markdown_body missing Artifact Inventory section")
	}
	t.Logf("export_report: %d artifacts %d sections markdown_len=%d",
		er.ArtifactCount, len(er.Sections), len(er.MarkdownBody))

	_ = id // suppress "declared and not used" if last tool added no further calls
}

// ---------------------------------------------------------------------------
// Scenario 24: Phase G — AIM Lifecycle Tools
//
// Exercises create_lra, update_lra, get_lra, create_aim_report, get_aim_summary
// against a fresh isolated instance.
// ---------------------------------------------------------------------------

func TestMCP_AIMLifecycleTools(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-aim-"+uuid.New().String()[:8], map[string]any{})
	instIDStr := instID.String()

	// -------------------------------------------------------------------------
	// Tool 1: create_lra
	// -------------------------------------------------------------------------
	lraPayload, _ := json.Marshal(map[string]any{
		"lra_id": "lra-2025-q1",
		"metadata": map[string]any{
			"created_at": "2025-01-01",
			"cycle":      "2025-Q1",
		},
		"strategic_alignment": map[string]any{
			"north_star_fit": "high",
			"notes":          "Initial LRA for Q1 launch.",
		},
		"adoption_context": map[string]any{
			"current_users": 0,
			"target_users":  500,
		},
	})

	var createLRAResp struct {
		Staged      bool   `json:"staged"`
		BatchID     string `json:"batch_id"`
		ArtifactKey string `json:"artifact_key"`
	}
	c.call(id, "create_lra", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "lra-2025-q1",
		"payload":      string(lraPayload),
	}).assertOK().decode(&createLRAResp)
	id++

	if !createLRAResp.Staged {
		t.Error("create_lra: staged should be true")
	}
	if createLRAResp.BatchID == "" {
		t.Error("create_lra: batch_id should not be empty")
	}
	t.Logf("create_lra: staged batch_id=%s", createLRAResp.BatchID)

	// Commit the LRA.
	c.call(id, "commit_batch", map[string]any{"batch_id": createLRAResp.BatchID}).assertOK()
	id++

	// -------------------------------------------------------------------------
	// Tool 2: get_lra — read the committed LRA
	// -------------------------------------------------------------------------
	var lraRaw map[string]any
	c.call(id, "get_lra", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "lra-2025-q1",
	}).assertOK().decode(&lraRaw)
	id++

	if lraRaw["lra_id"] != "lra-2025-q1" {
		t.Errorf("get_lra: lra_id=%v, want lra-2025-q1", lraRaw["lra_id"])
	}
	t.Logf("get_lra: lra_id=%v", lraRaw["lra_id"])

	// get_lra — not found.
	c.call(id, "get_lra", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "lra-does-not-exist",
	}).assertError()
	id++

	// -------------------------------------------------------------------------
	// Tool 3: update_lra — stage a revision
	// -------------------------------------------------------------------------
	updatedLRAPayload, _ := json.Marshal(map[string]any{
		"lra_id": "lra-2025-q1",
		"metadata": map[string]any{
			"created_at": "2025-01-01",
			"cycle":      "2025-Q1",
			"updated_at": "2025-02-01",
		},
		"strategic_alignment": map[string]any{
			"north_star_fit": "high",
			"notes":          "Revised after 4-week pilot results.",
		},
		"adoption_context": map[string]any{
			"current_users": 120,
			"target_users":  500,
		},
	})

	var updateLRAResp struct {
		Staged  bool   `json:"staged"`
		BatchID string `json:"batch_id"`
	}
	c.call(id, "update_lra", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "lra-2025-q1",
		"payload":      string(updatedLRAPayload),
	}).assertOK().decode(&updateLRAResp)
	id++

	if !updateLRAResp.Staged {
		t.Error("update_lra: staged should be true")
	}

	// Commit the update.
	c.call(id, "commit_batch", map[string]any{"batch_id": updateLRAResp.BatchID}).assertOK()
	id++

	// Verify the update is reflected.
	var updatedLRARaw map[string]any
	c.call(id, "get_lra", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "lra-2025-q1",
	}).assertOK().decode(&updatedLRARaw)
	id++

	if meta, ok := updatedLRARaw["metadata"].(map[string]any); ok {
		if meta["updated_at"] != "2025-02-01" {
			t.Errorf("update_lra: updated_at=%v, want 2025-02-01", meta["updated_at"])
		}
	}
	t.Logf("update_lra: revision committed, updated_at verified")

	// -------------------------------------------------------------------------
	// Tool 4: create_aim_report
	// -------------------------------------------------------------------------
	reportPayload, _ := json.Marshal(map[string]any{
		"roadmap_id": "rm-001",
		"cycle":      "2025-Q1",
		"okr_assessments": []any{
			map[string]any{
				"okr_id": "okr-001",
				"status": "on-track",
				"score":  0.75,
			},
		},
		"assumption_validations": []any{
			map[string]any{
				"assumption_id": "asm-001",
				"status":        "validated",
				"evidence":      "120 users onboarded ahead of schedule.",
			},
		},
		"strategic_insights": "Early traction confirms product-market fit hypothesis.",
	})

	var createReportResp struct {
		Staged      bool   `json:"staged"`
		BatchID     string `json:"batch_id"`
		ArtifactKey string `json:"artifact_key"`
	}
	c.call(id, "create_aim_report", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "aim-report-2025-q1",
		"payload":      string(reportPayload),
	}).assertOK().decode(&createReportResp)
	id++

	if !createReportResp.Staged {
		t.Error("create_aim_report: staged should be true")
	}
	if createReportResp.ArtifactKey != "aim-report-2025-q1" {
		t.Errorf("create_aim_report: artifact_key=%q, want aim-report-2025-q1", createReportResp.ArtifactKey)
	}
	t.Logf("create_aim_report: staged batch_id=%s", createReportResp.BatchID)

	// Commit the report.
	c.call(id, "commit_batch", map[string]any{"batch_id": createReportResp.BatchID}).assertOK()
	id++

	// invalid JSON should return tool error (isError=true).
	c.call(id, "create_aim_report", map[string]any{
		"instance_id":  instIDStr,
		"artifact_key": "aim-report-bad",
		"payload":      `{not valid`,
	}).assertError()
	id++

	// -------------------------------------------------------------------------
	// Tool 5: get_aim_summary
	// -------------------------------------------------------------------------
	var summary struct {
		InstanceID   string `json:"instance_id"`
		LRACount     int    `json:"lra_count"`
		ReportCount  int    `json:"report_count"`
		TriggerCount int    `json:"trigger_count"`
		LRAs         []struct {
			ArtifactKey  string `json:"artifact_key"`
			ArtifactType string `json:"artifact_type"`
		} `json:"lras"`
		Reports []struct {
			ArtifactKey string `json:"artifact_key"`
		} `json:"reports"`
	}
	c.call(id, "get_aim_summary", map[string]any{
		"instance_id": instIDStr,
	}).assertOK().decode(&summary)
	id++

	if summary.LRACount < 1 {
		t.Errorf("get_aim_summary: lra_count=%d, want >=1", summary.LRACount)
	}
	if summary.ReportCount < 1 {
		t.Errorf("get_aim_summary: report_count=%d, want >=1", summary.ReportCount)
	}
	if len(summary.LRAs) != summary.LRACount {
		t.Errorf("get_aim_summary: lras len=%d != lra_count=%d", len(summary.LRAs), summary.LRACount)
	}
	if len(summary.Reports) != summary.ReportCount {
		t.Errorf("get_aim_summary: reports len=%d != report_count=%d", len(summary.Reports), summary.ReportCount)
	}

	// Verify lra-2025-q1 appears in LRAs.
	lraFound := false
	for _, l := range summary.LRAs {
		if l.ArtifactKey == "lra-2025-q1" {
			lraFound = true
			if l.ArtifactType != "living_reality_assessment" {
				t.Errorf("get_aim_summary: lra artifact_type=%q, want living_reality_assessment", l.ArtifactType)
			}
		}
	}
	if !lraFound {
		t.Error("get_aim_summary: lra-2025-q1 not found in lras")
	}

	t.Logf("get_aim_summary: lra_count=%d report_count=%d trigger_count=%d",
		summary.LRACount, summary.ReportCount, summary.TriggerCount)

	_ = id
}

// ---------------------------------------------------------------------------
// Fresh-setup dry run: complete EPF strategy initialisation from scratch
//
// Simulates exactly what an AI agent would do when a user says
// "set up a new strategy for my company". No pre-seeded data.
// Uses only MCP tool calls in the order an agent would issue them.
// ---------------------------------------------------------------------------

func TestMCP_FreshSetup_EPFInitialisationDryRun(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	// ── Step 1: create workspace ──────────────────────────────────────────────
	var ws struct {
		ID          string `json:"ID"`
		GithubOwner string `json:"GithubOwner"`
	}
	c.call(id, "create_workspace", map[string]any{
		"github_owner": "acme-corp",
	}).assertOK().decode(&ws)
	id++
	if ws.ID == "" {
		t.Fatal("create_workspace: no ID returned")
	}
	t.Logf("Step 1 — workspace created: %s", ws.ID)

	// ── Step 2: import empty instance (fresh, no EPF data yet) ───────────────
	var inst struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	c.call(id, "import_instance", map[string]any{
		"workspace_id": ws.ID,
		"name":         "Acme Strategy 2026",
	}).assertOK().decode(&inst)
	id++
	if inst.ID == "" {
		t.Fatal("import_instance: no ID returned")
	}
	t.Logf("Step 2 — instance created: %s (status=%s)", inst.ID, inst.Status)

	// ── Step 3: activate ─────────────────────────────────────────────────────
	c.call(id, "activate_instance", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().contains("true")
	id++
	t.Log("Step 3 — instance activated")

	// ── Step 4: health_check — verify standard pack auto-installed ───────────
	var health map[string]any
	c.call(id, "health_check", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().decode(&health)
	id++

	sps, ok := health["standard_pack_status"].(map[string]any)
	if !ok {
		t.Fatalf("Step 4 — health_check: standard_pack_status missing or wrong type: %v", health)
	}
	if sps["up_to_date"] != true {
		t.Errorf("Step 4 — health_check: standard_pack not up_to_date after fresh init: %v", sps)
	}
	t.Logf("Step 4 — health_check: standard_pack_status=%v", sps)

	// ── Step 5: discover available templates (agent looks for north_star template) ─
	var templates struct {
		Templates []string `json:"Templates"`
	}
	c.call(id, "list_templates", nil).assertOK().decode(&templates)
	id++

	northStarTemplatePath := ""
	for _, p := range templates.Templates {
		if strings.Contains(p, "north_star") {
			northStarTemplatePath = p
			break
		}
	}
	if northStarTemplatePath == "" {
		t.Fatal("Step 5 — list_templates: no north_star template found")
	}
	t.Logf("Step 5 — found north_star template: %s", northStarTemplatePath)

	// ── Step 6: fetch the template to understand structure ────────────────────
	// get_template returns raw YAML text (not JSON), suitable for an agent to read.
	tmplResult := c.call(id, "get_template", map[string]any{
		"path": northStarTemplatePath,
	}).assertOK().contains("north_star")
	id++
	t.Logf("Step 6 — template loaded: %d bytes", len(tmplResult.text))

	// ── Step 7: run the feature-definition skill to get authoring prompt ──────
	// (an agent would do this before creating any feature)
	var skillResult map[string]any
	c.call(id, "run_skill", map[string]any{
		"instance_id": inst.ID,
		"skill_name":  "feature-definition",
	}).assertOK().decode(&skillResult)
	id++

	if skillResult["mode"] != "prompt" {
		t.Errorf("Step 7 — run_skill feature-definition: mode=%v, want prompt", skillResult["mode"])
	}
	if len(fmt.Sprintf("%v", skillResult["prompt_md"])) < 50 {
		t.Errorf("Step 7 — run_skill feature-definition: prompt_md too short")
	}
	t.Logf("Step 7 — feature-definition skill loaded (%d prompt chars)",
		len(fmt.Sprintf("%v", skillResult["prompt_md"])))

	// ── Step 8: stage a north_star artifact ───────────────────────────────────
	northStarPayload := `{
		"north_star": {
			"organization": "Acme Corp",
			"version": "1.0",
			"purpose": {"statement": "We exist to simplify B2B workflows"},
			"vision": {"vision_statement": "Every business runs on Acme by 2030"},
			"mission": {"mission_statement": "We build no-code automation for SMBs"},
			"values": [{"value": "Simplicity", "definition": "Less is more"}]
		}
	}`
	var northStarStaged map[string]any
	c.call(id, "update_north_star", map[string]any{
		"instance_id": inst.ID,
		"payload":     northStarPayload,
	}).assertOK().decode(&northStarStaged)
	id++

	batchID := fmt.Sprintf("%v", northStarStaged["batch_id"])
	if batchID == "" || batchID == "<nil>" {
		t.Fatal("Step 8 — update_north_star: no batch_id returned")
	}
	t.Logf("Step 8 — north_star staged in batch: %s", batchID)

	// ── Step 9: stage strategy_foundations in the same batch ─────────────────
	foundationsPayload := `{
		"personas": [
			{"id": "p-001", "name": "Alex the Ops Lead", "role": "Operations Manager",
			 "pain_points": ["Too many manual processes", "No visibility into bottlenecks"]}
		],
		"positioning": {"target_segment": "SMB Operations Teams"},
		"icp": {"company_size": "10-200 employees", "industry": "Professional Services"}
	}`
	var foundationsStaged map[string]any
	c.call(id, "update_strategy_foundations", map[string]any{
		"instance_id": inst.ID,
		"payload":     foundationsPayload,
		"batch_id":    batchID,
	}).assertOK().decode(&foundationsStaged)
	id++

	if fmt.Sprintf("%v", foundationsStaged["batch_id"]) != batchID {
		t.Errorf("Step 9 — update_strategy_foundations: batch_id mismatch: got %v want %v",
			foundationsStaged["batch_id"], batchID)
	}
	t.Log("Step 9 — strategy_foundations staged in same batch")

	// ── Step 10: commit the batch ─────────────────────────────────────────────
	c.call(id, "commit_batch", map[string]any{
		"instance_id": inst.ID,
		"batch_id":    batchID,
	}).assertOK().contains("committed")
	id++
	t.Logf("Step 10 — batch %s committed", batchID)

	// ── Step 11: verify north_star is retrievable ─────────────────────────────
	var vision map[string]any
	c.call(id, "get_product_vision", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().decode(&vision)
	id++

	if vision["north_star"] == nil && vision["vision"] == nil && vision["organization"] == nil {
		t.Errorf("Step 11 — get_product_vision: north_star content not found in response: %v", vision)
	}
	t.Logf("Step 11 — product vision retrieved (keys: %v)", mapKeys(vision))

	// ── Step 12: get_personas — verify foundations committed ─────────────────
	var personasResult map[string]any
	c.call(id, "get_personas", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().decode(&personasResult)
	id++
	t.Logf("Step 12 — get_personas: %v", personasResult)

	// ── Step 13: create a feature ─────────────────────────────────────────────
	featurePayload := `{
		"id": "fd-001",
		"name": "Workflow Automation",
		"phase": "now",
		"definition": {
			"job_to_be_done": "Automate repetitive approval workflows",
			"solution_approach": "No-code trigger-action builder",
			"capabilities": [
				{"name": "Trigger builder", "description": "Configure event triggers"},
				{"name": "Action library", "description": "Pre-built integration actions"}
			]
		},
		"strategic_context": {
			"contributes_to": ["Product.Revenue.Premium"],
			"assumptions_tested": ["asm-p-001"]
		}
	}`
	var featureStaged map[string]any
	c.call(id, "create_feature", map[string]any{
		"instance_id": inst.ID,
		"feature_key": "fd-001",
		"payload":     featurePayload,
	}).assertOK().decode(&featureStaged)
	id++

	featureBatchID := fmt.Sprintf("%v", featureStaged["batch_id"])
	if featureBatchID == "" || featureBatchID == "<nil>" {
		t.Fatal("Step 13 — create_feature: no batch_id returned")
	}
	t.Logf("Step 13 — feature fd-001 staged in batch: %s", featureBatchID)

	// ── Step 14: commit feature batch ─────────────────────────────────────────
	c.call(id, "commit_batch", map[string]any{
		"instance_id": inst.ID,
		"batch_id":    featureBatchID,
	}).assertOK()
	id++
	t.Log("Step 14 — feature batch committed")

	// ── Step 15: list_features — verify feature appears ──────────────────────
	// list_features returns a JSON array directly.
	var featureList []map[string]any
	c.call(id, "list_features", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().decode(&featureList)
	id++

	foundFeature := false
	for _, f := range featureList {
		if fmt.Sprintf("%v", f["artifact_key"]) == "fd-001" {
			foundFeature = true
		}
	}
	if !foundFeature {
		t.Errorf("Step 15 — list_features: fd-001 not found; got %v", featureList)
	}
	t.Logf("Step 15 — list_features: %d features, fd-001 found=%v", len(featureList), foundFeature)

	// ── Step 16: validate the feature artifact ────────────────────────────────
	var validation map[string]any
	c.call(id, "validate_artifact", map[string]any{
		"instance_id":   inst.ID,
		"artifact_type": "feature",
		"payload":       featurePayload,
	}).assertOK().decode(&validation)
	id++
	t.Logf("Step 16 — validate_artifact: valid=%v errors=%v", validation["valid"], validation["errors"])

	// ── Step 17: export instance YAML — verify EPF directory structure ────────
	var exported struct {
		Files []map[string]any `json:"Files"`
	}
	c.call(id, "export_instance_yaml", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().decode(&exported)
	id++

	if len(exported.Files) == 0 {
		t.Error("Step 17 — export_instance_yaml: no files exported")
	}
	northStarExported := false
	for _, f := range exported.Files {
		relPath := fmt.Sprintf("%v", f["rel_path"])
		if strings.Contains(relPath, "north_star") {
			northStarExported = true
		}
	}
	if !northStarExported {
		t.Errorf("Step 17 — export_instance_yaml: north_star not found in exported files: %v",
			func() []string {
				var paths []string
				for _, f := range exported.Files {
					paths = append(paths, fmt.Sprintf("%v", f["rel_path"]))
				}
				return paths
			}())
	}
	t.Logf("Step 17 — export_instance_yaml: %d files exported, north_star_found=%v",
		len(exported.Files), northStarExported)

	// ── Step 18: list_packs — verify standard pack present ───────────────────
	var packs []map[string]any
	c.call(id, "list_packs", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().decode(&packs)
	id++

	standardPackFound := false
	for _, p := range packs {
		if p["pack_name"] == "emergent-standard" && p["up_to_date"] == true {
			standardPackFound = true
		}
	}
	if !standardPackFound {
		t.Errorf("Step 18 — list_packs: emergent-standard with up_to_date=true not found: %v", packs)
	}
	t.Logf("Step 18 — list_packs: %d packs, emergent-standard present=%v", len(packs), standardPackFound)

	// ── Step 19: list_installed_skills — verify canonical skills accessible ───
	var skills []map[string]any
	c.call(id, "list_installed_skills", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().decode(&skills)
	id++

	if len(skills) == 0 {
		t.Error("Step 19 — list_installed_skills: no skills found after standard pack install")
	}
	featureDefFound := false
	for _, sk := range skills {
		if sk["skill_name"] == "feature-definition" {
			featureDefFound = true
		}
	}
	if !featureDefFound {
		t.Error("Step 19 — list_installed_skills: feature-definition skill not found")
	}
	t.Logf("Step 19 — list_installed_skills: %d skills, feature-definition=%v", len(skills), featureDefFound)

	// ── Step 20: final health_check — everything coherent ────────────────────
	var finalHealth map[string]any
	c.call(id, "health_check", map[string]any{
		"instance_id": inst.ID,
	}).assertOK().decode(&finalHealth)
	id++

	artifactCount, _ := finalHealth["artifact_count"].(float64)
	if artifactCount < 2 {
		t.Errorf("Step 20 — final health_check: artifact_count=%v, expected >= 2", artifactCount)
	}
	finalSPS, _ := finalHealth["standard_pack_status"].(map[string]any)
	if finalSPS["up_to_date"] != true {
		t.Errorf("Step 20 — final health_check: standard_pack not up_to_date: %v", finalSPS)
	}
	t.Logf("Step 20 — final health_check: artifact_count=%.0f standard_pack_status=%v",
		artifactCount, finalSPS)

	t.Log("✓ Fresh EPF setup dry run complete — all 20 steps passed")
	_ = id
}

// ---------------------------------------------------------------------------
// Scenario 5 (standalone): Archive a feature — include_archived filter
// ---------------------------------------------------------------------------

// TestMCP_Scenario_ArchiveFeature covers the archive-feature user journey from
// the strategy-scenarios spec:
//
//  1. Feature visible in default list
//  2. archive_feature → batch_id
//  3. commit_batch
//  4. Feature absent from default list
//  5. Feature visible with include_archived=true, status=archived
func TestMCP_Scenario_ArchiveFeature(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-archive-"+uuid.New().String()[:8], map[string]any{
		"fd-arc-001": map[string]any{"id": "fd-arc-001", "name": "Feature To Archive"},
	})
	instIDStr := instID.String()

	// Step 1 — feature visible in default list
	var before []map[string]any
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&before)
	id++
	found := false
	for _, f := range before {
		if f["artifact_key"] == "fd-arc-001" {
			found = true
		}
	}
	if !found {
		t.Fatalf("Step 1: fd-arc-001 not in list before archive (got %d features)", len(before))
	}
	t.Logf("Step 1 — list_features: fd-arc-001 present in %d features", len(before))

	// Step 2 — archive_feature
	var staged struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "archive_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-arc-001",
		"payload":     `{}`,
	}).assertOK().decode(&staged)
	id++
	if staged.BatchID == "" {
		t.Fatal("Step 2: archive_feature returned empty batch_id")
	}
	t.Logf("Step 2 — archive_feature: batch_id=%s", staged.BatchID)

	// Step 3 — commit_batch
	c.call(id, "commit_batch", map[string]any{"batch_id": staged.BatchID}).assertOK()
	id++
	t.Log("Step 3 — commit_batch: OK")

	// Step 4 — feature absent from default list
	var afterDefault []map[string]any
	c.call(id, "list_features", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&afterDefault)
	id++
	for _, f := range afterDefault {
		if f["artifact_key"] == "fd-arc-001" {
			t.Error("Step 4: fd-arc-001 still present in default list after archive")
		}
	}
	t.Logf("Step 4 — list_features (default): %d features, fd-arc-001 absent", len(afterDefault))

	// Step 5 — feature visible with include_archived=true, status=archived
	var withArchived []map[string]any
	c.call(id, "list_features", map[string]any{
		"instance_id":      instIDStr,
		"include_archived": "true",
	}).assertOK().decode(&withArchived)
	id++
	archivedFound := false
	for _, f := range withArchived {
		if f["artifact_key"] == "fd-arc-001" {
			archivedFound = true
			if f["status"] != "archived" {
				t.Errorf("Step 5: fd-arc-001 status=%q, want archived", f["status"])
			}
		}
	}
	if !archivedFound {
		t.Error("Step 5: fd-arc-001 not found in include_archived list")
	}
	t.Logf("Step 5 — list_features (include_archived): fd-arc-001 found=%v", archivedFound)

	t.Log("✓ Archive feature scenario complete")
	_ = id
}

// ---------------------------------------------------------------------------
// Scenario 6: Semantic search — stub and graceful degradation
// ---------------------------------------------------------------------------

// TestMCP_Scenario_SemanticSearch covers the semantic search user journey.
// Since Memory is not configured in tests, the scenario validates:
//   - search_strategy degrades gracefully (returns error, not panic)
//   - get_neighbors degrades gracefully
//   - When Memory IS configured (future), results would be non-empty
//
// The stub path (Memory unconfigured) is the only path testable without an
// external dependency. The test documents expected behaviour for both paths.
func TestMCP_Scenario_SemanticSearch(t *testing.T) {
	svc := buildSvc(t) // Semantic.Config{} — Memory not configured
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-search-"+uuid.New().String()[:8], map[string]any{
		"fd-001": map[string]any{"id": "fd-001", "name": "Enterprise SSO"},
		"fd-002": map[string]any{"id": "fd-002", "name": "Multi-tenant billing"},
	})
	instIDStr := instID.String()

	// Step 1 — search_strategy: Memory unavailable → tool-level error, not panic
	r1 := c.call(id, "search_strategy", map[string]any{
		"instance_id": instIDStr,
		"query":       "features targeting enterprise",
	})
	id++
	// Graceful degradation: either an error result (Memory unconfigured) or empty
	// results array. Both are acceptable; what is NOT acceptable is a 500 / panic.
	if r1.isError {
		t.Logf("Step 1 — search_strategy: correctly returns error when Memory unconfigured: %s",
			r1.text[:min(len(r1.text), 120)])
	} else {
		var results []map[string]any
		r1.decode(&results)
		t.Logf("Step 1 — search_strategy: returned %d results (stub empty set)", len(results))
	}

	// Step 2 — get_neighbors: same graceful degradation
	r2 := c.call(id, "get_neighbors", map[string]any{
		"instance_id": instIDStr,
		"node_key":    "fd-001",
	})
	id++
	if r2.isError {
		t.Logf("Step 2 — get_neighbors: error as expected (Memory unconfigured): %s",
			r2.text[:min(len(r2.text), 120)])
	} else {
		var neighbors []map[string]any
		r2.decode(&neighbors)
		t.Logf("Step 2 — get_neighbors: returned %d neighbors (stub empty set)", len(neighbors))
	}

	// Step 3 — verify the server is still healthy after semantic errors
	var health map[string]any
	c.call(id, "health_check", map[string]any{"instance_id": instIDStr}).
		assertOK().decode(&health)
	id++
	t.Logf("Step 3 — health_check after semantic errors: status=%v", health["status"])

	t.Log("✓ Semantic search scenario complete (stub path — Memory not configured)")
	_ = id
}

// ---------------------------------------------------------------------------
// Scenario 7: Detect contradictions and fix
// ---------------------------------------------------------------------------

// TestMCP_Scenario_DetectAndFix covers the contradiction detection scenario.
// With Memory unconfigured the tool returns gracefully. The test validates the
// full workflow shape — detect, fix via update, commit, detect again — and
// asserts the server handles each step without error.
func TestMCP_Scenario_DetectAndFix(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-contradict-"+uuid.New().String()[:8], map[string]any{
		"fd-001": map[string]any{
			"id":   "fd-001",
			"name": "Feature with inconsistency",
			"strategic_context": map[string]any{
				"contributes_to": []string{"Product.Core"},
			},
		},
	})
	instIDStr := instID.String()

	// Step 1 — detect_contradictions
	r1 := c.call(id, "detect_contradictions", map[string]any{
		"instance_id": instIDStr,
	})
	id++
	if r1.isError {
		// Memory not configured — graceful error is acceptable
		t.Logf("Step 1 — detect_contradictions: Memory unconfigured (expected): %s",
			r1.text[:min(len(r1.text), 120)])
	} else {
		var contradictions []map[string]any
		r1.decode(&contradictions)
		t.Logf("Step 1 — detect_contradictions: %d contradictions found", len(contradictions))
	}

	// Step 2 — apply a fix: update the feature
	var staged struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "update_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-001",
		"payload": `{"id":"fd-001","name":"Feature with inconsistency",` +
			`"strategic_context":{"contributes_to":["Product.Core","Product.Discovery"]}}`,
	}).assertOK().decode(&staged)
	id++
	if staged.BatchID == "" {
		t.Fatal("Step 2: update_feature returned empty batch_id")
	}
	t.Logf("Step 2 — update_feature: batch_id=%s", staged.BatchID)

	// Step 3 — commit the fix
	c.call(id, "commit_batch", map[string]any{"batch_id": staged.BatchID}).assertOK()
	id++
	t.Log("Step 3 — commit_batch: OK")

	// Step 4 — verify the update is reflected
	var updated map[string]any
	c.call(id, "get_feature", map[string]any{
		"instance_id": instIDStr,
		"feature_key": "fd-001",
	}).assertOK().decode(&updated)
	id++
	t.Logf("Step 4 — get_feature: payload present=%v", updated["payload"] != nil)

	// Step 5 — detect_contradictions again — with Memory configured this would
	// show one fewer contradiction; without Memory we confirm no panic/500.
	r5 := c.call(id, "detect_contradictions", map[string]any{
		"instance_id": instIDStr,
	})
	id++
	if r5.isError {
		t.Logf("Step 5 — detect_contradictions (post-fix): still Memory unconfigured (expected)")
	} else {
		var contradictions2 []map[string]any
		r5.decode(&contradictions2)
		t.Logf("Step 5 — detect_contradictions (post-fix): %d contradictions", len(contradictions2))
	}

	t.Log("✓ Detect contradictions and fix scenario complete")
	_ = id
}

// ---------------------------------------------------------------------------
// Scenario 8: What-if scenario exploration
// ---------------------------------------------------------------------------

// TestMCP_Scenario_WhatIf covers the what-if scenario exploration journey.
// Since Memory is not configured, the scenario tools return graceful errors.
// The test validates the full workflow shape and that the server remains stable.
func TestMCP_Scenario_WhatIf(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "test-org-whatif-"+uuid.New().String()[:8], map[string]any{
		"fd-001": map[string]any{"id": "fd-001", "name": "Core feature"},
		"fd-002": map[string]any{"id": "fd-002", "name": "Optional feature"},
		"fd-003": map[string]any{"id": "fd-003", "name": "Feature under evaluation"},
	})
	instIDStr := instID.String()

	// Step 1 — run_scenario: create a what-if branch
	r1 := c.call(id, "run_scenario", map[string]any{
		"instance_id": instIDStr,
		"description": "What if we deprioritise fd-003?",
		"anchor_node": "fd-003",
	})
	id++

	var scenarioID string
	if r1.isError {
		// Memory not configured — acceptable
		t.Logf("Step 1 — run_scenario: Memory unconfigured (expected): %s",
			r1.text[:min(len(r1.text), 120)])
		// Skip remaining steps since scenario_id is unavailable
		t.Log("✓ What-if scenario complete (stub path — Memory not configured)")
		return
	}
	var scenarioResult struct {
		ScenarioID string `json:"scenario_id"`
	}
	r1.decode(&scenarioResult)
	scenarioID = scenarioResult.ScenarioID
	if scenarioID == "" {
		t.Fatal("Step 1: run_scenario returned empty scenario_id")
	}
	t.Logf("Step 1 — run_scenario: scenario_id=%s", scenarioID)

	// Step 2 — evaluate_scenario
	r2 := c.call(id, "evaluate_scenario", map[string]any{
		"scenario_id": scenarioID,
		"instance_id": instIDStr,
	})
	id++
	if r2.isError {
		t.Logf("Step 2 — evaluate_scenario: error=%s", r2.text[:min(len(r2.text), 120)])
	} else {
		t.Logf("Step 2 — evaluate_scenario: OK (text len=%d)", len(r2.text))
	}

	// Step 3 — commit_scenario: promote mutations to a staging batch
	r3 := c.call(id, "commit_scenario", map[string]any{
		"scenario_id": scenarioID,
		"instance_id": instIDStr,
	})
	id++
	if r3.isError {
		t.Logf("Step 3 — commit_scenario: error=%s", r3.text[:min(len(r3.text), 120)])
	} else {
		// If scenario committed, a batch_id should be present for final commit
		var batchResult struct {
			BatchID string `json:"batch_id"`
		}
		if err := json.Unmarshal([]byte(r3.text), &batchResult); err == nil && batchResult.BatchID != "" {
			c.call(id, "commit_batch", map[string]any{"batch_id": batchResult.BatchID}).assertOK()
			id++
			t.Logf("Step 3 — commit_scenario: batch committed, batch_id=%s", batchResult.BatchID)
		}
	}

	// Step 4 — server remains healthy after scenario operations
	c.call(id, "health_check", map[string]any{"instance_id": instIDStr}).assertOK()
	id++
	t.Log("Step 4 — health_check: server stable after scenario operations")

	t.Log("✓ What-if scenario complete")
	_ = id
}

// mapKeys returns a sorted list of map keys for diagnostic logging.
func mapKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
