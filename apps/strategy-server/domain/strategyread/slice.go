package strategyread

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"
)

// Response budgets, in characters of serialised JSON.
const (
	// DefaultMaxChars is the budget when the caller does not give one. It is
	// derived from the measured size of the sections questions need (1 to 21 KB),
	// not from a client limit.
	DefaultMaxChars = 12000
	// HardMaxChars is the largest budget a caller can obtain.
	HardMaxChars = 40000

	gistMaxChars = 120

	// MaxSuggestions caps the paths offered for an unknown section name.
	MaxSuggestions  = 5
	suggestMaxDepth = 8
)

// Child describes one section, one level down, so a caller can decide what to
// read next without reading it.
type Child struct {
	Key       string `json:"key"`
	Path      string `json:"path"`
	Kind      string `json:"kind"`
	SizeChars int    `json:"size_chars"`
	Gist      string `json:"gist,omitempty"`
}

// Slice is the result of reading a section.
type Slice struct {
	// Defined is false when the path does not exist; Reason says why and
	// Children lists the nearest valid sections. Nothing is invented.
	Defined bool   `json:"defined"`
	Reason  string `json:"reason,omitempty"`
	Path    string `json:"path"`
	// SizeChars is the size of the whole section, whatever was returned.
	SizeChars int `json:"size_chars"`
	// Truncated is true whenever Content is not the whole section.
	Truncated bool `json:"truncated"`
	// MaxChars is the budget that applied. BudgetCapped says the requested
	// budget exceeded HardMaxChars.
	MaxChars     int  `json:"max_chars"`
	BudgetCapped bool `json:"budget_capped,omitempty"`
	// Content is the section, or for an array the items that fit whole, or for
	// an over-budget string its first MaxChars characters. It is nil when only
	// Children are returned.
	Content any `json:"content,omitempty"`
	// Suggestions lists paths where a section named like the last part of an
	// unknown path does exist. Nothing is resolved for the caller: it must read
	// one of them.
	Suggestions []string `json:"suggestions,omitempty"`
	// Children lists the sections of an over-budget object (or of an oversize
	// array item) with sizes.
	Children []Child `json:"children,omitempty"`
	// NextIndex and Remaining continue a truncated array: read "<path>[N:]".
	NextIndex *int `json:"next_index,omitempty"`
	Remaining int  `json:"remaining,omitempty"`
}

// wrappers maps an artifact type to the root key its payload nests under.
var wrappers = map[string]string{
	"north_star":           "north_star",
	"strategy_formula":     "strategy",
	"roadmap_recipe":       "roadmap",
	"strategy_foundations": "strategy_foundations",
	"insight_opportunity":  "opportunity",
}

// Wrapper returns the root wrapper key of an artifact type, or "".
func Wrapper(artifactType string) string { return wrappers[artifactType] }

// view returns the addressable top level of an artifact: the wrapped content
// with any keys that sit beside the wrapper, so callers write
// "mission.boundaries" and still reach "change_log".
func view(artifactType string, payload any) any {
	w := Wrapper(artifactType)
	root, ok := payload.(map[string]any)
	if w == "" || !ok {
		return payload
	}
	inner, ok := root[w].(map[string]any)
	if !ok {
		return payload
	}
	merged := make(map[string]any, len(root)+len(inner))
	for k, v := range root {
		if k != w {
			merged[k] = v
		}
	}
	for k, v := range inner {
		merged[k] = v
	}
	return merged
}

// nameAliases are the fields a [name=...] selector matches, in order.
var nameAliases = []string{"name", "competitor", "persona", "title", "objective"}

func matchesField(item any, field, value string) bool {
	m, ok := item.(map[string]any)
	if !ok {
		return false
	}
	fields := []string{field}
	if field == "name" {
		fields = nameAliases
	}
	for _, f := range fields {
		if s, ok := m[f].(string); ok && strings.EqualFold(strings.TrimSpace(s), value) {
			return true
		}
	}
	return false
}

type resolution struct {
	value any
	found bool
	// reason, and the nearest valid node and its path, when not found.
	reason      string
	nearest     any
	nearestPath string
	// fromIndex is the array offset when the path ends in [n:].
	fromIndex int
	basePath  string
}

// walker follows a parsed path through a payload, remembering the deepest valid
// node so a failed lookup can offer its children.
type walker struct {
	cur       any
	trail     []string
	path      string
	fromIndex int
	basePath  string
}

// descend moves into an object key. It returns a reason when it cannot.
func (w *walker) descend(key string) string {
	m, ok := w.cur.(map[string]any)
	if !ok {
		return fmt.Sprintf("%q is not an object, so it has no key %q", displayPath(w.path), key)
	}
	next, ok := m[key]
	if !ok {
		return fmt.Sprintf("no section %q under %q", key, displayPath(w.path))
	}
	w.cur = next
	w.trail = append(w.trail, key)
	w.path = strings.Join(w.trail, ".")
	return ""
}

