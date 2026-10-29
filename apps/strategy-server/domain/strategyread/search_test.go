package strategyread_test

import (
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

func TestTokens(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"2027-05-31", []string{"2027", "05", "31"}},
		{"Kvalitetssikring", []string{"kvalitetssikring"}},
		{"Ålesund and Æble", []string{"alesund", "and", "æble"}},
		{"kr-c-005: not-to-exceed (EUR 300k)", []string{"kr", "c", "005", "not", "to", "exceed", "eur", "300k"}},
		{"", nil},
		{"  ... ", nil},
	}
	for _, c := range cases {
		if got := strategyread.Tokens(c.in); !reflect.DeepEqual(got, c.want) {
			t.Errorf("Tokens(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestQueryTerms(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"Cargill 2027 dates", []string{"cargill", "2027", "dates"}},
		{"what is the", nil},
		{"hva er det", nil},
		{"a b c", nil},
		{"Cargill cargill CARGILL", []string{"cargill"}},
		{"kr-c-005", []string{"kr", "005"}},
	}
	for _, c := range cases {
		if got := strategyread.QueryTerms(c.in); !reflect.DeepEqual(got, c.want) {
			t.Errorf("QueryTerms(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func paths(hits []strategyread.Hit) []string {
	out := make([]string, len(hits))
	for i, h := range hits {
		out[i] = h.Path
	}
	return out
}

func TestSearch_FindsTheSmallestObjectWithTheMatch(t *testing.T) {
	payload := decode(t, roadmapFixture)
	hits := strategyread.Search("roadmap_recipe", payload, "paid conversions")
	if len(hits) == 0 {
		t.Fatal("no hits")
	}
	want := "tracks.commercial.okrs[id=okr-c-002].key_results[id=kr-c-003]"
	if hits[0].Path != want {
		t.Fatalf("best hit = %q, want %q (all: %v)", hits[0].Path, want, paths(hits))
	}
	if hits[0].Field != "description" {
		t.Errorf("field = %q", hits[0].Field)
	}
	for _, h := range hits {
		if h.Path == "" || h.Path == "tracks" || h.Path == "tracks.commercial" {
			t.Errorf("a hit names a whole section, not the smallest object: %q", h.Path)
		}
	}
}

func TestSearch_EveryHitPathResolves(t *testing.T) {
	payload := decode(t, roadmapFixture)
	for _, q := range []string{"pilots", "pricing", "NPS", "two paid", "target 40", "okr-c-001"} {
		for _, h := range strategyread.Search("roadmap_recipe", payload, q) {
			s, err := strategyread.Read("roadmap_recipe", payload, h.Path, 0)
			if err != nil || !s.Defined {
				t.Errorf("query %q: hit path %q does not read: err=%v defined=%v", q, h.Path, err, s.Defined)
			}
			if h.SizeChars != s.SizeChars {
				t.Errorf("query %q path %q: size %d, section is %d", q, h.Path, h.SizeChars, s.SizeChars)
			}
		}
	}
}

func TestSearch_AYearFindsADate(t *testing.T) {
	payload := decode(t, `{"roadmap":{"key_results":[
		{"id":"kr-1","description":"Seat commitment ends","target":"2027-05-31"},
		{"id":"kr-2","description":"Unrelated","target":"2026-01-01"}]}}`)
	hits := strategyread.Search("roadmap_recipe", payload, "2027")
	if len(hits) != 1 || hits[0].Path != "key_results[id=kr-1]" {
		t.Fatalf("hits = %v", paths(hits))
	}
}

func TestSearch_NumbersInJSONAreMatched(t *testing.T) {
	payload := decode(t, `{"roadmap":{"milestones":[{"id":"m1","year":2027,"title":"Renewal"}]}}`)
	if hits := strategyread.Search("roadmap_recipe", payload, "2027"); len(hits) != 1 {
		t.Fatalf("hits = %v", paths(hits))
	}
}

func TestSearch_ArrayOfStringsBelongsToItsOwner(t *testing.T) {
	payload := decode(t, `{"north_star":{"mission":{"boundaries":["we never sell data","we do not build a CRM"],"statement":"Trace it"}}}`)
	hits := strategyread.Search("north_star", payload, "CRM")
	if len(hits) != 1 || hits[0].Path != "mission" {
		t.Fatalf("hits = %v", paths(hits))
	}
	if hits[0].Field != "boundaries" || !strings.Contains(hits[0].Snippet, "CRM") {
		t.Errorf("hit = %+v", hits[0])
	}
}

func TestSearch_DuplicateOrUnusableIDsFallBackToAnIndex(t *testing.T) {
	payload := decode(t, `{"roadmap":{"items":[
		{"id":"dup","text":"alpha zebra"},
		{"id":"dup","text":"beta zebra"},
		{"id":"has.dot","text":"gamma zebra"},
		{"id":"Ok-1","text":"delta zebra"}]}}`)
	got := paths(strategyread.Search("roadmap_recipe", payload, "zebra"))
	want := map[string]bool{"items[0]": true, "items[1]": true, "items[2]": true, "items[id=Ok-1]": true}
	if len(got) != 4 {
		t.Fatalf("hits = %v", got)
	}
	for _, p := range got {
		if !want[p] {
			t.Errorf("unexpected path %q in %v", p, got)
		}
	}
	for _, h := range strategyread.Search("roadmap_recipe", payload, "zebra") {
		if s, err := strategyread.Read("roadmap_recipe", payload, h.Path, 0); err != nil || !s.Defined {
			t.Errorf("path %q does not read", h.Path)
		}
	}
}

func TestSearch_RanksByShareOfTermsThenByGistThenSize(t *testing.T) {
	payload := decode(t, `{"roadmap":{"items":[
		{"id":"a","text":"Acme renewal in 2027 with a long tail of other words that make this unit big"},
		{"id":"b","text":"Acme only"},
		{"id":"c","text":"renewal 2027 Acme"}]}}`)
	hits := strategyread.Search("roadmap_recipe", payload, "acme renewal 2027")
	got := paths(hits)
	want := []string{"items[id=c]", "items[id=a]", "items[id=b]"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
	if hits[0].Score <= hits[2].Score {
		t.Errorf("scores not decreasing: %v %v", hits[0].Score, hits[2].Score)
	}
}

func TestSearch_AMatchInAGistFieldOutranksOneInOtherText(t *testing.T) {
	payload := decode(t, `{"roadmap":{"items":[
		{"id":"a","notes":"pricing"},
		{"id":"b","title":"pricing"}]}}`)
	got := paths(strategyread.Search("roadmap_recipe", payload, "pricing"))
	if len(got) != 2 || got[0] != "items[id=b]" {
		t.Fatalf("order = %v", got)
	}
}

func TestSearch_PrefixMatchNeedsFourCharacters(t *testing.T) {
	payload := decode(t, `{"roadmap":{"items":[
		{"id":"a","text":"kvalitetssikring av feltapp"},
		{"id":"b","text":"date of renewal"}]}}`)
	if got := paths(strategyread.Search("roadmap_recipe", payload, "kvalitet")); len(got) != 1 || got[0] != "items[id=a]" {
		t.Errorf("kvalitet: %v", got)
	}
	if got := strategyread.Search("roadmap_recipe", payload, "dat"); len(got) != 0 {
		t.Errorf("a three-character term must not match by prefix: %v", paths(got))
	}
	if got := strategyread.Search("roadmap_recipe", payload, "dates"); len(got) != 0 {
		t.Errorf("there is no stemming, dates must not find date: %v", paths(got))
	}
	if got := paths(strategyread.Search("roadmap_recipe", payload, "date")); len(got) != 1 {
		t.Errorf("date: %v", got)
	}
}

func TestSearch_IgnoresCaseAndDiacritics(t *testing.T) {
	payload := decode(t, `{"roadmap":{"items":[{"id":"a","text":"Kontor i Ålesund"}]}}`)
	for _, q := range []string{"alesund", "ÅLESUND", "Ålesund"} {
		if got := strategyread.Search("roadmap_recipe", payload, q); len(got) != 1 {
			t.Errorf("%q: %v", q, paths(got))
		}
	}
}

func TestSearch_SnippetIsBoundedAndContainsTheMatch(t *testing.T) {
	long := strings.Repeat("filler words go here. ", 60) + "The ceiling is named Zanzibar in this sentence. " + strings.Repeat("more filler. ", 60)
	payload := decode(t, `{"roadmap":{"items":[{"id":"a","text":`+quote(long)+`}]}}`)
	hits := strategyread.Search("roadmap_recipe", payload, "zanzibar")
	if len(hits) != 1 {
		t.Fatalf("hits = %v", paths(hits))
	}
	if n := utf8.RuneCountInString(hits[0].Snippet); n > 245 {
		t.Errorf("snippet is %d runes", n)
	}
	if !strings.Contains(hits[0].Snippet, "Zanzibar") {
		t.Errorf("snippet lost the match: %q", hits[0].Snippet)
	}
}

func TestSearch_NothingToFind(t *testing.T) {
	payload := decode(t, roadmapFixture)
	for _, q := range []string{"", "what is the", "zzzznotthere"} {
		if got := strategyread.Search("roadmap_recipe", payload, q); len(got) != 0 {
			t.Errorf("%q: %v", q, paths(got))
		}
	}
}

func TestSearch_DoesNotMatchKeysOnlyText(t *testing.T) {
	payload := decode(t, `{"roadmap":{"pilots":[{"id":"x","text":"three"}]}}`)
	if got := strategyread.Search("roadmap_recipe", payload, "pilots"); len(got) != 0 {
		t.Errorf("a field name is not content: %v", paths(got))
	}
}

func quote(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
}
