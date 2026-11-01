package strategyread

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// SnippetMaxChars bounds the text a search hit carries.
const SnippetMaxChars = 240

// minPrefixLen is the shortest query term that matches by prefix.
const minPrefixLen = 4

// snippetLead is how many characters of context precede the match.
const snippetLead = 80

// gistBonus is added to a hit whose match is in a field that names the section.
const gistBonus = 0.25

// Hit is the smallest object of an artifact whose own text contains a match.
type Hit struct {
	// Path addresses the object and is accepted by Read.
	Path string `json:"path"`
	// Field is the field the snippet comes from.
	Field   string  `json:"field"`
	Score   float64 `json:"score"`
	Snippet string  `json:"snippet"`
	// SizeChars is the size of the object, as Read reports it.
	SizeChars int `json:"size_chars"`
	// MatchedTerms and MissingTerms split the query's terms by whether the object
	// contains them. The score alone cannot tell a hit that has every distinctive
	// word from one that has only the common ones.
	MatchedTerms []string `json:"matched_terms,omitempty"`
	MissingTerms []string `json:"missing_terms,omitempty"`
}

var stopWords = map[string]bool{
	// English
	"a": true, "an": true, "and": true, "are": true, "as": true, "at": true, "be": true,
	"by": true, "do": true, "does": true, "for": true, "from": true, "how": true,
	"in": true, "is": true, "it": true, "of": true, "on": true, "or": true,
	"that": true, "the": true, "this": true, "to": true, "was": true, "we": true,
	"what": true, "when": true, "where": true, "which": true, "who": true, "why": true,
	"with": true, "our": true, "us": true, "has": true, "have": true,
	// Norwegian
	"og": true, "i": true, "er": true, "det": true, "en": true, "et": true,
	"til": true, "av": true, "på": true, "med": true, "som": true, "de": true,
	"den": true, "om": true, "vi": true, "har": true, "hva": true, "hvem": true,
	"hvor": true, "når": true, "hvordan": true, "hvorfor": true, "vår": true,
	"vårt": true, "våre": true, "ikke": true, "å": true,
}

type token struct {
	text  string
	start int // offset in runes in the source string
}

// fold lowercases r and strips its diacritics: Å becomes a, Æ stays æ.
func fold(r rune, out *strings.Builder) {
	r = unicode.ToLower(r)
	if r < utf8.RuneSelf {
		out.WriteRune(r)
		return
	}
	for _, d := range norm.NFD.String(string(r)) {
		if !unicode.Is(unicode.Mn, d) {
			out.WriteRune(d)
		}
	}
}

func tokenize(s string) []token {
	var out []token
	var cur strings.Builder
	start, pos := 0, 0
	flush := func() {
		if cur.Len() > 0 {
			out = append(out, token{text: cur.String(), start: start})
			cur.Reset()
		}
	}
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if cur.Len() == 0 {
				start = pos
			}
			fold(r, &cur)
		case unicode.IsMark(r) && cur.Len() > 0:
		default:
			flush()
		}
		pos++
	}
	flush()
	return out
}

// Tokens splits text into lowercase tokens of letters and digits with
// diacritics removed: "2027-05-31" gives 2027, 05 and 31.
func Tokens(s string) []string {
	toks := tokenize(s)
	if len(toks) == 0 {
		return nil
	}
	out := make([]string, len(toks))
	for i, t := range toks {
		out[i] = t.text
	}
	return out
}