// apply narrows an array. last says the selector ends the whole path, which is
// the only place [n:] is allowed. It returns a reason when the selection fails.
func (w *walker) apply(sel Selector, last bool) (string, error) {
	arr, ok := w.cur.([]any)
	if !ok {
		return fmt.Sprintf("%q is not a list, so it cannot be selected from", displayPath(w.path)), nil
	}
	switch sel.Kind {
	case SelectIndex:
		if sel.Index >= len(arr) {
			return fmt.Sprintf("%q has %d items; there is no item %d", displayPath(w.path), len(arr), sel.Index), nil
		}
		w.cur = arr[sel.Index]
		w.path = fmt.Sprintf("%s[%d]", w.path, sel.Index)
		w.trail = []string{w.path}
	case SelectField:
		found := -1
		for idx, it := range arr {
			if matchesField(it, sel.Field, sel.Value) {
				found = idx
				break
			}
		}
		if found < 0 {
			return fmt.Sprintf("no item in %q with %s=%s", displayPath(w.path), sel.Field, sel.Value), nil
		}
		w.cur = arr[found]
		w.path = fmt.Sprintf("%s[%s=%s]", w.path, sel.Field, sel.Value)
		w.trail = []string{w.path}
	case SelectFrom:
		if !last {
			return "", fmt.Errorf("[n:] must be the last part of the path")
		}
		if sel.Index > len(arr) {
			return fmt.Sprintf("%q has %d items; cannot continue from %d", displayPath(w.path), len(arr), sel.Index), nil
		}
		w.fromIndex = sel.Index
		w.basePath = w.path
		w.cur = arr[sel.Index:]
	}
	return "", nil
}

// unwrapExplicit lets a caller name the root wrapper ("roadmap.tracks"): when
// the first step is the wrapper key and the merged view does not shadow it, the
// walk starts inside the wrapper.
func unwrapExplicit(artifactType string, payload any, steps []Step) (any, []Step) {
	w := Wrapper(artifactType)
	root, isMap := payload.(map[string]any)
	if w == "" || len(steps) == 0 || steps[0].Key != w || !isMap {
		return view(artifactType, payload), steps
	}
	if merged, ok := view(artifactType, payload).(map[string]any); ok {
		if _, shadowed := merged[w]; shadowed {
			return merged, steps
		}
	}
	inner, ok := root[w]
	if !ok {
		return view(artifactType, payload), steps
	}
	rest := append([]Step(nil), steps...)
	rest[0].Key = ""
	if len(rest[0].Selectors) == 0 {
		rest = rest[1:]
	}
	return inner, rest
}

func resolve(artifactType string, payload any, path string) (resolution, error) {
	steps, err := ParsePath(path)
	if err != nil {
		return resolution{}, err
	}
	start, steps := unwrapExplicit(artifactType, payload, steps)
	w := &walker{cur: start}

	for si, st := range steps {
		if st.Key != "" {
			if reason := w.descend(st.Key); reason != "" {
				return failed(w, reason), nil
			}
		}
		for i, sel := range st.Selectors {
			last := i == len(st.Selectors)-1 && si == len(steps)-1
			reason, err := w.apply(sel, last)
			if err != nil {
				return resolution{}, fmt.Errorf("path %q: %w", path, err)
			}
			if reason != "" {
				return failed(w, reason), nil
			}
		}
	}
	base := w.basePath
	if base == "" {
		base = w.path
	}
	return resolution{value: w.cur, found: true, fromIndex: w.fromIndex, basePath: base}, nil
}

func failed(w *walker, reason string) resolution {
	return resolution{reason: reason, nearest: w.cur, nearestPath: w.path}
}

func displayPath(p string) string {
	if p == "" {
		return "the artifact"
	}
	return p
}

// Read resolves a path in an artifact payload and returns it within a budget.
// maxChars of zero or less means DefaultMaxChars; values above HardMaxChars are
// capped and reported. The error is only for a malformed path; a path that does
// not exist returns a Slice with Defined false.
func Read(artifactType string, payload any, path string, maxChars int) (Slice, error) {
	budget, capped := NormaliseBudget(maxChars)
	out := Slice{Path: strings.TrimSpace(path), MaxChars: budget, BudgetCapped: capped}

	res, err := resolve(artifactType, payload, path)
	if err != nil {
		return Slice{}, err
	}
	if !res.found {
		out.Reason = res.reason
		out.Children = childrenOf(res.nearest, res.nearestPath, 0)
		out.Suggestions = suggestPaths(artifactType, payload, path)
		return out, nil
	}
	out.Defined = true
	out.SizeChars = sizeOf(res.value)

	if out.SizeChars <= budget {
		out.Content = res.value
		return out, nil
	}
	out.Truncated = true

	switch v := res.value.(type) {
	case map[string]any:
		out.Children = childrenOf(v, res.basePath, 0)
	case []any:
		fillArray(&out, v, res)
	case string:
		out.Content = firstRunes(v, budget)
	default:
		out.Content = v
		out.Truncated = false
	}
	return out, nil
}

