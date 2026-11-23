package handler

import (
	"strconv"
	"strings"
)

// Tolerant readers, shared by the bespoke pages.
//
// The schema says what a field should hold, but a payload that disagrees still
// validates. These read a number as its text, a lone string as a one-item list,
// and a plain string where an object is expected, so the page shows them rather
// than a blank card. Anything they cannot read is left to the fallback.

// tolText is the text of a scalar. Blank text is empty.
func tolText(v any) string {
	switch t := v.(type) {
	case string:
		if strings.TrimSpace(t) == "" {
			return ""
		}
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	}
	return ""
}

func tolStr(m map[string]any, key string) string { return tolText(m[key]) }

// tolStrs reads a list of scalars, or a lone scalar as a list of one.
func tolStrs(m map[string]any, key string) []string {
	switch t := m[key].(type) {
	case []any:
		var out []string
		for _, e := range t {
			if s := tolText(e); s != "" {
				out = append(out, s)
			}
		}
		return out
	case nil:
		return nil
	default:
		if s := tolText(t); s != "" {
			return []string{s}
		}
	}
	return nil
}

// tolItems reads a list of objects. A plain string item stands for an object
// whose textKey is that string. Items of any other type are skipped.
func tolItems(v any, textKey string) []map[string]any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	var out []map[string]any
	for _, item := range list {
		switch t := item.(type) {
		case map[string]any:
			out = append(out, t)
		case string:
			if tolText(t) != "" {
				out = append(out, map[string]any{textKey: t})
			}
		}
	}
	return out
}

func tolMap(m map[string]any, key string) map[string]any {
	child, _ := m[key].(map[string]any)
	return child
}

func tolDig(m map[string]any, path ...string) any {
	var cur any = m
	for _, k := range path {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[k]
	}
	return cur
}
