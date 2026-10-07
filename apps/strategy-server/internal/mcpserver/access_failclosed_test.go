package mcpserver_test

import (
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

// newMCPClientNoPrincipal mounts the MCP handler with no auth middleware, so
// requests arrive with nothing in context. This is the shape a future code
// path would have if it reached a handler without populating a principal.
func newMCPClientNoPrincipal(t *testing.T, svc mcpserver.Services) *mcpClient {
	t.Helper()
	ts := httptest.NewServer(mcpserver.New(svc))
	t.Cleanup(ts.Close)

	c := &mcpClient{t: t, server: ts}
	c.initialize()
	return c
}

// TestAccess_FailsClosedWithoutPrincipal is the regression guard for the
// fail-open inversion.
//
// assertWorkspaceAccess and assertInstanceAccess used to return nil — allow —
// when no user was in context, commented as "auth disabled". Any future path
// that reached a handler without populating context therefore received access
// to every tenant's data. The conditions were only *incidentally* dev-mode;
// nothing enforced that.
//
// Dev mode is now expressed as a present principal (AuthMiddleware injects
// DevUser when AUTH_ENABLED=false), so absence can safely mean deny.
func TestAccess_FailsClosedWithoutPrincipal(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "failclosed-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "secret vision"},
	})

	c := newMCPClientNoPrincipal(t, svc)

	// A read that would disclose artifact content.
	c.call(1, "get_product_vision", map[string]any{
		"instance_id": instID.String(),
	}).assertError()

	// A write that would mutate another tenant's strategy. Goes through
	// stageArtifact, the shared path behind every artifact writer.
	c.call(2, "update_north_star", map[string]any{
		"instance_id": instID.String(),
		"payload":     `{"vision":"attacker rewrote this"}`,
	}).assertError()
}

// TestAccess_DeniedForNonMember proves the check is a real membership test,
// not merely a presence test: a principal that exists but belongs to no org
// owning the instance is refused.
func TestAccess_DeniedForNonMember(t *testing.T) {
	svc := buildSvc(t)

	// Two independently seeded instances live in different orgs. seedInstance
	// grants DevUser membership of each org it creates, so to get a genuine
	// non-member we need an instance whose org DevUser was never added to.
	_, otherInstID := seedInstanceWithoutDevMembership(t, svc, "tenant-b-"+uuid.New().String()[:8])

	c := newMCPClient(t, svc) // authenticated as DevUser

	c.call(1, "get_product_vision", map[string]any{
		"instance_id": otherInstID.String(),
	}).assertError().contains("not found")
}
