package mcpserver_test

import (
	"encoding/json"
	"strings"
	"testing"
)

const brFormula = `{"strategy":{"id":"sf-1","title":"Win with farmers","trade_offs":[{"decision":"Depth over breadth"}],
 "competitive_moat":{"vs_competitors":[{"competitor":"Koltiva","wedge":"Offline first"}]}}}`

const brRoadmap = `{"roadmap":{"id":"rm-1","tracks":{"commercial":{"okrs":[{"id":"okr-c-001","objective":"Land three pilots","key_results":[{"id":"kr-c-001","description":"Three signed pilots"}]}]}}}}`

func brPayloads(t *testing.T) map[string]any {
	t.Helper()
	parse := func(s string) any {
		var v any
		if err := json.Unmarshal([]byte(s), &v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	return map[string]any{
		"strategy_formula": parse(brFormula),
		"roadmap_recipe":   parse(brRoadmap),
	}
}

func TestMCP_BoundedReads_AreVisibleWithoutAFilterCall(t *testing.T) {
	c := newMCPClient(t, buildSvc(t))
	listed := map[string]bool{}
	for _, n := range c.listTools() {
		listed[n] = true
	}
	for _, want := range []string{"get_outline", "get_section", "get_view"} {
		if !listed[want] {
			t.Errorf("%s is not in the first tools/list of a fresh session", want)
		}
	}
}

func TestMCP_GetSection_ReturnsTheEnvelope(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "br-owner", brPayloads(t))
	c := newMCPClient(t, svc)

	var got struct {
		Defined   bool           `json:"defined"`
		Truncated *bool          `json:"truncated"`
		SizeChars int            `json:"size_chars"`
		CiteAs    string         `json:"cite_as"`
		Content   any            `json:"content"`
		Source    map[string]any `json:"source"`
		Labels    map[string]string
	}
	c.call(1, "get_section", map[string]any{
		"instance_id": instID.String(), "artifact": "strategy_formula", "path": "trade_offs",
	}).assertOK().decode(&got)

	if !got.Defined || got.Truncated == nil || *got.Truncated {
		t.Errorf("defined=%v truncated=%v", got.Defined, got.Truncated)
	}
	if got.SizeChars <= 0 || got.CiteAs != "Strategy formula › trade offs" {
		t.Errorf("size=%d cite_as=%q", got.SizeChars, got.CiteAs)
	}
	if got.Source["artifact_key"] != "strategy_formula" || got.Source["path"] != "trade_offs" {
		t.Errorf("source = %v", got.Source)
	}
	if !strings.Contains(mustMarshalAny(t, got.Content), "Depth over breadth") {
		t.Errorf("content = %v", got.Content)
	}
}

func TestMCP_GetSection_MalformedPathIsAReadableError(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "br-owner-2", brPayloads(t))
	c := newMCPClient(t, svc)

	r := c.call(1, "get_section", map[string]any{
		"instance_id": instID.String(), "artifact": "strategy_formula", "path": "a[",
	}).assertError()
	r.contains("invalid path")
}

func TestMCP_GetOutline_IsSmallAndHasNoContent(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "br-owner-3", brPayloads(t))
	c := newMCPClient(t, svc)

	r := c.call(1, "get_outline", map[string]any{"instance_id": instID.String()}).assertOK()
	r.contains("strategy_formula").contains("trade_offs").contains("not_defined")
	if strings.Contains(r.text, "Depth over breadth") {
		t.Error("the outline must not carry content")
	}
	if len(r.text) > 6000 {
		t.Errorf("outline is %d characters", len(r.text))
	}
}

func TestMCP_GetView_Competitor(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "br-owner-4", brPayloads(t))
	c := newMCPClient(t, svc)

	r := c.call(1, "get_view", map[string]any{
		"instance_id": instID.String(), "view": "competitor", "name": "Koltiva",
	}).assertOK()
	r.contains("Offline first").contains("positioning_vs_competitor").contains("landscape_entry")

	c.call(2, "get_view", map[string]any{"instance_id": instID.String(), "view": "bogus"}).
		assertError().contains("valid views")
}

func TestMCP_BoundedReads_RespectInstanceAccess(t *testing.T) {
	svc := buildSvc(t)
	_, foreign := seedInstanceWithoutDevMembership(t, svc, "br-foreign")
	c := newMCPClient(t, svc)
	for _, tool := range []string{"get_outline", "get_section", "get_view"} {
		c.call(1, tool, map[string]any{
			"instance_id": foreign.String(), "artifact": "north_star", "view": "personas",
		}).assertError()
	}
}

func mustMarshalAny(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
