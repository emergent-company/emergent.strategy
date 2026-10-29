package mcpserver_test

// Contract: on an instance of the pilot's shape (authored artifacts totalling
// over 1 MB, plus the framework's definitions), no read tool returns more than
// its budget unless asked for more, nothing is cut without saying so, and
// asking for more never goes past the hard cap.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"gopkg.in/yaml.v3"
)

// envelope is the room a response may use beyond its content budget for labels,
// hints, the source block and the list of children.
const envelope = 6000

func prose(seed, n int) string {
	words := []string{"customer", "renewal", "traceability", "pilot", "contract", "verification", "seat", "field", "buyer", "record", "season", "cooperative"}
	var b strings.Builder
	x := seed*7919 + 13
	for b.Len() < n {
		x = (x*1103515245 + 12345) & 0x7fffffff
		b.WriteString(words[x%len(words)])
		b.WriteByte(' ')
	}
	return strings.TrimSpace(b.String())
}

func bulkItems(prefix string, count int, extra func(i int) map[string]any) []any {
	items := make([]any, 0, count)
	for i := 0; i < count; i++ {
		m := map[string]any{"id": fmt.Sprintf("%s-%03d", prefix, i), "text": prose(i+len(prefix), 600)}
		if extra != nil {
			for k, v := range extra(i) {
				m[k] = v
			}
		}
		items = append(items, m)
	}
	return items
}

// pilotShapePayloads returns six authored artifacts of about 250 KB each and
// every embedded canonical definition.
func pilotShapePayloads(t *testing.T) (payloads map[string]any, authoredBytes, definitions int) {
	t.Helper()
	payloads = map[string]any{
		"north_star": map[string]any{"north_star": map[string]any{
			"mission": map[string]any{"statement": "Trace what we sell " + prose(1, 200)},
			"beliefs": bulkItems("belief", 380, nil),
		}},
		"insight_analyses": map[string]any{
			"target_users": bulkItems("user", 190, func(i int) map[string]any { return map[string]any{"persona": fmt.Sprintf("Persona %d", i)} }),
			"competitive_landscape": map[string]any{
				"direct_competitors":   bulkItems("dc", 190, func(i int) map[string]any { return map[string]any{"name": fmt.Sprintf("Rival %d", i)} }),
				"indirect_competitors": bulkItems("ic", 20, func(i int) map[string]any { return map[string]any{"name": fmt.Sprintf("Other %d", i)} }),
			},
		},
		"strategy_foundations": map[string]any{"strategy_foundations": map[string]any{
			"value_proposition": map[string]any{"points": bulkItems("vp", 400, nil)},
		}},
		"insight_opportunity": map[string]any{"opportunity": map[string]any{
			"id": "op", "evidence": bulkItems("ev", 400, nil),
		}},
		"strategy_formula": map[string]any{"strategy": map[string]any{
			"id": "sf", "positioning": "Own the record " + prose(2, 300),
			"competitive_moat": map[string]any{"vs_competitors": bulkItems("vs", 400, func(i int) map[string]any {
				return map[string]any{"competitor": fmt.Sprintf("Rival %d", i)}
			})},
		}},
		"roadmap_recipe": map[string]any{"roadmap": map[string]any{
			"id": "rm", "cross_track_dependencies": bulkItems("dep", 30, nil),
			"tracks": map[string]any{
				"commercial": map[string]any{"okrs": []any{
					map[string]any{"id": "okr-c-001", "objective": "Land pilots", "key_results": bulkItems("kr-c", 380, nil)},
				}},
				"product": map[string]any{"okrs": []any{
					map[string]any{"id": "okr-p-001", "objective": "Ship", "key_results": bulkItems("kr-p", 10, nil)},
				}},
			},
		}},
	}
	for _, p := range payloads {
		raw, err := json.Marshal(p)
		if err != nil {
			t.Fatal(err)
		}
		authoredBytes += len(raw)
	}

	paths, err := embedded.ListTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range paths {
		if !strings.Contains(p, "definitions/") || !strings.HasSuffix(p, ".yaml") {
			continue
		}
		key := strings.TrimSuffix(path.Base(p), ".yaml")
		if _, dup := payloads[key]; dup {
			continue
		}
		doc, ok := definitionPayload(p)
		if !ok {
			continue
		}
		payloads[key] = doc
		definitions++
	}
	return payloads, authoredBytes, definitions
}

