// Package template provides template and definition loading for EPF artifacts.
package template

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/schema"
)

// TemplateInfo contains metadata about a loaded template
type TemplateInfo struct {
	ArtifactType schema.ArtifactType `json:"artifact_type"`
	Phase        schema.Phase        `json:"phase"`
	Name         string              `json:"name"`
	Description  string              `json:"description"`
	FilePath     string              `json:"file_path"`
	Content      string              `json:"content"`
	SchemaFile   string              `json:"schema_file"`
	UsageHint    string              `json:"usage_hint"`
}

// templateMapping maps artifact types to template file paths (relative to EPF root)
var templateMapping = map[schema.ArtifactType]struct {
	Path        string
	Phase       schema.Phase
	Name        string
	Description string
	UsageHint   string
}{
	// READY Phase templates
	schema.ArtifactNorthStar: {
		Path:        "templates/READY/00_north_star.yaml",
		Phase:       schema.PhaseREADY,
		Name:        "North Star",
		Description: "Organizational strategic foundation - vision, mission, values, core beliefs",
		UsageHint:   "Fill in all placeholder fields marked with {}. Remove instructional comments when done.",
	},
	schema.ArtifactInsightAnalyses: {
		Path:        "templates/READY/01_insight_analyses.yaml",
		Phase:       schema.PhaseREADY,
		Name:        "Insight Analyses",
		Description: "Foundational analyses - trends, market, technology, user research",
		UsageHint:   "Complete each analysis section with current market data and research findings.",
	},
	schema.ArtifactStrategyFoundations: {
		Path:        "templates/READY/02_strategy_foundations.yaml",
		Phase:       schema.PhaseREADY,
		Name:        "Strategy Foundations",
		Description: "Strategic pillars and principles guiding product decisions",
		UsageHint:   "Define 3-5 strategic pillars that will guide all product decisions.",
	},
	schema.ArtifactInsightOpportunity: {
		Path:        "templates/READY/03_insight_opportunity.yaml",
		Phase:       schema.PhaseREADY,
		Name:        "Insight Opportunity",
		Description: "Opportunities discovered from insights analysis",
		UsageHint:   "Identify and prioritize opportunities that emerge from your insight analyses.",
	},
	schema.ArtifactStrategyFormula: {
		Path:        "templates/READY/04_strategy_formula.yaml",
		Phase:       schema.PhaseREADY,
		Name:        "Strategy Formula",
		Description: "How to compete and win - positioning, business model, moat",
		UsageHint:   "Define your competitive strategy and how you will win in the market.",
	},
	schema.ArtifactRoadmapRecipe: {
		Path:        "templates/READY/05_roadmap_recipe.yaml",
		Phase:       schema.PhaseREADY,
		Name:        "Roadmap Recipe",
		Description: "High-level roadmap structure with OKRs and milestones",
		UsageHint:   "Create quarterly OKRs that advance your strategy.",
	},
	schema.ArtifactProductPortfolio: {
		Path:        "templates/READY/product_portfolio.yaml",
		Phase:       schema.PhaseREADY,
		Name:        "Product Portfolio",
		Description: "Product lines, brands, and offerings",
		UsageHint:   "Define your product portfolio structure and how products relate.",
	},

	// FIRE Phase templates
	schema.ArtifactFeatureDefinition: {
		Path:        "definitions/product/_template/feature_definition_template.yaml",
		Phase:       schema.PhaseFIRE,
		Name:        "Feature Definition",
		Description: "Feature specification - personas, scenarios, capabilities, dependencies",
		UsageHint:   "Use examples from epf_list_definitions('product') to learn quality patterns. Requires exactly 4 personas with 200+ character narratives.",
	},
	schema.ArtifactValueModel: {
		Path:        "templates/FIRE/value_models/product.value_model.yaml",
		Phase:       schema.PhaseFIRE,
		Name:        "Value Model (Product)",
		Description: "Product value model defining value delivery structure",
		UsageHint:   "Build from scratch for your specific product. Use business language, not technical jargon.",
	},
	schema.ArtifactMappings: {
		Path:        "templates/FIRE/mappings.yaml",
		Phase:       schema.PhaseFIRE,
		Name:        "Mappings",
		Description: "Cross-reference mappings between features and strategic context",
		UsageHint:   "Map features to their strategic context and value model contributions.",
	},

	// AIM Phase templates
	schema.ArtifactAssessmentReport: {
		Path:        "templates/AIM/assessment_report.yaml",
		Phase:       schema.PhaseAIM,
		Name:        "Assessment Report",
		Description: "Periodic product/market assessment",
		UsageHint:   "Complete quarterly to assess progress against OKRs and market conditions.",
	},
	schema.ArtifactCalibrationMemo: {
		Path:        "templates/AIM/calibration_memo.yaml",
		Phase:       schema.PhaseAIM,
		Name:        "Calibration Memo",
		Description: "Strategic adjustments documentation",
		UsageHint:   "Document strategic pivots or adjustments with rationale.",
	},
	schema.ArtifactAimTriggerConfig: {
		Path:        "templates/AIM/aim_trigger_config.yaml",
		Phase:       schema.PhaseAIM,
		Name:        "AIM Trigger Config",
		Description: "Configuration for AIM phase triggers and thresholds",
		UsageHint:   "Define when AIM phase assessments should be triggered.",
	},
}

