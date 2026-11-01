// Package mcpserver_test — Phase 2d E2E integration tests.
//
// Tests added for Phase 2d cover:
//   - Semantic tools with mocked Memory (search, neighbors, contradictions)
//   - Organisation management tools (create, list, invite, remove, list_members)
//   - Ingest pipeline trigger on commit_batch
//   - Full agent workflow: routing → query → mutate → commit → search
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

	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark/changemarktest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/google/uuid"
)

// ---------------------------------------------------------------------------
// Helpers — Phase 2d
// ---------------------------------------------------------------------------

// buildSvcWithMemory creates a full Services struct over a fake Memory, wired
// as cmd_serve wires it: semantic reads go through the instance's manifest. The
// fake starts empty; a test fills it with seedKnowledgeGraph.
func buildSvcWithMemory(t *testing.T) (mcpserver.Services, *memtest.Server) {
	t.Helper()
	mem := memtest.New(t)
	return fencedSvc(t, mem), mem
}

// seedKnowledgeGraph puts a small graph of the instance into the fake Memory and
// its manifest: fd-001 enables fd-002 and depends on fd-003, and fd-orphaned has
// no relationships. fd-001 and fd-002 are what a search for "knowledge graph"
// finds first.
func seedKnowledgeGraph(t *testing.T, svc mcpserver.Services, mem *memtest.Server, inst uuid.UUID) {
	t.Helper()
	markReady(t, svc, inst)
	for _, o := range []struct{ key, name string }{
		{"fd-001_knowledge_graph_engine", "Knowledge Graph Engine"},
		{"fd-002_document_ingestion", "Document Ingestion Pipeline"},
		{"fd-003_ai_native_chat", "AI Native Chat"},
		{"fd-orphaned", "Orphaned"},
	} {
		putObject(t, svc, mem, inst, "feature", o.key, "artifact", map[string]any{"artifact_type": "feature", "snippet": o.name, "name": o.name})
	}
	mem.Scores[ingest.ScopedKey(inst, "fd-001_knowledge_graph_engine")] = 0.95
	mem.Scores[ingest.ScopedKey(inst, "fd-002_document_ingestion")] = 0.82
	for _, r := range []struct{ typ, from, to string }{
		{"enables", "fd-001_knowledge_graph_engine", "fd-002_document_ingestion"},
		{"depends_on", "fd-003_ai_native_chat", "fd-001_knowledge_graph_engine"},
	} {
		putRelationship(t, svc, mem, inst, r.typ, r.from, r.to)
	}
}

// buildSvcWithOrg creates Services that include the Org service and a user
// seeded in the database so org tools can succeed.
func buildSvcWithOrg(t *testing.T) mcpserver.Services {
	t.Helper()
	db := database.TestDB(t)

	// Seed the dev user so org tools find it.
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceSystem)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
	userSvc := user.NewService(db)
	_, err := userSvc.EnsureUser(ctx, web.DevUser.Sub, web.DevUser.Email, web.DevUser.Name)
	if err != nil {
		t.Fatalf("seed dev user: %v", err)
	}

	// EnsureUser generates its own ID — we need to override with DevUser.ID
	// so UserFromContext matches.
	_, err = db.NewUpdate().TableExpr("users").
		Set("id = ?", web.DevUser.ID).
		Where("sub = ?", web.DevUser.Sub).
		Exec(ctx)
	if err != nil {
		t.Fatalf("override dev user ID: %v", err)
	}

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
		Org:       orgdom.NewService(db),
	}
}

// mcpClientWithUser wraps the MCP handler with a thin middleware that injects
// web.DevUser into the context, mirroring what AuthMiddleware does in dev mode.
// This is necessary for org tools which call web.UserFromContext(ctx).
type mcpClientWithUser struct {
	mcpClient
}

