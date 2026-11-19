package aim

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// frameworkClasses are the integrity classes that mark content shipped with the
// framework. Content the company wrote, or that merely still holds placeholder
// values, is not in this list.
var frameworkClasses = []string{"unmodified_template", "canonical_reference", "packaged_default"}

// seedArtifactRow commits an artifact row with an integrity class ("" means
// authored) and an explicit updated_at.
func seedArtifactRow(t *testing.T, db *bun.DB, instID uuid.UUID, artifactType, key string, payload any, class string, updatedAt time.Time) {
	t.Helper()
	ctx := context.Background()

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	mutID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.StrategyMutation{
		ID:           mutID,
		InstanceID:   instID,
		ArtifactType: artifactType,
		ArtifactKey:  key,
		Action:       domain.MutationActionCreate,
		Payload:      raw,
		Status:       domain.MutationStatusCommitted,
		Source:       "system",
	}).Exec(ctx); err != nil {
		t.Fatalf("seed mutation: %v", err)
	}

	art := &domain.StrategyArtifact{
		ID:           uuid.New(),
		InstanceID:   instID,
		ArtifactKey:  key,
		ArtifactType: artifactType,
		Status:       domain.ArtifactStatusActive,
		Payload:      raw,
		MutationID:   mutID,
		CreatedAt:    updatedAt,
		UpdatedAt:    updatedAt,
	}
	if class != "" {
		art.IntegrityClass = &class
	}
	if _, err := db.NewInsert().Model(art).Exec(ctx); err != nil {
		t.Fatalf("seed artifact %s: %v", key, err)
	}
}

func assessmentPayload(marker string) map[string]any {
	return map[string]any{
		"roadmap_id": "roadmap-001",
		"marker":     marker,
		"okr_assessments": []any{
			map[string]any{"okr_id": "okr-p-001", "key_result_outcomes": []any{
				map[string]any{"kr_id": "kr-p-001", "status": "met"},
			}},
		},
	}
}

func TestEvaluateTriggers_FrameworkAssessmentCountsAsNone(t *testing.T) {
	for _, class := range frameworkClasses {
		t.Run(class, func(t *testing.T) {
			db := database.TestDB(t)
			instID := seedInstance(t, db)
			seedArtifactRow(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report",
				assessmentPayload("template"), class, time.Now())

			got := NewService(db).EvaluateTriggers(context.Background(), instID)

			if !got.Fired || got.Reason != "time" {
				t.Fatalf("trigger = %+v, want the time trigger to fire", got)
			}
			if got.ReasonMessage != "No assessment report exists yet" {
				t.Errorf("message = %q, want the first-cycle message", got.ReasonMessage)
			}
			if !got.LastAssessmentAt.IsZero() {
				t.Errorf("LastAssessmentAt = %v, want zero: an unmodified template is not an assessment", got.LastAssessmentAt)
			}
		})
	}
}

func TestEvaluateTriggers_AuthoredAssessmentStillCounts(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)
	seedArtifactRow(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report",
		assessmentPayload("authored"), "", time.Now())

	got := NewService(db).EvaluateTriggers(context.Background(), instID)

	if got.Fired {
		t.Errorf("trigger = %+v, want no trigger for a recent authored assessment", got)
	}
}

func TestEvaluateTriggers_AuthoredAssessmentIsNotReplacedByNewerTemplate(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)
	seedArtifactRow(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report_2026-q1",
		assessmentPayload("authored"), "", time.Now().Add(-100*24*time.Hour))
	seedArtifactRow(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report",
		assessmentPayload("template"), "unmodified_template", time.Now())

	got := NewService(db).EvaluateTriggers(context.Background(), instID)

	if !got.Fired || got.Reason != "time" {
		t.Fatalf("trigger = %+v, want the time trigger to fire", got)
	}
	if !strings.Contains(got.ReasonMessage, "100 days ago") {
		t.Errorf("message = %q, want it measured from the authored assessment (100 days ago)", got.ReasonMessage)
	}
}