// bounded decodes the fields a read response uses to describe what it returned.
type bounded struct {
	SizeChars int  `json:"size_chars"`
	Truncated bool `json:"truncated"`
	MaxChars  int  `json:"max_chars"`
	Content   any  `json:"content"`
	Children  []any
	Parts     []struct {
		Name      string `json:"name"`
		SizeChars int    `json:"size_chars"`
		Truncated bool   `json:"truncated"`
		Content   any    `json:"content"`
	} `json:"parts"`
}

func TestMCP_ReadBudget_PilotShapeNeverOverrunsAndNeverCutsSilently(t *testing.T) {
	payloads, authoredBytes, definitions := pilotShapePayloads(t)
	if authoredBytes < 1_000_000 {
		t.Fatalf("fixture is %d bytes of authored content, want over 1 MB", authoredBytes)
	}
	if definitions < 100 {
		t.Fatalf("fixture seeded %d definitions, want the framework's whole set", definitions)
	}

	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "budget-owner", payloads)
	c := newMCPClient(t, svc)
	id := instID.String()
	defaultLimit := strategyread.DefaultMaxChars + envelope
	hardLimit := strategyread.HardMaxChars + envelope

	type call struct {
		tool  string
		args  map[string]any
		limit int
		// content is true when the response is a bounded slice whose size_chars
		// and truncated fields must agree with what it returned.
		content bool
	}
	calls := []call{
		{"get_strategy_context", map[string]any{}, defaultLimit, false},
		{"list_artifacts", map[string]any{}, defaultLimit, false},
		{"get_outline", map[string]any{}, defaultLimit, false},
		{"get_roadmap", map[string]any{}, defaultLimit, true},
		{"get_personas", map[string]any{}, defaultLimit, true},
		{"get_competitive_position", map[string]any{}, defaultLimit, false},
		{"get_product_vision", map[string]any{}, defaultLimit, false},
		{"get_view", map[string]any{"view": "personas"}, defaultLimit, false},
		{"get_view", map[string]any{"view": "objectives"}, defaultLimit, false},
		{"get_view", map[string]any{"view": "competitor", "name": "Rival 7"}, defaultLimit, false},
		{"get_view", map[string]any{"view": "key_result", "id": "kr-c-005"}, defaultLimit, false},
		// Asking for more is bounded by the hard cap.
		{"get_strategy_context", map[string]any{"full": "true"}, hardLimit, false},
		{"list_artifacts", map[string]any{"full": "true"}, hardLimit, false},
		{"get_roadmap", map[string]any{"full": "true"}, hardLimit, true},
		{"get_personas", map[string]any{"max_chars": "999999999"}, hardLimit, true},
	}
	for _, art := range []string{"north_star", "insight_analyses", "strategy_foundations", "insight_opportunity", "strategy_formula", "roadmap_recipe"} {
		calls = append(calls,
			call{"get_section", map[string]any{"artifact": art}, defaultLimit, true},
			call{"get_section", map[string]any{"artifact": art, "max_chars": "999999999"}, hardLimit, true},
		)
	}

	n := 0
	for _, cl := range calls {
		n++
		args := map[string]any{"instance_id": id}
		for k, v := range cl.args {
			args[k] = v
		}
		label := fmt.Sprintf("%s %v", cl.tool, cl.args)
		r := c.call(n, cl.tool, args)
		if r.isError {
			t.Errorf("%s returned an error: %s", label, firstChars(r.text, 160))
			continue
		}
		if len(r.text) > cl.limit {
			t.Errorf("%s returned %d characters, over its limit of %d", label, len(r.text), cl.limit)
		}
		if !cl.content {
			continue
		}
		var b bounded
		if err := json.Unmarshal([]byte(r.text), &b); err != nil {
			t.Errorf("%s: response is not the bounded envelope: %v", label, err)
			continue
		}
		if b.SizeChars > b.MaxChars && !b.Truncated {
			t.Errorf("%s: the section is %d characters, the budget %d, and truncated is false: a silent cut", label, b.SizeChars, b.MaxChars)
		}
		if b.MaxChars > strategyread.HardMaxChars {
			t.Errorf("%s: budget %d is over the hard cap %d", label, b.MaxChars, strategyread.HardMaxChars)
		}
		if b.Truncated && b.Content == nil && len(b.Children) == 0 && !strings.Contains(r.text, "next_index") {
			t.Errorf("%s: truncated, with no content, no children and no next_index to continue from", label)
		}
	}
	if n != len(calls) {
		t.Fatal("not every call was made")
	}
}

