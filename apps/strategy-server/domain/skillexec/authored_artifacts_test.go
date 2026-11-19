package skillexec

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// seedContextInstance seeds orgs -> workspaces -> strategy_instances, the chain
// strategy_artifacts needs. Local to this file: skillexec has no shared
// DB-backed test helper.
func seedContextInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()

	orgID := uuid.New()
	if _, err := db.ExecContext(ctx,
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "Test Org", "test-org-"+orgID.String()[:8]); err != nil {
		t.Fatalf("seed org: %v", err)
	}
	wsID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.Workspace{
		ID: wsID, GithubOwner: "test-" + wsID.String()[:8], OrgID: orgID,
	}).Exec(ctx); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	instID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.StrategyInstance{
		ID: instID, WorkspaceID: wsID, Name: "test-instance", Status: "active",
	}).Exec(ctx); err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}

func seedContextArtifact(t *testing.T, db *bun.DB, instID uuid.UUID, artifactType, key, marker, class string) {
	t.Helper()
	ctx := context.Background()

	raw, err := json.Marshal(map[string]any{"marker": marker})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	mutID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.StrategyMutation{
		ID: mutID, InstanceID: instID, ArtifactType: artifactType, ArtifactKey: key,
		Action: domain.MutationActionCreate, Payload: raw,
		Status: domain.MutationStatusCommitted, Source: "system",
	}).Exec(ctx); err != nil {
		t.Fatalf("seed mutation: %v", err)
	}
	art := &domain.StrategyArtifact{
		ID: uuid.New(), InstanceID: instID, ArtifactKey: key, ArtifactType: artifactType,
		Status: domain.ArtifactStatusActive, Payload: raw, MutationID: mutID,
	}
	if class != "" {
		art.IntegrityClass = &class
	}
	if _, err := db.NewInsert().Model(art).Exec(ctx); err != nil {
		t.Fatalf("seed artifact %s: %v", key, err)
	}
}

func TestLoadAllArtifacts_LeavesOutFrameworkContent(t *testing.T) {
	db := database.TestDB(t)
	instID := seedContextInstance(t, db)

	seedContextArtifact(t, db, instID, "north_star", "north_star", "authored", "")
	seedContextArtifact(t, db, instID, domain.ArtifactTypeAssessmentReport, "assessment_report", "template", "unmodified_template")
	seedContextArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model_product", "packaged", "packaged_default")
	seedContextArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model_commercial", "authored", "")

	got, err := loadAllArtifacts(context.Background(), db, instID)
	if err != nil {
		t.Fatalf("loadAllArtifacts: %v", err)
	}

	if ns, ok := got["north_star"].(map[string]any); !ok || ns["marker"] != "authored" {
		t.Errorf("north_star = %v, want the authored artifact", got["north_star"])
	}
	if _, ok := got[domain.ArtifactTypeAssessmentReport]; ok {
		t.Errorf("assessment_report is in the skill context, want an unmodified template left out: it would be injected into the prompt as a real assessment")
	}
	models, _ := got[domain.ArtifactTypeValueModel].([]any)
	if len(models) != 1 {
		t.Fatalf("value models = %v, want only the authored one", models)
	}
	if m, _ := models[0].(map[string]any); m["marker"] != "authored" {
		t.Errorf("value model = %v, want the authored one", models[0])
	}
}