func newMCPClientWithUser(t *testing.T, svc mcpserver.Services) *mcpClientWithUser {
	t.Helper()
	handler := mcpserver.New(svc)

	// Wrap with user injection.
	wrappedHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := web.ContextWithUser(r.Context(), web.DevUser)
		ctx = audit.ContextWithActor(ctx, web.DevUser.ID)
		ctx = audit.ContextWithSource(ctx, audit.SourceMCP)
		ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
		handler.ServeHTTP(w, r.WithContext(ctx))
	})

	ts := httptest.NewServer(wrappedHandler)
	t.Cleanup(ts.Close)

	c := &mcpClientWithUser{}
	c.t = t
	c.server = ts
	c.initialize()
	return c
}

// ---------------------------------------------------------------------------
// Scenario: Semantic tools with mocked Memory
// ---------------------------------------------------------------------------

func TestMCP_SemanticSearch_WithMemory(t *testing.T) {
	svc, mem := buildSvcWithMemory(t)
	_, instID := seedInstance(t, svc, "semantic-owner", map[string]any{
		"north_star": map[string]any{"vision": "AI-native knowledge work"},
	})
	seedKnowledgeGraph(t, svc, mem, instID)
	c := newMCPClient(t, svc)
	id := 1

	// search_strategy in semantic mode: ranked results from the graph. (This was
	// the default before auto mode added keyword hits.)
	r := c.call(id, "search_strategy", map[string]any{
		"instance_id": instID.String(),
		"query":       "knowledge graph",
		"limit":       "10",
		"mode":        "semantic",
	})
	r.assertOK()

	var results []struct {
		ArtifactKey  string  `json:"artifact_key"`
		ArtifactType string  `json:"artifact_type"`
		Snippet      string  `json:"snippet"`
		Score        float64 `json:"score"`
	}
	r.decode(&results)
	if len(results) != 4 {
		t.Fatalf("expected the instance's 4 graph objects, got %d", len(results))
	}
	if results[0].ArtifactKey != "fd-001_knowledge_graph_engine" {
		t.Errorf("first result key = %q, want fd-001_knowledge_graph_engine", results[0].ArtifactKey)
	}
	if results[0].Score < 0.9 {
		t.Errorf("first result score = %f, want >= 0.9", results[0].Score)
	}
	if results[1].Snippet != "Document Ingestion Pipeline" {
		t.Errorf("second result snippet = %q, want Document Ingestion Pipeline", results[1].Snippet)
	}
}

func TestMCP_GetNeighbors_WithMemory(t *testing.T) {
	svc, mem := buildSvcWithMemory(t)
	_, instID := seedInstance(t, svc, "neighbor-owner", map[string]any{
		"north_star": map[string]any{"vision": "test"},
	})
	seedKnowledgeGraph(t, svc, mem, instID)
	c := newMCPClient(t, svc)

	r := c.call(1, "get_neighbors", map[string]any{
		"instance_id": instID.String(),
		"node_key":    "fd-001_knowledge_graph_engine",
	})
	r.assertOK()

	var neighbors []struct {
		NodeKey  string `json:"node_key"`
		NodeType string `json:"node_type"`
		EdgeType string `json:"edge_type"`
		EdgeDir  string `json:"edge_direction"`
	}
	r.decode(&neighbors)
	if len(neighbors) != 2 {
		t.Fatalf("expected 2 neighbors, got %d", len(neighbors))
	}

	// Verify we have both inbound and outbound.
	var dirs []string
	for _, n := range neighbors {
		dirs = append(dirs, n.EdgeDir)
	}
	hasInbound := false
	hasOutbound := false
	for _, d := range dirs {
		if d == "inbound" {
			hasInbound = true
		}
		if d == "outbound" {
			hasOutbound = true
		}
	}
	if !hasInbound || !hasOutbound {
		t.Errorf("expected both inbound and outbound neighbors, got dirs: %v", dirs)
	}

	// Verify specific keys.
	r.contains("fd-002_document_ingestion")
	r.contains("fd-003_ai_native_chat")
}

