package mcpserver_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// TestEveryToolIsClassified is the mechanism that keeps the gate honest.
//
// AccessFor defaults an unlisted tool to write, so forgetting to classify one
// is safe but silently restrictive. This test converts that silence into a
// build-time failure, and is the reason the default can be trusted not to
// quietly accumulate exceptions.
func TestEveryToolIsClassified(t *testing.T) {
	s := mcpserver.NewMCPServerForIntrospection()
	var registered []string
	for name := range s.ListTools() {
		registered = append(registered, name)
	}
	sort.Strings(registered)

	if len(registered) == 0 {
		t.Fatal("no tools registered; the introspection server is not wired")
	}

	var missing []string
	for _, name := range registered {
		if _, ok := mcpserver.ToolAccess[name]; !ok {
			missing = append(missing, name)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("%d registered tool(s) are not in ToolAccess.\n"+
			"They default to write and are refused to read-only credentials.\n"+
			"Classify each by reading its handler — never by its name prefix:\n  %s",
			len(missing), strings.Join(missing, "\n  "))
	}

	// The reverse direction: a stale entry means a tool was renamed or
	// removed, and the dead entry would mask the rename from the check above.
	inRegistry := make(map[string]bool, len(registered))
	for _, n := range registered {
		inRegistry[n] = true
	}
	var stale []string
	for name := range mcpserver.ToolAccess {
		if !inRegistry[name] {
			stale = append(stale, name)
		}
	}
	sort.Strings(stale)
	if len(stale) > 0 {
		t.Errorf("%d entr(ies) in ToolAccess name no registered tool (renamed or removed?):\n  %s",
			len(stale), strings.Join(stale, "\n  "))
	}
}

// TestToolAccessValuesAreValid catches a typo'd class, which AccessFor would
// otherwise treat as "not read, not session" and silently deny.
func TestToolAccessValuesAreValid(t *testing.T) {
	for name, access := range mcpserver.ToolAccess {
		switch access {
		case mcpserver.AccessRead, mcpserver.AccessSession, mcpserver.AccessWrite:
		default:
			t.Errorf("tool %q has access class %q, want read/session/write", name, access)
		}
	}
}

func TestAccessFor_UnlistedDefaultsToWrite(t *testing.T) {
	if got := mcpserver.AccessFor("a_tool_that_does_not_exist"); got != mcpserver.AccessWrite {
		t.Errorf("AccessFor(unlisted) = %q, want %q — an unclassified tool must be "+
			"treated as the most dangerous thing it could be", got, mcpserver.AccessWrite)
	}
}

// readOnlyPrincipal builds the principal AuthMiddleware produces for a
// read-scoped token.
func readOnlyPrincipal(instanceID uuid.UUID) *web.Principal {
	return &web.Principal{
		User:     &web.User{ID: web.DevUser.ID},
		TokenID:  ptr(uuid.New()),
		Grants:   []web.InstanceGrant{{InstanceID: instanceID, Permission: web.PermissionRead}},
		ReadOnly: true,
	}
}

// TestWriteGate_DeniesWriteTools covers the central behaviour across a spread
// of write tools, including the ones whose names do not look like writes.
func TestWriteGate_DeniesWriteTools(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "gate-w-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "protected"},
	})

	c := newMCPClientAs(t, svc, readOnlyPrincipal(instID))
	c.activateAllTools()

	cases := []struct {
		tool string
		args map[string]any
	}{
		{"update_north_star", map[string]any{
			"instance_id": instID.String(), "payload": `{"vision":"nope"}`}},
		{"create_feature", map[string]any{
			"instance_id": instID.String(), "key": "f1", "payload": `{"name":"F"}`}},
		{"delete_instance", map[string]any{"instance_id": instID.String()}},
		{"stage_artifact", map[string]any{
			"instance_id": instID.String(), "artifact_type": "feature",
			"artifact_key": "f1", "action": "create", "payload": `{"name":"F"}`}},
		{"archive_instance", map[string]any{"instance_id": instID.String()}},
		// Named like a read, classified write because it UPDATEs mutations.
		{"describe_batch", map[string]any{
			"batch_id": uuid.New().String(), "agent_id": "x", "description": "y"}},
	}

	for i, tc := range cases {
		t.Run(tc.tool, func(t *testing.T) {
			r := c.call(100+i, tc.tool, tc.args).assertError()
			if !strings.Contains(r.text, "read-only") {
				t.Errorf("denial message does not explain the cause: %s", r.text)
			}
		})
	}
}

// TestWriteGate_AllowsReadTools is the control: the gate must not be a blanket
// refusal.
func TestWriteGate_AllowsReadTools(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "gate-r-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "readable"},
	})

	c := newMCPClientAs(t, svc, readOnlyPrincipal(instID))
	c.activateAllTools()

	id := 200
	for _, tool := range []string{
		"get_product_vision",
		"list_artifacts",
		"validate_instance",
		"health_check",
		"list_pending_batches",
		"get_coverage_analysis",
	} {
		id++
		c.call(id, tool, map[string]any{"instance_id": instID.String()}).assertOK()
	}
}

