package mcpserver_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity/integritytest"
)

const brFormula = `{"strategy":{"id":"sf-1","title":"Win with farmers","trade_offs":[{"decision":"Depth over breadth"}],
 "competitive_moat":{"vs_competitors":[{"competitor":"Rivalco","wedge":"Offline first"}]}}}`

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
		"instance_id": instID.String(), "view": "competitor", "name": "Rivalco",
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

func frameworkMixPayloads(t *testing.T) map[string]any {
	t.Helper()
	p := brPayloads(t)
	p["north_star"] = integritytest.Payload(t, "READY/00_north_star")
	p["sd-001"] = integritytest.Payload(t, "FIRE/definitions/strategy/")
	return p
}

func TestMCP_ExistingReads_ExcludeFrameworkContentByDefault(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "br-owner-5", frameworkMixPayloads(t))
	c := newMCPClient(t, svc)
	id := instID.String()

	var ctxOut struct {
		Artifacts        []map[string]any `json:"artifacts"`
		NotDefined       []map[string]any `json:"not_defined"`
		FrameworkContent map[string]int   `json:"framework_content"`
	}
	c.call(1, "get_strategy_context", map[string]any{"instance_id": id}).assertOK().decode(&ctxOut)
	for _, a := range ctxOut.Artifacts {
		if a["artifact"] == "north_star" {
			t.Error("an unmodified north star template is listed as the company's strategy")
		}
	}
	if ctxOut.FrameworkContent["canonical_reference"] != 1 || ctxOut.FrameworkContent["unmodified_template"] != 1 {
		t.Errorf("framework_content = %v, want one definition and one template counted", ctxOut.FrameworkContent)
	}

	var page struct {
		Artifacts         []map[string]any `json:"artifacts"`
		FrameworkExcluded int              `json:"framework_excluded"`
	}
	c.call(2, "list_artifacts", map[string]any{"instance_id": id}).assertOK().decode(&page)
	if page.FrameworkExcluded != 2 || len(page.Artifacts) != 2 {
		t.Errorf("list_artifacts: excluded=%d rows=%d, want 2 excluded and the 2 authored", page.FrameworkExcluded, len(page.Artifacts))
	}
	for _, a := range page.Artifacts {
		if _, has := a["payload"]; has {
			t.Errorf("%v: the default page must not carry payloads", a["artifact_key"])
		}
	}

	c.call(3, "list_artifacts", map[string]any{"instance_id": id, "include_framework": "true"}).
		assertOK().contains("canonical_reference").contains("unmodified_template")
}

func TestMCP_GetProductVision_OnATemplateIsNotDefined(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "br-owner-6", frameworkMixPayloads(t))
	c := newMCPClient(t, svc)

	var got struct {
		Defined   bool   `json:"defined"`
		Reason    string `json:"reason"`
		Integrity struct {
			Class string `json:"class"`
		} `json:"integrity"`
	}
	r := c.call(1, "get_product_vision", map[string]any{"instance_id": instID.String()}).assertOK().decode(&got)
	if got.Defined || got.Integrity.Class != "unmodified_template" || !strings.Contains(got.Reason, "framework content") {
		t.Errorf("got %+v", got)
	}
	if strings.Contains(r.text, "PLACEHOLDER") || strings.Contains(r.text, "Your Organization") {
		t.Error("template content leaked into the response")
	}
}

func TestMCP_GetRoadmap_IsBoundedAndFullRaisesTheCap(t *testing.T) {
	svc := buildSvc(t)
	big := strings.Repeat("r", 3000)
	var items []any
	for i := 0; i < 20; i++ {
		items = append(items, map[string]any{"id": "x", "text": big})
	}
	_, instID := seedInstance(t, svc, "br-owner-7", map[string]any{
		"roadmap_recipe": map[string]any{"roadmap": map[string]any{"id": "rm", "tracks": map[string]any{"a": items}, "notes": "small"}},
	})
	c := newMCPClient(t, svc)

	var def struct {
		Truncated bool `json:"truncated"`
		Children  []struct {
			Key string `json:"key"`
		} `json:"children"`
	}
	r := c.call(1, "get_roadmap", map[string]any{"instance_id": instID.String()}).assertOK().decode(&def)
	if !def.Truncated || len(def.Children) == 0 {
		t.Errorf("an over-budget roadmap must return its sections and say so: %+v", def)
	}
	if len(r.text) > 14000 {
		t.Errorf("default get_roadmap returned %d characters", len(r.text))
	}

	full := c.call(2, "get_roadmap", map[string]any{"instance_id": instID.String(), "full": "true"}).assertOK()
	if len(full.text) > 45000 {
		t.Errorf("full get_roadmap returned %d characters, over the cap", len(full.text))
	}
}

func TestMCP_GetPersonas_ReadsTheInsightsFile(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "br-owner-8", map[string]any{
		"insight_analyses": map[string]any{"target_users": []any{map[string]any{"persona": "Farm manager", "problems": []any{"paper"}}}},
		"strategy_foundations": map[string]any{"strategy_foundations": map[string]any{
			"product_vision": "not personas",
		}},
	})
	c := newMCPClient(t, svc)
	r := c.call(1, "get_personas", map[string]any{"instance_id": instID.String()}).assertOK()
	r.contains("Farm manager")
	if strings.Contains(r.text, "not personas") {
		t.Error("get_personas must not return the strategy foundations file")
	}
}
