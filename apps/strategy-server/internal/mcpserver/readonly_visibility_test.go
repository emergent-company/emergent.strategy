package mcpserver_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

func toolSet(names []string) map[string]bool {
	m := make(map[string]bool, len(names))
	for _, n := range names {
		m[n] = true
	}
	return m
}

// A read-only credential is refused every write by the access gate. Listing
// those tools only invites attempts, so tools/list leaves them out. This shapes
// the list; it is not an access control, and TestWriteGate_* still prove the
// calls are refused.
func TestToolsList_ReadOnlySessionDoesNotListWriteTools(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "vis-ro-"+uuid.New().String()[:8], nil)
	c := newMCPClientAs(t, svc, readOnlyPrincipal(instID))

	first := toolSet(c.listTools())
	for _, write := range []string{"commit_batch", "discard_batch", "describe_batch"} {
		if first[write] {
			t.Errorf("read-only session is shown write tool %s in its first tools/list", write)
		}
	}
	for _, read := range []string{"get_outline", "get_section", "get_view", "search_strategy", "get_instance", "set_tool_filter"} {
		if !first[read] {
			t.Errorf("read-only session is not shown %s", read)
		}
	}

	c.activateAllTools()
	all := toolSet(c.listTools())
	for name := range all {
		if mcpserver.AccessFor(name) == mcpserver.AccessWrite {
			t.Errorf("read-only session with every category active is still shown write tool %s", name)
		}
	}
	if !all["get_product_vision"] {
		t.Error("activating all categories removed read tools")
	}
}

func TestToolsList_FullAuthoritySessionStillListsWriteTools(t *testing.T) {
	c := newMCPClient(t, buildSvc(t))
	if !toolSet(c.listTools())["commit_batch"] {
		t.Error("a full-authority session must still see commit_batch")
	}
}
