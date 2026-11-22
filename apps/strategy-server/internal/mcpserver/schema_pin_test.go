package mcpserver_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"

	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

const oldSchemaVersion = "2.33.0"

// An assessment report with a pending Key Result outcome: valid since 2.34.0,
// rejected by the 2.33.0 schema.
func pendingAssessment() map[string]any {
	return map[string]any{
		"roadmap_id": "roadmap-001",
		"cycle":      2,
		"okr_assessments": []any{map[string]any{
			"okr_id": "okr-p-001", "assessment": strings.Repeat("Not yet measured, so the outcome stays pending until the cycle ends. ", 2),
			"key_result_outcomes": []any{map[string]any{"kr_id": "kr-p-001", "status": "pending"}},
		}},
		"assumption_validations": []any{},
	}
}

// pinnedInstance builds the reporter's situation: a registry that holds an older
// schema version whose assessment_report enum lacks "pending", and an instance
// pinned to that version whose stored report uses it.
func pinnedInstance(t *testing.T) (mcpserver.Services, string) {
	t.Helper()
	svc := buildSvc(t)
	db := svc.Strategy.DB()
	svc.Schema = schemadom.NewService(db)
	ctx := context.Background()

	for _, v := range []string{oldSchemaVersion, strings.TrimSpace(embedded.Version)} {
		if _, err := svc.Schema.ImportFromEmbedded(ctx, v); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, `UPDATE schema_registry
		SET content = replace(content::text, '"pending"', '"not_yet"')::jsonb
		WHERE version = ? AND schema_name = 'assessment_report_schema.json'`, oldSchemaVersion); err != nil {
		t.Fatal(err)
	}

	_, instID := seedInstance(t, svc, "pin-"+uuid.NewString()[:8], map[string]any{"assessment_report": pendingAssessment()})
	if _, err := db.ExecContext(ctx, `UPDATE strategy_instances SET schema_version = ? WHERE id = ?`, oldSchemaVersion, instID); err != nil {
		t.Fatal(err)
	}
	return svc, instID.String()
}

func pinOf(t *testing.T, svc mcpserver.Services, id string) string {
	t.Helper()
	var pin *string
	if err := svc.Strategy.DB().NewRaw(`SELECT schema_version FROM strategy_instances WHERE id = ?`, id).Scan(context.Background(), &pin); err != nil {
		t.Fatal(err)
	}
	if pin == nil {
		return ""
	}
	return *pin
}

