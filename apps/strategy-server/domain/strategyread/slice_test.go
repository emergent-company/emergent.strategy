package strategyread_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

func decode(t *testing.T, s string) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		t.Fatalf("fixture: %v", err)
	}
	return v
}

const roadmapFixture = `{"roadmap":{"id":"roadmap-1","cycle":"2026-Q4",
 "tracks":{
  "commercial":{"track_objective":"Win first customers",
    "okrs":[
      {"id":"okr-c-001","objective":"Land three pilots","key_results":[
        {"id":"kr-c-001","description":"Three signed pilots","target":"3"},
        {"id":"kr-c-002","description":"Pilot NPS above 40","target":"40"}]},
      {"id":"okr-c-002","objective":"Prove pricing","key_results":[
        {"id":"kr-c-003","description":"Two paid conversions","target":"2"}]}]},
  "product":{"okrs":[]}},
 "execution_plan":{"summary":"Ship in order"}}}`

func TestParsePath(t *testing.T) {
	tests := []struct {
		in      string
		want    int
		wantErr bool
	}{
		{"mission.boundaries", 2, false},
		{"tracks.commercial.okrs[id=okr-c-001].key_results[0]", 4, false},
		{"vs_competitors[name=Foo Bar]", 1, false},
		{"a[2][0]", 1, false},
		{"", 0, false},
		{"a[", 0, true},
		{"a[id=]", 0, true},
		{"a..b", 0, true},
		{"a[-1]", 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			steps, err := strategyread.ParsePath(tt.in)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil && len(steps) != tt.want {
				t.Errorf("steps = %d, want %d: %+v", len(steps), tt.want, steps)
			}
		})
	}
}

func TestRead_RootWrapperIsTransparent(t *testing.T) {
	payload := decode(t, roadmapFixture)
	for _, path := range []string{"execution_plan", "roadmap.execution_plan"} {
		got, err := strategyread.Read("roadmap_recipe", payload, path, 0)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if !got.Defined || got.Truncated {
			t.Fatalf("%s: defined=%v truncated=%v", path, got.Defined, got.Truncated)
		}
		if !strings.Contains(mustJSON(t, got.Content), "Ship in order") {
			t.Errorf("%s: content = %s", path, mustJSON(t, got.Content))
		}
	}
}

func TestRead_ItemSelectors(t *testing.T) {
	payload := decode(t, roadmapFixture)
	tests := []struct {
		path string
		want string
	}{
		{"tracks.commercial.okrs[id=okr-c-001]", "Land three pilots"},
		{"tracks.commercial.okrs[1]", "Prove pricing"},
		{"tracks.commercial.okrs[id=okr-c-001].key_results[id=kr-c-002]", "Pilot NPS above 40"},
		{"tracks.commercial.okrs[name=prove pricing]", "okr-c-002"},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got, err := strategyread.Read("roadmap_recipe", payload, tt.path, 0)
			if err != nil {
				t.Fatal(err)
			}
			if !got.Defined {
				t.Fatalf("not defined: %+v", got)
			}
			if !strings.Contains(mustJSON(t, got.Content), tt.want) {
				t.Errorf("content = %s, want it to contain %q", mustJSON(t, got.Content), tt.want)
			}
		})
	}
}

func TestRead_UnknownPathListsNearestChildrenAndInventsNothing(t *testing.T) {
	payload := decode(t, roadmapFixture)
	got, err := strategyread.Read("roadmap_recipe", payload, "tracks.commercial.nonsense.deeper", 0)
	if err != nil {
		t.Fatal(err)
	}
	if got.Defined {
		t.Fatal("an unknown path must not be defined")
	}
	if got.Content != nil {
		t.Errorf("content must be empty, got %v", got.Content)
	}
	keys := childKeys(got.Children)
	if !contains(keys, "okrs") || !contains(keys, "track_objective") {
		t.Errorf("nearest children = %v, want the children of tracks.commercial", keys)
	}
	if got.Reason == "" {
		t.Error("an undefined result must say why")
	}
}

func TestRead_SelectorThatMatchesNothing(t *testing.T) {
	payload := decode(t, roadmapFixture)
	got, err := strategyread.Read("roadmap_recipe", payload, "tracks.commercial.okrs[id=okr-zzz]", 0)
	if err != nil {
		t.Fatal(err)
	}
	if got.Defined {
		t.Fatal("must not be defined")
	}
	if !strings.Contains(got.Reason, "okr-zzz") {
		t.Errorf("reason = %q, want it to name the selector", got.Reason)
	}
}

