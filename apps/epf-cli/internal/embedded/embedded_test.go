package embedded

import (
	"strings"
	"testing"
)

// TestGetSchema verifies that embedded schemas can be loaded.
// This test catches the Windows filepath.Join bug: embed.FS uses forward-slash
// paths internally, but filepath.Join produces backslashes on Windows.
func TestGetSchema(t *testing.T) {
	data, err := GetSchema("north_star_schema.json")
	if err != nil {
		t.Fatalf("GetSchema failed: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("GetSchema returned empty data")
	}
	// Sanity check: should be valid JSON with a $schema key
	if !strings.Contains(string(data), `"$schema"`) {
		t.Error("Schema content does not contain $schema key")
	}
}

func TestGetSchemaNotFound(t *testing.T) {
	_, err := GetSchema("nonexistent_schema.json")
	if err == nil {
		t.Fatal("expected error for nonexistent schema")
	}
}

func TestListSchemas(t *testing.T) {
	names, err := ListSchemas()
	if err != nil {
		t.Fatalf("ListSchemas failed: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("ListSchemas returned no schemas")
	}
	// All names should end with .json
	for _, name := range names {
		if !strings.HasSuffix(name, ".json") {
			t.Errorf("schema name %q does not end with .json", name)
		}
	}
	t.Logf("Found %d embedded schemas", len(names))
}

// TestGetAllSchemasLoadable verifies every listed schema can actually be read.
// This is the key regression test — if path construction is wrong, GetSchema
// returns an error even though ListSchemas succeeds (ListSchemas uses ReadDir
// which doesn't construct paths, GetSchema uses ReadFile which does).
func TestGetAllSchemasLoadable(t *testing.T) {
	names, err := ListSchemas()
	if err != nil {
		t.Fatalf("ListSchemas failed: %v", err)
	}

	for _, name := range names {
		data, err := GetSchema(name)
		if err != nil {
			t.Errorf("GetSchema(%q) failed: %v", name, err)
			continue
		}
		if len(data) == 0 {
			t.Errorf("GetSchema(%q) returned empty data", name)
		}
	}
}

func TestGetTemplate(t *testing.T) {
	data, err := GetTemplate("READY/00_north_star.yaml")
	if err != nil {
		t.Fatalf("GetTemplate failed: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("GetTemplate returned empty data")
	}
}

func TestGetTemplateNotFound(t *testing.T) {
	_, err := GetTemplate("READY/nonexistent.yaml")
	if err == nil {
		t.Fatal("expected error for nonexistent template")
	}
}

func TestGetWizard(t *testing.T) {
	// Use a wizard we know exists
	names, err := ListWizards()
	if err != nil {
		t.Fatalf("ListWizards failed: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("no embedded wizards found")
	}

	data, err := GetWizard(names[0])
	if err != nil {
		t.Fatalf("GetWizard(%q) failed: %v", names[0], err)
	}
	if len(data) == 0 {
		t.Fatalf("GetWizard(%q) returned empty data", names[0])
	}
}

func TestGetWizardNotFound(t *testing.T) {
	_, err := GetWizard("nonexistent.md")
	if err == nil {
		t.Fatal("expected error for nonexistent wizard")
	}
}

func TestListWizards(t *testing.T) {
	names, err := ListWizards()
	if err != nil {
		t.Fatalf("ListWizards failed: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("no embedded wizards found")
	}
	for _, name := range names {
		if !strings.HasSuffix(name, ".md") {
			t.Errorf("wizard name %q does not end with .md", name)
		}
	}
	t.Logf("Found %d embedded wizards", len(names))
}

// TestGetAllWizardsLoadable mirrors TestGetAllSchemasLoadable for wizards.
func TestGetAllWizardsLoadable(t *testing.T) {
	names, err := ListWizards()
	if err != nil {
		t.Fatalf("ListWizards failed: %v", err)
	}

	for _, name := range names {
		data, err := GetWizard(name)
		if err != nil {
			t.Errorf("GetWizard(%q) failed: %v", name, err)
			continue
		}
		if len(data) == 0 {
			t.Errorf("GetWizard(%q) returned empty data", name)
		}
	}
}

func TestGetGenerator(t *testing.T) {
	genFS, err := GetGenerator("context-sheet")
	if err != nil {
		t.Fatalf("GetGenerator failed: %v", err)
	}
	// Should be able to read the generator.yaml from the sub-FS
	if genFS == nil {
		t.Fatal("GetGenerator returned nil FS")
	}
}

func TestGetGeneratorNotFound(t *testing.T) {
	// Note: fs.Sub on embed.FS returns an empty FS for nonexistent paths rather
	// than an error. This is Go's standard behavior. The caller discovers the
	// problem when trying to read files from the returned FS.
	genFS, err := GetGenerator("nonexistent-generator")
	if err != nil {
		// If it does error, that's also acceptable
		return
	}
	// If no error, the FS should be empty (no readable files)
	_, readErr := genFS.Open("generator.yaml")
	if readErr == nil {
		t.Fatal("expected empty FS for nonexistent generator, but found files")
	}
}

func TestListGenerators(t *testing.T) {
	names, err := ListGenerators()
	if err != nil {
		t.Fatalf("ListGenerators failed: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("no embedded generators found")
	}
	t.Logf("Found %d embedded generators", len(names))
}

// TestGetAllGeneratorsLoadable ensures every listed generator can be accessed.
func TestGetAllGeneratorsLoadable(t *testing.T) {
	names, err := ListGenerators()
	if err != nil {
		t.Fatalf("ListGenerators failed: %v", err)
	}

	for _, name := range names {
		genFS, err := GetGenerator(name)
		if err != nil {
			t.Errorf("GetGenerator(%q) failed: %v", name, err)
			continue
		}
		if genFS == nil {
			t.Errorf("GetGenerator(%q) returned nil FS", name)
		}
	}
}

func TestGetVersion(t *testing.T) {
	version := GetVersion()
	if version == "" {
		t.Fatal("GetVersion returned empty string")
	}
	// Should look like a semver
	parts := strings.Split(version, ".")
	if len(parts) != 3 {
		t.Errorf("version %q does not look like semver (expected 3 parts, got %d)", version, len(parts))
	}
	t.Logf("Embedded EPF version: %s", version)
}

func TestHasEmbeddedArtifacts(t *testing.T) {
	if !HasEmbeddedArtifacts() {
		t.Fatal("HasEmbeddedArtifacts returned false — binary has no embedded schemas")
	}
}

func TestGetGeneratorContent(t *testing.T) {
	content, err := GetGeneratorContent("context-sheet")
	if err != nil {
		t.Fatalf("GetGeneratorContent failed: %v", err)
	}
	if content.Name != "context-sheet" {
		t.Errorf("expected name 'context-sheet', got %q", content.Name)
	}
	// context-sheet has schema.json, wizard.instructions.md, README.md
	// but not necessarily generator.yaml (varies by generator)
	if content.Schema == "" {
		t.Error("generator schema (schema.json) is empty")
	}
	if content.Wizard == "" {
		t.Error("generator wizard (wizard.instructions.md) is empty")
	}
	if content.Readme == "" {
		t.Error("generator README.md is empty")
	}
}

func TestListCanonicalDefinitions(t *testing.T) {
	defs, err := ListCanonicalDefinitions()
	if err != nil {
		t.Fatalf("ListCanonicalDefinitions failed: %v", err)
	}
	if len(defs) == 0 {
		t.Fatal("ListCanonicalDefinitions returned no definitions")
	}

	// Should have definitions from all 3 canonical tracks
	tracks := make(map[string]int)
	for _, d := range defs {
		tracks[d.Track]++
		// Validate fields are populated
		if d.ID == "" {
			t.Errorf("definition with empty ID at path %s", d.Path)
		}
		if d.Filename == "" {
			t.Errorf("definition with empty Filename at path %s", d.Path)
		}
		if d.Track == "" {
			t.Errorf("definition %s has empty Track", d.ID)
		}
	}

	for _, track := range []string{"strategy", "org_ops", "commercial"} {
		if tracks[track] == 0 {
			t.Errorf("no definitions found for canonical track %q", track)
		}
	}
	// Product definitions (fd-*) should NOT be included
	if tracks["product"] > 0 {
		t.Errorf("found %d product definitions — only canonical tracks should be embedded", tracks["product"])
	}

	t.Logf("Found %d canonical definitions across tracks: %v", len(defs), tracks)
}

func TestGetCanonicalDefinition(t *testing.T) {
	defs, err := ListCanonicalDefinitions()
	if err != nil || len(defs) == 0 {
		t.Fatal("ListCanonicalDefinitions failed or returned empty")
	}

	// Load the first definition by filename
	data, err := GetCanonicalDefinition(defs[0].Filename)
	if err != nil {
		t.Fatalf("GetCanonicalDefinition(%q) failed: %v", defs[0].Filename, err)
	}
	if len(data) == 0 {
		t.Fatalf("GetCanonicalDefinition(%q) returned empty data", defs[0].Filename)
	}
	// Should be valid YAML
	if !strings.Contains(string(data), "id:") && !strings.Contains(string(data), "name:") {
		t.Errorf("definition content doesn't look like YAML definition")
	}
}

func TestGetCanonicalDefinitionNotFound(t *testing.T) {
	_, err := GetCanonicalDefinition("nonexistent-definition.yaml")
	if err == nil {
		t.Fatal("expected error for nonexistent definition")
	}
}

func TestGetAllCanonicalDefinitionsLoadable(t *testing.T) {
	defs, err := ListCanonicalDefinitions()
	if err != nil {
		t.Fatalf("ListCanonicalDefinitions failed: %v", err)
	}

	for _, d := range defs {
		data, err := GetCanonicalDefinition(d.Filename)
		if err != nil {
			t.Errorf("GetCanonicalDefinition(%q) failed: %v", d.Filename, err)
			continue
		}
		if len(data) == 0 {
			t.Errorf("GetCanonicalDefinition(%q) returned empty data", d.Filename)
		}
	}
}

func TestCanonicalDefinitionPrefixes(t *testing.T) {
	defs, err := ListCanonicalDefinitions()
	if err != nil {
		t.Fatalf("ListCanonicalDefinitions failed: %v", err)
	}

	// Verify that all definitions have canonical prefixes (sd-, pd-, cd-)
	for _, d := range defs {
		hasCanonicalPrefix := strings.HasPrefix(d.ID, "sd-") ||
			strings.HasPrefix(d.ID, "pd-") ||
			strings.HasPrefix(d.ID, "cd-")
		if !hasCanonicalPrefix {
			t.Errorf("definition %q doesn't have canonical prefix (sd-/pd-/cd-)", d.ID)
		}
	}
}

func TestGetAgentsMD(t *testing.T) {
	data, err := GetAgentsMD()
	if err != nil {
		t.Fatalf("GetAgentsMD failed: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("GetAgentsMD returned empty data")
	}
}
