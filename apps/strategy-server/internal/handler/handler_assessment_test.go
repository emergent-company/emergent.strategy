package handler

import (
	"strings"
	"testing"
)

func assessmentPayload() map[string]any {
	return map[string]any{
		"cycle": float64(2),
		"okr_assessments": []any{map[string]any{
			"okr_id":     "okr-p-001",
			"assessment": "Mostly delivered",
			"key_result_outcomes": []any{map[string]any{
				"kr_id": "kr-p-001", "status": "partially_met", "target": "10", "actual": "6",
			}},
		}},
	}
}

// The schema names the results of an objective key_result_outcomes. They show with
// their status, which is an enum and so carries no marker in the schema sample.
func TestAssessmentViewShowsTheKeyResultOutcomesAndTheirStatus(t *testing.T) {
	page := renderPageOfType(t, "assessment_report", assessmentPayload())
	for _, want := range []string{"kr-p-001", "partially_met", "Mostly delivered"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
}

// The list AI-drafted reports used, key_results, is still read.
func TestAssessmentViewStillReadsKeyResults(t *testing.T) {
	payload := assessmentPayload()
	om := payload["okr_assessments"].([]any)[0].(map[string]any)
	om["key_results"] = []any{map[string]any{"kr_id": "kr-p-777", "status": "met"}}
	page := renderPageOfType(t, "assessment_report", payload)
	for _, want := range []string{"kr-p-001", "kr-p-777"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
}

// A key no view reads is not dropped: it is shown as stored, under the notice.
func TestAssessmentViewShowsAnUnknownKeyUnderTheNotice(t *testing.T) {
	payload := assessmentPayload()
	payload["lessons_learned"] = map[string]any{"headline": "ship smaller"}
	page := renderPageOfType(t, "assessment_report", payload)
	for _, want := range []string{"has no dedicated view", "ship smaller"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(renderPageOfType(t, "assessment_report", assessmentPayload()), "no dedicated view") {
		t.Error("a payload every view reads must not show the notice")
	}
}
