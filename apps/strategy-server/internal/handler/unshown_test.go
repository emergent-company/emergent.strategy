package handler

import (
	"reflect"
	"testing"
)

func TestUnshownContent(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]any
		shown   []string
		want    map[string]any
	}{
		{
			name:    "everything shown leaves nothing",
			payload: map[string]any{"a": "x", "b": map[string]any{"c": "y"}},
			shown:   []string{"a", "b.c"},
			want:    nil,
		},
		{
			name:    "an unnamed top-level key is returned whole",
			payload: map[string]any{"a": "x", "foo_analysis": map[string]any{"k": "v", "n": []any{"p", "q"}}},
			shown:   []string{"a"},
			want:    map[string]any{"foo_analysis": map[string]any{"k": "v", "n": []any{"p", "q"}}},
		},
		{
			name: "a field inside a shown section that nothing reads is returned with its siblings pruned",
			payload: map[string]any{"strengths": []any{
				map[string]any{"strength": "S1", "defensibility": "high"},
				map[string]any{"strength": "S2"},
			}},
			shown: []string{"strengths.*.strength"},
			want:  map[string]any{"strengths": []any{map[string]any{"defensibility": "high"}}},
		},
		{
			name:    "a wildcard matches map keys and list positions",
			payload: map[string]any{"trends": map[string]any{"market": []any{map[string]any{"trend": "T", "extra": "E"}}}},
			shown:   []string{"trends.*.*.trend"},
			want:    map[string]any{"trends": map[string]any{"market": []any{map[string]any{"extra": "E"}}}},
		},
		{
			name:    "a path that names a list of scalars covers its items, and a lone string",
			payload: map[string]any{"a": map[string]any{"evidence": []any{"e1", "e2"}}, "b": map[string]any{"evidence": "single"}},
			shown:   []string{"a.evidence", "b.evidence"},
			want:    nil,
		},
		{
			name:    "a list item that is a plain string is shown only when the path for plain items is declared",
			payload: map[string]any{"key_insights": []any{"plain text", map[string]any{"insight": "mapped"}}},
			shown:   []string{"key_insights.*.insight"},
			want:    map[string]any{"key_insights": []any{"plain text"}},
		},
		{
			name:    "plain items are covered once declared",
			payload: map[string]any{"key_insights": []any{"plain text", map[string]any{"insight": "mapped"}}},
			shown:   []string{"key_insights.*", "key_insights.*.insight"},
			want:    nil,
		},
		{
			name:    "a scalar path does not cover a map under the same name",
			payload: map[string]any{"tam": map[string]any{"size": "big", "method": "m"}},
			shown:   []string{"tam"},
			want:    map[string]any{"tam": map[string]any{"size": "big", "method": "m"}},
		},
		{
			name: "empty values are not content",
			payload: map[string]any{
				"a": "", "b": nil, "c": []any{}, "d": map[string]any{"e": ""},
				"f": []any{map[string]any{"g": ""}},
			},
			shown: nil,
			want:  nil,
		},
		{
			name:    "numbers and booleans are content, including zero and false",
			payload: map[string]any{"rank": float64(0), "ok": false, "n": float64(3)},
			shown:   []string{"n"},
			want:    map[string]any{"rank": float64(0), "ok": false},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := unshownContent(tc.payload, tc.shown)
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("got  %#v\nwant %#v", got, tc.want)
			}
		})
	}
}

func TestUnshownContentDoesNotChangeThePayload(t *testing.T) {
	payload := map[string]any{"a": []any{map[string]any{"x": "1", "y": "2"}}}
	_ = unshownContent(payload, []string{"a.*.x"})
	want := map[string]any{"a": []any{map[string]any{"x": "1", "y": "2"}}}
	if !reflect.DeepEqual(payload, want) {
		t.Errorf("payload was modified: %#v", payload)
	}
}