func TestRead_OverBudgetObjectReturnsChildrenWithSizes(t *testing.T) {
	big := strings.Repeat("x", 3000)
	payload := decode(t, `{"strategy":{"trade_offs":{"a":"`+big+`","b":"`+big+`","c":"short"}}}`)

	got, err := strategyread.Read("strategy_formula", payload, "trade_offs", 2000)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Truncated || got.Content != nil {
		t.Fatalf("truncated=%v content=%v, want truncated with no content", got.Truncated, got.Content)
	}
	if len(got.Children) != 3 {
		t.Fatalf("children = %d, want 3", len(got.Children))
	}
	sizes := map[string]int{}
	for _, c := range got.Children {
		sizes[c.Key] = c.SizeChars
		if c.Path != "trade_offs."+c.Key {
			t.Errorf("child path = %q", c.Path)
		}
	}
	if sizes["a"] < 3000 || sizes["c"] > 50 {
		t.Errorf("sizes = %v", sizes)
	}
	if got.SizeChars < 6000 {
		t.Errorf("size_chars = %d, want the whole section's size", got.SizeChars)
	}
}

func TestRead_OverBudgetArrayReturnsWholeItemsAndNextIndex(t *testing.T) {
	item := strings.Repeat("y", 400)
	payload := decode(t, `{"strategy":{"risks":[{"n":"`+item+`"},{"n":"`+item+`"},{"n":"`+item+`"},{"n":"`+item+`"},{"n":"`+item+`"}]}}`)

	got, err := strategyread.Read("strategy_formula", payload, "risks", 1000)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Truncated {
		t.Fatal("must be truncated")
	}
	items, ok := got.Content.([]any)
	if !ok {
		t.Fatalf("content = %T, want the items that fit", got.Content)
	}
	if len(items) != 2 {
		t.Errorf("returned %d items, want 2 whole items within 1000 chars", len(items))
	}
	if got.NextIndex == nil || *got.NextIndex != 2 {
		t.Errorf("next_index = %v, want 2", got.NextIndex)
	}
	if got.Remaining != 3 {
		t.Errorf("remaining = %d, want 3", got.Remaining)
	}
	for _, it := range items {
		if len(mustJSON(t, it)) < 400 {
			t.Error("an item was cut")
		}
	}
	if got.Defined != true {
		t.Error("a truncated read of a real section is still defined")
	}
}

func TestRead_ArrayContinuesFromAnIndex(t *testing.T) {
	payload := decode(t, `{"strategy":{"risks":[{"n":"a"},{"n":"b"},{"n":"c"}]}}`)
	got, err := strategyread.Read("strategy_formula", payload, "risks[1:]", 0)
	if err != nil {
		t.Fatal(err)
	}
	items, _ := got.Content.([]any)
	if len(items) != 2 || got.Truncated {
		t.Errorf("items = %d truncated = %v, want the last two items whole", len(items), got.Truncated)
	}
}

func TestRead_OversizeItemDescendsToItsChildren(t *testing.T) {
	big := strings.Repeat("z", 5000)
	payload := decode(t, `{"strategy":{"risks":[{"title":"Big risk","detail":"`+big+`","mitigation":"small"}]}}`)

	got, err := strategyread.Read("strategy_formula", payload, "risks", 1000)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Truncated || got.Content != nil {
		t.Fatalf("truncated=%v content=%v", got.Truncated, got.Content)
	}
	keys := childKeys(got.Children)
	if !contains(keys, "detail") || !contains(keys, "mitigation") {
		t.Errorf("children = %v, want the oversize item's fields", keys)
	}
	for _, c := range got.Children {
		if !strings.HasPrefix(c.Path, "risks[0].") {
			t.Errorf("child path = %q, want it addressed through the item", c.Path)
		}
	}
}

func TestRead_OversizeStringIsCutAndSaysSo(t *testing.T) {
	payload := decode(t, `{"strategy":{"narrative":"`+strings.Repeat("w", 5000)+`"}}`)
	got, err := strategyread.Read("strategy_formula", payload, "narrative", 1000)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Truncated {
		t.Fatal("a cut string must be flagged")
	}
	s, _ := got.Content.(string)
	if len([]rune(s)) != 1000 {
		t.Errorf("cut string has %d characters, want 1000", len([]rune(s)))
	}
	if got.SizeChars < 5000 {
		t.Errorf("size_chars = %d, want the full size", got.SizeChars)
	}
}

func TestRead_BudgetIsCapped(t *testing.T) {
	payload := decode(t, `{"strategy":{"x":"`+strings.Repeat("q", 60000)+`"}}`)
	got, err := strategyread.Read("strategy_formula", payload, "x", 1_000_000)
	if err != nil {
		t.Fatal(err)
	}
	if len([]rune(got.Content.(string))) != strategyread.HardMaxChars {
		t.Errorf("budget not capped at %d", strategyread.HardMaxChars)
	}
	if !got.BudgetCapped {
		t.Error("a capped budget must be reported")
	}
}

