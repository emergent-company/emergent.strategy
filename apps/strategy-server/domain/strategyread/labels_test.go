package strategyread_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

func TestLabels_MapIdentifiersInContentToReadableNames(t *testing.T) {
	roadmap := decode(t, roadmapFixture)
	idx := strategyread.BuildLabelIndex(roadmap)

	content := decode(t, `{"linked_to_kr":["kr-c-002","kr-zzz-999"],"parent":"okr-c-001","note":"mentions kr-c-001 inline"}`)
	got := strategyread.LabelsFor(content, idx)

	want := map[string]string{
		"kr-c-002":  "Pilot NPS above 40",
		"okr-c-001": "Land three pilots",
		"kr-c-001":  "Three signed pilots",
	}
	for id, label := range want {
		if got[id] != label {
			t.Errorf("label[%s] = %q, want %q", id, got[id], label)
		}
	}
	if _, ok := got["kr-zzz-999"]; ok {
		t.Error("an identifier with no source in the instance must not get a label")
	}
}

func TestLabels_AreCapped(t *testing.T) {
	var sb strings.Builder
	sb.WriteString(`{"items":[`)
	for i := 0; i < 100; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(`{"id":"kr-x-` + pad3(i) + `","description":"Result ` + pad3(i) + `"}`)
	}
	sb.WriteString(`]}`)
	idx := strategyread.BuildLabelIndex(decode(t, sb.String()))

	var refs []string
	for i := 0; i < 100; i++ {
		refs = append(refs, `"kr-x-`+pad3(i)+`"`)
	}
	got := strategyread.LabelsFor(decode(t, `[`+strings.Join(refs, ",")+`]`), idx)
	if len(got) != strategyread.MaxLabels {
		t.Errorf("labels = %d, want the cap of %d", len(got), strategyread.MaxLabels)
	}
}

func pad3(i int) string { return fmt.Sprintf("%03d", i) }

func TestCiteAs(t *testing.T) {
	tests := []struct{ artifact, path, want string }{
		{"strategy_formula", "trade_offs", "Strategy formula › trade offs"},
		{"roadmap_recipe", "tracks.commercial.okrs[id=okr-c-001]", "Roadmap recipe › tracks › commercial › okrs [okr-c-001]"},
		{"north_star", "", "North star"},
		{"insight_analyses", "target_users[2]", "Insight analyses › target users [item 3]"},
		{"something_new", "a", "something new › a"},
	}
	for _, tt := range tests {
		if got := strategyread.CiteAs(tt.artifact, tt.path); got != tt.want {
			t.Errorf("CiteAs(%q, %q) = %q, want %q", tt.artifact, tt.path, got, tt.want)
		}
	}
}
