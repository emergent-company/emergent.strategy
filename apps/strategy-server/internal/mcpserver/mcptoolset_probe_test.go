package mcpserver_test

// This file answers establish-agent-contract tasks.md §5's second bullet:
// "Probe ADK's mcptoolset against that endpoint — does a remote agent's tool
// set genuinely appear as local tools? Do not assume from names." It is a
// real probe, not a read of package names: it stands up strategy-server's
// actual streamable-HTTP MCP handler and drives it with ADK's actual
// mcptoolset client, over the actual wire protocol.
//
// google.golang.org/adk/v2 is not a new dependency introduced for this probe
// — internal/adk already imports google.golang.org/adk/v2/model and
// google.golang.org/adk/v2/session directly (see internal/adk/provider_model.go,
// session_types.go). This file is the first user of tool/mcptoolset, agent,
// and auth, all from the same already-resolved v2.2.0.

import (
	"testing"

	"github.com/mark3labs/mcp-go/server"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/auth"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/mcptoolset"
	"google.golang.org/adk/v2/tool/toolconfirmation"

	"net/http"
	"net/http/httptest"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

// fakeToolContext is agent.Context, built from the public
// agent.StrictContextMock. Every method panics on first use except the four
// plain context.Context methods (served from an embedded real context) and
// ToolConfirmation, which mcpTool.Run calls unconditionally on every
// invocation to check for a pending human-in-the-loop confirmation — we
// override it to report "none pending" so a probe that never asks for
// confirmation doesn't panic on a mock method it was never going to
// exercise otherwise. A probe that started calling any other Context method
// would panic loudly, which is exactly the point of StrictContextMock: an
// unexpected dependency on ADK plumbing fails the test, it does not
// silently no-op.
type fakeToolContext struct {
	agent.StrictContextMock
}

func newFakeToolContext(t *testing.T) *fakeToolContext {
	return &fakeToolContext{agent.NewStrictContextMock(t.Context())}
}

func (*fakeToolContext) ToolConfirmation() *toolconfirmation.ToolConfirmation { return nil }

// runnable is the subset of mcptoolset's unexported concrete tool type this
// probe needs. mcptoolset.New returns []tool.Tool — the base interface has
// no Run method — so calling a converted tool (as opposed to merely listing
// it) requires this structural assertion. Asserting against it is itself
// part of the proof: it only compiles and succeeds if mcptoolset really
// produces tools with the shape an ADK LLM-agent runtime would invoke.
type runnable interface {
	Run(ctx agent.Context, args any) (map[string]any, error)
}

// closeStreamableHTTPTestServer tears down httpSrv. Streamable-HTTP MCP
// clients (including mcptoolset's) hold a standalone SSE GET connection open
// indefinitely for server-pushed notifications and never close it on their
// own — this probe's own client never issues a shutdown request either, so
// plain httpSrv.Close() blocks forever waiting for that connection to go
// idle. This is a genuine, reusable finding about the transport, not a test
// artifact: any harness that stands up a real streamable-HTTP MCP server for
// a short-lived client must force-close connections, not just Close().
func closeStreamableHTTPTestServer(httpSrv *httptest.Server) {
	httpSrv.CloseClientConnections()
	httpSrv.Close()
}

func toolNames(tools []tool.Tool) map[string]bool {
	names := make(map[string]bool, len(tools))
	for _, tl := range tools {
		names[tl.Name()] = true
	}
	return names
}

// TestMCPToolSet_RemoteToolsAppearAsLocalADKTools is the core transport
// probe. It proves, by actually running the code rather than reading
// package names, that:
//
//  1. mcptoolset.New, pointed at strategy-server's real streamable-HTTP MCP
//     handler, converts the remote catalogue into ADK tool.Tool values.
//  2. A fresh session sees only the "core" category by default — the
//     existing per-session tool-category filter (tool_filter.go, built for
//     interactive LLM clients trimming context) applies to a remote
//     mcptoolset caller exactly as it does to any other MCP client. This
//     was not obvious from the package layout: mcptoolset presents itself
//     as "the remote agent's tools," which could easily have been assumed
//     to mean the full catalogue.
//  3. Calling the returned set_tool_filter tool through the same toolset
//     instance, then listing again, genuinely expands what mcptoolset
//     reports — the filter and the toolset share one underlying MCP
//     session, not two independent views.
func TestMCPToolSet_RemoteToolsAppearAsLocalADKTools(t *testing.T) {
	httpSrv := httptest.NewServer(server.NewStreamableHTTPServer(mcpserver.NewMCPServerForIntrospection()))
	t.Cleanup(func() { closeStreamableHTTPTestServer(httpSrv) })

	ts, err := mcptoolset.New(mcptoolset.Config{Endpoint: httpSrv.URL})
	if err != nil {
		t.Fatalf("mcptoolset.New: %v", err)
	}

	ctx := newFakeToolContext(t)

	// 1. Fresh session: mcptoolset must report only the core category, not
	// the full 153-tool catalogue, and it must do so via genuine remote
	// discovery (tools/list), not a hardcoded local list.
	coreTools, err := ts.Tools(ctx)
	if err != nil {
		t.Fatalf("Tools() on fresh session: %v", err)
	}

	wantCore := 0
	for _, cat := range mcpserver.ToolCategories {
		if cat == mcpserver.CategoryCore {
			wantCore++
		}
	}
	if len(coreTools) != wantCore {
		t.Fatalf("fresh session: got %d tools, want exactly the %d core tools (mcpserver.ToolCategories); "+
			"either the default-filter behavior changed or mcptoolset is not seeing the real session-scoped list",
			len(coreTools), wantCore)
	}

	names := toolNames(coreTools)
	if !names["set_tool_filter"] {
		t.Fatalf("fresh session missing set_tool_filter — core category tools: %v", names)
	}
	if names["get_product_vision"] {
		t.Fatalf("fresh session unexpectedly exposes a non-core tool (get_product_vision) — "+
			"default filtering is not being applied to this remote caller: %v", names)
	}

	// 2. Invoke set_tool_filter *as an ADK tool*, through the same toolset
	// instance — proving mcptoolset's converted tools are genuinely
	// callable, not just listable, and that doing so mutates server-side
	// session state reachable from a second Tools() call below.
	var filterTool runnable
	for _, tl := range coreTools {
		if tl.Name() != "set_tool_filter" {
			continue
		}
		r, ok := tl.(runnable)
		if !ok {
			t.Fatalf("set_tool_filter converted to %T, which does not implement Run — "+
				"mcptoolset produced a listable-but-not-callable tool", tl)
		}
		filterTool = r
	}
	if filterTool == nil {
		t.Fatal("set_tool_filter not found among fresh-session tools")
	}

	if _, err := filterTool.Run(ctx, map[string]any{"categories": []any{"all"}}); err != nil {
		t.Fatalf("Run(set_tool_filter, categories=[all]): %v", err)
	}

	// 3. Same toolset instance, listed again: the expanded filter must be
	// visible, proving the CallTool and the ListTools that follow it share
	// one real MCP session rather than two independent connections.
	allTools, err := ts.Tools(ctx)
	if err != nil {
		t.Fatalf("Tools() after set_tool_filter: %v", err)
	}
	if len(allTools) != len(mcpserver.ToolCategories) {
		t.Fatalf("after set_tool_filter([all]): got %d tools, want all %d — "+
			"expanding the filter through a converted ADK tool did not take effect on the next remote list",
			len(allTools), len(mcpserver.ToolCategories))
	}
}

// TestMCPToolSet_Auth_StaticTokenIsForwarded proves the auth seam this
// change's transport decision (tasks.md §5's third bullet) depends on:
// mcptoolset.Config.Auth actually attaches a bearer token to every outgoing
// MCP request, using ADK's real auth.StaticToken provider and a real HTTP
// round trip — not asserted from reading providers.go, verified by
// inspecting the Authorization header the server actually received.
//
// This is the mechanism a same-trust-domain delegated call (design.md §1)
// would use to forward the initiating principal's real, independently
// verifiable token: a per-request CredentialProvider, not a token baked in
// at process start. Wiring that principal's token into the provider (as
// opposed to a fixed test string) is exactly the plumbing the end-to-end
// proof in tasks.md §6 needs to build, once a second real endpoint exists
// to delegate to — not solved here.
func TestMCPToolSet_Auth_StaticTokenIsForwarded(t *testing.T) {
	const wantToken = "same-trust-domain-token-abc123"

	var gotAuthHeader string
	inner := server.NewStreamableHTTPServer(mcpserver.NewMCPServerForIntrospection())
	spy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthHeader = r.Header.Get("Authorization")
		inner.ServeHTTP(w, r)
	}))
	t.Cleanup(func() { closeStreamableHTTPTestServer(spy) })

	ts, err := mcptoolset.New(mcptoolset.Config{
		Endpoint: spy.URL,
		Auth:     auth.StaticToken(wantToken),
	})
	if err != nil {
		t.Fatalf("mcptoolset.New: %v", err)
	}

	if _, err := ts.Tools(newFakeToolContext(t)); err != nil {
		t.Fatalf("Tools(): %v", err)
	}

	want := "Bearer " + wantToken
	if gotAuthHeader != want {
		t.Fatalf("Authorization header = %q, want %q — auth.StaticToken did not reach the wire", gotAuthHeader, want)
	}
}