// QueryTerms returns the distinct, usable terms of a query, in order. Terms of
// one character and stop words are dropped.
func QueryTerms(q string) []string {
	var out []string
	seen := map[string]bool{}
	for _, t := range Tokens(q) {
		if utf8.RuneCountInString(t) < 2 || stopWords[t] || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

func termMatches(term, tok string) bool {
	if tok == term {
		return true
	}
	return utf8.RuneCountInString(term) >= minPrefixLen && strings.HasPrefix(tok, term)
}

// matchedTerms returns the indexes of the terms that some token matches, and
// the offset of the first matching token, or -1.
func matchedTerms(toks []token, terms []string) (matched []int, firstStart int) {
	firstStart = -1
	for i, term := range terms {
		for _, tk := range toks {
			if termMatches(term, tk.text) {
				matched = append(matched, i)
				if firstStart < 0 || tk.start < firstStart {
					firstStart = tk.start
				}
				break
			}
		}
	}
	return matched, firstStart
}

type textField struct {
	key  string
	text string
}

func ownText(m map[string]any) []textField {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var out []textField
	for _, k := range keys {
		switch v := m[k].(type) {
		case string:
			out = append(out, textField{k, v})
		case float64:
			out = append(out, textField{k, strconv.FormatFloat(v, 'f', -1, 64)})
		case []any:
			var parts []string
			for _, it := range v {
				switch s := it.(type) {
				case string:
					parts = append(parts, s)
				case float64:
					parts = append(parts, strconv.FormatFloat(s, 'f', -1, 64))
				}
			}
			if len(parts) > 0 {
				out = append(out, textField{k, strings.Join(parts, " ; ")})
			}
		}
	}
	return out
}

var bonusFields = func() map[string]bool {
	m := map[string]bool{}
	for _, f := range gistFields {
		if f != "id" {
			m[f] = true
		}
	}
	return m
}()

var plainID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

// itemIDs returns, for the items of an array that have a plain id no other item
// shares, that id. Other items are addressed by position.
func itemIDs(items []any) map[int]string {
	counts := map[string]int{}
	ids := map[int]string{}
	for i, it := range items {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		id, ok := m["id"].(string)
		if !ok || !plainID.MatchString(id) {
			continue
		}
		ids[i] = id
		counts[strings.ToLower(id)]++
	}
	for i, id := range ids {
		if counts[strings.ToLower(id)] != 1 {
			delete(ids, i)
		}
	}
	return ids
}

func snippetAround(text string, start int) string {
	rs := []rune(text)
	if len(rs) <= SnippetMaxChars {
		return strings.Join(strings.Fields(text), " ")
	}
	from := start - snippetLead
	if from < 0 {
		from = 0
	}
	to := from + SnippetMaxChars
	if to > len(rs) {
		to = len(rs)
		from = to - SnippetMaxChars
	}
	s := strings.Join(strings.Fields(string(rs[from:to])), " ")
	if from > 0 {
		s = "…" + s
	}
	if to < len(rs) {
		s += "…"
	}
	return s
}

func matchObject(m map[string]any, path string, terms []string) (Hit, bool) {
	union := map[int]bool{}
	bonus := false
	best := -1
	var bestField textField
	bestStart := 0
	for _, f := range ownText(m) {
		matched, first := matchedTerms(tokenize(f.text), terms)
		if len(matched) == 0 {
			continue
		}
		for _, i := range matched {
			union[i] = true
		}
		if bonusFields[f.key] {
			bonus = true
		}
		if len(matched) > best || (len(matched) == best && bonusFields[f.key] && !bonusFields[bestField.key]) {
			best, bestField, bestStart = len(matched), f, first
		}
	}
	if len(union) == 0 {
		return Hit{}, false
	}
	score := float64(len(union)) / float64(len(terms))
	if bonus {
		score += gistBonus
	}
	var matched, missing []string
	for i, term := range terms {
		if union[i] {
			matched = append(matched, term)
		} else {
			missing = append(missing, term)
		}
	}
	return Hit{
		Path:         path,
		Field:        bestField.key,
		Score:        score,
		Snippet:      snippetAround(bestField.text, bestStart),
		SizeChars:    sizeOf(m),
		MatchedTerms: matched,
		MissingTerms: missing,
	}, true
}

func walkSearch(v any, path string, terms []string, out *[]Hit) {
	switch val := v.(type) {
	case map[string]any:
		if h, ok := matchObject(val, path, terms); ok {
			*out = append(*out, h)
		}
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			switch val[k].(type) {
			case map[string]any, []any:
				p := k
				if path != "" {
					p = path + "." + k
				}
				walkSearch(val[k], p, terms, out)
			}
		}
	case []any:
		ids := itemIDs(val)
		for i, it := range val {
			p := fmt.Sprintf("%s[%d]", path, i)
			if id, ok := ids[i]; ok {
				p = fmt.Sprintf("%s[id=%s]", path, id)
			}
			walkSearch(it, p, terms, out)
		}
	}
}

// Search finds the smallest objects of an artifact whose own text contains any
// term of the query, best first: by the share of distinct terms, with a bonus
// when the match is in a field that names the object, then smaller objects, then
// path. Field names are not searched, only content. An empty or all-stop-word
// query returns nothing.
func Search(artifactType string, payload any, query string) []Hit {
	terms := QueryTerms(query)
	if len(terms) == 0 {
		return nil
	}
	var hits []Hit
	walkSearch(view(artifactType, payload), "", terms, &hits)
	sort.SliceStable(hits, func(i, j int) bool {
		a, b := hits[i], hits[j]
		if a.Score != b.Score {
			return a.Score > b.Score
		}
		if a.SizeChars != b.SizeChars {
			return a.SizeChars < b.SizeChars
		}
		return a.Path < b.Path
	})
	return hits
}
