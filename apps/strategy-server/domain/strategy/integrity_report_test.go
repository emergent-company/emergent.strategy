package strategy_test

import (
	"context"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func TestReportIntegrity_FindingsBySeverityAndAggregation(t *testing.T) {
	svc, db, inst := seedRead(t)
	ctx := context.Background()

	// Two canonical definitions in one track, one unmodified template, one packaged value model.
	commitAuto(t, svc, inst, "definition", "sd-001", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/context/"))
	commitAuto(t, svc, inst, "definition", "sd-002", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/communications/"))
	commitAuto(t, svc, inst, "north_star", "north_star", domain.MutationActionCreate, embeddedPayload(t, "READY/00_north_star"))
	commitAuto(t, svc, inst, "value_model", "value_model_product.value_model", domain.MutationActionCreate, embeddedPayload(t, "value_models/product"))
	if _, err := db.ExecContext(ctx, "UPDATE strategy_artifacts SET track = 'strategy' WHERE artifact_key IN ('sd-001','sd-002') AND instance_id = ?", inst); err != nil {
		t.Fatal(err)
	}

	rep, err := svc.ReportIntegrity(ctx, inst)
	if err != nil {
		t.Fatalf("ReportIntegrity: %v", err)
	}

	if rep.Counts["canonical_reference"] != 2 || rep.Counts["unmodified_template"] != 1 || rep.Counts["packaged_default"] != 1 {
		t.Errorf("counts = %v", rep.Counts)
	}
	if rep.Scanned < 7 {
		t.Errorf("scanned = %d, want every artifact in the instance", rep.Scanned)
	}

	var canonical, template, vm []strategyFinding
	for _, f := range rep.Findings {
		switch f.Rule {
		case "integrity.canonical_reference":
			canonical = append(canonical, strategyFinding(f))
		case "integrity.unmodified_template":
			template = append(template, strategyFinding(f))
		case "integrity.packaged_default":
			vm = append(vm, strategyFinding(f))
		}
	}
	if len(canonical) != 1 || canonical[0].Severity != "info" || canonical[0].Key != "" {
		t.Errorf("canonical definitions must be one aggregated info finding per track, got %+v", canonical)
	}
	if len(canonical) == 1 && !strings.Contains(canonical[0].Message, "2") {
		t.Errorf("the aggregated message must carry the count: %q", canonical[0].Message)
	}
	if len(template) != 1 || template[0].Severity != "warning" || template[0].Key != "north_star" {
		t.Errorf("an unmodified template is a warning on its key, got %+v", template)
	}
	if len(vm) != 1 || vm[0].Severity != "warning" {
		t.Errorf("the product value model at its packaged default is a warning, got %+v", vm)
	}
	for _, f := range rep.Findings {
		if f.Severity == "error" {
			t.Errorf("integrity findings are advisory; got an error: %+v", f)
		}
		if !strings.HasPrefix(f.Rule, "integrity.") {
			t.Errorf("rule %q is not in the integrity namespace", f.Rule)
		}
		if f.Message == "" {
			t.Errorf("finding %+v has no message", f)
		}
	}
	if rep.Source == "" {
		t.Error("the report must say what it matched against, so a missing manifest is visible")
	}
}

func TestReportIntegrity_CleanInstanceHasNoFindings(t *testing.T) {
	svc, _, inst := seedRead(t)
	rep, err := svc.ReportIntegrity(context.Background(), inst)
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Findings) != 0 || len(rep.Counts) != 0 {
		t.Errorf("findings=%v counts=%v, want none for an all-authored instance", rep.Findings, rep.Counts)
	}
	if rep.Scanned != 3 {
		t.Errorf("scanned = %d, want the 3 artifacts", rep.Scanned)
	}
}

// strategyFinding is a local alias so the test reads naturally.
type strategyFinding = struct {
	Severity string
	Key      string
	Rule     string
	Message  string
}