func TestRead_EmptyPathReadsTheWholeArtifactWithinBudget(t *testing.T) {
	payload := decode(t, roadmapFixture)
	got, err := strategyread.Read("roadmap_recipe", payload, "", 300)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Truncated || len(got.Children) == 0 {
		t.Errorf("a whole artifact over budget returns its sections, got truncated=%v children=%d", got.Truncated, len(got.Children))
	}
}

func TestOutline_ListsSectionsWithSizesAndGists(t *testing.T) {
	payload := decode(t, `{"north_star":{"organization":"Acme","vision":{"statement":"Fair widgets for all"},"values":[{"name":"Honest"},{"name":"Fair"}],"purpose":"Why we exist"}}`)
	out := strategyread.Outline("north_star", payload)

	byKey := map[string]strategyread.Child{}
	for _, c := range out {
		byKey[c.Key] = c
		if c.SizeChars <= 0 || c.Path != c.Key {
			t.Errorf("child %+v", c)
		}
	}
	if !strings.Contains(byKey["vision"].Gist, "Fair widgets") {
		t.Errorf("vision gist = %q", byKey["vision"].Gist)
	}
	if !strings.Contains(byKey["values"].Gist, "2 items") {
		t.Errorf("values gist = %q", byKey["values"].Gist)
	}
	if byKey["purpose"].Kind != "string" || byKey["values"].Kind != "array" || byKey["vision"].Kind != "object" {
		t.Errorf("kinds: %+v", byKey)
	}
}

func TestOutline_GistIsBounded(t *testing.T) {
	payload := decode(t, `{"strategy":{"title":"`+strings.Repeat("t", 500)+`","k":{"title":"`+strings.Repeat("u", 500)+`"}}}`)
	for _, c := range strategyread.Outline("strategy_formula", payload) {
		if len([]rune(c.Gist)) > 130 {
			t.Errorf("gist of %s has %d characters", c.Key, len([]rune(c.Gist)))
		}
	}
}

func TestRead_PayloadWithoutWrapperStillResolves(t *testing.T) {
	payload := decode(t, `{"target_users":[{"persona":"Farm manager","problems":["a"]}],"last_updated":"2026-01-01"}`)
	got, err := strategyread.Read("insight_analyses", payload, "target_users[name=farm manager]", 0)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Defined || !strings.Contains(mustJSON(t, got.Content), "Farm manager") {
		t.Errorf("persona not found through the name alias: %+v", got)
	}
}

func TestRead_KeysOutsideTheWrapperAreReachable(t *testing.T) {
	payload := decode(t, `{"change_log":[{"v":"1"}],"strategy_foundations":{"product_vision":"x"}}`)
	got, err := strategyread.Read("strategy_foundations", payload, "change_log", 0)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Defined {
		t.Error("top-level keys beside the wrapper must stay reachable")
	}
	got, err = strategyread.Read("strategy_foundations", payload, "product_vision", 0)
	if err != nil || !got.Defined {
		t.Errorf("wrapped key not reachable: %+v %v", got, err)
	}
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func childKeys(cs []strategyread.Child) []string {
	var out []string
	for _, c := range cs {
		out = append(out, c.Key)
	}
	return out
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func TestRead_UnknownLeafNameSuggestsWhereASectionOfThatNameExists(t *testing.T) {
	payload := decode(t, `{"strategy":{"competitive_moat":{"vs_competitors":[{"competitor":"A"}]},"business_model":{"growth_engines":[{"n":1}]},"other":{"growth_engines":"x"}}}`)

	got, err := strategyread.Read("strategy_formula", payload, "vs_competitors", 0)
	if err != nil {
		t.Fatal(err)
	}
	if got.Defined || got.Content != nil {
		t.Fatalf("a shorthand must not be silently resolved: %+v", got)
	}
	if len(got.Suggestions) != 1 || got.Suggestions[0] != "competitive_moat.vs_competitors" {
		t.Errorf("suggestions = %v, want the full path", got.Suggestions)
	}

	got, _ = strategyread.Read("strategy_formula", payload, "growth_engines", 0)
	if len(got.Suggestions) != 2 {
		t.Errorf("suggestions = %v, want both places the name exists", got.Suggestions)
	}

	got, _ = strategyread.Read("strategy_formula", payload, "business_model.nope", 0)
	if len(got.Suggestions) != 0 {
		t.Errorf("suggestions = %v for a name that exists nowhere", got.Suggestions)
	}
}

func TestRead_SuggestionsAreCapped(t *testing.T) {
	var sb strings.Builder
	sb.WriteString(`{"strategy":{`)
	for i := 0; i < 20; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		fmt.Fprintf(&sb, `"s%02d":{"dup":1}`, i)
	}
	sb.WriteString(`}}`)
	got, _ := strategyread.Read("strategy_formula", decode(t, sb.String()), "dup", 0)
	if len(got.Suggestions) != strategyread.MaxSuggestions {
		t.Errorf("suggestions = %d, want the cap of %d", len(got.Suggestions), strategyread.MaxSuggestions)
	}
}
