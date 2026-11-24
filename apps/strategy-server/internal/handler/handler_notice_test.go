package handler

import (
	"strings"
	"testing"
)

// Pages with a dedicated view keep the promise of #163: a key no view reads is
// shown as stored, under a notice, and a payload every view reads shows no notice.
func TestNorthStarAndCalibrationShowWhatTheyHaveNoViewFor(t *testing.T) {
	for _, tc := range []struct {
		schema, artifactType string
		unknown              func(payload map[string]any)
	}{
		{"north_star_schema.json", "north_star", func(p map[string]any) {
			// Inside the root block and beside it.
			p["north_star"].(map[string]any)["board_notes"] = map[string]any{"headline": "inside-root-unknown"}
			p["sidecar"] = "beside-root-unknown"
		}},
		{"calibration_memo_schema.json", "calibration_memo", func(p map[string]any) {
			p["lessons"] = map[string]any{"headline": "calibration-unknown"}
		}},
	} {
		t.Run(tc.artifactType, func(t *testing.T) {
			// Every property of the schema has a dedicated view: no notice.
			for pick := 0; pick < 2; pick++ {
				payload, _ := sampleOfSchema(t, tc.schema, pick, 1)
				if page := renderPageOfType(t, tc.artifactType, payload); strings.Contains(page, "no dedicated view") {
					t.Fatalf("pick %d: the page shows the notice for a payload built from its own schema", pick)
				}
			}
			payload, _ := sampleOfSchema(t, tc.schema, 0, 1)
			tc.unknown(payload)
			page := renderPageOfType(t, tc.artifactType, payload)
			if !strings.Contains(page, "no dedicated view") {
				t.Fatal("an unknown key does not bring the notice")
			}
			for _, want := range []string{"inside-root-unknown", "beside-root-unknown", "calibration-unknown"} {
				if strings.Contains(fmtJSON(payload), want) && !strings.Contains(page, want) {
					t.Errorf("the page drops %q", want)
				}
			}
		})
	}
}

func fmtJSON(v map[string]any) string {
	var b strings.Builder
	var walk func(any)
	walk = func(x any) {
		switch t := x.(type) {
		case map[string]any:
			for _, c := range t {
				walk(c)
			}
		case []any:
			for _, c := range t {
				walk(c)
			}
		case string:
			b.WriteString(t + "\n")
		}
	}
	walk(v)
	return b.String()
}

// The older layout of a calibration memo, a "calibration" block with continue_doing
// and stop_doing, is read by the page, so it is shown and does not bring the notice.
func TestCalibrationLegacyBlockIsShownWithoutTheNotice(t *testing.T) {
	page := renderPageOfType(t, "calibration_memo", map[string]any{
		"calibration": map[string]any{
			"decision":        "pivot",
			"continue_doing":  []any{"keep-shipping-weekly"},
			"stop_doing":      []any{"stop-the-side-project"},
			"start_exploring": []any{"try-partner-channel"},
		},
	})
	for _, want := range []string{"keep-shipping-weekly", "stop-the-side-project", "try-partner-channel"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the legacy layout is read by the page and must not bring the notice")
	}
}
