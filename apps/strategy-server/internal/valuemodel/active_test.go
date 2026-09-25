package valuemodel_test

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
)

// TestActiveIsReadFromThePayload pins the flag that decides whether a component
// counts at all.
//
// Value models for strategy, org_ops and commercial are canonical and shared
// across projects: they describe every component such a track could have, not
// the ones this instance uses. On the emergent instance 93 of 126 components
// are dormant. A component that defaulted to active would put all of them in
// the coverage denominator, so a report over 126 would measure a catalogue and
// call it a strategy.
func TestActiveIsReadFromThePayload(t *testing.T) {
	cases := map[string]struct {
		raw  any
		want bool
	}{
		"true":            {true, true},
		"false":           {false, false},
		"absent":          {nil, false},
		"string not bool": {"true", false},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			comp := map[string]any{"id": "c1", "path_segment": "C"}
			if tc.raw != nil {
				comp["active"] = tc.raw
			}
			m := valuemodel.ParseModel(map[string]any{
				"track_name": "Product",
				"layers":     []any{map[string]any{"id": "l1", "path_segment": "L", "components": []any{comp}}},
			})
			if got := m.Layers[0].Components[0].Active(); got != tc.want {
				t.Fatalf("Active() = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestContributesToReadsBothLocations pins the single authority. This lived in
// internal/handler until a second caller needed it; a second reader is exactly
// how the first one's blind spot survived.
func TestContributesToReadsBothLocations(t *testing.T) {
	got := valuemodel.ContributesTo(map[string]any{
		"contributes_to":    []any{"A.B"},
		"strategic_context": map[string]any{"contributes_to": []any{"C.D"}},
	})
	if len(got) != 2 {
		t.Fatalf("read %v, want both locations combined", got)
	}
}

// TestContributesToOnNothing is the empty-subject control: a reader that
// returns something for every input cannot report that a definition
// contributes nowhere.
func TestContributesToOnNothing(t *testing.T) {
	for _, p := range []map[string]any{
		nil,
		{},
		{"contributes_to": nil},
		{"contributes_to": []any{""}},
		{"contributes_to": "not-a-list"},
		{"strategic_context": "not-a-map"},
	} {
		if got := valuemodel.ContributesTo(p); len(got) != 0 {
			t.Errorf("payload %v yielded %v, want none", p, got)
		}
	}
}