func TestMCP_DetectContradictions_WithMemory(t *testing.T) {
	svc, mem := buildSvcWithMemory(t)
	_, instID := seedInstance(t, svc, "contra-owner", map[string]any{
		"north_star": map[string]any{"vision": "test"},
	})
	seedKnowledgeGraph(t, svc, mem, instID)
	c := newMCPClient(t, svc)

	r := c.call(1, "detect_contradictions", map[string]any{
		"instance_id": instID.String(),
	})
	r.assertOK()

	var contradictions []struct {
		Description string `json:"description"`
		FixWith     string `json:"fix_with"`
	}
	r.decode(&contradictions)

	// Our mock has one orphaned node (obj-400/fd-orphaned).
	if len(contradictions) < 1 {
		t.Fatalf("expected at least 1 contradiction (orphaned node), got %d", len(contradictions))
	}

	foundOrphaned := false
	for _, c := range contradictions {
		if strings.Contains(c.Description, "fd-orphaned") {
			foundOrphaned = true
		}
	}
	if !foundOrphaned {
		t.Errorf("expected contradiction mentioning fd-orphaned, got: %+v", contradictions)
	}
}

func TestMCP_RunScenario_WithMemory(t *testing.T) {
	svc, mem := buildSvcWithMemory(t)
	_, instID := seedInstance(t, svc, "scenario-owner", map[string]any{
		"north_star": map[string]any{"vision": "test"},
	})
	c := newMCPClient(t, svc)

	r := c.call(1, "run_scenario", map[string]any{
		"instance_id": instID.String(),
		"description": "What if we drop feature fd-002?",
	})
	r.assertOK()

	branches := mem.Branches()
	if len(branches) != 1 || !strings.HasPrefix(branches[0].Name, "scenario-"+instID.String()+"-") {
		t.Fatalf("branches = %+v, want one scenario branch named for the instance", branches)
	}
	r.contains(branches[0].ID)
}

// ---------------------------------------------------------------------------
// Scenario: Organisation management tools
// ---------------------------------------------------------------------------

func TestMCP_OrgLifecycle(t *testing.T) {
	svc := buildSvcWithOrg(t)
	c := newMCPClientWithUser(t, svc)
	id := 1

	// Step 1: create_org.
	r := c.call(id, "create_org", map[string]any{
		"name": "Acme Corp",
	})
	id++
	r.assertOK()

	var org struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	r.decode(&org)
	if org.Name != "Acme Corp" {
		t.Errorf("org name = %q, want Acme Corp", org.Name)
	}
	if org.Slug != "acme-corp" {
		t.Errorf("org slug = %q, want acme-corp", org.Slug)
	}
	orgID := org.ID

	// Step 2: list_orgs — should see the new org.
	r = c.call(id, "list_orgs", map[string]any{})
	id++
	r.assertOK()

	var orgs []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	r.decode(&orgs)
	if len(orgs) == 0 {
		t.Fatal("list_orgs returned 0 orgs, expected at least 1")
	}
	found := false
	for _, o := range orgs {
		if o.ID == orgID {
			found = true
		}
	}
	if !found {
		t.Errorf("list_orgs did not include created org %s", orgID)
	}

	// Step 3: list_members — should show the creator as admin.
	r = c.call(id, "list_members", map[string]any{
		"org_id": orgID,
	})
	id++
	r.assertOK()

	var membersResp struct {
		Members []struct {
			UserID string `json:"user_id"`
			Role   string `json:"role"`
		} `json:"members"`
		Invitations []any `json:"invitations"`
	}
	r.decode(&membersResp)
	if len(membersResp.Members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(membersResp.Members))
	}
	if membersResp.Members[0].Role != "org_admin" {
		t.Errorf("creator role = %q, want org_admin", membersResp.Members[0].Role)
	}

	// Step 4: invite_member — invite a new email.
	r = c.call(id, "invite_member", map[string]any{
		"org_id": orgID,
		"email":  "newuser@example.com",
		"role":   "org_viewer",
	})
	id++
	r.assertOK()
	r.contains("invited")

	// Step 5: list_members again — should show 1 member + 1 invitation.
	r = c.call(id, "list_members", map[string]any{
		"org_id": orgID,
	})
	r.assertOK()
	r.decode(&membersResp)
	if len(membersResp.Members) != 1 {
		t.Errorf("expected 1 member after invite (user not yet accepted), got %d", len(membersResp.Members))
	}
	if len(membersResp.Invitations) != 1 {
		t.Errorf("expected 1 pending invitation, got %d", len(membersResp.Invitations))
	}
}