// Additional value model templates
var valueModelTemplates = map[string]struct {
	Path        string
	Name        string
	Description string
}{
	"strategy": {
		Path:        "templates/FIRE/value_models/strategy.value_model.yaml",
		Name:        "Value Model (Strategy)",
		Description: "Strategy track value model - canonical for all organizations",
	},
	"org_ops": {
		Path:        "templates/FIRE/value_models/org_ops.value_model.yaml",
		Name:        "Value Model (OrgOps)",
		Description: "OrgOps track value model - canonical for all organizations",
	},
	"commercial": {
		Path:        "templates/FIRE/value_models/commercial.value_model.yaml",
		Name:        "Value Model (Commercial)",
		Description: "Commercial track value model - canonical for all organizations",
	},
}

// Loader loads and manages EPF templates
type Loader struct {
	epfRoot    string
	templates  map[schema.ArtifactType]*TemplateInfo
	isEmbedded bool
}

// NewLoader creates a new template loader
func NewLoader(epfRoot string) *Loader {
	return &Loader{
		epfRoot:    epfRoot,
		templates:  make(map[schema.ArtifactType]*TemplateInfo),
		isEmbedded: false,
	}
}

// NewEmbeddedLoader creates a template loader that uses embedded templates
func NewEmbeddedLoader() *Loader {
	return &Loader{
		epfRoot:    "",
		templates:  make(map[schema.ArtifactType]*TemplateInfo),
		isEmbedded: true,
	}
}

// IsEmbedded returns true if using embedded templates
func (l *Loader) IsEmbedded() bool {
	return l.isEmbedded
}

// Source returns the source of the templates (filesystem path or "embedded")
func (l *Loader) Source() string {
	if l.isEmbedded {
		return "embedded"
	}
	return l.epfRoot
}

// Load loads all templates from the EPF directory or embedded assets
func (l *Loader) Load() error {
	// If we're an embedded loader, load directly from embedded
	if l.isEmbedded {
		return l.loadFromEmbedded()
	}

	// Try filesystem first
	for artifactType, mapping := range templateMapping {
		templatePath := filepath.Join(l.epfRoot, mapping.Path)

		// Read template file
		content, err := os.ReadFile(templatePath)
		if err != nil {
			// Template doesn't exist - skip (some may be optional)
			continue
		}

		l.templates[artifactType] = &TemplateInfo{
			ArtifactType: artifactType,
			Phase:        mapping.Phase,
			Name:         mapping.Name,
			Description:  mapping.Description,
			FilePath:     mapping.Path,
			Content:      string(content),
			SchemaFile:   schema.SchemaFilename(artifactType),
			UsageHint:    mapping.UsageHint,
		}
	}

	if len(l.templates) == 0 {
		// Fall back to embedded templates
		if embedded.HasEmbeddedArtifacts() {
			l.isEmbedded = true
			return l.loadFromEmbedded()
		}
		return fmt.Errorf("no templates loaded from %s", l.epfRoot)
	}

	return nil
}

