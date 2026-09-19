package verdict_test

import (
	"encoding/json"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/verdict"
)

func TestNew_OKIgnoresWarningsAndInfo(t *testing.T) {
	v := verdict.New(10, []verdict.Finding{
		{Severity: verdict.SeverityWarning, Rule: "r.w", Message: "w"},
		{Severity: verdict.SeverityInfo, Rule: "r.i", Message: "i"},
	})

	if !v.OK {
		t.Errorf("OK = false with only warnings and info; only error-severity findings may clear it — "+
			"otherwise the server is choosing a threshold that belongs to the consumer. counts=%+v", v.Counts)
	}
	if v.Counts.Warning != 1 || v.Counts.Info != 1 || v.Counts.Error != 0 {
		t.Errorf("counts = %+v, want 1 warning / 1 info / 0 errors", v.Counts)
	}
}

func TestNew_OneErrorClearsOK(t *testing.T) {
	v := verdict.New(3, []verdict.Finding{
		{Severity: verdict.SeverityWarning, Rule: "r.w", Message: "w"},
		{Severity: verdict.SeverityError, Rule: "r.e", Message: "e"},
	})
	if v.OK {
		t.Error("OK = true despite an error-severity finding")
	}
}

// A known consumer (opencode-harness internal/provider/verdict.go Blocking())
// treats an absent severity as blocking. A warning that forgot to set one
// would therefore silently become a build-breaker downstream.
func TestNew_MissingSeverityIsNormalisedToError(t *testing.T) {
	v := verdict.New(1, []verdict.Finding{{Rule: "r.x", Message: "no severity set"}})

	if got := v.Findings[0].Severity; got != verdict.SeverityError {
		t.Errorf("severity = %q, want %q — an unset severity must be made explicit, not shipped as a zero value",
			got, verdict.SeverityError)
	}
	if v.Counts.Error != 1 {
		t.Errorf("counts.error = %d, want 1", v.Counts.Error)
	}
	if v.OK {
		t.Error("OK = true for a finding normalised to error severity")
	}
}

// counts.checked is what separates "clean" from "nothing ran". A gate that
// cannot tell those apart passes when its input silently disappears.
func TestNew_NothingCheckedIsNotReportedAsAPass(t *testing.T) {
	empty := verdict.New(0, nil)
	if empty.Counts.Checked != 0 {
		t.Fatalf("checked = %d, want 0", empty.Counts.Checked)
	}
	if empty.Summary != "nothing was checked" {
		t.Errorf("summary = %q; an empty run must not read as a clean pass", empty.Summary)
	}

	clean := verdict.New(12, nil)
	if clean.Summary == empty.Summary {
		t.Error("a clean run of 12 checks is indistinguishable from a run of 0 checks")
	}
}

// The wire names are a cross-repo contract consumed by opencode-harness and
// requested of emergent.memory. Renaming a field breaks them silently.
func TestVerdict_WireFieldNamesAreStable(t *testing.T) {
	raw, err := json.Marshal(verdict.New(1, []verdict.Finding{{
		Severity: verdict.SeverityError,
		Key:      "fd-001",
		Rule:     "schema.required",
		Path:     "/name",
		Message:  "missing property 'name'",
	}}))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"ok", "summary", "counts", "findings"} {
		if _, present := got[field]; !present {
			t.Errorf("envelope is missing %q — this name is consumed cross-repo", field)
		}
	}

	findings, ok := got["findings"].([]any)
	if !ok || len(findings) != 1 {
		t.Fatalf("findings did not marshal as a one-element array: %v", got["findings"])
	}
	f, ok := findings[0].(map[string]any)
	if !ok {
		t.Fatalf("finding did not marshal as an object: %v", findings[0])
	}
	for _, field := range []string{"severity", "key", "rule", "message"} {
		if _, present := f[field]; !present {
			t.Errorf("finding is missing %q — this name is consumed cross-repo", field)
		}
	}
}

// `ok` must be a real JSON boolean. The harness refuses to treat a payload as
// a verdict unless `ok` is present and boolean, precisely so that structured
// data which merely happens to have other fields is never mistaken for a
// judgement.
func TestVerdict_OKMarshalsAsABoolean(t *testing.T) {
	raw, err := json.Marshal(verdict.New(1, nil))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var probe struct {
		OK *bool `json:"ok"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if probe.OK == nil {
		t.Fatal("ok did not decode as a boolean; a consumer would reject this payload as 'not a verdict'")
	}
}

// Findings must never marshal as null: the published schema types the field as
// an array and a consumer ranging over it should not have to nil-check.
func TestNew_FindingsAreNeverNull(t *testing.T) {
	raw, err := json.Marshal(verdict.New(5, nil))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got struct {
		Findings *[]verdict.Finding `json:"findings"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.Findings == nil {
		t.Fatal("findings marshalled as null, want []")
	}
	if len(*got.Findings) != 0 {
		t.Fatalf("findings = %v, want empty", *got.Findings)
	}
}
