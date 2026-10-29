package mcpserver_test

// Contract for the read tools that used to return everything they knew:
// list_mutations, list_installed_skills, validate_instance and
// validate_with_plan. On an instance of the pilot's shape each stays within its
// budget, says when it left something out, and keeps what a programmatic
// consumer relies on whole.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

// called is a tool response seen the way both kinds of client see it.
type called struct {
	text       string
	structured map[string]any
}

func callBoth(t *testing.T, c *mcpClient, id int, tool string, args map[string]any) called {
	t.Helper()
	argsJSON, _ := json.Marshal(args)
	body := fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":%q,"arguments":%s}}`, id, tool, argsJSON)
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s: %v", tool, err)
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(resp.Body)
	var env struct {
		Result struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
			IsError    bool           `json:"isError"`
			Structured map[string]any `json:"structuredContent"`
		} `json:"result"`
	}
	if err := json.Unmarshal(jsonRPCPayload(raw), &env); err != nil {
		t.Fatalf("%s: parse: %v", tool, err)
	}
	if env.Result.IsError {
		t.Fatalf("%s returned an error: %s", tool, raw)
	}
	var sb strings.Builder
	for _, p := range env.Result.Content {
		sb.WriteString(p.Text)
	}
	return called{text: sb.String(), structured: env.Result.Structured}
}

// skillCatalog decodes the skills of a list_installed_skills response, which
// wraps them with a total and a truncated flag.
type skillCatalog []map[string]any

func (s *skillCatalog) UnmarshalJSON(b []byte) error {
	var env struct {
		Skills []map[string]any `json:"skills"`
	}
	if err := json.Unmarshal(b, &env); err != nil {
		return err
	}
	*s = env.Skills
	return nil
}

func (c called) findingCount(t *testing.T) (listed, counted int) {
	t.Helper()
	findings, _ := c.structured["findings"].([]any)
	counts, _ := c.structured["counts"].(map[string]any)
	for _, k := range []string{"error", "warning", "info"} {
		n, _ := counts[k].(float64)
		counted += int(n)
	}
	return len(findings), counted
}

// manyInvalidFeatures adds features that do not satisfy the schema, as a
// backlog of unfinished feature definitions would.
func manyInvalidFeatures(payloads map[string]any, n int) {
	for i := 0; i < n; i++ {
		payloads[fmt.Sprintf("fd-%03d", i)] = map[string]any{"id": fmt.Sprintf("fd-%03d", i), "name": prose(i, 40)}
	}
}

func TestMCP_ValidationTools_StayWithinBudgetAndKeepEveryFinding(t *testing.T) {
	payloads, _, _ := pilotShapePayloads(t)
	manyInvalidFeatures(payloads, 150)
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "val-owner", payloads)
	c := newMCPClient(t, svc)
	c.activateAllTools()
	id := instID.String()
	limit := strategyread.DefaultMaxChars + envelope
	hard := strategyread.HardMaxChars + envelope

	for n, tool := range []string{"validate_instance", "validate_with_plan"} {
		def := callBoth(t, c, 700+n*10, tool, map[string]any{"instance_id": id})
		if len(def.text) > limit {
			t.Errorf("%s: %d characters of text, over the default budget %d", tool, len(def.text), limit)
		}
		listed, counted := def.findingCount(t)
		if listed == 0 || listed != counted {
			t.Errorf("%s: structuredContent lists %d findings but counts %d: a consumer that gates on findings must get all of them", tool, listed, counted)
		}
		var body map[string]any
		if err := json.Unmarshal([]byte(def.text), &body); err != nil {
			t.Fatalf("%s: text is not JSON: %v", tool, err)
		}
		if body["truncated"] != true {
			t.Errorf("%s: left detail out of the text without saying truncated", tool)
		}
		if !strings.Contains(def.text, "structuredContent") {
			t.Errorf("%s: the text does not say where the complete findings are", tool)
		}

		full := callBoth(t, c, 701+n*10, tool, map[string]any{"instance_id": id, "full": "true"})
		if len(full.text) > hard {
			t.Errorf("%s full=true: %d characters, over the hard limit %d", tool, len(full.text), hard)
		}
		if len(full.text) <= len(def.text) {
			t.Errorf("%s: full=true returned no more than the default", tool)
		}
		huge := callBoth(t, c, 702+n*10, tool, map[string]any{"instance_id": id, "max_chars": "999999999"})
		if len(huge.text) > hard {
			t.Errorf("%s max_chars=999999999: %d characters, over the hard limit %d", tool, len(huge.text), hard)
		}
	}
}

func TestMCP_ValidationTools_ASmallInstanceKeepsItsFullText(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "val-small", brPayloads(t))
	c := newMCPClient(t, svc)
	c.activateAllTools()

	got := callBoth(t, c, 750, "validate_instance", map[string]any{"instance_id": instID.String()})
	var body struct {
		Truncated     bool             `json:"truncated"`
		ArtifactCount int              `json:"artifact_count"`
		Results       []map[string]any `json:"results"`
	}
	if err := json.Unmarshal([]byte(got.text), &body); err != nil {
		t.Fatal(err)
	}
	if body.Truncated {
		t.Error("a response that fits was marked truncated")
	}
	if body.ArtifactCount == 0 || len(body.Results) != body.ArtifactCount {
		t.Errorf("results lists %d of %d artifacts: a response that fits must be what it was before", len(body.Results), body.ArtifactCount)
	}
}