func firstChars(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// definitionPayload loads an embedded definition as the generic payload shape,
// turning YAML maps with non-string keys into string-keyed ones. It reports false
// for a file that is not a YAML mapping.
func definitionPayload(p string) (map[string]any, bool) {
	data, err := embedded.GetTemplate(p)
	if err != nil {
		return nil, false
	}
	var doc any
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, false
	}
	m, ok := stringKeyed(doc).(map[string]any)
	return m, ok
}

func stringKeyed(v any) any {
	switch val := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, x := range val {
			out[k] = stringKeyed(x)
		}
		return out
	case map[any]any:
		out := make(map[string]any, len(val))
		for k, x := range val {
			out[fmt.Sprint(k)] = stringKeyed(x)
		}
		return out
	case []any:
		out := make([]any, len(val))
		for i, x := range val {
			out[i] = stringKeyed(x)
		}
		return out
	}
	return v
}

// unboundedReadTools are read tools that, called with only an instance id on an
// instance of the pilot's shape, return more than the default budget. Each is a
// known gap or a deliberate full dump. The list is a ratchet: a new tool that
// overruns fails the test below, and so does a listed tool that has since been
// bounded, so the list only shrinks.
var unboundedReadTools = map[string]string{
	"export_instance_yaml":  "an export: the whole instance by design",
	"list_mutations":        "returns every mutation with its payload; needs a page size and no payloads by default",
	"list_installed_skills": "returns every installed skill with its prompt; not instance content",
	"validate_instance":     "returns every finding; grows with the number of findings",
	"validate_with_plan":    "returns every finding with its fix plan; grows with the number of findings",
}

func TestMCP_ReadTools_UnboundedOnesAreAcknowledged(t *testing.T) {
	payloads, _, _ := pilotShapePayloads(t)
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "ratchet-owner", payloads)
	limit := strategyread.DefaultMaxChars + envelope

	over := map[string]int{}
	n := 100
	for _, st := range mcpserver.NewMCPServerForIntrospection().ListTools() {
		name := st.Tool.Name
		req := st.Tool.InputSchema.Required
		onlyInstance := len(req) > 0
		for _, r := range req {
			if r != "instance_id" {
				onlyInstance = false
			}
		}
		if !onlyInstance || mcpserver.AccessFor(name) != mcpserver.AccessRead {
			continue
		}
		n++
		id := n
		t.Run(name, func(t *testing.T) {
			// A tool that cannot answer (Memory not configured, nothing to
			// list) returns a short result or an error; only size matters here.
			c := newMCPClient(t, svc)
			c.activateAllTools()
			size := responseSize(t, c, id, name, map[string]any{"instance_id": instID.String()})
			if size > limit {
				over[name] = size
			}
		})
	}

	for name, size := range over {
		if _, ok := unboundedReadTools[name]; !ok {
			t.Errorf("read tool %s returned %d characters for an instance id alone, over the default budget of %d: bound it, or add it to unboundedReadTools with a reason", name, size, limit)
		}
	}
	for name, reason := range unboundedReadTools {
		if _, ok := over[name]; !ok {
			t.Errorf("%s is listed as unbounded (%s) but now fits the default budget: remove it from unboundedReadTools", name, reason)
		}
	}
}

// responseSize returns the total characters of a tool's content, treating an
// empty response as size zero instead of a failure.
func responseSize(t *testing.T, c *mcpClient, id int, tool string, args map[string]any) int {
	t.Helper()
	argsJSON, _ := json.Marshal(args)
	body := fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":%q,"arguments":%s}}`, id, tool, argsJSON)
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("tool %s: %v", tool, err)
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(resp.Body)
	var env struct {
		Result struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
	}
	if err := json.Unmarshal(jsonRPCPayload(raw), &env); err != nil {
		t.Fatalf("tool %s: parse envelope: %v", tool, err)
	}
	total := 0
	for _, part := range env.Result.Content {
		total += len(part.Text)
	}
	return total
}
