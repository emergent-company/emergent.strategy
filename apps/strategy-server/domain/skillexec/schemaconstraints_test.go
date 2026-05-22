package skillexec

import (
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// ExtractSchemaConstraints — integration with embedded schemas
// ---------------------------------------------------------------------------

func TestExtractSchemaConstraints_StrategyFormula(t *testing.T) {
	sc, err := ExtractSchemaConstraints("strategy_formula")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sc.ArtifactType != "strategy_formula" {
		t.Errorf("ArtifactType = %q; want strategy_formula", sc.ArtifactType)
	}
	// strategy_formula has enum fields (status, confidence_level).
	if len(sc.Enums) == 0 {
		t.Error("expected at least one enum constraint for strategy_formula")
	}
}

func TestExtractSchemaConstraints_RoadmapRecipe(t *testing.T) {
	sc, err := ExtractSchemaConstraints("roadmap_recipe")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Must find ID patterns.
	if len(sc.IDPatterns) == 0 {
		t.Error("expected ID pattern constraints for roadmap_recipe")
	}

	// Must find minLength constraints.
	if len(sc.MinLengths) == 0 {
		t.Error("expected minLength constraints for roadmap_recipe")
	}

	// Must find minItems constraints.
	if len(sc.MinItems) == 0 {
		t.Error("expected minItems constraints for roadmap_recipe")
	}

	// Must find enum constraints.
	if len(sc.Enums) == 0 {
		t.Error("expected enum constraints for roadmap_recipe")
	}

	// Specific: roadmap.id must appear in patterns.
	foundRoadmapID := false
	for _, c := range sc.IDPatterns {
		if strings.Contains(c.JSONPath, "roadmap.id") {
			foundRoadmapID = true
		}
	}
	if !foundRoadmapID {
		t.Errorf("expected roadmap.id to appear in IDPatterns; got paths: %v", pathList(sc.IDPatterns))
	}

	// Specific: roadmap.status must appear in enums.
	foundStatus := false
	for _, c := range sc.Enums {
		if strings.Contains(c.JSONPath, "roadmap.status") {
			foundStatus = true
		}
	}
	if !foundStatus {
		t.Errorf("expected roadmap.status to appear in Enums; got paths: %v", pathList(sc.Enums))
	}

	// Specific: sequencing_rationale must appear in minLengths (minLength 200).
	foundSeqRationale := false
	for _, c := range sc.MinLengths {
		if strings.Contains(c.JSONPath, "sequencing_rationale") {
			foundSeqRationale = true
			if c.Constraint != "200" {
				t.Errorf("sequencing_rationale minLength = %q; want 200", c.Constraint)
			}
		}
	}
	if !foundSeqRationale {
		t.Errorf("expected sequencing_rationale in MinLengths; got paths: %v", pathList(sc.MinLengths))
	}
}

func TestExtractSchemaConstraints_UnknownType(t *testing.T) {
	// Unknown artifact type — should return empty constraints, not an error.
	sc, err := ExtractSchemaConstraints("nonexistent_type_xyz")
	if err != nil {
		t.Fatalf("unexpected error for unknown type: %v", err)
	}
	if sc.ArtifactType != "nonexistent_type_xyz" {
		t.Errorf("ArtifactType = %q; want nonexistent_type_xyz", sc.ArtifactType)
	}
	if len(sc.IDPatterns)+len(sc.MinLengths)+len(sc.MinItems)+len(sc.Enums) != 0 {
		t.Error("expected zero constraints for unknown type")
	}
}

// ---------------------------------------------------------------------------
// RenderConstraintAppendix
// ---------------------------------------------------------------------------

func TestRenderConstraintAppendix_EmptyConstraints(t *testing.T) {
	sc := SchemaConstraints{ArtifactType: "foo"}
	result := RenderConstraintAppendix(sc)
	if result != "" {
		t.Errorf("expected empty string for zero constraints, got %q", result)
	}
}

func TestRenderConstraintAppendix_ContainsSections(t *testing.T) {
	sc, err := ExtractSchemaConstraints("roadmap_recipe")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	result := RenderConstraintAppendix(sc)

	if !strings.Contains(result, "roadmap_recipe") {
		t.Error("rendered appendix should mention the artifact type")
	}
	if !strings.Contains(result, "ID and format patterns") {
		t.Error("expected ID patterns section")
	}
	if !strings.Contains(result, "Minimum character lengths") {
		t.Error("expected minLength section")
	}
	if !strings.Contains(result, "Minimum array sizes") {
		t.Error("expected minItems section")
	}
	if !strings.Contains(result, "Enum fields") {
		t.Error("expected enums section")
	}
}

func TestRenderConstraintAppendix_IsValidMarkdown(t *testing.T) {
	sc, err := ExtractSchemaConstraints("roadmap_recipe")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	result := RenderConstraintAppendix(sc)

	// Basic markdown table sanity: every table line has |.
	for i, line := range strings.Split(result, "\n") {
		if strings.HasPrefix(line, "|") && !strings.HasSuffix(strings.TrimSpace(line), "|") {
			t.Errorf("line %d looks like a malformed table row: %q", i, line)
		}
	}
}

// ---------------------------------------------------------------------------
// schemaConstraints template function — end-to-end via renderPrompt
// ---------------------------------------------------------------------------

func TestRenderPrompt_SchemaConstraintsFunction(t *testing.T) {
	prompt := `HEADER
{{schemaConstraints "strategy_formula"}}
FOOTER`

	bundle := &ContextBundle{
		InstanceID: "test",
		Artifacts:  map[string]any{},
		Params:     map[string]any{},
	}

	rendered, _, err := renderPrompt(prompt, bundle)
	if err != nil {
		t.Fatalf("renderPrompt error: %v", err)
	}

	if !strings.Contains(rendered, "strategy_formula") {
		t.Error("rendered prompt should contain schema constraints for strategy_formula")
	}
	if !strings.Contains(rendered, "HEADER") || !strings.Contains(rendered, "FOOTER") {
		t.Error("rendered prompt should preserve surrounding content")
	}
}

func TestRenderPrompt_SchemaConstraintsUnknownType(t *testing.T) {
	// Unknown type should produce a comment placeholder, not an error.
	prompt := `{{schemaConstraints "unknown_artifact_type_xyz"}}`
	bundle := &ContextBundle{
		InstanceID: "test",
		Artifacts:  map[string]any{},
		Params:     map[string]any{},
	}
	rendered, _, err := renderPrompt(prompt, bundle)
	if err != nil {
		t.Fatalf("renderPrompt error: %v", err)
	}
	// Unknown type has no constraints → empty string output (not an error comment).
	// The function returns "" for unknown types, so rendered output is just whitespace.
	if strings.Contains(rendered, "unavailable") {
		t.Errorf("should not contain error comment for unknown type, got: %q", rendered)
	}
}

// ---------------------------------------------------------------------------
// Walker internals
// ---------------------------------------------------------------------------

func TestConstraintWalker_RefResolution(t *testing.T) {
	// The roadmap_recipe schema uses $ref for track definitions.
	// Verify that $ref traversal finds the track constraints.
	sc, err := ExtractSchemaConstraints("roadmap_recipe")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// The track $ref should resolve and surface the okrs[] constraints.
	foundOKRObjective := false
	for _, c := range sc.MinLengths {
		if strings.Contains(c.JSONPath, "objective") {
			foundOKRObjective = true
		}
	}
	if !foundOKRObjective {
		t.Errorf("expected 'objective' minLength constraint from resolved $ref; MinLengths: %v", pathList(sc.MinLengths))
	}
}

func TestConstraintWalker_WildcardTrackCollapse(t *testing.T) {
	// The four track names should be collapsed to "tracks.*" to avoid repetition.
	sc, err := ExtractSchemaConstraints("roadmap_recipe")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should NOT find "tracks.product", "tracks.strategy", etc. — they should
	// all be collapsed to "tracks.*".
	for _, c := range sc.IDPatterns {
		if strings.Contains(c.JSONPath, "tracks.product") ||
			strings.Contains(c.JSONPath, "tracks.strategy") ||
			strings.Contains(c.JSONPath, "tracks.org_ops") ||
			strings.Contains(c.JSONPath, "tracks.commercial") {
			t.Errorf("track-specific path found — should be collapsed to tracks.*: %q", c.JSONPath)
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func pathList(cs []FieldConstraint) []string {
	paths := make([]string, len(cs))
	for i, c := range cs {
		paths[i] = c.JSONPath
	}
	return paths
}