func fillArray(out *Slice, items []any, res resolution) {
	used := 2
	n := 0
	for _, it := range items {
		sz := sizeOf(it) + 1
		if used+sz > out.MaxChars {
			break
		}
		used += sz
		n++
	}
	if n == 0 {
		switch first := items[0].(type) {
		case map[string]any:
			out.Children = childrenOf(first, fmt.Sprintf("%s[%d]", res.basePath, res.fromIndex), 0)
		case string:
			out.Content = firstRunes(first, out.MaxChars)
		default:
			out.Content = items[0]
		}
		next := res.fromIndex + 1
		if next < res.fromIndex+len(items) {
			out.NextIndex = &next
			out.Remaining = len(items) - 1
		}
		return
	}
	out.Content = items[:n]
	if n < len(items) {
		next := res.fromIndex + n
		out.NextIndex = &next
		out.Remaining = len(items) - n
	} else {
		out.Truncated = false
	}
}

// Outline lists the top-level sections of an artifact with sizes and gists.
func Outline(artifactType string, payload any) []Child {
	return childrenOf(view(artifactType, payload), "", 0)
}

// OutlineAt lists the sections one level below a path.
func OutlineAt(artifactType string, payload any, path string) ([]Child, error) {
	res, err := resolve(artifactType, payload, path)
	if err != nil {
		return nil, err
	}
	if !res.found {
		return childrenOf(res.nearest, res.nearestPath, 0), nil
	}
	return childrenOf(res.value, res.basePath, res.fromIndex), nil
}

func childrenOf(v any, basePath string, offset int) []Child {
	switch val := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := make([]Child, 0, len(keys))
		for _, k := range keys {
			p := k
			if basePath != "" {
				p = basePath + "." + k
			}
			out = append(out, newChild(k, p, val[k]))
		}
		return out
	case []any:
		out := make([]Child, 0, len(val))
		for i, it := range val {
			idx := offset + i
			out = append(out, newChild(fmt.Sprintf("[%d]", idx), fmt.Sprintf("%s[%d]", basePath, idx), it))
		}
		return out
	}
	return nil
}

func newChild(key, path string, v any) Child {
	return Child{Key: key, Path: path, Kind: kindOf(v), SizeChars: sizeOf(v), Gist: gistOf(v)}
}

func kindOf(v any) string {
	switch v.(type) {
	case map[string]any:
		return "object"
	case []any:
		return "array"
	case string:
		return "string"
	case float64, json.Number, int, int64:
		return "number"
	case bool:
		return "boolean"
	case nil:
		return "null"
	}
	return "other"
}

var gistFields = []string{"title", "name", "statement", "description", "text", "objective", "persona", "competitor", "summary", "id"}

func gistOf(v any) string {
	switch val := v.(type) {
	case string:
		return clip(val)
	case map[string]any:
		for _, f := range gistFields {
			if s, ok := val[f].(string); ok && strings.TrimSpace(s) != "" {
				return clip(s)
			}
		}
		for _, inner := range val {
			if m, ok := inner.(map[string]any); ok {
				if s, ok := m["statement"].(string); ok && strings.TrimSpace(s) != "" {
					return clip(s)
				}
			}
		}
	case []any:
		g := fmt.Sprintf("%d items", len(val))
		if len(val) > 0 {
			if first := gistOf(val[0]); first != "" {
				g += "; first: " + first
			}
		}
		return clip(g)
	}
	return ""
}

func clip(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) <= gistMaxChars {
		return s
	}
	return firstRunes(s, gistMaxChars) + "…"
}

func firstRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// NormaliseBudget applies the default and the hard cap to a requested budget.
func NormaliseBudget(requested int) (budget int, capped bool) {
	switch {
	case requested <= 0:
		return DefaultMaxChars, false
	case requested > HardMaxChars:
		return HardMaxChars, true
	}
	return requested, false
}

// sizeOf is the number of characters of v serialised as JSON, without HTML
// escaping so that "<" counts as one character.
func sizeOf(v any) int {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return 0
	}
	return utf8.RuneCount(bytes.TrimRight(buf.Bytes(), "\n"))
}

// suggestPaths finds where a section named like the last key of path exists
// anywhere in the artifact. Callers often know a section by its leaf name
// ("vs_competitors") and not by its parent ("competitive_moat").
func suggestPaths(artifactType string, payload any, path string) []string {
	steps, err := ParsePath(path)
	if err != nil || len(steps) == 0 {
		return nil
	}
	leaf := ""
	for i := len(steps) - 1; i >= 0; i-- {
		if steps[i].Key != "" {
			leaf = steps[i].Key
			break
		}
	}
	if leaf == "" {
		return nil
	}
	var found []string
	walkKeys(view(artifactType, payload), "", 0, leaf, &found)
	sort.Strings(found)
	if len(found) > MaxSuggestions {
		found = found[:MaxSuggestions]
	}
	return found
}

func walkKeys(v any, prefix string, depth int, leaf string, out *[]string) {
	m, ok := v.(map[string]any)
	if !ok || depth > suggestMaxDepth {
		return
	}
	for k, child := range m {
		p := k
		if prefix != "" {
			p = prefix + "." + k
		}
		if k == leaf {
			*out = append(*out, p)
		}
		walkKeys(child, p, depth+1, leaf, out)
	}
}
