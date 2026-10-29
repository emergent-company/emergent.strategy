// Package strategyread slices strategy artifacts into question-sized pieces: it
// parses section paths, resolves them against an artifact payload, applies a
// size budget without ever truncating silently, and builds outlines. It is pure
// logic with no infrastructure dependencies.
package strategyread

import (
	"fmt"
	"strconv"
	"strings"
)

// SelectorKind is the kind of an array selector in a path.
type SelectorKind int

// Selector kinds.
const (
	// SelectIndex picks one array item by position: [2].
	SelectIndex SelectorKind = iota
	// SelectField picks the array item whose field equals a value: [id=okr-c-001].
	SelectField
	// SelectFrom picks the tail of an array from a position: [2:].
	SelectFrom
)

// Selector narrows an array.
type Selector struct {
	Kind  SelectorKind
	Index int
	Field string
	Value string
}

// Step is one dot-separated segment of a path: an object key followed by zero
// or more array selectors.
type Step struct {
	Key       string
	Selectors []Selector
}

// ParsePath parses a section path such as
// "tracks.commercial.okrs[id=okr-c-001].key_results[0]". An empty path has no
// steps and addresses the whole artifact.
func ParsePath(p string) ([]Step, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return nil, nil
	}
	segments, err := splitSegments(p)
	if err != nil {
		return nil, err
	}
	steps := make([]Step, 0, len(segments))
	for _, seg := range segments {
		step, err := parseSegment(seg)
		if err != nil {
			return nil, err
		}
		steps = append(steps, step)
	}
	return steps, nil
}

// splitSegments splits on dots that are outside brackets, so a selector value
// may itself contain dots.
func splitSegments(p string) ([]string, error) {
	var out []string
	depth := 0
	start := 0
	for i, r := range p {
		switch r {
		case '[':
			depth++
		case ']':
			depth--
			if depth < 0 {
				return nil, fmt.Errorf("path %q: unmatched ']'", p)
			}
		case '.':
			if depth == 0 {
				if i == start {
					return nil, fmt.Errorf("path %q: empty segment", p)
				}
				out = append(out, p[start:i])
				start = i + 1
			}
		}
	}
	if depth != 0 {
		return nil, fmt.Errorf("path %q: unclosed '['", p)
	}
	if start >= len(p) {
		return nil, fmt.Errorf("path %q: trailing '.'", p)
	}
	return append(out, p[start:]), nil
}

func parseSegment(seg string) (Step, error) {
	key := seg
	rest := ""
	if i := strings.Index(seg, "["); i >= 0 {
		key, rest = seg[:i], seg[i:]
	}
	step := Step{Key: key}
	for rest != "" {
		end := strings.Index(rest, "]")
		if rest[0] != '[' || end < 0 {
			return Step{}, fmt.Errorf("segment %q: malformed selector", seg)
		}
		sel, err := parseSelector(rest[1:end])
		if err != nil {
			return Step{}, fmt.Errorf("segment %q: %w", seg, err)
		}
		step.Selectors = append(step.Selectors, sel)
		rest = rest[end+1:]
	}
	if step.Key == "" && len(step.Selectors) == 0 {
		return Step{}, fmt.Errorf("segment %q: empty", seg)
	}
	return step, nil
}

func parseSelector(s string) (Selector, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return Selector{}, fmt.Errorf("empty selector")
	}
	if field, value, ok := strings.Cut(s, "="); ok {
		field, value = strings.TrimSpace(field), strings.TrimSpace(value)
		if field == "" || value == "" {
			return Selector{}, fmt.Errorf("selector %q needs a field and a value", s)
		}
		return Selector{Kind: SelectField, Field: field, Value: value}, nil
	}
	if strings.HasSuffix(s, ":") {
		n, err := strconv.Atoi(strings.TrimSuffix(s, ":"))
		if err != nil || n < 0 {
			return Selector{}, fmt.Errorf("selector %q: position must be a non-negative number", s)
		}
		return Selector{Kind: SelectFrom, Index: n}, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return Selector{}, fmt.Errorf("selector %q: position must be a non-negative number", s)
	}
	return Selector{Kind: SelectIndex, Index: n}, nil
}