func TestMCP_OrgRemoveMember_LastAdmin(t *testing.T) {
	svc := buildSvcWithOrg(t)
	c := newMCPClientWithUser(t, svc)
	id := 1

	// Create org — dev user is the only admin.
	r := c.call(id, "create_org", map[string]any{"name": "Solo Org"})
	id++
	r.assertOK()

	var org struct {
		ID string `json:"id"`
	}
	r.decode(&org)

	// Try to remove self — should fail (last admin protection).
	r = c.call(id, "remove_member", map[string]any{
		"org_id":  org.ID,
		"user_id": web.DevUser.ID.String(),
	})
	r.assertError()
	r.contains("last admin")
}

// ---------------------------------------------------------------------------
// Scenario: Ingest pipeline triggered by commit_batch
// ---------------------------------------------------------------------------

func TestMCP_CommitBatch_MarksInstanceForIngest(t *testing.T) {
	db := database.TestDB(t)
	packSvc := pack.NewService(db)
	instSvc := instance.NewService(db)
	instSvc.WithPackEnsurer(packSvc)

	marker, rec := changemarktest.New(db)

	svc := mcpserver.Services{
		Workspace: workspace.NewService(db),
		Instance:  instSvc,
		Strategy:  strategy.NewService(db).WithChangeMarker(marker),
		Pack:      packSvc,
		App:       appdom.NewService(db),
		Semantic:  semantic.NewService(semantic.Config{}),
		Org:       orgdom.NewService(db),
	}

	_, instID := seedInstance(t, svc, "ingest-owner", map[string]any{
		"north_star": map[string]any{"vision": "test"},
	})
	c := newMCPClient(t, svc)
	id := 1
	// Seeding ran BackfillIndex through the same marked service; start clean.
	changemarktest.Reset(t, db, instID)
	seeded := rec.Count(instID)

	// Stage a feature.
	featurePayload, _ := json.Marshal(map[string]any{
		"name":        "Test Feature",
		"description": "For ingest test",
	})
	r := c.call(id, "create_feature", map[string]any{
		"instance_id": instID.String(),
		"feature_key": "fd-ingest-001",
		"payload":     string(featurePayload),
	})
	id++
	r.assertOK()

	var staged struct {
		BatchID string `json:"batch_id"`
	}
	r.decode(&staged)
	if staged.BatchID == "" {
		t.Fatal("create_feature did not return batch_id")
	}

	// Commit the batch.
	r = c.call(id, "commit_batch", map[string]any{
		"batch_id": staged.BatchID,
	})
	r.assertOK()

	// The commit must mark the instance changed and notify the ingest service
	// exactly once; the domain service does it, not the MCP handler.
	if n := rec.Count(instID) - seeded; n != 1 {
		t.Errorf("instance notified %d times by commit_batch, want 1", n)
	}
	if s := changemarktest.Load(t, db, instID); s.Dirty == nil {
		t.Error("commit_batch did not mark the instance dirty")
	}
}

// ---------------------------------------------------------------------------
// Scenario: Full agent workflow — routing → query → mutate → commit → search
// ---------------------------------------------------------------------------

