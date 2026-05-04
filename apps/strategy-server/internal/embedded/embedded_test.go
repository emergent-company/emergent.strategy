package embedded_test

import (
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// ---------------------------------------------------------------------------
// Version / Manifest
// ---------------------------------------------------------------------------

func TestVersion_NotEmpty(t *testing.T) {
	v := strings.TrimSpace(embedded.Version)
	if v == "" {
		t.Fatal("Version is empty — run scripts/sync-embedded.sh")
	}
	t.Logf("embedded EPF version: %s", v)
}

func TestManifest_NotEmpty(t *testing.T) {
	if embedded.Manifest == "" {
		t.Fatal("Manifest is empty")
	}
	if !strings.Contains(embedded.Manifest, "## Schemas") {
		t.Error("Manifest missing '## Schemas' section")
	}
	if !strings.Contains(embedded.Manifest, "## Agents") {
		t.Error("Manifest missing '## Agents' section")
	}
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

func TestListSchemas_ReturnsExpectedFiles(t *testing.T) {
	names, err := embedded.ListSchemas()
	if err != nil {
		t.Fatalf("ListSchemas: %v", err)
	}
	if len(names) < 10 {
		t.Errorf("expected ≥10 schemas, got %d", len(names))
	}

	required := []string{
		"feature_definition_schema.json",
		"north_star_schema.json",
		"value_model_schema.json",
		"commercial_definition_schema.json",
		"org_ops_definition_schema.json",
		"strategy_definition_schema.json",
	}
	nameSet := make(map[string]bool, len(names))
	for _, n := range names {
		nameSet[n] = true
	}
	for _, r := range required {
		if !nameSet[r] {
			t.Errorf("missing required schema: %s", r)
		}
	}
	t.Logf("schemas: %d", len(names))
}

func TestGetSchema_FeatureDefinition(t *testing.T) {
	data, err := embedded.GetSchema("feature_definition_schema.json")
	if err != nil {
		t.Fatalf("GetSchema: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("schema data is empty")
	}
	// Must be valid JSON (starts with '{')
	if data[0] != '{' {
		t.Errorf("schema does not start with '{': %q", string(data[:min(20, len(data))]))
	}
}

func TestGetSchema_NotFound(t *testing.T) {
	_, err := embedded.GetSchema("nonexistent_schema.json")
	if err == nil {
		t.Error("expected error for missing schema, got nil")
	}
}

func TestSchemaFS_Accessible(t *testing.T) {
	sfs, err := embedded.SchemaFS()
	if err != nil {
		t.Fatalf("SchemaFS: %v", err)
	}
	f, err := sfs.Open("feature_definition_schema.json")
	if err != nil {
		t.Fatalf("open schema via FS: %v", err)
	}
	f.Close() //nolint:errcheck
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

func TestListTemplates_HasREADYPhase(t *testing.T) {
	paths, err := embedded.ListTemplates()
	if err != nil {
		t.Fatalf("ListTemplates: %v", err)
	}
	if len(paths) == 0 {
		t.Fatal("no templates found")
	}

	hasNorthStar := false
	for _, p := range paths {
		if strings.Contains(p, "north_star") {
			hasNorthStar = true
		}
	}
	if !hasNorthStar {
		t.Error("ListTemplates: no north_star template found")
	}
	t.Logf("templates: %d", len(paths))
}

func TestGetTemplate_NorthStar(t *testing.T) {
	paths, _ := embedded.ListTemplates()
	// Find the north_star template path
	var nsPath string
	for _, p := range paths {
		if strings.Contains(p, "north_star") {
			nsPath = p
			break
		}
	}
	if nsPath == "" {
		t.Skip("no north_star template in embedded content")
	}

	data, err := embedded.GetTemplate(nsPath)
	if err != nil {
		t.Fatalf("GetTemplate(%q): %v", nsPath, err)
	}
	if len(data) == 0 {
		t.Fatal("template data is empty")
	}
}

func TestGetTemplate_NotFound(t *testing.T) {
	_, err := embedded.GetTemplate("READY/nonexistent.yaml")
	if err == nil {
		t.Error("expected error for missing template, got nil")
	}
}

// ---------------------------------------------------------------------------
// Wizards (legacy)
// ---------------------------------------------------------------------------

func TestListWizards_NonEmpty(t *testing.T) {
	names, err := embedded.ListWizards()
	if err != nil {
		t.Fatalf("ListWizards: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("no wizards found")
	}
	for _, n := range names {
		if !strings.HasSuffix(n, ".md") {
			t.Errorf("wizard %q has unexpected extension", n)
		}
	}
	t.Logf("wizards: %d", len(names))
}

func TestGetWizard_FirstWizard(t *testing.T) {
	names, err := embedded.ListWizards()
	if err != nil || len(names) == 0 {
		t.Skip("no wizards available")
	}
	data, err := embedded.GetWizard(names[0])
	if err != nil {
		t.Fatalf("GetWizard(%q): %v", names[0], err)
	}
	if len(data) == 0 {
		t.Fatalf("wizard %q is empty", names[0])
	}
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

func TestListGenerators_NonEmpty(t *testing.T) {
	names, err := embedded.ListGenerators()
	if err != nil {
		t.Fatalf("ListGenerators: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("no generators found")
	}
	t.Logf("generators: %d — %v", len(names), names)
}

func TestGetGenerator_FirstGenerator(t *testing.T) {
	names, err := embedded.ListGenerators()
	if err != nil || len(names) == 0 {
		t.Skip("no generators available")
	}
	gfs, err := embedded.GetGenerator(names[0])
	if err != nil {
		t.Fatalf("GetGenerator(%q): %v", names[0], err)
	}
	if gfs == nil {
		t.Fatal("GetGenerator returned nil FS")
	}
	// Verify the FS is usable by opening "." — all embed sub-FSes support this.
	f, err := gfs.Open(".")
	if err != nil {
		t.Fatalf("open '.' in generator FS: %v", err)
	}
	f.Close() //nolint:errcheck
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

func TestListAgents_IncludesPathfinder(t *testing.T) {
	names, err := embedded.ListAgents()
	if err != nil {
		t.Fatalf("ListAgents: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("no agents found")
	}

	found := false
	for _, n := range names {
		if n == "pathfinder" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected 'pathfinder' agent, got: %v", names)
	}
	t.Logf("agents: %d — %v", len(names), names)
}

func TestGetAgentYAML_Pathfinder(t *testing.T) {
	data, err := embedded.GetAgentYAML("pathfinder")
	if err != nil {
		t.Fatalf("GetAgentYAML(pathfinder): %v", err)
	}
	if !strings.Contains(string(data), "name: pathfinder") {
		t.Errorf("agent.yaml missing 'name: pathfinder', got: %q", string(data[:min(100, len(data))]))
	}
	if !strings.Contains(string(data), "phase: READY") {
		t.Errorf("agent.yaml missing 'phase: READY'")
	}
}

func TestGetAgentYAML_NotFound(t *testing.T) {
	_, err := embedded.GetAgentYAML("nonexistent-agent")
	if err == nil {
		t.Error("expected error for missing agent, got nil")
	}
}

func TestGetAgentPrompt_Pathfinder(t *testing.T) {
	// pathfinder may or may not have prompt.md — both outcomes are valid.
	data, err := embedded.GetAgentPrompt("pathfinder")
	if err != nil {
		t.Fatalf("GetAgentPrompt(pathfinder): %v", err)
	}
	t.Logf("pathfinder prompt.md: %d bytes", len(data))
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

func TestListSkills_IncludesFeatureDefinition(t *testing.T) {
	names, err := embedded.ListSkills()
	if err != nil {
		t.Fatalf("ListSkills: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("no skills found")
	}

	found := false
	for _, n := range names {
		if n == "feature-definition" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected 'feature-definition' skill, got: %v", names)
	}
	t.Logf("skills: %d — %v", len(names), names)
}

func TestGetSkillYAML_FeatureDefinition(t *testing.T) {
	data, err := embedded.GetSkillYAML("feature-definition")
	if err != nil {
		t.Fatalf("GetSkillYAML(feature-definition): %v", err)
	}
	if !strings.Contains(string(data), "name: feature-definition") {
		t.Errorf("skill.yaml missing 'name: feature-definition'")
	}
	if !strings.Contains(string(data), "phase: FIRE") {
		t.Errorf("skill.yaml missing 'phase: FIRE'")
	}
}

func TestGetSkillYAML_NotFound(t *testing.T) {
	_, err := embedded.GetSkillYAML("nonexistent-skill")
	if err == nil {
		t.Error("expected error for missing skill, got nil")
	}
}

func TestGetSkillPrompt_FeatureDefinition(t *testing.T) {
	data, err := embedded.GetSkillPrompt("feature-definition")
	if err != nil {
		t.Fatalf("GetSkillPrompt(feature-definition): %v", err)
	}
	if len(data) == 0 {
		t.Error("feature-definition skill has no prompt content")
	}
	t.Logf("feature-definition prompt: %d bytes", len(data))
}

func TestGetSkillPrompt_NonexistentSkill(t *testing.T) {
	data, err := embedded.GetSkillPrompt("nonexistent-skill")
	// Should return nil, nil (no panic, no error — just absent)
	if err != nil {
		t.Errorf("GetSkillPrompt for nonexistent skill: expected nil error, got %v", err)
	}
	if data != nil {
		t.Errorf("GetSkillPrompt for nonexistent skill: expected nil data, got %d bytes", len(data))
	}
}

// ---------------------------------------------------------------------------
// ResolveSkill — generator alias
// ---------------------------------------------------------------------------

func TestResolveSkill_CanonicalSkill(t *testing.T) {
	skill, err := embedded.ResolveSkill("feature-definition")
	if err != nil {
		t.Fatalf("ResolveSkill(feature-definition): %v", err)
	}
	if skill.Source != embedded.CoreSkillSourceEmbedded {
		t.Errorf("expected source %q, got %q", embedded.CoreSkillSourceEmbedded, skill.Source)
	}
	if skill.Name != "feature-definition" {
		t.Errorf("expected name %q, got %q", "feature-definition", skill.Name)
	}
	if len(skill.SkillYAML) == 0 {
		t.Error("SkillYAML is empty")
	}
	t.Logf("resolved canonical skill: name=%s type=%s source=%s", skill.Name, skill.Type, skill.Source)
}

func TestResolveSkill_GeneratorAlias(t *testing.T) {
	// All 5 generator names are now also present in skills/ (canonical takes precedence).
	// Verify they resolve correctly — canonical is correct, not generator-alias.
	// The generator-alias path is exercised only for names that exist solely in outputs/.
	// Since all current generators have been promoted to skills/, we verify the
	// canonical path resolves with type=generation for these names.
	skill, err := embedded.ResolveSkill("context-sheet")
	if err != nil {
		t.Fatalf("ResolveSkill(context-sheet): %v", err)
	}
	// context-sheet has a skills/ entry so it is canonical.
	if skill.Source != embedded.CoreSkillSourceEmbedded {
		t.Errorf("expected source %q, got %q", embedded.CoreSkillSourceEmbedded, skill.Source)
	}
	if skill.Name != "context-sheet" {
		t.Errorf("expected name %q, got %q", "context-sheet", skill.Name)
	}
	if len(skill.SkillYAML) == 0 {
		t.Error("SkillYAML is empty")
	}
	t.Logf("context-sheet: source=%s type=%s", skill.Source, skill.Type)
}

func TestResolveSkill_AllGeneratorsResolve(t *testing.T) {
	// All 5 generator names must resolve (either canonical or alias) without error.
	generators := []string{
		"context-sheet",
		"development-brief",
		"investor-memo",
		"skattefunn-application",
		"value-model-preview",
	}
	for _, name := range generators {
		skill, err := embedded.ResolveSkill(name)
		if err != nil {
			t.Errorf("ResolveSkill(%q): unexpected error: %v", name, err)
			continue
		}
		if skill.Name != name {
			t.Errorf("ResolveSkill(%q): name mismatch, got %q", name, skill.Name)
		}
		if len(skill.SkillYAML) == 0 {
			t.Errorf("ResolveSkill(%q): SkillYAML is empty", name)
		}
		t.Logf("generator %q → source=%s type=%s", name, skill.Source, skill.Type)
	}
}

func TestResolveSkill_GeneratorAliasPath(t *testing.T) {
	// Verify the generator-alias fallback works when a name only exists in outputs/.
	// We test this by verifying the logic is reachable: if the outputs/ directory
	// contains entries that skills/ does not, they resolve as generator-alias.
	// Currently all generators have been promoted to skills/, so this test verifies
	// the alias code is at least compilable and the not-found path works correctly.
	_, err := embedded.ResolveSkill("outputs-only-hypothetical-name")
	if err == nil {
		t.Error("expected error for name not in skills/ or outputs/, got nil")
	}
}

func TestResolveSkill_NotFound(t *testing.T) {
	_, err := embedded.ResolveSkill("nonexistent-skill-xyz")
	if err == nil {
		t.Error("expected error for nonexistent skill, got nil")
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