// A pinned instance rejected a value the current framework accepts, and nothing
// said which version had judged it. The result names the version it used, and
// when that is not the one the server embeds, the summary says so.
func TestValidateInstance_NamesTheSchemaVersionItUsed(t *testing.T) {
	svc, id := pinnedInstance(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()
	current := strings.TrimSpace(embedded.Version)

	got := callBoth(t, c, 900, "validate_instance", map[string]any{"instance_id": id})
	var body map[string]any
	if err := json.Unmarshal([]byte(got.text), &body); err != nil {
		t.Fatal(err)
	}
	if body["invalid_count"] != float64(1) {
		t.Fatalf("the pinned schema should reject the pending outcome: %v", body["invalid_count"])
	}
	if body["schema_version_used"] != oldSchemaVersion || body["embedded_schema_version"] != current {
		t.Fatalf("used=%v embedded=%v, want %s and %s", body["schema_version_used"], body["embedded_schema_version"], oldSchemaVersion, current)
	}
	summary, _ := got.structured["summary"].(string)
	for _, want := range []string{oldSchemaVersion, current, "upgrade_instance_schema"} {
		if !strings.Contains(summary, want) {
			t.Errorf("summary %q should mention %q", summary, want)
		}
	}
}

func TestValidateInstance_AnInstanceOnTheCurrentVersionHasNoVersionNote(t *testing.T) {
	svc, id := pinnedInstance(t)
	if _, err := svc.Strategy.DB().ExecContext(context.Background(),
		`UPDATE strategy_instances SET schema_version = ? WHERE id = ?`, strings.TrimSpace(embedded.Version), id); err != nil {
		t.Fatal(err)
	}
	c := newMCPClient(t, svc)
	c.activateAllTools()

	got := callBoth(t, c, 901, "validate_instance", map[string]any{"instance_id": id})
	summary, _ := got.structured["summary"].(string)
	if strings.Contains(summary, "schema version") || strings.Contains(summary, "upgrade_instance_schema") {
		t.Fatalf("an instance on the current version needs no note: %q", summary)
	}
	if !strings.Contains(got.text, `"invalid_count":0`) {
		t.Fatalf("the pending outcome is valid under the current schema: %s", got.text)
	}
}

func TestUpgradeInstanceSchema_ShowsWhatChangesAndChangesNothing(t *testing.T) {
	svc, id := pinnedInstance(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()
	current := strings.TrimSpace(embedded.Version)

	got := callBoth(t, c, 910, "upgrade_instance_schema", map[string]any{"instance_id": id})
	var body struct {
		Applied      bool     `json:"applied"`
		From         string   `json:"current_version"`
		To           string   `json:"target_version"`
		NewlyValid   []string `json:"newly_valid"`
		NewlyInvalid []struct {
			ArtifactKey string `json:"artifact_key"`
		} `json:"newly_invalid"`
	}
	if err := json.Unmarshal([]byte(got.text), &body); err != nil {
		t.Fatal(err)
	}
	if body.Applied || body.From != oldSchemaVersion || body.To != current {
		t.Fatalf("dry run: %+v", body)
	}
	if len(body.NewlyValid) != 1 || body.NewlyValid[0] != "assessment_report" || len(body.NewlyInvalid) != 0 {
		t.Fatalf("the report becomes valid and nothing else changes: %+v", body)
	}
	if pin := pinOf(t, svc, id); pin != oldSchemaVersion {
		t.Fatalf("a dry run moved the pin to %q", pin)
	}
}

func TestUpgradeInstanceSchema_ApplyMovesThePinAndTheStandardPack(t *testing.T) {
	svc, id := pinnedInstance(t)
	db := svc.Strategy.DB()
	ctx := context.Background()
	current := strings.TrimSpace(embedded.Version)
	if _, err := db.ExecContext(ctx, `UPDATE installed_skills SET pack_version = ? WHERE instance_id = ? AND pack_name = 'emergent-standard'`, oldSchemaVersion, id); err != nil {
		t.Fatal(err)
	}
	c := newMCPClient(t, svc)
	c.activateAllTools()

	got := callBoth(t, c, 920, "upgrade_instance_schema", map[string]any{"instance_id": id, "apply": true})
	if !strings.Contains(got.text, `"applied":true`) {
		t.Fatalf("not applied: %s", got.text)
	}
	if pin := pinOf(t, svc, id); pin != current {
		t.Fatalf("pin is %q, want %q", pin, current)
	}
	var stale int
	if err := db.NewRaw(`SELECT count(*) FROM installed_skills WHERE instance_id = ? AND pack_name = 'emergent-standard' AND pack_version <> ?`, id, current).Scan(ctx, &stale); err != nil {
		t.Fatal(err)
	}
	var total int
	if err := db.NewRaw(`SELECT count(*) FROM installed_skills WHERE instance_id = ? AND pack_name = 'emergent-standard'`, id).Scan(ctx, &total); err != nil {
		t.Fatal(err)
	}
	if stale != 0 || total == 0 {
		t.Fatalf("standard pack: %d of %d skills still on an older version", stale, total)
	}

	after := callBoth(t, c, 921, "validate_instance", map[string]any{"instance_id": id})
	if !strings.Contains(after.text, `"invalid_count":0`) {
		t.Fatalf("after the upgrade the report is valid: %s", after.text)
	}
	again := callBoth(t, c, 922, "upgrade_instance_schema", map[string]any{"instance_id": id})
	if !strings.Contains(again.text, `"up_to_date":true`) {
		t.Fatalf("a second call should find nothing to do: %s", again.text)
	}
}
