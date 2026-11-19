package strategy_test

import (
	"context"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
)

func TestGetAIMSummary_CountsOnlyAuthoredArtifacts(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	commitAuto(t, svc, inst, domain.ArtifactTypeAssessmentReport, "assessment_report", domain.MutationActionCreate,
		embeddedPayload(t, "AIM/assessment_report"))
	commitAuto(t, svc, inst, domain.ArtifactTypeLRA, "living_reality_assessment", domain.MutationActionCreate,
		embeddedPayload(t, "AIM/living_reality_assessment"))

	for _, key := range []string{"assessment_report", "living_reality_assessment"} {
		row := artifactRow(t, db, inst, key)
		if row.IntegrityClass == nil || *row.IntegrityClass != string(integrity.ClassUnmodifiedTemplate) {
			t.Fatalf("%s class = %v, want %s: the test needs a real unmodified template", key, deref(row.IntegrityClass), integrity.ClassUnmodifiedTemplate)
		}
	}

	summary, err := svc.GetAIMSummary(context.Background(), inst)
	if err != nil {
		t.Fatalf("GetAIMSummary: %v", err)
	}
	if summary.ReportCount != 0 || summary.LRACount != 0 {
		t.Errorf("summary = %d reports, %d reality assessments, want 0 and 0: unmodified templates are not the company's AIM artifacts",
			summary.ReportCount, summary.LRACount)
	}

	commitAuto(t, svc, inst, domain.ArtifactTypeAssessmentReport, "assessment_report_2026-q1", domain.MutationActionCreate,
		map[string]any{"roadmap_id": "roadmap-001", "marker": "authored"})

	summary, err = svc.GetAIMSummary(context.Background(), inst)
	if err != nil {
		t.Fatalf("GetAIMSummary: %v", err)
	}
	if summary.ReportCount != 1 {
		t.Errorf("ReportCount = %d, want 1 for the authored report", summary.ReportCount)
	}
}
