// Package strategy — export.go
//
// ExportInstance converts committed strategy_artifacts for an instance into an
// EPF YAML directory structure (map[relPath]yamlBytes).  ExportFeature does the
// same for a single feature artifact.  ExportReport produces a structured text
// summary of the instance's strategic state.
package strategy

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"strings"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

// ---------------------------------------------------------------------------
// Artifact type → EPF directory path
// ---------------------------------------------------------------------------

// artifactTypeToDirPath returns the EPF subdirectory for a given artifact type.
// The directory is relative to the instance root.
func artifactTypeToDirPath(artifactType string) string {
	switch artifactType {
	case "north_star":
		return "READY"
	case "strategy_foundations":
		return "READY"
	case "strategy_formula":
		return "READY"
	case "insight_analyses":
		return "READY"
	case "insight_opportunity":
		return "READY"
	case "value_model":
		return "FIRE/value_model"
	case "feature":
		return "FIRE/definitions/features"
	case "roadmap", "roadmap_recipe":
		return "FIRE/definitions/roadmap"
	case "org_ops_def":
		return "FIRE/definitions/org_ops"
	case "commercial_def":
		return "FIRE/definitions/commercial"
	case "strategy_def":
		return "FIRE/definitions/strategy"
	case "product_portfolio":
		return "FIRE/definitions"
	case "mappings":
		return "FIRE/definitions"
	case "assessment_report":
		return "AIM"
	case "living_reality_assessment":
		return "AIM"
	case "aim_trigger_config":
		return "AIM"
	default:
		return "FIRE/definitions"
	}
}

// artifactKeyToFilename derives a YAML filename from the artifact key.
// For keys that already end in .yaml / .yml, just use the basename.
// Otherwise append .yaml.
func artifactKeyToFilename(artifactType, artifactKey string) string {
	base := path.Base(artifactKey)
	if strings.HasSuffix(base, ".yaml") || strings.HasSuffix(base, ".yml") {
		return base
	}
	// Use the type-specific default filenames for singleton artifacts.
	switch artifactType {
	case "north_star":
		return "north_star.yaml"
	case "strategy_foundations":
		return "strategy_foundations.yaml"
	case "strategy_formula":
		return "strategy_formula.yaml"
	case "insight_analyses":
		return "insight_analyses.yaml"
	case "value_model":
		return artifactKey + ".yaml"
	default:
		return base + ".yaml"
	}
}

// ---------------------------------------------------------------------------
// JSON → YAML conversion helper
// ---------------------------------------------------------------------------

// jsonToYAML converts raw JSON bytes to YAML bytes.
func jsonToYAML(raw []byte) ([]byte, error) {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, fmt.Errorf("unmarshal json: %w", err)
	}
	out, err := yaml.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("marshal yaml: %w", err)
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// ExportEntry is a single file in the exported directory structure.
// ---------------------------------------------------------------------------

// ExportEntry represents one exported artifact file.
type ExportEntry struct {
	RelPath      string `json:"rel_path"` // e.g. "FIRE/definitions/features/fd-001.yaml"
	ArtifactKey  string `json:"artifact_key"`
	ArtifactType string `json:"artifact_type"`
	Content      string `json:"content"` // YAML content as a UTF-8 string
}

// ExportResult is the output of ExportInstance.
type ExportResult struct {
	InstanceID    string        `json:"instance_id"`
	ArtifactCount int           `json:"artifact_count"`
	Files         []ExportEntry `json:"files"`
}

// ExportInstance exports all non-archived artifacts for an instance as EPF YAML files.
func (s *Service) ExportInstance(ctx context.Context, instanceID uuid.UUID) (*ExportResult, error) {
	artifacts, err := s.ListCurrentArtifacts(ctx, instanceID, "")
	if err != nil {
		return nil, err
	}

	result := &ExportResult{
		InstanceID:    instanceID.String(),
		ArtifactCount: len(artifacts),
		Files:         make([]ExportEntry, 0, len(artifacts)),
	}

	for _, a := range artifacts {
		yamlBytes, err := jsonToYAML(a.Payload)
		if err != nil {
			// Skip artifacts that can't be serialised; don't fail the whole export.
			continue
		}
		dir := artifactTypeToDirPath(a.ArtifactType)
		filename := artifactKeyToFilename(a.ArtifactType, a.ArtifactKey)
		relPath := path.Join(dir, filename)

		result.Files = append(result.Files, ExportEntry{
			RelPath:      relPath,
			ArtifactKey:  a.ArtifactKey,
			ArtifactType: a.ArtifactType,
			Content:      string(yamlBytes),
		})
	}

	return result, nil
}

// ExportFeature exports a single feature artifact as a YAML string.
func (s *Service) ExportFeature(ctx context.Context, instanceID uuid.UUID, featureKey string) (*ExportEntry, error) {
	raw, err := s.GetCurrentArtifact(ctx, instanceID, featureKey)
	if err != nil {
		return nil, err
	}

	// Retrieve full artifact to get the type.
	artifact, err := s.GetCurrentArtifactFull(ctx, instanceID, featureKey)
	if err != nil {
		return nil, err
	}

	yamlBytes, err := jsonToYAML(raw)
	if err != nil {
		return nil, fmt.Errorf("export feature %q: %w", featureKey, err)
	}

	dir := artifactTypeToDirPath(artifact.ArtifactType)
	filename := artifactKeyToFilename(artifact.ArtifactType, featureKey)
	relPath := path.Join(dir, filename)

	return &ExportEntry{
		RelPath:      relPath,
		ArtifactKey:  featureKey,
		ArtifactType: artifact.ArtifactType,
		Content:      string(yamlBytes),
	}, nil
}