// loadFromEmbedded loads templates from embedded assets
func (l *Loader) loadFromEmbedded() error {
	for artifactType, mapping := range templateMapping {
		// Embedded paths are relative to templates/ directory
		// e.g., "templates/READY/00_north_star.yaml" -> "READY/00_north_star.yaml"
		embeddedPath := strings.TrimPrefix(mapping.Path, "templates/")

		// Read from embedded
		content, err := embedded.GetTemplate(embeddedPath)
		if err != nil {
			// Template doesn't exist in embedded - skip
			continue
		}

		l.templates[artifactType] = &TemplateInfo{
			ArtifactType: artifactType,
			Phase:        mapping.Phase,
			Name:         mapping.Name,
			Description:  mapping.Description,
			FilePath:     mapping.Path,
			Content:      string(content),
			SchemaFile:   schema.SchemaFilename(artifactType),
			UsageHint:    mapping.UsageHint,
		}
	}

	if len(l.templates) == 0 {
		return fmt.Errorf("no templates loaded from embedded assets")
	}

	return nil
}

// GetTemplate returns the template for an artifact type
func (l *Loader) GetTemplate(artifactType schema.ArtifactType) (*TemplateInfo, error) {
	template, ok := l.templates[artifactType]
	if !ok {
		return nil, fmt.Errorf("template not found for artifact type: %s", artifactType)
	}
	return template, nil
}

// GetTemplateByName returns the template by name (case-insensitive)
func (l *Loader) GetTemplateByName(name string) (*TemplateInfo, error) {
	// First try direct artifact type conversion
	artifactType, err := schema.ArtifactTypeFromString(name)
	if err == nil {
		return l.GetTemplate(artifactType)
	}

	// Try matching by name
	normalized := strings.ToLower(name)
	for _, template := range l.templates {
		if strings.ToLower(template.Name) == normalized ||
			strings.ToLower(string(template.ArtifactType)) == normalized {
			return template, nil
		}
	}

	return nil, fmt.Errorf("template not found: %s", name)
}

// ListTemplates returns all loaded templates
func (l *Loader) ListTemplates() []*TemplateInfo {
	result := make([]*TemplateInfo, 0, len(l.templates))
	for _, template := range l.templates {
		result = append(result, template)
	}
	return result
}

// ListTemplatesByPhase returns templates for a specific phase
func (l *Loader) ListTemplatesByPhase(phase schema.Phase) []*TemplateInfo {
	var result []*TemplateInfo
	for _, template := range l.templates {
		if template.Phase == phase {
			result = append(result, template)
		}
	}
	return result
}

// GetValueModelTemplate returns a specific value model template by track
func (l *Loader) GetValueModelTemplate(track string) (*TemplateInfo, error) {
	mapping, ok := valueModelTemplates[strings.ToLower(track)]
	if !ok {
		// Default to product value model
		return l.GetTemplate(schema.ArtifactValueModel)
	}

	templatePath := filepath.Join(l.epfRoot, mapping.Path)
	content, err := os.ReadFile(templatePath)
	if err != nil {
		return nil, fmt.Errorf("could not read value model template for track %s: %w", track, err)
	}

	return &TemplateInfo{
		ArtifactType: schema.ArtifactValueModel,
		Phase:        schema.PhaseFIRE,
		Name:         mapping.Name,
		Description:  mapping.Description,
		FilePath:     mapping.Path,
		Content:      string(content),
		SchemaFile:   schema.SchemaFilename(schema.ArtifactValueModel),
		UsageHint:    "Canonical value model - adopt directly or customize for your organization.",
	}, nil
}

// HasTemplate returns true if a template exists for the artifact type
func (l *Loader) HasTemplate(artifactType schema.ArtifactType) bool {
	_, ok := l.templates[artifactType]
	return ok
}

// TemplateCount returns the number of loaded templates
func (l *Loader) TemplateCount() int {
	return len(l.templates)
}