func TestMCP_ListMutations_IsASummaryAndPagesThroughEverything(t *testing.T) {
	payloads, _, _ := pilotShapePayloads(t)
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "mut-owner", payloads)
	c := newMCPClient(t, svc)
	c.activateAllTools()
	id := instID.String()
	limit := strategyread.DefaultMaxChars + envelope
	hard := strategyread.HardMaxChars + envelope

	type page struct {
		Mutations  []map[string]any `json:"mutations"`
		NextCursor string           `json:"next_cursor"`
		Truncated  bool             `json:"truncated"`
	}
	walk := func(extra map[string]any, maxLen int) (seen map[string]int, pages int, withPayload int) {
		seen = map[string]int{}
		cursor := ""
		for pages = 0; pages < 400; {
			args := map[string]any{"instance_id": id, "limit": "200"}
			for k, v := range extra {
				args[k] = v
			}
			if cursor != "" {
				args["cursor"] = cursor
			}
			got := callBoth(t, c, 800+pages, "list_mutations", args)
			pages++
			if len(got.text) > maxLen {
				t.Fatalf("list_mutations page %d: %d characters, over %d", pages, len(got.text), maxLen)
			}
			var p page
			if err := json.Unmarshal([]byte(got.text), &p); err != nil {
				t.Fatal(err)
			}
			if len(p.Mutations) == 0 {
				t.Fatalf("page %d is empty: paging could not progress", pages)
			}
			for _, m := range p.Mutations {
				seen[fmt.Sprint(m["id"])]++
				if _, ok := m["payload"]; ok {
					withPayload++
				}
			}
			if p.NextCursor == "" {
				return seen, pages, withPayload
			}
			if !p.Truncated {
				t.Errorf("page %d has a next_cursor but does not say truncated", pages)
			}
			cursor = p.NextCursor
		}
		t.Fatal("paging did not finish")
		return
	}

	seen, pages, withPayload := walk(nil, limit)
	if withPayload != 0 {
		t.Errorf("%d mutations carried a payload by default: a history list is a summary", withPayload)
	}
	if len(seen) != len(payloads) {
		t.Errorf("paging returned %d distinct mutations, the instance has %d", len(seen), len(payloads))
	}
	for mid, n := range seen {
		if n != 1 {
			t.Errorf("mutation %s returned %d times", mid, n)
		}
	}
	if pages < 2 {
		t.Errorf("%d mutations came back in one page within the budget: the budget is not being applied", len(seen))
	}

	seenFull, _, withPayloadFull := walk(map[string]any{"full": "true"}, hard)
	if withPayloadFull == 0 {
		t.Error("full=true returned no payloads")
	}
	if len(seenFull) != len(payloads) {
		t.Errorf("full=true paging returned %d distinct mutations, the instance has %d", len(seenFull), len(payloads))
	}
}

func TestMCP_ListInstalledSkills_IsACatalogNotThePrompts(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "skill-owner", brPayloads(t))
	c := newMCPClient(t, svc)
	c.activateAllTools()
	limit := strategyread.DefaultMaxChars + envelope

	got := callBoth(t, c, 900, "list_installed_skills", map[string]any{"instance_id": instID.String()})
	if len(got.text) > limit {
		t.Fatalf("%d characters, over the default budget %d", len(got.text), limit)
	}
	var out struct {
		Skills    []map[string]any `json:"skills"`
		Total     int              `json:"total"`
		Truncated bool             `json:"truncated"`
	}
	if err := json.Unmarshal([]byte(got.text), &out); err != nil {
		t.Fatalf("not the catalog envelope: %v", err)
	}
	if len(out.Skills) == 0 || out.Total < len(out.Skills) {
		t.Fatalf("skills=%d total=%d", len(out.Skills), out.Total)
	}
	if out.Truncated != (len(out.Skills) < out.Total) {
		t.Errorf("truncated=%v with %d of %d skills shown", out.Truncated, len(out.Skills), out.Total)
	}
	for _, s := range out.Skills {
		for _, field := range []string{"skill_name", "source", "execution", "type"} {
			if s[field] == nil || s[field] == "" {
				t.Errorf("skill %v has no %s", s["skill_name"], field)
			}
		}
		for _, banned := range []string{"prompt_md", "skill_yaml", "script_src"} {
			if _, ok := s[banned]; ok {
				t.Errorf("skill %v carries %s: that is get_installed_skill's job", s["skill_name"], banned)
			}
		}
	}
	if !strings.Contains(got.text, "get_installed_skill") {
		t.Error("the catalog does not say how to read one skill in full")
	}
}