func TestMCP_FullAgentWorkflow(t *testing.T) {
	svc, mem := buildSvcWithMemory(t)

	// Seed a rich instance with vision + features.
	payloads := map[string]any{
		"north_star": map[string]any{
			"vision":       "Become the operating system for knowledge work",
			"mission":      "AI-native knowledge management",
			"product_name": "Emergent Memory",
			"time_horizon": "3 years",
		},
		"strategy_foundations": map[string]any{
			"positioning": map[string]any{
				"category":       "Knowledge Management",
				"target":         "Engineering teams",
				"differentiator": "AI-native graph database",
			},
		},
	}
	_, instID := seedInstance(t, svc, "workflow-owner", payloads)
	seedKnowledgeGraph(t, svc, mem, instID)
	c := newMCPClient(t, svc)
	id := 1

	// Step 1: Agent routing — get_agent_for_task.
	r := c.call(id, "get_agent_for_task", map[string]any{
		"task_description": "I want to create a new feature for user onboarding",
	})
	id++
	r.assertOK()
	// Should recommend an agent or direct tool.
	r.contains("feature")

	// Step 2: Query strategic context.
	r = c.call(id, "get_product_vision", map[string]any{
		"instance_id": instID.String(),
	})
	id++
	r.assertOK()
	r.contains("operating system for knowledge work")

	// Step 3: Search strategy (via mocked Memory).
	r = c.call(id, "search_strategy", map[string]any{
		"instance_id": instID.String(),
		"query":       "knowledge graph capabilities",
		"limit":       "5",
	})
	id++
	r.assertOK()

	var searchResults []struct {
		ArtifactKey string `json:"artifact_key"`
	}
	r.decode(&searchResults)
	if len(searchResults) == 0 {
		t.Fatal("search_strategy returned 0 results")
	}

	// Step 4: Create a new feature.
	featurePayload, _ := json.Marshal(map[string]any{
		"name":        "User Onboarding Wizard",
		"description": "Guide new users through their first knowledge graph setup",
		"status":      "draft",
		"track":       "product",
	})
	r = c.call(id, "create_feature", map[string]any{
		"instance_id": instID.String(),
		"feature_key": "fd-workflow-001",
		"payload":     string(featurePayload),
	})
	id++
	r.assertOK()

	var batchResp struct {
		BatchID string `json:"batch_id"`
	}
	r.decode(&batchResp)

	// Step 5: Verify staged — feature should NOT be visible yet.
	r = c.call(id, "list_features", map[string]any{
		"instance_id": instID.String(),
	})
	id++
	r.assertOK()
	if strings.Contains(r.text, "fd-workflow-001") {
		t.Error("staged feature should not appear in list_features before commit")
	}

	// Step 6: Commit the batch.
	r = c.call(id, "commit_batch", map[string]any{
		"batch_id": batchResp.BatchID,
	})
	id++
	r.assertOK()

	// Step 7: Verify committed — feature should be visible.
	r = c.call(id, "list_features", map[string]any{
		"instance_id": instID.String(),
	})
	id++
	r.assertOK()
	r.contains("fd-workflow-001")

	// Step 8: Get the feature back.
	r = c.call(id, "get_feature", map[string]any{
		"instance_id": instID.String(),
		"feature_key": "fd-workflow-001",
	})
	id++
	r.assertOK()
	r.contains("User Onboarding Wizard")

	// Step 9: Get neighbors from the instance's graph.
	r = c.call(id, "get_neighbors", map[string]any{
		"instance_id": instID.String(),
		"node_key":    "fd-001_knowledge_graph_engine",
	})
	r.assertOK()
	// fd-001 has two neighbours in the seeded graph.
	r.contains("fd-002_document_ingestion")
}

// ---------------------------------------------------------------------------
// Scenario: Semantic search with empty Memory — verify no panics
// ---------------------------------------------------------------------------

func TestMCP_SemanticSearch_EmptyResults(t *testing.T) {
	svc, _ := buildSvcWithMemory(t)
	_, instID := seedInstance(t, svc, "empty-owner", map[string]any{
		"north_star": map[string]any{"vision": "test"},
	})
	markReady(t, svc, instID)
	c := newMCPClient(t, svc)

	r := c.call(1, "search_strategy", map[string]any{
		"instance_id": instID.String(),
		"query":       "nonexistent concept",
		"mode":        "semantic",
		"limit":       "10",
	})
	r.assertOK()

	var results []any
	r.decode(&results)
	if len(results) != 0 {
		t.Errorf("expected 0 results for empty Memory, got %d", len(results))
	}
}

// ---------------------------------------------------------------------------
// Helper: mcpClientWithUser uses the same call/listTools/initialize as
// mcpClient but the wrapped server injects DevUser into every request context.
// ---------------------------------------------------------------------------

