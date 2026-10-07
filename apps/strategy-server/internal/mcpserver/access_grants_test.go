package mcpserver_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// withPrincipal mounts the MCP handler behind a middleware that injects the
// given principal, standing in for AuthMiddleware's token path.
func withPrincipal(h http.Handler, p *web.Principal) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := web.ContextWithPrincipal(r.Context(), p)
		ctx = audit.ContextWithSource(ctx, audit.SourceMCPToken)
		ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
		if p != nil && p.User != nil {
			ctx = audit.ContextWithActor(ctx, p.User.ID)
		}
		h.ServeHTTP(w, r.WithContext(ctx))
	})
}

func newMCPClientAs(t *testing.T, svc mcpserver.Services, p *web.Principal) *mcpClient {
	t.Helper()
	ts := httptest.NewServer(withPrincipal(mcpserver.New(svc), p))
	t.Cleanup(ts.Close)
	c := &mcpClient{t: t, server: ts}
	c.initialize()
	return c
}

// tokenPrincipal builds a scoped principal as the middleware would.
func tokenPrincipal(instanceID uuid.UUID, permission string) *web.Principal {
	readOnly := permission != web.PermissionWrite
	return &web.Principal{
		User:     &web.User{ID: web.DevUser.ID},
		TokenID:  ptr(uuid.New()),
		Grants:   []web.InstanceGrant{{InstanceID: instanceID, Permission: permission}},
		ReadOnly: readOnly,
	}
}

func ptr[T any](v T) *T { return &v }

// TestGrantedInstanceIsReachable is the happy path: a scoped token reaches
// the instance named in its grant.
func TestGrantedInstanceIsReachable(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "granted-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "reachable"},
	})

	c := newMCPClientAs(t, svc, tokenPrincipal(instID, web.PermissionRead))
	c.call(1, "get_product_vision", map[string]any{"instance_id": instID.String()}).assertOK()
}

// TestUngrantedInstanceIsNotReachable is the core scoping property.
//
// The principal's user is DevUser, who *is* a member of the org owning both
// instances. If authorisation consulted org membership for a scoped
// credential, this would wrongly succeed — which is exactly the escalation
// scoping exists to prevent.
func TestUngrantedInstanceIsNotReachable(t *testing.T) {
	svc := buildSvc(t)
	_, granted := seedInstance(t, svc, "tok-a-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "granted"},
	})
	_, ungranted := seedInstance(t, svc, "tok-b-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "SECRET — different instance"},
	})

	c := newMCPClientAs(t, svc, tokenPrincipal(granted, web.PermissionRead))

	// Sanity: the grant works.
	c.call(1, "get_product_vision", map[string]any{"instance_id": granted.String()}).assertOK()

	// The other instance is invisible despite org membership.
	r := c.call(2, "get_product_vision", map[string]any{
		"instance_id": ungranted.String(),
	}).assertError()
	r.contains("not found")

	if strings.Contains(r.text, "SECRET") {
		t.Fatalf("the ungranted instance's content leaked: %s", r.text)
	}
}

// TestGrantsDoNotWidenOrgAdminAuthority states Key Decision 4 directly.
//
// DevUser is an org admin. A read-only token held by that admin must stay
// read-only: authority is a property of the credential, not only of the
// person. If org membership were consulted as a fallback when the grant says
// read, every scoped token would be as powerful as its owner.
func TestGrantsDoNotWidenOrgAdminAuthority(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "narrow-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "original vision"},
	})

	// Confirm the same user, unscoped, *can* write — so the denial below is
	// attributable to the grant and not to some unrelated failure.
	admin := newMCPClient(t, svc)
	admin.call(1, "update_north_star", map[string]any{
		"instance_id": instID.String(),
		"payload":     `{"vision":"admin rewrote this"}`,
	}).assertOK()

	// The same user through a read-only token cannot.
	scoped := newMCPClientAs(t, svc, tokenPrincipal(instID, web.PermissionRead))
	scoped.call(2, "update_north_star", map[string]any{
		"instance_id": instID.String(),
		"payload":     `{"vision":"token should not be able to write this"}`,
	}).assertError()
}

// TestWriteGrantPermitsWriting is the control for the test above: the denial
// must come from the permission, not from scoping as such.
func TestWriteGrantPermitsWriting(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "writable-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "before"},
	})

	c := newMCPClientAs(t, svc, tokenPrincipal(instID, web.PermissionWrite))
	c.call(1, "update_north_star", map[string]any{
		"instance_id": instID.String(),
		"payload":     `{"vision":"written via a write-scoped token"}`,
	}).assertOK()
}

// TestMultiGrantTokenIsPerInstance covers the case the global write gate
// cannot: one token with write on A and read on B. The middleware sees only
// the tool name, so the per-instance check is what refuses the write to B.
func TestMultiGrantTokenIsPerInstance(t *testing.T) {
	svc := buildSvc(t)
	_, writable := seedInstance(t, svc, "multi-w-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "writable"},
	})
	_, readable := seedInstance(t, svc, "multi-r-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{"vision": "read only"},
	})

	p := &web.Principal{
		User:    &web.User{ID: web.DevUser.ID},
		TokenID: ptr(uuid.New()),
		Grants: []web.InstanceGrant{
			{InstanceID: writable, Permission: web.PermissionWrite},
			{InstanceID: readable, Permission: web.PermissionRead},
		},
		ReadOnly: false, // holds a write grant, so not globally read-only
	}
	c := newMCPClientAs(t, svc, p)

	// Reads work on both.
	c.call(1, "get_product_vision", map[string]any{"instance_id": writable.String()}).assertOK()
	c.call(2, "get_product_vision", map[string]any{"instance_id": readable.String()}).assertOK()

	// Write works only where granted.
	c.call(3, "update_north_star", map[string]any{
		"instance_id": writable.String(),
		"payload":     `{"vision":"allowed"}`,
	}).assertOK()

	c.call(4, "update_north_star", map[string]any{
		"instance_id": readable.String(),
		"payload":     `{"vision":"must be refused"}`,
	}).assertError()
}