func TestLoadArtifactPayload_AuthoredContentOnly(t *testing.T) {
	cases := []struct {
		class     string
		wantFound bool
	}{
		{"", true},
		{"template_values", true},
		{"near_canonical", true},
		{"unmodified_template", false},
		{"canonical_reference", false},
		{"packaged_default", false},
	}
	for _, tc := range cases {
		name := tc.class
		if name == "" {
			name = "authored"
		}
		t.Run(name, func(t *testing.T) {
			db := database.TestDB(t)
			instID := seedInstance(t, db)
			seedArtifactRow(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report",
				assessmentPayload("row"), tc.class, time.Now())

			got, err := NewService(db).loadArtifactPayload(context.Background(), instID, domain.ArtifactTypeAssessmentReport)

			if tc.wantFound {
				if err != nil || got["marker"] != "row" {
					t.Errorf("payload = %v, err = %v, want the row to load", got, err)
				}
				return
			}
			if err == nil {
				t.Errorf("payload = %v, want not found for class %q", got, tc.class)
			}
		})
	}
}

func TestLoadArtifactPayload_AuthoredIsNotReplacedByNewerTemplate(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)
	seedArtifactRow(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report_2026-q1",
		assessmentPayload("authored"), "", time.Now().Add(-48*time.Hour))
	seedArtifactRow(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report",
		assessmentPayload("template"), "unmodified_template", time.Now())

	got, err := NewService(db).loadArtifactPayload(context.Background(), instID, domain.ArtifactTypeAssessmentReport)
	if err != nil {
		t.Fatalf("loadArtifactPayload: %v", err)
	}
	if got["marker"] != "authored" {
		t.Errorf("marker = %v, want the authored assessment, not the newer template", got["marker"])
	}
}

func TestGetTriggerConfig_UnmodifiedTemplateGivesDefaults(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)
	seedArtifactRow(t, db, instID, domain.ArtifactTypeAIMTriggerConfig, "aim_trigger_config",
		TriggerConfig{DaysBetweenAssessments: 7, CriticalSignalThreshold: 1}, "unmodified_template", time.Now())

	got := NewService(db).GetTriggerConfig(context.Background(), instID)

	if got.DaysBetweenAssessments != 90 || got.CriticalSignalThreshold != 3 {
		t.Errorf("config = %+v, want the defaults (90 days, threshold 3): the template's values were never chosen", got)
	}
}

func TestGetTriggerConfig_AuthoredConfigIsUsed(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)
	seedArtifactRow(t, db, instID, domain.ArtifactTypeAIMTriggerConfig, "aim_trigger_config",
		TriggerConfig{DaysBetweenAssessments: 7, CriticalSignalThreshold: 1}, "", time.Now())

	got := NewService(db).GetTriggerConfig(context.Background(), instID)

	if got.DaysBetweenAssessments != 7 || got.CriticalSignalThreshold != 1 {
		t.Errorf("config = %+v, want the authored values (7 days, threshold 1)", got)
	}
}

func TestAssembleCalibrationParams_OnlyTemplateAssessmentIsRefused(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)
	seedArtifactRow(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report",
		assessmentPayload("template"), "unmodified_template", time.Now())

	params, err := NewService(db).AssembleCalibrationParams(context.Background(), instID)

	if err == nil {
		t.Fatalf("params = %v, want an error: with no committed assessment calibration must not run on the template (0%% hit rate, pivot)", params)
	}
	if !strings.Contains(err.Error(), "No committed assessment report found") {
		t.Errorf("error = %q, want it to say no committed assessment exists", err)
	}
}

func TestAssembleAssessmentParams_UnmodifiedRoadmapTemplateIsRefused(t *testing.T) {
	db := database.TestDB(t)
	instID := seedInstance(t, db)
	seedArtifactRow(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe",
		map[string]any{"roadmap": map[string]any{"id": "roadmap-001", "tracks": map[string]any{}}},
		"unmodified_template", time.Now())

	params, err := NewService(db).AssembleAssessmentParams(context.Background(), instID)

	if err == nil {
		t.Fatalf("params = %v, want an error: an unmodified roadmap template is not the company's roadmap", params)
	}
	if !strings.Contains(err.Error(), "No roadmap found") {
		t.Errorf("error = %q, want it to say no roadmap exists", err)
	}
}