// ---------------------------------------------------------------------------
// ExportReport — formatted strategy summary
// ---------------------------------------------------------------------------

// ReportSection is a named section of a strategy report.
type ReportSection struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// StrategyReport is the output of ExportReport.
type StrategyReport struct {
	InstanceID    string          `json:"instance_id"`
	GeneratedAt   string          `json:"generated_at"`
	ArtifactCount int             `json:"artifact_count"`
	Sections      []ReportSection `json:"sections"`
	MarkdownBody  string          `json:"markdown_body"`
}

// ExportReport produces a structured Markdown report of the instance's
// strategic state: artifact inventory, value propositions, and relationship summary.
func (s *Service) ExportReport(ctx context.Context, instanceID uuid.UUID) (*StrategyReport, error) {
	artifacts, err := s.ListCurrentArtifacts(ctx, instanceID, "")
	if err != nil {
		return nil, err
	}

	// Group by type.
	byType := make(map[string]int)
	for _, a := range artifacts {
		byType[a.ArtifactType]++
	}

	// Value propositions.
	valueProps, err := s.GetValuePropositions(ctx, instanceID)
	if err != nil {
		return nil, err
	}

	// Coverage analysis.
	coverage, err := s.GetCoverageAnalysis(ctx, instanceID)
	if err != nil {
		return nil, err
	}

	// Assumptions.
	assumptions, err := s.GetAssumptions(ctx, instanceID)
	if err != nil {
		return nil, err
	}

	var sb strings.Builder

	// Header.
	sb.WriteString(fmt.Sprintf("# Strategy Report\n\n**Instance:** `%s`\n\n", instanceID))

	// Inventory.
	sb.WriteString("## Artifact Inventory\n\n")
	sb.WriteString(fmt.Sprintf("Total artifacts: **%d**\n\n", len(artifacts)))
	for _, atype := range []string{
		"feature", "north_star", "strategy_foundations", "strategy_formula",
		"insight_analyses", "value_model", "roadmap", "assessment_report",
	} {
		if n := byType[atype]; n > 0 {
			sb.WriteString(fmt.Sprintf("- `%s`: %d\n", atype, n))
		}
	}
	// Remaining types not in the ordered list.
	orderedTypes := map[string]bool{
		"feature": true, "north_star": true, "strategy_foundations": true,
		"strategy_formula": true, "insight_analyses": true, "value_model": true,
		"roadmap": true, "assessment_report": true,
	}
	for t, n := range byType {
		if !orderedTypes[t] {
			sb.WriteString(fmt.Sprintf("- `%s`: %d\n", t, n))
		}
	}
	sb.WriteString("\n")

	// Value propositions.
	sb.WriteString("## Value Propositions\n\n")
	if len(valueProps) == 0 {
		sb.WriteString("_No features found._\n\n")
	} else {
		for _, f := range valueProps {
			name := f.ArtifactKey
			if f.Name != nil && *f.Name != "" {
				name = *f.Name
			}
			sb.WriteString(fmt.Sprintf("### %s\n", name))
			if f.Track != nil {
				sb.WriteString(fmt.Sprintf("**Track:** %s  \n", *f.Track))
			}
			sb.WriteString(fmt.Sprintf("**Status:** %s  \n", f.Status))
			if len(f.ContributesTo) > 0 {
				sb.WriteString("**Contributes to:**\n")
				for _, p := range f.ContributesTo {
					sb.WriteString(fmt.Sprintf("- %s\n", p))
				}
			}
			sb.WriteString("\n")
		}
	}

	// Coverage gaps.
	sb.WriteString("## Value Path Coverage\n\n")
	if len(coverage) == 0 {
		sb.WriteString("_No value path relationships found._\n\n")
	} else {
		for _, entry := range coverage {
			sb.WriteString(fmt.Sprintf("- **%s** — covered by %d feature(s): %s\n",
				entry.ValuePath, len(entry.Features), strings.Join(entry.Features, ", ")))
		}
		sb.WriteString("\n")
	}

	// Assumptions.
	sb.WriteString("## Assumptions Under Test\n\n")
	if len(assumptions) == 0 {
		sb.WriteString("_No tested assumptions found._\n\n")
	} else {
		for _, a := range assumptions {
			sb.WriteString(fmt.Sprintf("- **%s** — tested by: %s\n",
				a.AssumptionKey, strings.Join(a.TestedBy, ", ")))
		}
		sb.WriteString("\n")
	}

	// Build sections for structured consumers.
	sections := []ReportSection{
		{"Artifact Inventory", fmt.Sprintf("%d artifacts across %d types", len(artifacts), len(byType))},
		{"Value Propositions", fmt.Sprintf("%d features with value path mappings", len(valueProps))},
		{"Value Path Coverage", fmt.Sprintf("%d value paths covered", len(coverage))},
		{"Assumptions", fmt.Sprintf("%d assumptions under test", len(assumptions))},
	}

	return &StrategyReport{
		InstanceID:    instanceID.String(),
		ArtifactCount: len(artifacts),
		Sections:      sections,
		MarkdownBody:  sb.String(),
	}, nil
}
