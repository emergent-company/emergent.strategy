package mcpserver_test

import (
	"context"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// scaffold_instance seeds the READY templates. They must reach strategy_artifacts
// (the table every read uses) and be classified as unmodified templates, so reads
// do not present them as the company's strategy.
func TestMCP_ScaffoldInstance_IndexesAndClassifiesTemplates(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	c.activateAllTools()

	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
	orgID := seedOrg(t, svc.Strategy.DB(), ctx)
	ws, err := svc.Workspace.CreateWorkspace(ctx, "scaffold-owner", nil, orgID)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}

	c.call(1, "scaffold_instance", map[string]any{
		"workspace_id": ws.ID.String(),
		"name":         "Scaffolded",
	}).assertOK()

	var rows []domain.StrategyArtifact
	if err := svc.Strategy.DB().NewSelect().Model(&rows).
		Join("JOIN strategy_instances si ON si.id = sa.instance_id").
		Where("si.workspace_id = ?", ws.ID).
		Scan(ctx); err != nil {
		t.Fatalf("select artifacts: %v", err)
	}
	if len(rows) == 0 {
		t.Fatal("scaffold_instance left strategy_artifacts empty: the seeded templates are invisible to every read")
	}
	for _, r := range rows {
		if r.IntegrityClass == nil || *r.IntegrityClass != "unmodified_template" {
			t.Errorf("seeded artifact %s class = %v, want unmodified_template", r.ArtifactKey, r.IntegrityClass)
		}
	}
}
