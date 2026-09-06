package selfmodel

import (
	"bytes"
	"os"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

// TestGenerate_MatchesLiveToolRegistration proves the self-model's tool
// catalogue is the real, live-registered one — not a hand-copied or
// partially-stubbed subset. Directly guards the finding from
// introspection.go's doc comment: a naively (only partially) stubbed
// Services under-reports to 106 of 153 tools. If this regresses back to
// under-reporting, this test catches it by comparing against the same
// introspection path with a different, independently-constructed
// assertion (a raw count from ListTools, not from Generate itself).
func TestGenerate_MatchesLiveToolRegistration(t *testing.T) {
	live := mcpserver.NewMCPServerForIntrospection().ListTools()

	m, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	if len(m.Tools) != len(live) {
		t.Fatalf("Generate produced %d tools, live registration has %d", len(m.Tools), len(live))
	}
	byName := make(map[string]bool, len(m.Tools))
	for _, tool := range m.Tools {
		byName[tool.Name] = true
	}
	for name := range live {
		if !byName[name] {
			t.Errorf("live tool %q missing from generated self-model", name)
		}
	}
}

// TestGenerate_CategoryCountsMatchToolCategories cross-checks every
// published category's tool_count against mcpserver.ToolCategories
// directly, via an independently-computed count (not Generate's own
// internal counting logic) — the same discipline as the test above, so a
// bug in Generate's aggregation and a bug in the source data can't both
// hide behind the same computation.
func TestGenerate_CategoryCountsMatchToolCategories(t *testing.T) {
	want := make(map[string]int)
	for _, cat := range mcpserver.ToolCategories {
		want[cat]++
	}

	m, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if len(m.Categories) != len(mcpserver.CategoryOrder) {
		t.Fatalf("got %d categories, want %d (mcpserver.CategoryOrder)", len(m.Categories), len(mcpserver.CategoryOrder))
	}
	for _, c := range m.Categories {
		if c.ToolCount != want[c.Name] {
			t.Errorf("category %q: tool_count = %d, want %d", c.Name, c.ToolCount, want[c.Name])
		}
	}
}

// TestGenerate_ChangingACategoryChangesTheModel is the task's own explicit
// requirement: "changing a tool category changes the published model." This
// proves the self-model is generated fresh from mcpserver.ToolCategories
// every call, not cached or computed once — by mutating the live category
// map at test time (saved and restored via t.Cleanup, so this cannot leak
// into any other test in this package or run out of order) and confirming
// Generate's output moves with it.
func TestGenerate_ChangingACategoryChangesTheModel(t *testing.T) {
	const tool = "list_workspaces" // a real, currently-"core" tool
	original, ok := mcpserver.ToolCategories[tool]
	if !ok {
		t.Fatalf("fixture assumption broken: %q is no longer in mcpserver.ToolCategories", tool)
	}
	t.Cleanup(func() { mcpserver.ToolCategories[tool] = original })

	before, err := Generate()
	if err != nil {
		t.Fatalf("Generate (before): %v", err)
	}
	beforeCat := categoryOf(t, before, tool)
	if beforeCat != original {
		t.Fatalf("sanity check failed: generated category %q != source category %q before mutation", beforeCat, original)
	}

	const moveTo = "features"
	if moveTo == original {
		t.Fatalf("fixture assumption broken: %q is already in category %q", tool, moveTo)
	}
	mcpserver.ToolCategories[tool] = moveTo

	after, err := Generate()
	if err != nil {
		t.Fatalf("Generate (after): %v", err)
	}
	afterCat := categoryOf(t, after, tool)
	if afterCat != moveTo {
		t.Errorf("after moving %q to %q, generated model still reports %q — self-model is not reading the live category map", tool, moveTo, afterCat)
	}

	// The category counts must move too, not just the one tool's own field —
	// otherwise "the model changed" would be true only at the per-tool level
	// while the aggregate view (tool_categories[].tool_count) silently lied.
	beforeCount := countOf(before, original)
	afterCount := countOf(after, original)
	if afterCount != beforeCount-1 {
		t.Errorf("%s category count: before=%d after=%d, want after == before-1", original, beforeCount, afterCount)
	}
}

func categoryOf(t *testing.T, m *Model, toolName string) string {
	t.Helper()
	for _, tool := range m.Tools {
		if tool.Name == toolName {
			return tool.Category
		}
	}
	t.Fatalf("tool %q not found in generated model", toolName)
	return ""
}

func countOf(m *Model, category string) int {
	for _, c := range m.Categories {
		if c.Name == category {
			return c.ToolCount
		}
	}
	return -1
}

// TestGenerate_IsDeterministic proves two independent calls to Generate
// produce byte-identical JSON. This is the property the committed-file
// drift check below depends on — if Generate were non-deterministic (e.g.
// from unsorted map iteration), the drift check would fail on every commit
// regardless of whether anything actually drifted, making it useless.
func TestGenerate_IsDeterministic(t *testing.T) {
	a, err := Generate()
	if err != nil {
		t.Fatalf("Generate (a): %v", err)
	}
	b, err := Generate()
	if err != nil {
		t.Fatalf("Generate (b): %v", err)
	}
	aBytes, err := MarshalIndent(a)
	if err != nil {
		t.Fatalf("MarshalIndent (a): %v", err)
	}
	bBytes, err := MarshalIndent(b)
	if err != nil {
		t.Fatalf("MarshalIndent (b): %v", err)
	}
	if !bytes.Equal(aBytes, bBytes) {
		t.Fatal("two calls to Generate produced different JSON — output is not deterministic")
	}
}

// TestModel_CommittedFileMatchesGenerated is the drift check: the task's
// other explicit requirement, "a stale committed copy fails CI." Mirrors
// 21st-bot's genmanifest -check precedent (design.md's adoption checklist,
// item 5) as a Go test rather than a separate CLI flag, since this
// repo's own convention is `task check` (go test + lint), not a bespoke
// generator binary's -check mode — cmd/genselfmodel (this package's sibling)
// still exists for regenerating the file, but verifying it is exactly this
// test, runnable the same way every other regression in this repo is.
func TestModel_CommittedFileMatchesGenerated(t *testing.T) {
	committed, err := os.ReadFile(committedFilePath)
	if err != nil {
		t.Fatalf("read committed self-model (%s): %v — run `task selfmodel:generate`", committedFilePath, err)
	}

	m, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	fresh, err := MarshalIndent(m)
	if err != nil {
		t.Fatalf("MarshalIndent: %v", err)
	}

	if !bytes.Equal(committed, fresh) {
		t.Errorf("%s is stale — committed self-model does not match freshly generated output.\n"+
			"Run `task selfmodel:generate` and commit the result.", committedFilePath)
	}
}