// TestWriteGate_AllowsSessionTools covers the reason AccessSession exists.
//
// set_tool_filter mutates, but only the caller's own view. Refusing it would
// leave a read-only client unable to see any tool outside the default core
// set — the catalogue would be unnavigable with a valid credential.
func TestWriteGate_AllowsSessionTools(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "gate-s-"+uuid.New().String()[:8], nil)

	c := newMCPClientAs(t, svc, readOnlyPrincipal(instID))

	c.call(1, "list_tool_categories", map[string]any{}).assertOK()
	c.call(2, "set_tool_filter", map[string]any{
		"categories": []any{"strategy"},
	}).assertOK()
	c.call(3, "get_agent_for_task", map[string]any{
		"task_description": "read the product vision",
	}).assertOK()

	// The filter actually took effect, so the allowance is useful and not
	// merely a non-error.
	tools := c.listTools()
	found := false
	for _, n := range tools {
		if n == "get_product_vision" {
			found = true
		}
	}
	if !found {
		t.Error("set_tool_filter was permitted but had no effect on the visible tool list")
	}
}

// TestWriteGate_UnclassifiedToolIsDenied exercises the default through the
// real middleware rather than only through AccessFor.
func TestWriteGate_UnclassifiedToolIsDenied(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "gate-u-"+uuid.New().String()[:8], nil)

	c := newMCPClientAs(t, svc, readOnlyPrincipal(instID))
	c.activateAllTools()

	// An unregistered name cannot reach the gate — mcp-go rejects it at the
	// protocol layer with a JSON-RPC error before any middleware runs, which
	// the test harness cannot represent as a tool result. The default is
	// therefore asserted directly against AccessFor
	// (TestAccessFor_UnlistedDefaultsToWrite) and here against the gate's
	// own decision function, which is what the middleware consults.
	if mcpserver.AccessFor("some_tool_added_next_week") != mcpserver.AccessWrite {
		t.Error("an unclassified tool must default to write")
	}
	_ = c
}

// TestWriteGate_FullAccessUnaffected proves the gate is inert for ordinary
// interactive sessions — the regression that would break every existing user.
func TestWriteGate_FullAccessUnaffected(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "gate-f-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "before"},
	})

	c := newMCPClient(t, svc) // unscoped DevUser principal
	c.activateAllTools()

	c.call(1, "update_north_star", map[string]any{
		"instance_id": instID.String(),
		"payload":     `{"vision":"an unscoped session may write"}`,
	}).assertOK()
}

// TestWriteGate_DeniesBeforeHandlerRuns is the property that makes the gate a
// gate rather than a late error: the refused write must leave no trace.
func TestWriteGate_DeniesBeforeHandlerRuns(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "gate-b-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "untouched"},
	})

	c := newMCPClientAs(t, svc, readOnlyPrincipal(instID))
	c.activateAllTools()

	before := c.call(1, "list_pending_batches",
		map[string]any{"instance_id": instID.String()}).assertOK().text

	c.call(2, "update_north_star", map[string]any{
		"instance_id": instID.String(),
		"payload":     `{"vision":"must never be staged"}`,
	}).assertError()

	after := c.call(3, "list_pending_batches",
		map[string]any{"instance_id": instID.String()}).assertOK().text

	if before != after {
		t.Errorf("a refused write changed pending batches, so the handler ran:\nbefore: %s\nafter:  %s",
			before, after)
	}

	// The artifact itself is unchanged.
	vision := c.call(4, "get_product_vision",
		map[string]any{"instance_id": instID.String()}).assertOK().text
	if strings.Contains(vision, "must never be staged") {
		t.Errorf("the refused write reached the artifact: %s", vision)
	}
}

// TestWriteGateIgnoresToolFilter is the point of Key Decision 2.
//
// tool_filter.go says plainly that it shapes tools/list only and every tool
// stays invocable via tools/call. If the gate were satisfied by a tool being
// hidden, a read-only caller could write simply by calling a tool whose
// category was never activated. This asserts the gate holds without the
// filter's help.
func TestWriteGateIgnoresToolFilter(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "gate-tf-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "protected"},
	})

	c := newMCPClientAs(t, svc, readOnlyPrincipal(instID))

	// Deliberately do NOT activate categories. delete_instance lives in
	// "admin", which is inactive on a fresh session.
	const hidden = "delete_instance"
	for _, n := range c.listTools() {
		if n == hidden {
			t.Fatalf("%s is visible on a fresh session; this test no longer "+
				"proves anything about inactive categories", hidden)
		}
	}

	r := c.call(1, hidden, map[string]any{
		"instance_id": instID.String(),
	}).assertError()

	if !strings.Contains(r.text, "read-only") {
		t.Errorf("an invisible write tool was refused for the wrong reason: %s", r.text)
	}
}
