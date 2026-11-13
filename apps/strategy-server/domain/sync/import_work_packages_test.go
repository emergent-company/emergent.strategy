package sync_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

const importedWorkPackageYAML = `id: wp-001
title: Imported work packages show up
intent: A work package written to the instance repository is a work package in the server.
track: product
targets:
  value_model_paths: []
  definition_ids:
    - fd-026
  kr_ids: []
risk_class: low
status: approved
source:
  authoring_tool: openspec
  reference: https://github.com/acme/fleet/issues/7
lifecycle:
  created_at: "2026-11-01"
`

// A work package file in the instance repository is imported under the key the
// work package tools take (wp-001) and with the work_package type, so it is
// listed and fetched like one created through the tools, and a re-export
// writes it back to work_packages/wp-001.yaml.
func TestImportFromGithub_WorkPackageFilesAreWorkPackages(t *testing.T) {
	db := database.TestDB(t)
	ctx := newCtx()

	instSvc := instance.NewService(db)
	stratSvc := strategy.NewService(db)
	reader := &mockRepoReader{
		installationToken: "ghs_read_token",
		defaultBranch:     "main",
		headCommitSHA:     "sha-1",
		files: map[string][]byte{
			"READY/north_star.yaml":     []byte(northStarYAML),
			"work_packages/wp-001.yaml": []byte(importedWorkPackageYAML),
		},
	}
	svc := syncdom.NewService(db, stratSvc, versiondom.NewService(db), &mockRepoWriter{installationToken: "ghs_write_token", defaultBranch: "main"})
	svc.WithReader(reader)
	svc.WithInstanceReimporter(instSvc)

	orgID := seedTestOrg(t, db)
	ws, err := workspace.NewService(db).CreateWorkspace(ctx, "wp-import-"+uuid.NewString()[:8], nil, orgID)
	if err != nil {
		t.Fatal(err)
	}
	repo := "acme/strategy"
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{WorkspaceID: ws.ID, Name: "Acme", GithubRepo: &repo})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ImportFromGithub(ctx, syncdom.ImportParams{InstanceID: inst.ID}); err != nil {
		t.Fatalf("import: %v", err)
	}

	listed, err := stratSvc.ListArtifactsFiltered(ctx, inst.ID, domain.ArtifactTypeWorkPackage, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 1 || listed[0].ArtifactKey != "wp-001" {
		t.Fatalf("list_work_packages should find wp-001, got %d: %+v", len(listed), keysOf(listed))
	}
	if listed[0].Status != "approved" {
		t.Errorf("the status comes from the file: %q", listed[0].Status)
	}

	raw, err := stratSvc.GetCurrentArtifact(ctx, inst.ID, "wp-001")
	if err != nil {
		t.Fatalf("get_work_package wp-001: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil || got["id"] != "wp-001" {
		t.Errorf("wp-001 payload: %v %v", err, got)
	}

	exported, err := stratSvc.ExportInstance(ctx, inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	var wrote string
	for _, f := range exported.Files {
		if f.RelPath == "work_packages/wp-001.yaml" {
			wrote = f.Content
		}
	}
	if wrote == "" {
		t.Fatalf("the export should write work_packages/wp-001.yaml, wrote %v", pathsOf(exported.Files))
	}
	var before, after any
	if err := yaml.Unmarshal([]byte(importedWorkPackageYAML), &before); err != nil {
		t.Fatal(err)
	}
	if err := yaml.Unmarshal([]byte(wrote), &after); err != nil {
		t.Fatal(err)
	}
	if b, a := mustJSON(t, before), mustJSON(t, after); b != a {
		t.Errorf("the re-export changes the work package:\nbefore %s\nafter  %s", b, a)
	}
}

func keysOf(as []*domain.StrategyArtifact) []string {
	out := make([]string, 0, len(as))
	for _, a := range as {
		out = append(out, a.ArtifactKey)
	}
	return out
}

func pathsOf(fs []strategy.ExportEntry) []string {
	out := make([]string, 0, len(fs))
	for _, f := range fs {
		out = append(out, f.RelPath)
	}
	return out
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
