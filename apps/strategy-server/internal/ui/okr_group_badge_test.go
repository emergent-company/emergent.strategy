package ui

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

// A later cycle's objective is marked as such on the pages that list objectives,
// as the roadmap page does; a current one is not.
func TestExecutionOKRNamesALaterGroup(t *testing.T) {
	render := func(okr ExecutionOKR) string {
		var buf bytes.Buffer
		if err := executionOKRSection(okr, "Product", "i", false).Render(context.Background(), &buf); err != nil {
			t.Fatal(err)
		}
		return buf.String()
	}
	if got := render(ExecutionOKR{ID: "okr-2", Objective: "later", Group: "future_okrs_q3_2026"}); !strings.Contains(got, "Planned · q3 2026") {
		t.Error("a later objective is not marked")
	}
	if got := render(ExecutionOKR{ID: "okr-1", Objective: "now"}); strings.Contains(got, "Planned") {
		t.Error("a current objective is marked as planned")
	}
}

func TestFireTrackColumnNamesALaterGroup(t *testing.T) {
	render := func(obj FireOKRObjective) string {
		var buf bytes.Buffer
		col := fireTrackColumn("i", FireTrackData{Objectives: []FireOKRObjective{obj}})
		if err := col.Render(context.Background(), &buf); err != nil {
			t.Fatal(err)
		}
		return buf.String()
	}
	if got := render(FireOKRObjective{Objective: "later", Group: "future_okrs_2027"}); !strings.Contains(got, "Planned · 2027") {
		t.Error("a later objective is not marked")
	}
	if got := render(FireOKRObjective{Objective: "now"}); strings.Contains(got, "Planned") {
		t.Error("a current objective is marked as planned")
	}
}