// initialize re-uses the base mcpClient's initialize, which sends the MCP
// handshake and captures the session ID. The wrapper's context injection
// ensures the handshake itself also has a user (harmless for initialize).
func (c *mcpClientWithUser) call(id int, toolName string, args map[string]any) toolResult {
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
	if err := json.Unmarshal(jsonRPCPayload(raw), &envelope); err != nil {
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

// ---------------------------------------------------------------------------
// newMCPClientForUser creates an MCP client that injects a specific user into
// every request context. Used for multi-tenant isolation tests.
// ---------------------------------------------------------------------------

func newMCPClientForUser(t *testing.T, svc mcpserver.Services, u *web.User) *mcpClientWithUser {
	t.Helper()
	handler := mcpserver.New(svc)

	wrappedHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := web.ContextWithUser(r.Context(), u)
		ctx = audit.ContextWithActor(ctx, u.ID)
		ctx = audit.ContextWithSource(ctx, audit.SourceMCP)
		ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
		handler.ServeHTTP(w, r.WithContext(ctx))
	})

	ts := httptest.NewServer(wrappedHandler)
	t.Cleanup(ts.Close)

	c := &mcpClientWithUser{}
	c.t = t
	c.server = ts
	c.initialize()
	return c
}

// ---------------------------------------------------------------------------
// Scenario: Multi-tenant isolation — two orgs, cross-access denied
// ---------------------------------------------------------------------------

