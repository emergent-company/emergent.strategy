package workpackage_test

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workpackage"
)

func TestValidateTransition_Legal(t *testing.T) {
	legal := [][2]string{
		{"proposed", "approved"},
		{"approved", "scheduled"},
		{"scheduled", "executing"},
		{"executing", "done"},
		{"proposed", "cancelled"},
		{"approved", "cancelled"},
		{"scheduled", "cancelled"},
		{"executing", "cancelled"},
	}
	for _, tc := range legal {
		if err := workpackage.ValidateTransition(tc[0], tc[1]); err != nil {
			t.Errorf("ValidateTransition(%q, %q) = %v, want nil", tc[0], tc[1], err)
		}
	}
}

func TestValidateTransition_Illegal(t *testing.T) {
	illegal := [][2]string{
		{"proposed", "scheduled"}, // skips approved
		{"proposed", "executing"}, // skips two
		{"approved", "executing"}, // skips scheduled
		{"done", "executing"},     // terminal
		{"done", "approved"},      // terminal
		{"cancelled", "approved"}, // terminal
		{"executing", "proposed"}, // backward
		{"approved", "proposed"},  // backward
	}
	for _, tc := range illegal {
		if err := workpackage.ValidateTransition(tc[0], tc[1]); err == nil {
			t.Errorf("ValidateTransition(%q, %q) = nil, want error", tc[0], tc[1])
		}
	}
}

func TestValidateTransition_NoOpAndInvalid(t *testing.T) {
	if err := workpackage.ValidateTransition("approved", "approved"); err == nil {
		t.Error("no-op transition should error")
	}
	if err := workpackage.ValidateTransition("bogus", "approved"); err == nil {
		t.Error("invalid from-status should error")
	}
	if err := workpackage.ValidateTransition("approved", "bogus"); err == nil {
		t.Error("invalid to-status should error")
	}
}

func TestIsTerminal(t *testing.T) {
	if !workpackage.IsTerminal("done") || !workpackage.IsTerminal("cancelled") {
		t.Error("done and cancelled must be terminal")
	}
	for _, s := range []string{"proposed", "approved", "scheduled", "executing"} {
		if workpackage.IsTerminal(s) {
			t.Errorf("%q must not be terminal", s)
		}
	}
}

func TestFootprint_UnionExcludesKRs(t *testing.T) {
	payload := []byte(`{
		"id": "wp-001",
		"targets": {
			"value_model_paths": ["Product.Core.csv-import"],
			"definition_ids": ["fd-001", "cd-003"],
			"kr_ids": ["kr-p-001"]
		}
	}`)
	fp := workpackage.Footprint(payload)
	want := []string{"Product.Core.csv-import", "cd-003", "fd-001"} // sorted union
	if len(fp) != len(want) {
		t.Fatalf("footprint = %v, want %v", fp, want)
	}
	for i := range want {
		if fp[i] != want[i] {
			t.Errorf("footprint[%d] = %q, want %q", i, fp[i], want[i])
		}
	}
}