func TestMCP_MultiTenantIsolation(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceSystem)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())

	// Create two users.
	userSvc := user.NewService(db)
	userAlice, err := userSvc.EnsureUser(ctx, "alice-sub", "alice@example.com", "Alice")
	if err != nil {
		t.Fatalf("create alice: %v", err)
	}
	userBob, err := userSvc.EnsureUser(ctx, "bob-sub", "bob@example.com", "Bob")
	if err != nil {
		t.Fatalf("create bob: %v", err)
	}

	// Create two orgs.
	orgSvc := orgdom.NewService(db)
	orgAlice, err := orgSvc.Create(ctx, orgdom.CreateParams{Name: "Alice Corp"}, userAlice.ID)
	if err != nil {
		t.Fatalf("create alice org: %v", err)
	}
	orgBob, err := orgSvc.Create(ctx, orgdom.CreateParams{Name: "Bob Inc"}, userBob.ID)
	if err != nil {
		t.Fatalf("create bob org: %v", err)
	}

	// Create workspaces scoped to each org.
	wsSvc := workspace.NewService(db)
	wsAlice, err := wsSvc.CreateWorkspace(ctx, "alice-github", nil, orgAlice.ID)
	if err != nil {
		t.Fatalf("create alice workspace: %v", err)
	}

	wsBob, err := wsSvc.CreateWorkspace(ctx, "bob-github", nil, orgBob.ID)
	if err != nil {
		t.Fatalf("create bob workspace: %v", err)
	}

	// Create instances in each workspace.
	instSvc := instance.NewService(db)
	instAlice, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: wsAlice.ID,
		Name:        "Alice Strategy",
	})
	if err != nil {
		t.Fatalf("import alice instance: %v", err)
	}

	instBob, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: wsBob.ID,
		Name:        "Bob Strategy",
	})
	if err != nil {
		t.Fatalf("import bob instance: %v", err)
	}

	// Stage a feature in Bob's instance (using system context for setup).
	stratSvc := strategy.NewService(db)
	batchIDBob, err := stratSvc.Stage(ctx, strategy.StageParams{
		InstanceID:   instBob.ID,
		ArtifactType: "feature",
		ArtifactKey:  "fd-001",
		Action:       "create",
		Payload:      map[string]any{"name": "Bob's Feature"},
	})
	if err != nil {
		t.Fatalf("stage bob feature: %v", err)
	}

	// Build MCP services.
	packSvc := pack.NewService(db)
	svc := mcpserver.Services{
		Workspace: wsSvc,
		Instance:  instSvc,
		Strategy:  stratSvc,
		Pack:      packSvc,
		App:       appdom.NewService(db),
		Semantic:  semantic.NewService(semantic.Config{}),
		Org:       orgSvc,
	}

	// Create MCP clients for each user.
	aliceUser := &web.User{ID: userAlice.ID, Sub: "alice-sub", Email: "alice@example.com", Name: "Alice"}
	bobUser := &web.User{ID: userBob.ID, Sub: "bob-sub", Email: "bob@example.com", Name: "Bob"}
	aliceClient := newMCPClientForUser(t, svc, aliceUser)
	bobClient := newMCPClientForUser(t, svc, bobUser)

	id := 1

	// -----------------------------------------------------------------------
	// Test 1: list_workspaces — each user sees only their org's workspaces
	// -----------------------------------------------------------------------
	t.Run("list_workspaces_scoped", func(t *testing.T) {
		var aliceResult struct {
			Workspaces []struct {
				ID string `json:"id"`
			} `json:"workspaces"`
		}
		aliceClient.call(id, "list_workspaces", map[string]any{}).assertOK().decode(&aliceResult)
		id++
		if len(aliceResult.Workspaces) != 1 {
			t.Fatalf("alice should see 1 workspace, got %d", len(aliceResult.Workspaces))
		}
		if aliceResult.Workspaces[0].ID != wsAlice.ID.String() {
			t.Errorf("alice sees wrong workspace: %s", aliceResult.Workspaces[0].ID)
		}

		var bobResult struct {
			Workspaces []struct {
				ID string `json:"id"`
			} `json:"workspaces"`
		}
		bobClient.call(id, "list_workspaces", map[string]any{}).assertOK().decode(&bobResult)
		id++
		if len(bobResult.Workspaces) != 1 {
			t.Fatalf("bob should see 1 workspace, got %d", len(bobResult.Workspaces))
		}
		if bobResult.Workspaces[0].ID != wsBob.ID.String() {
			t.Errorf("bob sees wrong workspace: %s", bobResult.Workspaces[0].ID)
		}
	})

	// -----------------------------------------------------------------------
	// Test 2: get_instance — cross-org access denied
	// -----------------------------------------------------------------------
	t.Run("get_instance_cross_org_denied", func(t *testing.T) {
		// Alice can access her own instance.
		aliceClient.call(id, "get_instance", map[string]any{
			"instance_id": instAlice.ID.String(),
		}).assertOK()
		id++

		// Alice CANNOT access Bob's instance.
		aliceClient.call(id, "get_instance", map[string]any{
			"instance_id": instBob.ID.String(),
		}).assertError()
		id++
		t.Log("alice correctly denied access to bob's instance")
	})

	// -----------------------------------------------------------------------
	// Test 3: commit_batch — cross-org write denied
	// -----------------------------------------------------------------------
	t.Run("commit_batch_cross_org_denied", func(t *testing.T) {
		// Alice CANNOT commit Bob's batch.
		aliceClient.call(id, "commit_batch", map[string]any{
			"batch_id": batchIDBob.String(),
		}).assertError()
		id++
		t.Log("alice correctly denied commit on bob's batch")

		// Bob CAN commit his own batch.
		bobClient.call(id, "commit_batch", map[string]any{
			"batch_id": batchIDBob.String(),
		}).assertOK()
		id++
		t.Log("bob successfully committed his own batch")
	})

	// -----------------------------------------------------------------------
	// Test 4: list_instances — cross-org workspace access denied
	// -----------------------------------------------------------------------
	t.Run("list_instances_cross_org_denied", func(t *testing.T) {
		// Alice can list instances in her workspace.
		aliceClient.call(id, "list_instances", map[string]any{
			"workspace_id": wsAlice.ID.String(),
		}).assertOK()
		id++

		// Alice CANNOT list instances in Bob's workspace.
		aliceClient.call(id, "list_instances", map[string]any{
			"workspace_id": wsBob.ID.String(),
		}).assertError()
		id++
		t.Log("alice correctly denied access to bob's workspace instances")
	})

	t.Logf("multi-tenant isolation: all checks passed (alice org=%s, bob org=%s)", orgAlice.ID, orgBob.ID)
}
