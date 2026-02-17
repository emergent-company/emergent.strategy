// Package mcp provides the MCP (Model Context Protocol) server implementation.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/anchor"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/checks"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/discovery"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/fixplan"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/generator"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/migration"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/relationships"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/template"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/wizard"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"gopkg.in/yaml.v3"
)

const (
	ServerName = "epf-cli"
)

// Server wraps the MCP server with EPF-specific functionality
type Server struct {
	mcpServer        *server.MCPServer
	validator        *validator.Validator
	schemasDir       string
	epfRoot          string
	templateLoader   *template.Loader
	definitionLoader *template.DefinitionLoader
	wizardLoader     *wizard.Loader
	generatorLoader  *generator.Loader

	// Relationship analyzer cache (by instance path)
	analyzerMu sync.RWMutex
	analyzers  map[string]*relationships.Analyzer
}

// NewServer creates a new EPF MCP server
func NewServer(schemasDir string) (*Server, error) {
	val, err := validator.NewValidator(schemasDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create validator: %w", err)
	}

	// Determine if we're using embedded mode (no filesystem schemasDir)
	useEmbedded := schemasDir == "" || val.GetLoader().IsEmbedded()

	// EPF root is the parent of schemas directory (schemas/ is under EPF root)
	// When using embedded mode, this will be empty but loaders handle that
	var epfRoot string
	if !useEmbedded {
		epfRoot = filepath.Dir(schemasDir)
	}

	// Create template loader - use embedded if no filesystem
	var templateLoader *template.Loader
	if useEmbedded {
		templateLoader = template.NewEmbeddedLoader()
	} else {
		templateLoader = template.NewLoader(epfRoot)
	}
	if err := templateLoader.Load(); err != nil {
		// Templates are optional - log but don't fail
		// Some deployments may not have templates
	}

	// Create definition loader - definitions are filesystem only, skip in embedded mode
	var definitionLoader *template.DefinitionLoader
	if !useEmbedded {
		definitionLoader = template.NewDefinitionLoader(epfRoot)
		if err := definitionLoader.Load(); err != nil {
			// Definitions are optional - log but don't fail
		}
	}

	// Create wizard loader - use embedded if no filesystem
	var wizardLoader *wizard.Loader
	if useEmbedded {
		wizardLoader = wizard.NewEmbeddedLoader()
	} else {
		wizardLoader = wizard.NewLoader(epfRoot)
	}
	if err := wizardLoader.Load(); err != nil {
		// Wizards are optional - log but don't fail
	}

	// Create generator loader - use embedded if no filesystem
	var generatorLoader *generator.Loader
	if useEmbedded {
		generatorLoader = generator.NewEmbeddedLoader()
	} else {
		generatorLoader = generator.NewLoader(epfRoot)
	}
	if err := generatorLoader.Load(); err != nil {
		// Generators are optional - log but don't fail
	}

	// Create MCP server
	mcpServer := server.NewMCPServer(
		ServerName,
		version.Version,
		server.WithLogging(),
	)

	s := &Server{
		mcpServer:        mcpServer,
		validator:        val,
		schemasDir:       schemasDir,
		epfRoot:          epfRoot,
		templateLoader:   templateLoader,
		definitionLoader: definitionLoader,
		wizardLoader:     wizardLoader,
		generatorLoader:  generatorLoader,
		analyzers:        make(map[string]*relationships.Analyzer),
	}

	// Register tools
	s.registerTools()

	return s, nil
}

// registerTools registers all EPF MCP tools
func (s *Server) registerTools() {
	// Tool: epf_list_schemas
	s.mcpServer.AddTool(
		mcp.NewTool("epf_list_schemas",
			mcp.WithDescription("List all available EPF schemas with their artifact types, phases, and descriptions. Use this to discover what schemas are available for validation."),
		),
		s.handleListSchemas,
	)

	// Tool: epf_get_schema
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_schema",
			mcp.WithDescription("Get the JSON Schema for a specific EPF artifact type. Use this to understand the structure and validation rules for EPF YAML files."),
			mcp.WithString("artifact_type",
				mcp.Required(),
				mcp.Description("The artifact type to get the schema for (e.g., 'north_star', 'feature_definition', 'value_model'). Use epf_list_schemas to see all available types."),
			),
		),
		s.handleGetSchema,
	)

	// Tool: epf_validate_file
	s.mcpServer.AddTool(
		mcp.NewTool("epf_validate_file",
			mcp.WithDescription("Validate a local EPF YAML file against its schema. Automatically detects the artifact type from the filename/path pattern. "+
				"Use ai_friendly=true for structured output optimized for AI agents with error classification, priorities, and fix hints."),
			mcp.WithString("path",
				mcp.Required(),
				mcp.Description("The path to the YAML file to validate"),
			),
			mcp.WithString("ai_friendly",
				mcp.Description("Return AI-friendly structured output with error classification and fix hints (true/false, default: false)"),
			),
		),
		s.handleValidateFile,
	)

	// Tool: epf_validate_content
	s.mcpServer.AddTool(
		mcp.NewTool("epf_validate_content",
			mcp.WithDescription("Validate YAML content directly against an EPF schema without writing to a file."),
			mcp.WithString("content",
				mcp.Required(),
				mcp.Description("The YAML content to validate"),
			),
			mcp.WithString("artifact_type",
				mcp.Required(),
				mcp.Description("The artifact type to validate against (e.g., 'north_star', 'feature_definition')"),
			),
		),
		s.handleValidateContent,
	)

	// ==========================================================================
	// AI Agent Validation Tools (v0.11.0)
	// ==========================================================================

	// Tool: epf_validate_with_plan
	s.mcpServer.AddTool(
		mcp.NewTool("epf_validate_with_plan",
			mcp.WithDescription("Validate a file and return a chunked fix plan for AI agents. "+
				"The fix plan groups errors into manageable chunks with priorities and fix strategies. "+
				"IMPORTANT: For substantial work (16+ errors), the response includes workflow_guidance with planning recommendations. "+
				"Before processing chunks, check what planning tools you have available (todo lists, task trackers, "+
				"openspec/, .plan/, etc.) and consider creating a plan to track progress across chunks."),
			mcp.WithString("path",
				mcp.Required(),
				mcp.Description("The path to the YAML file to validate"),
			),
		),
		s.handleValidateWithPlan,
	)

	// Tool: epf_validate_section
	s.mcpServer.AddTool(
		mcp.NewTool("epf_validate_section",
			mcp.WithDescription("Validate a specific section of a YAML file. "+
				"Use this for incremental validation when fixing a file section by section. "+
				"Returns AI-friendly output with errors scoped to the specified section."),
			mcp.WithString("path",
				mcp.Required(),
				mcp.Description("The path to the YAML file to validate"),
			),
			mcp.WithString("section",
				mcp.Required(),
				mcp.Description("The section path to validate (e.g., 'target_users', 'key_insights', 'competitive_landscape.direct_competitors')"),
			),
		),
		s.handleValidateSection,
	)

	// Tool: epf_get_section_example
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_section_example",
			mcp.WithDescription("Get a template example for a specific section of an artifact type. "+
				"Returns the corresponding section from the canonical template, showing the expected structure and example values. "+
				"Useful when fixing validation errors to see what the section should look like."),
			mcp.WithString("artifact_type",
				mcp.Required(),
				mcp.Description("The artifact type (e.g., 'insight_analyses', 'feature_definition')"),
			),
			mcp.WithString("section",
				mcp.Required(),
				mcp.Description("The section path to extract (e.g., 'target_users', 'key_insights')"),
			),
		),
		s.handleGetSectionExample,
	)

	// Tool: epf_detect_artifact_type
	s.mcpServer.AddTool(
		mcp.NewTool("epf_detect_artifact_type",
			mcp.WithDescription("Detect the EPF artifact type from a file path based on naming conventions."),
			mcp.WithString("path",
				mcp.Required(),
				mcp.Description("The file path to analyze"),
			),
		),
		s.handleDetectArtifactType,
	)

	// Tool: epf_get_phase_artifacts
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_phase_artifacts",
			mcp.WithDescription("Get all artifact types for a specific EPF phase (READY, FIRE, or AIM)."),
			mcp.WithString("phase",
				mcp.Required(),
				mcp.Description("The phase to get artifacts for: READY, FIRE, or AIM"),
			),
		),
		s.handleGetPhaseArtifacts,
	)

	// Tool: epf_health_check
	s.mcpServer.AddTool(
		mcp.NewTool("epf_health_check",
			mcp.WithDescription("Run a comprehensive health check on an EPF instance. "+
				"RECOMMENDED FIRST STEP: Always run health check before starting work to assess scope. "+
				"Returns structure validation, schema validation, content readiness, and workflow guidance. "+
				"If significant issues are found, the response includes planning recommendations - "+
				"check your available planning tools (todo lists, task trackers, openspec/, etc.) before diving into fixes."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory (contains READY/, FIRE/, AIM/ directories)"),
			),
		),
		s.handleHealthCheck,
	)

	// Tool: epf_check_instance
	s.mcpServer.AddTool(
		mcp.NewTool("epf_check_instance",
			mcp.WithDescription("Check the structure of an EPF instance (READY/FIRE/AIM directories, required files)."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleCheckInstance,
	)

	// Tool: epf_check_content_readiness
	s.mcpServer.AddTool(
		mcp.NewTool("epf_check_content_readiness",
			mcp.WithDescription("Check for placeholder content (TBD, TODO, [placeholder], etc.) in EPF artifacts."),
			mcp.WithString("path",
				mcp.Required(),
				mcp.Description("Path to check (file or directory)"),
			),
		),
		s.handleCheckContentReadiness,
	)

	// Tool: epf_check_feature_quality
	s.mcpServer.AddTool(
		mcp.NewTool("epf_check_feature_quality",
			mcp.WithDescription("Validate feature definition quality (personas, scenarios, narratives)."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleCheckFeatureQuality,
	)

	// Tool: epf_list_artifacts
	s.mcpServer.AddTool(
		mcp.NewTool("epf_list_artifacts",
			mcp.WithDescription("List all EPF artifact types with metadata including templates, schemas, and phase information. Use this to discover what artifacts you can create and which have templates available."),
			mcp.WithString("phase",
				mcp.Description("Optional: Filter artifacts by phase (READY, FIRE, or AIM)"),
			),
		),
		s.handleListArtifacts,
	)

	// Tool: epf_get_template
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_template",
			mcp.WithDescription("Get the starting template YAML for an EPF artifact type. Templates provide the structure to fill in when creating new artifacts."),
			mcp.WithString("artifact_type",
				mcp.Required(),
				mcp.Description("The artifact type to get the template for (e.g., 'north_star', 'feature_definition', 'value_model')"),
			),
		),
		s.handleGetTemplate,
	)

	// Tool: epf_list_definitions
	s.mcpServer.AddTool(
		mcp.NewTool("epf_list_definitions",
			mcp.WithDescription("List EPF track definitions. Product track definitions are EXAMPLES to learn from. Strategy, OrgOps, and Commercial track definitions are CANONICAL and should be adopted directly."),
			mcp.WithString("track",
				mcp.Description("Optional: Filter by track (product, strategy, org_ops, commercial)"),
			),
			mcp.WithString("category",
				mcp.Description("Optional: Filter by category within a track"),
			),
		),
		s.handleListDefinitions,
	)

	// Tool: epf_get_definition
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_definition",
			mcp.WithDescription("Get a specific EPF definition by ID. Returns the full YAML content with usage guidance based on whether it's an example or canonical definition."),
			mcp.WithString("id",
				mcp.Required(),
				mcp.Description("The definition ID (e.g., 'fd-001' for product, 'pd-005' for org_ops, 'sd-001' for strategy)"),
			),
		),
		s.handleGetDefinition,
	)

	// ==========================================================================
	// Relationship Intelligence Tools
	// ==========================================================================

	// Tool: epf_explain_value_path
	s.mcpServer.AddTool(
		mcp.NewTool("epf_explain_value_path",
			mcp.WithDescription("Explain what a value model path means. Returns layer info, component details, maturity, contributing features, and targeting KRs. Use this to understand any value model path reference."),
			mcp.WithString("path",
				mcp.Required(),
				mcp.Description("The value model path to explain (e.g., 'Product.Discovery.KnowledgeExploration', 'Strategy.Growth.MarketExpansion')"),
			),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory (contains READY/, FIRE/, AIM/ directories)"),
			),
		),
		s.handleExplainValuePath,
	)

	// Tool: epf_get_strategic_context
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_strategic_context",
			mcp.WithDescription("Get the strategic context for a feature. Returns the feature's value model contributions (resolved), related KRs, and dependency relationships. Use this to understand how a feature connects to strategy."),
			mcp.WithString("feature_id",
				mcp.Required(),
				mcp.Description("The feature ID or slug (e.g., 'fd-001', 'knowledge-exploration')"),
			),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleGetStrategicContext,
	)

	// Tool: epf_analyze_coverage
	s.mcpServer.AddTool(
		mcp.NewTool("epf_analyze_coverage",
			mcp.WithDescription("Analyze feature coverage of the value model. Shows which L2 components have features contributing to them and identifies gaps. Use this to find strategic blind spots."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("track",
				mcp.Description("Optional: Filter to a specific track (Product, Strategy, OrgOps, Commercial). Omit for all tracks."),
			),
		),
		s.handleAnalyzeCoverage,
	)

	// Tool: epf_validate_relationships
	s.mcpServer.AddTool(
		mcp.NewTool("epf_validate_relationships",
			mcp.WithDescription("Validate all relationship paths in features and KRs against the value model. Returns detailed errors with 'did you mean' suggestions for invalid paths."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleValidateRelationships,
	)

	// ==========================================================================
	// Migration Intelligence Tools
	// ==========================================================================

	// Tool: epf_get_migration_guide
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_migration_guide",
			mcp.WithDescription("Generate a migration guide for an EPF instance. Shows what files need updates, schema validation errors, and specific changes required to bring files up to the current schema version."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("file_path",
				mcp.Description("Optional: Generate guide for a specific file only"),
			),
		),
		s.handleGetMigrationGuide,
	)

	// Tool: epf_check_migration_status
	s.mcpServer.AddTool(
		mcp.NewTool("epf_check_migration_status",
			mcp.WithDescription("Quick check of migration status for an EPF instance. Returns whether migration is needed, file counts, and version information."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleCheckMigrationStatus,
	)

	// ==========================================================================
	// Wizard Tools
	// ==========================================================================

	// Tool: epf_list_wizards
	s.mcpServer.AddTool(
		mcp.NewTool("epf_list_wizards",
			mcp.WithDescription("List available EPF wizards and agent prompts. Wizards guide users through EPF workflows like creating features, planning roadmaps, and running assessments."),
			mcp.WithString("phase",
				mcp.Description("Optional: Filter by phase (READY, FIRE, AIM)"),
			),
			mcp.WithString("type",
				mcp.Description("Optional: Filter by type (agent_prompt, wizard, ready_sub_wizard)"),
			),
		),
		s.handleListWizards,
	)

	// Tool: epf_get_wizard
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_wizard",
			mcp.WithDescription("Get the full content and metadata for an EPF wizard. Use this to retrieve wizard instructions for guiding users through EPF workflows."),
			mcp.WithString("name",
				mcp.Required(),
				mcp.Description("The wizard name (e.g., 'start_epf', 'pathfinder', 'feature_definition')"),
			),
		),
		s.handleGetWizard,
	)

	// Tool: epf_get_wizard_for_task
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_wizard_for_task",
			mcp.WithDescription("Recommend the best wizard for a user's task. Analyzes the task description and suggests the most appropriate wizard with alternatives."),
			mcp.WithString("task",
				mcp.Required(),
				mcp.Description("Description of what the user wants to do (e.g., 'create a feature definition', 'analyze market trends')"),
			),
		),
		s.handleGetWizardForTask,
	)

	// Tool: epf_list_agent_instructions
	s.mcpServer.AddTool(
		mcp.NewTool("epf_list_agent_instructions",
			mcp.WithDescription("List EPF agent instruction files. These provide AI agents with guidance for working with EPF."),
		),
		s.handleListAgentInstructions,
	)

	// Tool: epf_get_agent_instructions
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_agent_instructions",
			mcp.WithDescription("Get the full content of an EPF agent instructions file. Use this to retrieve comprehensive guidance for AI agents."),
			mcp.WithString("name",
				mcp.Required(),
				mcp.Description("The instruction file name (e.g., 'AGENTS.md', 'copilot-instructions.md')"),
			),
		),
		s.handleGetAgentInstructions,
	)

	// ==========================================================================
	// Generator Tools
	// ==========================================================================

	// Tool: epf_list_generators
	s.mcpServer.AddTool(
		mcp.NewTool("epf_list_generators",
			mcp.WithDescription("List available EPF output generators. Generators create documents from EPF data (investor memos, compliance docs, context sheets, etc.)"),
			mcp.WithString("category",
				mcp.Description("Optional: Filter by category (compliance, marketing, investor, internal, development, custom)"),
			),
			mcp.WithString("source",
				mcp.Description("Optional: Filter by source (instance, framework, global)"),
			),
		),
		s.handleListGenerators,
	)

	// Tool: epf_get_generator
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_generator",
			mcp.WithDescription("Get full details of an EPF output generator including wizard instructions. Use this to understand how to generate a specific output type."),
			mcp.WithString("name",
				mcp.Required(),
				mcp.Description("The generator name (e.g., 'context-sheet', 'investor-memo', 'skattefunn-application')"),
			),
			mcp.WithString("include_wizard",
				mcp.Description("Include wizard instructions in response (default: true)"),
			),
			mcp.WithString("include_schema",
				mcp.Description("Include output schema in response (default: false)"),
			),
		),
		s.handleGetGenerator,
	)

	// Tool: epf_check_generator_prereqs
	s.mcpServer.AddTool(
		mcp.NewTool("epf_check_generator_prereqs",
			mcp.WithDescription("Check if an EPF instance has the required artifacts to run a generator."),
			mcp.WithString("name",
				mcp.Required(),
				mcp.Description("The generator name to check prerequisites for"),
			),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleCheckGeneratorPrereqs,
	)

	// Tool: epf_scaffold_generator
	s.mcpServer.AddTool(
		mcp.NewTool("epf_scaffold_generator",
			mcp.WithDescription("Create a new EPF output generator with all required files in the product instance. Use this to help users create custom generators for their specific output needs. Generators are created in the instance's generators/ directory."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance (e.g., 'docs/EPF/_instances/my-product')"),
			),
			mcp.WithString("name",
				mcp.Required(),
				mcp.Description("Generator name (lowercase with hyphens, e.g., 'pitch-deck', 'seis-application')"),
			),
			mcp.WithString("description",
				mcp.Description("Description of what the generator creates"),
			),
			mcp.WithString("category",
				mcp.Description("Generator category: compliance, marketing, investor, internal, development, custom (default: custom)"),
			),
			mcp.WithString("author",
				mcp.Description("Generator author (default: Custom)"),
			),
			mcp.WithString("output_dir",
				mcp.Description("Directory to create the generator in (default: {instance_path}/generators/)"),
			),
			mcp.WithString("output_format",
				mcp.Description("Output format: markdown, json, yaml, html, text (default: markdown)"),
			),
			mcp.WithString("required_artifacts",
				mcp.Description("Comma-separated EPF artifacts required (e.g., 'north_star,strategy_formula')"),
			),
			mcp.WithString("optional_artifacts",
				mcp.Description("Comma-separated optional EPF artifacts"),
			),
			mcp.WithString("regions",
				mcp.Description("Comma-separated region codes for compliance generators (e.g., 'NO,GB')"),
			),
		),
		s.handleScaffoldGenerator,
	)

	// Tool: epf_validate_generator_output
	s.mcpServer.AddTool(
		mcp.NewTool("epf_validate_generator_output",
			mcp.WithDescription("Validate generator output against its schema and optional bash validator. Use this to check if generated content conforms to the expected format."),
			mcp.WithString("generator",
				mcp.Required(),
				mcp.Description("Generator name (e.g., 'context-sheet', 'investor-memo')"),
			),
			mcp.WithString("content",
				mcp.Description("Content to validate (provide either content or file_path)"),
			),
			mcp.WithString("file_path",
				mcp.Description("Path to file containing content to validate"),
			),
			mcp.WithString("run_bash_validator",
				mcp.Description("Run the generator's bash validator if available (true/false, default: false)"),
			),
		),
		s.handleValidateGeneratorOutput,
	)

	// ==========================================================================
	// Relationship Maintenance Tools
	// ==========================================================================

	// Tool: epf_add_implementation_reference
	s.mcpServer.AddTool(
		mcp.NewTool("epf_add_implementation_reference",
			mcp.WithDescription("Add or update an implementation reference (spec, issue, PR, code) to a feature definition. Use this after implementing a feature to link it to its implementation artifacts."),
			mcp.WithString("feature_id",
				mcp.Required(),
				mcp.Description("Feature ID or slug (e.g., 'fd-012', 'epf-cli-local-development')"),
			),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("ref_type",
				mcp.Required(),
				mcp.Description("Reference type: 'spec', 'issue', 'pr', 'code', 'documentation', 'test'"),
			),
			mcp.WithString("title",
				mcp.Required(),
				mcp.Description("Human-readable title for the reference"),
			),
			mcp.WithString("url",
				mcp.Required(),
				mcp.Description("URL to the implementation artifact"),
			),
			mcp.WithString("status",
				mcp.Description("Reference status: 'current', 'deprecated', 'superseded' (default: 'current')"),
			),
			mcp.WithString("description",
				mcp.Description("Optional description of the reference"),
			),
		),
		s.handleAddImplementationReference,
	)

	// Tool: epf_update_capability_maturity
	s.mcpServer.AddTool(
		mcp.NewTool("epf_update_capability_maturity",
			mcp.WithDescription("Update the maturity level of a capability in a feature definition. Use this after completing a KR or milestone that advances a capability."),
			mcp.WithString("feature_id",
				mcp.Required(),
				mcp.Description("Feature ID or slug (e.g., 'fd-012', 'epf-cli-local-development')"),
			),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("capability_id",
				mcp.Required(),
				mcp.Description("The capability ID within the feature (e.g., 'cap-schema-validation')"),
			),
			mcp.WithString("maturity",
				mcp.Required(),
				mcp.Description("Maturity level: 'hypothetical', 'emerging', 'proven', 'scaled'"),
			),
			mcp.WithString("evidence",
				mcp.Required(),
				mcp.Description("Evidence supporting the maturity claim (e.g., 'Validates 27/27 files in production instance')"),
			),
			mcp.WithString("delivered_by_kr",
				mcp.Description("Optional KR ID that delivered this capability (e.g., 'kr-p-2025-q1-001')"),
			),
		),
		s.handleUpdateCapabilityMaturity,
	)

	// Tool: epf_add_mapping_artifact
	s.mcpServer.AddTool(
		mcp.NewTool("epf_add_mapping_artifact",
			mcp.WithDescription("Add a new artifact to mappings.yaml for a value model path. Use this after creating code, documentation, or tests that implement a value model component."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("sub_component_id",
				mcp.Required(),
				mcp.Description("Value model path (e.g., 'Product.Graph.EntityExtraction', 'Product.LocalTools.EPFCLIValidation')"),
			),
			mcp.WithString("artifact_type",
				mcp.Required(),
				mcp.Description("Artifact type: 'code', 'design', 'documentation', 'test'"),
			),
			mcp.WithString("url",
				mcp.Required(),
				mcp.Description("URL to the artifact (e.g., GitHub file/directory URL)"),
			),
			mcp.WithString("description",
				mcp.Required(),
				mcp.Description("Brief description of the artifact"),
			),
		),
		s.handleAddMappingArtifact,
	)

	// Tool: epf_suggest_relationships
	s.mcpServer.AddTool(
		mcp.NewTool("epf_suggest_relationships",
			mcp.WithDescription("Analyze an artifact and suggest relationships it should have. Use this to discover missing contributes_to paths, implementation references, or mappings."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("artifact_type",
				mcp.Required(),
				mcp.Description("Type of artifact to analyze: 'feature', 'code_file', 'pr'"),
			),
			mcp.WithString("artifact_path",
				mcp.Required(),
				mcp.Description("Path to the artifact (file path for feature/code_file, URL for pr)"),
			),
			mcp.WithString("include_code_analysis",
				mcp.Description("Analyze imports/dependencies for code files (true/false, default: false)"),
			),
		),
		s.handleSuggestRelationships,
	)

	// ==========================================================================
	// AI Agent Discovery Tools (v0.13.0)
	// ==========================================================================

	// Tool: epf_agent_instructions
	s.mcpServer.AddTool(
		mcp.NewTool("epf_agent_instructions",
			mcp.WithDescription("Get comprehensive AI agent instructions for working with EPF. "+
				"Returns epf-cli authority declaration, discovery status, key commands, MCP tools, "+
				"and workflow guidance. AI agents should call this first when entering an EPF context."),
			mcp.WithString("path",
				mcp.Description("Optional path to check for EPF instance (defaults to current directory)"),
			),
		),
		s.handleAgentInstructions,
	)

	// Tool: epf_locate_instance
	s.mcpServer.AddTool(
		mcp.NewTool("epf_locate_instance",
			mcp.WithDescription("Find EPF instances in a directory tree with confidence scoring. "+
				"Returns instances grouped by status (valid, legacy, broken) with suggestions for fixing issues. "+
				"Use require_anchor=true to only return instances with anchor files (_epf.yaml)."),
			mcp.WithString("path",
				mcp.Description("Starting path to search (defaults to current directory)"),
			),
			mcp.WithString("max_depth",
				mcp.Description("Maximum directory depth to search (default: 5)"),
			),
			mcp.WithString("require_anchor",
				mcp.Description("Only return instances with anchor files (true/false, default: false)"),
			),
		),
		s.handleLocateInstance,
	)

	// ==========================================================================
	// Instance Management Tools (v0.14.0)
	// ==========================================================================

	// Tool: epf_init_instance
	s.mcpServer.AddTool(
		mcp.NewTool("epf_init_instance",
			mcp.WithDescription("Initialize a new EPF instance with the recommended directory structure. "+
				"Creates READY/FIRE/AIM directories, anchor file (_epf.yaml), and optional template files. "+
				"Use dry_run=true to preview what would be created without making changes."),
			mcp.WithString("path",
				mcp.Required(),
				mcp.Description("Path where the EPF instance should be created"),
			),
			mcp.WithString("product_name",
				mcp.Required(),
				mcp.Description("Name of the product (used in _epf.yaml and _meta.yaml)"),
			),
			mcp.WithString("epf_version",
				mcp.Description("EPF framework version (default: 2.0.0)"),
			),
			mcp.WithString("structure_type",
				mcp.Description("Directory structure type: 'phased' (READY/FIRE/AIM) or 'flat' (default: phased)"),
			),
			mcp.WithString("dry_run",
				mcp.Description("Preview changes without creating files (true/false, default: false)"),
			),
			mcp.WithString("force",
				mcp.Description("Overwrite existing files if present (true/false, default: false)"),
			),
			mcp.WithString("mode",
				mcp.Description("Instance mode: 'integrated' (default, creates docs/EPF/ wrapper) or 'standalone' (instance at path directly)"),
			),
		),
		s.handleInitInstance,
	)

	// Tool: epf_fix_file
	s.mcpServer.AddTool(
		mcp.NewTool("epf_fix_file",
			mcp.WithDescription("Auto-fix common issues in EPF YAML files. "+
				"Can fix whitespace, line endings, tabs, trailing newlines, and add missing meta.epf_version. "+
				"Use dry_run=true to preview changes without modifying files."),
			mcp.WithString("path",
				mcp.Required(),
				mcp.Description("Path to the YAML file or directory to fix"),
			),
			mcp.WithString("fix_types",
				mcp.Description("Comma-separated list of fix types to apply: whitespace, line_endings, tabs, newlines, versions, all (default: all)"),
			),
			mcp.WithString("dry_run",
				mcp.Description("Preview changes without modifying files (true/false, default: false)"),
			),
		),
		s.handleFixFile,
	)

	// ==========================================================================
	// AIM Tools (v0.14.0)
	// ==========================================================================

	// Tool: epf_aim_bootstrap
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_bootstrap",
			mcp.WithDescription("Create a Living Reality Assessment (LRA) non-interactively. "+
				"The LRA is the foundational baseline that captures organizational context, track maturity, and current focus. "+
				"All AIM tools require an LRA to exist. Use force=true to overwrite an existing LRA."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
			),
			mcp.WithString("organization_type",
				mcp.Description("Organization type: solo_founder, cofounding_team, bootstrapped_startup, funded_startup, corporate_spinout, enterprise_division, agency_project, open_source"),
			),
			mcp.WithString("funding_stage",
				mcp.Description("Funding stage: bootstrapped, pre_seed, seed, series_a, series_b_plus, profitable, enterprise_budget"),
			),
			mcp.WithString("team_size",
				mcp.Description("Number of team members (integer as string)"),
			),
			mcp.WithString("product_stage",
				mcp.Description("Product stage: idea, prototype, mvp, growth, mature (used to infer code_assets maturity)"),
			),
			mcp.WithString("primary_bottleneck",
				mcp.Description("Primary bottleneck: execution_capacity, strategic_clarity, market_validation, funding, hiring, technical_capability, attention_bandwidth"),
			),
			mcp.WithString("ai_capability_level",
				mcp.Description("AI capability level: manual_only, ai_assisted, ai_first, agentic"),
			),
			mcp.WithString("runway_months",
				mcp.Description("Runway in months (integer as string, optional)"),
			),
			mcp.WithString("primary_objective",
				mcp.Description("Primary objective for current focus (free text)"),
			),
			mcp.WithString("force",
				mcp.Description("Overwrite existing LRA (true/false, default: false)"),
			),
		),
		s.handleAimBootstrap,
	)

	// Tool: epf_aim_status
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_status",
			mcp.WithDescription("Get comprehensive status of the Living Reality Assessment (LRA). "+
				"Shows lifecycle stage, adoption level, organizational context, track maturity baselines, current focus, and warnings."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
			),
		),
		s.handleAimStatus,
	)

	// Tool: epf_aim_assess
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_assess",
			mcp.WithDescription("Generate an assessment report template from roadmap data. "+
				"Pre-populates OKRs, Key Results, and assumptions from the roadmap for evaluation. "+
				"Returns YAML template with TODO placeholders to fill in."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
			),
			mcp.WithString("roadmap_id",
				mcp.Description("Roadmap ID to assess (optional, uses ID from roadmap file if not provided)"),
			),
		),
		s.handleAimAssess,
	)

	// Tool: epf_aim_validate_assumptions
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_validate_assumptions",
			mcp.WithDescription("Check assumption validation status from assessment reports. "+
				"Cross-references assumptions from roadmap with evidence from assessment reports. "+
				"Returns counts of validated, invalidated, inconclusive, and pending assumptions."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
			),
			mcp.WithString("verbose",
				mcp.Description("Include evidence details (true/false, default: false)"),
			),
		),
		s.handleAimValidateAssumptions,
	)

	// Tool: epf_aim_okr_progress
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_okr_progress",
			mcp.WithDescription("Calculate OKR and Key Result achievement rates from assessments. "+
				"Analyzes assessment reports to compute achievement rates (exceeded+met/total). "+
				"Can filter by track and cycle, and show trends across all cycles."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
			),
			mcp.WithString("track",
				mcp.Description("Filter by track: product, strategy, org_ops, commercial"),
			),
			mcp.WithString("cycle",
				mcp.Description("Filter by cycle number (integer as string)"),
			),
			mcp.WithString("all_cycles",
				mcp.Description("Show progress for all cycles (true/false, default: false)"),
			),
		),
		s.handleAimOKRProgress,
	)

	// ==========================================================================
	// AIM Write-Back Tools (Phase 1)
	// ==========================================================================

	// Tool: epf_aim_update_lra
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_update_lra",
			mcp.WithDescription("Apply field-level updates to the Living Reality Assessment and append an evolution log entry. "+
				"Uses structured input rather than freeform YAML editing. Both 'trigger' and 'summary' must be provided together for evolution logging."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
			),
			mcp.WithString("primary_track",
				mcp.Description("Primary focus track: product, strategy, org_ops, commercial"),
			),
			mcp.WithString("secondary_track",
				mcp.Description("Secondary focus track: product, strategy, org_ops, commercial, none"),
			),
			mcp.WithString("primary_objective",
				mcp.Description("Current primary objective text"),
			),
			mcp.WithString("cycle_reference",
				mcp.Description("Cycle reference (e.g., C1, C2)"),
			),
			mcp.WithString("lifecycle_stage",
				mcp.Description("Lifecycle stage: bootstrap, maturing, evolved"),
			),
			mcp.WithString("trigger",
				mcp.Description("Evolution log trigger (e.g., aim_signals, external_change, cycle_transition). Required with 'summary'."),
			),
			mcp.WithString("summary",
				mcp.Description("Evolution log summary (max 200 chars). Required with 'trigger'."),
			),
			mcp.WithString("updated_by",
				mcp.Description("Attribution for the update (default: mcp-agent)"),
			),
		),
		s.handleAimUpdateLRA,
	)

	// Tool: epf_aim_write_assessment
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_write_assessment",
			mcp.WithDescription("Write an assessment report to the AIM directory from YAML content. "+
				"The assessment report captures OKR progress, key result outcomes, and assumption validation evidence for a cycle."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
				mcp.Required(),
			),
			mcp.WithString("content",
				mcp.Description("Assessment report YAML content to write"),
				mcp.Required(),
			),
		),
		s.handleAimWriteAssessment,
	)

	// Tool: epf_aim_write_calibration
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_write_calibration",
			mcp.WithDescription("Write a calibration memo to the AIM directory from YAML content. "+
				"The calibration memo captures the persevere/pivot/pull-the-plug decision, learnings, and next-cycle inputs."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
				mcp.Required(),
			),
			mcp.WithString("content",
				mcp.Description("Calibration memo YAML content to write"),
				mcp.Required(),
			),
		),
		s.handleAimWriteCalibration,
	)

	// Tool: epf_aim_init_cycle
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_init_cycle",
			mcp.WithDescription("Initialize a new cycle by optionally archiving the previous cycle, "+
				"removing old assessment/calibration artifacts, and updating the LRA cycle reference."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
				mcp.Required(),
			),
			mcp.WithString("cycle_number",
				mcp.Description("New cycle number (positive integer as string, required)"),
				mcp.Required(),
			),
			mcp.WithString("archive_previous",
				mcp.Description("Archive the previous cycle before starting (true/false, default: false)"),
			),
			mcp.WithString("updated_by",
				mcp.Description("Attribution for the update (default: mcp-agent)"),
			),
		),
		s.handleAimInitCycle,
	)

	// Tool: epf_aim_archive_cycle
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_archive_cycle",
			mcp.WithDescription("Archive current cycle's AIM artifacts to AIM/cycles/cycle-N/ directory. "+
				"Copies assessment_report.yaml, calibration_memo.yaml, and living_reality_assessment.yaml (if they exist) as snapshots. "+
				"Original files are NOT removed."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
				mcp.Required(),
			),
			mcp.WithString("cycle_number",
				mcp.Description("Cycle number to archive (positive integer as string, required)"),
				mcp.Required(),
			),
		),
		s.handleAimArchiveCycle,
	)

	// Tool: epf_aim_generate_src
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_generate_src",
			mcp.WithDescription("Generate a Strategic Reality Check (SRC) by running automated mechanical checks "+
				"against the EPF instance. Auto-populates market currency (freshness), strategic alignment "+
				"(cross-references), and execution reality (maturity mismatches). Leaves belief validity "+
				"as TODO placeholders for AI/human input. Writes result to AIM/strategic_reality_check.yaml."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
				mcp.Required(),
			),
			mcp.WithString("cycle",
				mcp.Description("Cycle number for this SRC (positive integer as string, default: '1')"),
			),
		),
		s.handleAimGenerateSRC,
	)

	// Tool: epf_aim_write_src
	s.mcpServer.AddTool(
		mcp.NewTool("epf_aim_write_src",
			mcp.WithDescription("Write or update a Strategic Reality Check from YAML content. "+
				"Use this after running epf_aim_generate_src and filling in subjective sections "+
				"(belief validity evidence, market changes). Writes to AIM/strategic_reality_check.yaml."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
				mcp.Required(),
			),
			mcp.WithString("content",
				mcp.Description("SRC YAML content to write"),
				mcp.Required(),
			),
		),
		s.handleAimWriteSRC,
	)

	// ==========================================================================
	// Report & Diff Tools (v0.14.0)
	// ==========================================================================

	// Tool: epf_generate_report
	s.mcpServer.AddTool(
		mcp.NewTool("epf_generate_report",
			mcp.WithDescription("Generate comprehensive health report for an EPF instance. "+
				"Runs all health checks and compiles results into markdown, HTML, or JSON format. "+
				"Returns report content (does not write to file)."),
			mcp.WithString("instance_path",
				mcp.Description("Path to EPF instance (default: current directory)"),
			),
			mcp.WithString("format",
				mcp.Description("Output format: markdown (default), html, json"),
			),
			mcp.WithString("verbose",
				mcp.Description("Include detailed information (true/false, default: false)"),
			),
		),
		s.handleGenerateReport,
	)

	// Tool: epf_diff_artifacts
	s.mcpServer.AddTool(
		mcp.NewTool("epf_diff_artifacts",
			mcp.WithDescription("Compare two EPF artifacts or instance directories. "+
				"Shows structural differences including added, removed, and modified fields. "+
				"Supports file-to-file and directory-to-directory comparison."),
			mcp.WithString("path1",
				mcp.Required(),
				mcp.Description("Path to source file or directory"),
			),
			mcp.WithString("path2",
				mcp.Required(),
				mcp.Description("Path to target file or directory"),
			),
			mcp.WithString("verbose",
				mcp.Description("Show old/new values for changes (true/false, default: false)"),
			),
		),
		s.handleDiffArtifacts,
	)

	// Tool: epf_diff_template
	s.mcpServer.AddTool(
		mcp.NewTool("epf_diff_template",
			mcp.WithDescription("Compare a file against its canonical template. "+
				"Auto-detects artifact type and shows structural differences with fix hints and priorities. "+
				"Useful for understanding why validation fails."),
			mcp.WithString("file_path",
				mcp.Required(),
				mcp.Description("Path to the EPF artifact file to compare"),
			),
			mcp.WithString("verbose",
				mcp.Description("Include extra fields not in template (true/false, default: false)"),
			),
		),
		s.handleDiffTemplate,
	)

	// ==========================================================================
	// Strategy Server Tools (Product Strategy for AI Agents)
	// ==========================================================================
	s.registerStrategyTools()
}

// SchemaListItem represents a schema in the list response
type SchemaListItem struct {
	ArtifactType string `json:"artifact_type"`
	SchemaFile   string `json:"schema_file"`
	Phase        string `json:"phase,omitempty"`
	Description  string `json:"description"`
}

// handleListSchemas handles the epf_list_schemas tool
func (s *Server) handleListSchemas(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	schemas := s.validator.GetLoader().ListSchemas()

	// Sort by phase, then by artifact type
	sort.Slice(schemas, func(i, j int) bool {
		if schemas[i].Phase != schemas[j].Phase {
			// Order: READY, FIRE, AIM, then others
			phaseOrder := map[schema.Phase]int{
				schema.PhaseREADY: 1,
				schema.PhaseFIRE:  2,
				schema.PhaseAIM:   3,
				"":                4,
			}
			return phaseOrder[schemas[i].Phase] < phaseOrder[schemas[j].Phase]
		}
		return schemas[i].ArtifactType < schemas[j].ArtifactType
	})

	// Build response
	items := make([]SchemaListItem, len(schemas))
	for i, sch := range schemas {
		items[i] = SchemaListItem{
			ArtifactType: string(sch.ArtifactType),
			SchemaFile:   sch.SchemaFile,
			Phase:        string(sch.Phase),
			Description:  sch.Description,
		}
	}

	// Group by phase for readable output
	var sb strings.Builder
	sb.WriteString("# EPF Schemas\n\n")

	currentPhase := ""
	for _, item := range items {
		phase := item.Phase
		if phase == "" {
			phase = "Other"
		}
		if phase != currentPhase {
			currentPhase = phase
			sb.WriteString(fmt.Sprintf("## %s Phase\n\n", phase))
		}
		sb.WriteString(fmt.Sprintf("- **%s** (%s)\n", item.ArtifactType, item.SchemaFile))
		if item.Description != "" {
			sb.WriteString(fmt.Sprintf("  %s\n", item.Description))
		}
	}

	sb.WriteString(fmt.Sprintf("\n---\nTotal: %d schemas loaded from %s\n", len(schemas), s.schemasDir))

	return mcp.NewToolResultText(sb.String()), nil
}

// handleGetSchema handles the epf_get_schema tool
func (s *Server) handleGetSchema(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	artifactTypeStr, err := request.RequireString("artifact_type")
	if err != nil {
		return mcp.NewToolResultError("artifact_type parameter is required"), nil
	}

	artifactType, err := schema.ArtifactTypeFromString(artifactTypeStr)
	if err != nil {
		// List available types
		types := s.validator.GetLoader().ListArtifactTypes()
		typeNames := make([]string, len(types))
		for i, t := range types {
			typeNames[i] = string(t)
		}
		sort.Strings(typeNames)
		return mcp.NewToolResultError(fmt.Sprintf("Unknown artifact type '%s'. Available types: %s", artifactTypeStr, strings.Join(typeNames, ", "))), nil
	}

	schemaJSON, err := s.validator.GetLoader().GetSchemaJSON(artifactType)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get schema: %s", err.Error())), nil
	}

	// Pretty print the JSON
	var prettyJSON map[string]interface{}
	if err := json.Unmarshal([]byte(schemaJSON), &prettyJSON); err == nil {
		if pretty, err := json.MarshalIndent(prettyJSON, "", "  "); err == nil {
			schemaJSON = string(pretty)
		}
	}

	return mcp.NewToolResultText(schemaJSON), nil
}

// handleValidateFile handles the epf_validate_file tool
func (s *Server) handleValidateFile(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	path, err := request.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError("path parameter is required"), nil
	}

	// Check for ai_friendly parameter
	aiFriendlyStr, _ := request.RequireString("ai_friendly")
	aiFriendly := strings.ToLower(aiFriendlyStr) == "true"

	if aiFriendly {
		// Use the new AI-friendly validation method
		aiResult, err := s.validator.ValidateFileAIFriendly(path)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Validation failed: %s", err.Error())), nil
		}

		jsonBytes, err := json.MarshalIndent(aiResult, "", "  ")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize result: %s", err.Error())), nil
		}
		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	// Default: basic validation result
	result, err := s.validator.ValidateFile(path)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Validation failed: %s", err.Error())), nil
	}

	jsonResult, err := result.ToJSON()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize result: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(jsonResult), nil
}

// handleValidateContent handles the epf_validate_content tool
func (s *Server) handleValidateContent(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	content, err := request.RequireString("content")
	if err != nil {
		return mcp.NewToolResultError("content parameter is required"), nil
	}

	artifactTypeStr, err := request.RequireString("artifact_type")
	if err != nil {
		return mcp.NewToolResultError("artifact_type parameter is required"), nil
	}

	artifactType, err := schema.ArtifactTypeFromString(artifactTypeStr)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Invalid artifact type: %s", err.Error())), nil
	}

	result, err := s.validator.ValidateContent([]byte(content), artifactType)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Validation failed: %s", err.Error())), nil
	}

	jsonResult, err := result.ToJSON()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize result: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(jsonResult), nil
}

// handleDetectArtifactType handles the epf_detect_artifact_type tool
func (s *Server) handleDetectArtifactType(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	path, err := request.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError("path parameter is required"), nil
	}

	artifactType, err := s.validator.GetLoader().DetectArtifactType(path)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	schemaInfo, _ := s.validator.GetLoader().GetSchema(artifactType)

	response := map[string]interface{}{
		"path":          path,
		"artifact_type": string(artifactType),
	}
	if schemaInfo != nil {
		response["schema_file"] = schemaInfo.SchemaFile
		response["phase"] = string(schemaInfo.Phase)
		response["description"] = schemaInfo.Description
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleGetPhaseArtifacts handles the epf_get_phase_artifacts tool
func (s *Server) handleGetPhaseArtifacts(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	phaseStr, err := request.RequireString("phase")
	if err != nil {
		return mcp.NewToolResultError("phase parameter is required"), nil
	}

	// Normalize phase
	phaseStr = strings.ToUpper(phaseStr)
	var phase schema.Phase
	switch phaseStr {
	case "READY":
		phase = schema.PhaseREADY
	case "FIRE":
		phase = schema.PhaseFIRE
	case "AIM":
		phase = schema.PhaseAIM
	default:
		return mcp.NewToolResultError(fmt.Sprintf("Invalid phase '%s'. Valid phases: READY, FIRE, AIM", phaseStr)), nil
	}

	artifactTypes := s.validator.GetLoader().GetArtifactTypesByPhase(phase)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s Phase Artifacts\n\n", phase))

	for _, at := range artifactTypes {
		schemaInfo, _ := s.validator.GetLoader().GetSchema(at)
		sb.WriteString(fmt.Sprintf("- **%s**\n", at))
		if schemaInfo != nil && schemaInfo.Description != "" {
			sb.WriteString(fmt.Sprintf("  %s\n", schemaInfo.Description))
		}
	}

	if len(artifactTypes) == 0 {
		sb.WriteString("No artifacts found for this phase.\n")
	}

	return mcp.NewToolResultText(sb.String()), nil
}

// ServeStdio starts the MCP server over stdio
func (s *Server) ServeStdio() error {
	return server.ServeStdio(s.mcpServer)
}

// GetMCPServer returns the underlying MCP server (useful for testing)
func (s *Server) GetMCPServer() *server.MCPServer {
	return s.mcpServer
}

// HealthCheckSummary represents the overall health check result for MCP
type HealthCheckSummary struct {
	InstancePath      string                         `json:"instance_path"`
	OverallStatus     string                         `json:"overall_status"` // HEALTHY, WARNINGS, ERRORS
	InstanceCheck     *checks.CheckSummary           `json:"instance_check,omitempty"`
	ContentReadiness  *checks.ContentReadinessResult `json:"content_readiness,omitempty"`
	FeatureQuality    *checks.FeatureQualitySummary  `json:"feature_quality,omitempty"`
	ValueModelQuality *valuemodel.QualityReport      `json:"value_model_quality,omitempty"`
	Summary           string                         `json:"summary"`
}

// handleHealthCheck handles the epf_health_check tool
func (s *Server) handleHealthCheck(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	// VALIDATION: Ensure the path is a valid EPF instance
	// Check if anchor file exists or if it's a legacy instance with READY/FIRE/AIM
	hasAnchor := anchor.Exists(instancePath)
	isLegacy := anchor.IsLegacyInstance(instancePath)

	if !hasAnchor && !isLegacy {
		// Check if instancePath is actually a directory
		info, statErr := os.Stat(instancePath)
		if statErr != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Path does not exist: %s", instancePath)), nil
		}

		// Path exists but is not a valid EPF instance
		errorMsg := fmt.Sprintf(
			"Invalid EPF instance: %s\n\n"+
				"The provided path is not a valid EPF instance. It must either:\n"+
				"  1. Contain an anchor file (_epf.yaml), OR\n"+
				"  2. Have a legacy EPF structure (READY/, FIRE/, AIM/ directories)\n\n"+
				"Found: %s\n\n"+
				"If you're looking for an EPF instance, use epf_locate_instance to find valid instances in this repository.",
			instancePath,
			func() string {
				if info.IsDir() {
					return "directory exists but lacks EPF structure"
				}
				return "not a directory"
			}(),
		)
		return mcp.NewToolResultError(errorMsg), nil
	}

	// If it has an anchor, validate it
	if hasAnchor {
		anchorValidation := anchor.ValidateFile(instancePath)
		if !anchorValidation.Valid {
			errorMsg := fmt.Sprintf(
				"Invalid anchor file at %s:\n%s\n\nRun epf-cli migrate-anchor to fix the anchor file.",
				instancePath,
				strings.Join(anchorValidation.Errors, "\n"),
			)
			return mcp.NewToolResultError(errorMsg), nil
		}
	}

	result := &HealthCheckSummary{
		InstancePath:  instancePath,
		OverallStatus: "HEALTHY",
	}

	// Run instance structure check
	instanceChecker := checks.NewInstanceChecker(instancePath)
	instanceResult := instanceChecker.Check()
	result.InstanceCheck = instanceResult

	// Run content readiness check
	contentChecker := checks.NewContentReadinessChecker(instancePath)
	contentResult, _ := contentChecker.Check()
	result.ContentReadiness = contentResult

	// Run feature quality check
	featureChecker := checks.NewFeatureQualityChecker(instancePath)
	featureResult, _ := featureChecker.Check()
	result.FeatureQuality = featureResult

	// Run value model quality check
	vmPath := filepath.Join(instancePath, "FIRE", "value_models")
	if _, vmStatErr := os.Stat(vmPath); vmStatErr == nil {
		vmLoader := valuemodel.NewLoader(instancePath)
		vmModels, vmErr := vmLoader.Load()
		if vmErr == nil && vmModels != nil && len(vmModels.ByFile) > 0 {
			portfolioNames, _ := valuemodel.LoadPortfolioNames(instancePath)

			// Build feature contributions
			var contributions *valuemodel.FeatureContributions
			featureLoader := relationships.NewFeatureLoader(instancePath)
			featureSet, featureLoadErr := featureLoader.Load()
			if featureLoadErr == nil && featureSet != nil && len(featureSet.ByValueModelPath) > 0 {
				contributions = &valuemodel.FeatureContributions{
					ComponentToFeatureCount: make(map[string]int),
					FeatureToComponentCount: make(map[string]int),
				}
				for path, features := range featureSet.ByValueModelPath {
					contributions.ComponentToFeatureCount[path] = len(features)
				}
				for _, fd := range featureSet.ByID {
					contributions.FeatureToComponentCount[fd.ID] = len(fd.StrategicContext.ContributesTo)
				}
			}

			vmReport := valuemodel.AssessQuality(vmModels, portfolioNames, contributions)
			result.ValueModelQuality = vmReport
		}
	}

	// Determine overall status
	if instanceResult.HasCritical() || instanceResult.HasErrors() {
		result.OverallStatus = "ERRORS"
	} else if instanceResult.Warnings > 0 {
		result.OverallStatus = "WARNINGS"
	}

	if contentResult != nil && contentResult.Grade == "F" {
		result.OverallStatus = "ERRORS"
	}

	if featureResult != nil && featureResult.AverageScore < 50 {
		if result.OverallStatus != "ERRORS" {
			result.OverallStatus = "WARNINGS"
		}
	}

	if result.ValueModelQuality != nil && result.ValueModelQuality.ScoreLevel == "alert" {
		if result.OverallStatus != "ERRORS" {
			result.OverallStatus = "WARNINGS"
		}
	}

	// Build summary
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# EPF Health Check: %s\n\n", instancePath))
	sb.WriteString(fmt.Sprintf("**Overall Status:** %s\n\n", result.OverallStatus))

	// Instance structure
	sb.WriteString("## Instance Structure\n")
	sb.WriteString(fmt.Sprintf("- Checks: %d passed, %d failed\n", instanceResult.Passed, instanceResult.Failed))
	if instanceResult.HasErrors() {
		sb.WriteString("- ⚠️ Has errors that need attention\n")
	}
	sb.WriteString("\n")

	// Content readiness
	if contentResult != nil {
		sb.WriteString("## Content Readiness\n")
		sb.WriteString(fmt.Sprintf("- Score: %d/100 (Grade: %s)\n", contentResult.Score, contentResult.Grade))
		sb.WriteString(fmt.Sprintf("- Placeholders found: %d\n", len(contentResult.Placeholders)))
		sb.WriteString("\n")
	}

	// Feature quality
	if featureResult != nil {
		sb.WriteString("## Feature Quality\n")
		sb.WriteString(fmt.Sprintf("- Features analyzed: %d\n", featureResult.TotalFeatures))
		sb.WriteString(fmt.Sprintf("- Average score: %.0f/100\n", featureResult.AverageScore))
		sb.WriteString(fmt.Sprintf("- Passing: %d\n", featureResult.PassedCount))
		sb.WriteString("\n")
	}

	// Value model quality
	if result.ValueModelQuality != nil {
		sb.WriteString("## Value Model Quality\n")
		sb.WriteString(fmt.Sprintf("- Models analyzed: %d\n", result.ValueModelQuality.ModelsAnalyzed))
		sb.WriteString(fmt.Sprintf("- Quality score: %d/100 (%s)\n", result.ValueModelQuality.OverallScore, result.ValueModelQuality.ScoreLevel))
		warningCount := 0
		for _, w := range result.ValueModelQuality.Warnings {
			if w.Level == valuemodel.WarningLevelWarning {
				warningCount++
			}
		}
		sb.WriteString(fmt.Sprintf("- Warnings: %d\n", warningCount))
		if warningCount > 0 {
			for _, w := range result.ValueModelQuality.Warnings {
				if w.Level == valuemodel.WarningLevelWarning {
					sb.WriteString(fmt.Sprintf("  - %s\n", w.Message))
				}
			}
			sb.WriteString("\n> Consider running the `value_model_review` wizard for guided remediation.\n> Use: `epf_get_wizard { \"name\": \"value_model_review\" }`\n")
		}
		sb.WriteString("\n")
	}

	result.Summary = sb.String()

	jsonResult, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize result: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonResult)), nil
}

// handleCheckInstance handles the epf_check_instance tool
func (s *Server) handleCheckInstance(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	checker := checks.NewInstanceChecker(instancePath)
	result := checker.Check()

	// Build human-readable output
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# Instance Structure Check: %s\n\n", instancePath))
	sb.WriteString(fmt.Sprintf("**Results:** %d/%d checks passed\n\n", result.Passed, result.TotalChecks))

	// Group by severity
	var critical, errors, warnings, info []*checks.CheckResult
	for _, r := range result.Results {
		switch r.Severity {
		case checks.SeverityCritical:
			critical = append(critical, r)
		case checks.SeverityError:
			errors = append(errors, r)
		case checks.SeverityWarning:
			warnings = append(warnings, r)
		default:
			info = append(info, r)
		}
	}

	if len(critical) > 0 {
		sb.WriteString("## Critical Issues\n")
		for _, r := range critical {
			sb.WriteString(fmt.Sprintf("- ❌ **%s**: %s\n", r.Check, r.Message))
		}
		sb.WriteString("\n")
	}

	if len(errors) > 0 {
		sb.WriteString("## Errors\n")
		for _, r := range errors {
			sb.WriteString(fmt.Sprintf("- ❌ **%s**: %s\n", r.Check, r.Message))
		}
		sb.WriteString("\n")
	}

	if len(warnings) > 0 {
		sb.WriteString("## Warnings\n")
		for _, r := range warnings {
			sb.WriteString(fmt.Sprintf("- ⚠️ **%s**: %s\n", r.Check, r.Message))
		}
		sb.WriteString("\n")
	}

	return mcp.NewToolResultText(sb.String()), nil
}

// handleCheckContentReadiness handles the epf_check_content_readiness tool
func (s *Server) handleCheckContentReadiness(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	path, err := request.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError("path parameter is required"), nil
	}

	checker := checks.NewContentReadinessChecker(path)
	result, err := checker.Check()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Check failed: %s", err.Error())), nil
	}

	// Build human-readable output
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# Content Readiness Check: %s\n\n", path))
	sb.WriteString(fmt.Sprintf("**Score:** %d/100 (Grade: %s)\n", result.Score, result.Grade))
	sb.WriteString(fmt.Sprintf("**Files checked:** %d\n\n", result.FilesChecked))

	if len(result.Placeholders) > 0 {
		sb.WriteString(fmt.Sprintf("## Placeholders Found (%d)\n\n", len(result.Placeholders)))

		// Group by file
		byFile := make(map[string][]checks.PlaceholderMatch)
		for _, p := range result.Placeholders {
			relPath := filepath.Base(p.File)
			byFile[relPath] = append(byFile[relPath], p)
		}

		for file, matches := range byFile {
			sb.WriteString(fmt.Sprintf("### %s\n", file))
			for _, m := range matches {
				sb.WriteString(fmt.Sprintf("- Line %d: `%s`\n", m.Line, m.Content))
			}
			sb.WriteString("\n")
		}
	} else {
		sb.WriteString("✅ No placeholder content found!\n")
	}

	return mcp.NewToolResultText(sb.String()), nil
}

// handleCheckFeatureQuality handles the epf_check_feature_quality tool
func (s *Server) handleCheckFeatureQuality(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	checker := checks.NewFeatureQualityChecker(instancePath)
	result, err := checker.Check()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Check failed: %s", err.Error())), nil
	}

	// Build human-readable output
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# Feature Quality Check: %s\n\n", instancePath))
	sb.WriteString(fmt.Sprintf("**Total Features:** %d\n", result.TotalFeatures))
	sb.WriteString(fmt.Sprintf("**Passing:** %d\n", result.PassedCount))
	sb.WriteString(fmt.Sprintf("**Average Score:** %.0f/100\n\n", result.AverageScore))

	if len(result.Results) > 0 {
		sb.WriteString("## Feature Scores\n\n")

		for _, f := range result.Results {
			status := "❌"
			if f.Score >= 70 {
				status = "✅"
			} else if f.Score >= 50 {
				status = "⚠️"
			}

			sb.WriteString(fmt.Sprintf("### %s %s (Score: %d)\n", status, filepath.Base(f.File), f.Score))

			if len(f.Issues) > 0 {
				sb.WriteString("- Issues:\n")
				for _, issue := range f.Issues {
					sb.WriteString(fmt.Sprintf("  - [%s] %s: %s\n", issue.Severity, issue.Field, issue.Message))
				}
			}
			sb.WriteString("\n")
		}
	}

	return mcp.NewToolResultText(sb.String()), nil
}

// ArtifactListItem represents an artifact type in the list response
type ArtifactListItem struct {
	ArtifactType string `json:"artifact_type"`
	Phase        string `json:"phase"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	HasTemplate  bool   `json:"has_template"`
	HasSchema    bool   `json:"has_schema"`
	SchemaFile   string `json:"schema_file,omitempty"`
}

// handleListArtifacts handles the epf_list_artifacts tool
func (s *Server) handleListArtifacts(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	phaseFilter, _ := request.RequireString("phase")

	// Get all schemas
	schemas := s.validator.GetLoader().ListSchemas()

	// Build artifact list
	var items []ArtifactListItem
	for _, sch := range schemas {
		// Apply phase filter if specified
		if phaseFilter != "" && strings.ToUpper(phaseFilter) != string(sch.Phase) {
			continue
		}

		hasTemplate := false
		templateName := ""
		templateDesc := sch.Description

		// Check if we have a template for this artifact
		if s.templateLoader != nil {
			if tmpl, err := s.templateLoader.GetTemplate(sch.ArtifactType); err == nil {
				hasTemplate = true
				templateName = tmpl.Name
				if tmpl.Description != "" {
					templateDesc = tmpl.Description
				}
			}
		}

		items = append(items, ArtifactListItem{
			ArtifactType: string(sch.ArtifactType),
			Phase:        string(sch.Phase),
			Name:         templateName,
			Description:  templateDesc,
			HasTemplate:  hasTemplate,
			HasSchema:    true,
			SchemaFile:   sch.SchemaFile,
		})
	}

	// Sort by phase, then by artifact type
	sort.Slice(items, func(i, j int) bool {
		phaseOrder := map[string]int{"READY": 1, "FIRE": 2, "AIM": 3, "": 4}
		if items[i].Phase != items[j].Phase {
			return phaseOrder[items[i].Phase] < phaseOrder[items[j].Phase]
		}
		return items[i].ArtifactType < items[j].ArtifactType
	})

	// Build response
	var sb strings.Builder
	sb.WriteString("# EPF Artifact Types\n\n")

	if phaseFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by phase: %s\n\n", strings.ToUpper(phaseFilter)))
	}

	currentPhase := ""
	for _, item := range items {
		phase := item.Phase
		if phase == "" {
			phase = "Other"
		}
		if phase != currentPhase {
			currentPhase = phase
			sb.WriteString(fmt.Sprintf("## %s Phase\n\n", phase))
		}

		templateStatus := "📄"
		if item.HasTemplate {
			templateStatus = "✅"
		}

		sb.WriteString(fmt.Sprintf("- **%s** %s template\n", item.ArtifactType, templateStatus))
		if item.Description != "" {
			sb.WriteString(fmt.Sprintf("  %s\n", item.Description))
		}
		sb.WriteString(fmt.Sprintf("  Schema: `%s`\n", item.SchemaFile))
	}

	sb.WriteString(fmt.Sprintf("\n---\n✅ = template available, 📄 = schema only\nTotal: %d artifact types\n", len(items)))

	return mcp.NewToolResultText(sb.String()), nil
}

// TemplateResponse represents the response for epf_get_template
type TemplateResponse struct {
	ArtifactType string `json:"artifact_type"`
	Phase        string `json:"phase"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Template     string `json:"template"`
	SchemaFile   string `json:"schema_file"`
	UsageHint    string `json:"usage_hint"`
}

// handleGetTemplate handles the epf_get_template tool
func (s *Server) handleGetTemplate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	artifactTypeStr, err := request.RequireString("artifact_type")
	if err != nil {
		return mcp.NewToolResultError("artifact_type parameter is required"), nil
	}

	if s.templateLoader == nil || s.templateLoader.TemplateCount() == 0 {
		return mcp.NewToolResultError("Templates not loaded. Ensure EPF templates directory exists."), nil
	}

	// Try to get template by name/type
	tmpl, err := s.templateLoader.GetTemplateByName(artifactTypeStr)
	if err != nil {
		// List available templates
		templates := s.templateLoader.ListTemplates()
		var names []string
		for _, t := range templates {
			names = append(names, string(t.ArtifactType))
		}
		sort.Strings(names)
		return mcp.NewToolResultError(fmt.Sprintf("Template not found for '%s'. Available templates: %s", artifactTypeStr, strings.Join(names, ", "))), nil
	}

	// Build response
	response := TemplateResponse{
		ArtifactType: string(tmpl.ArtifactType),
		Phase:        string(tmpl.Phase),
		Name:         tmpl.Name,
		Description:  tmpl.Description,
		Template:     tmpl.Content,
		SchemaFile:   tmpl.SchemaFile,
		UsageHint:    tmpl.UsageHint,
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// DefinitionListResponse represents the response for epf_list_definitions
type DefinitionListResponse struct {
	Track       string                  `json:"track,omitempty"`
	Type        string                  `json:"type"`
	Description string                  `json:"description"`
	Categories  []template.CategoryInfo `json:"categories,omitempty"`
	Definitions []DefinitionListItem    `json:"definitions"`
	Total       int                     `json:"total"`
}

// DefinitionListItem represents a definition in the list
type DefinitionListItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Track       string `json:"track"`
	Type        string `json:"type"`
	Category    string `json:"category,omitempty"`
	Description string `json:"description"`
}

// handleListDefinitions handles the epf_list_definitions tool
func (s *Server) handleListDefinitions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	trackFilter, _ := request.RequireString("track")
	categoryFilter, _ := request.RequireString("category")

	if s.definitionLoader == nil || s.definitionLoader.DefinitionCount() == 0 {
		return mcp.NewToolResultError("Definitions not loaded. Ensure EPF definitions directory exists."), nil
	}

	// Parse track filter if provided
	var trackPtr *template.Track
	if trackFilter != "" {
		track, err := template.TrackFromString(trackFilter)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Invalid track '%s'. Valid tracks: product, strategy, org_ops, commercial", trackFilter)), nil
		}
		trackPtr = &track
	}

	// Parse category filter if provided
	var categoryPtr *string
	if categoryFilter != "" {
		categoryPtr = &categoryFilter
	}

	// Get definitions
	definitions := s.definitionLoader.ListDefinitions(trackPtr, categoryPtr)

	// Build response
	var sb strings.Builder
	sb.WriteString("# EPF Definitions\n\n")

	if trackFilter != "" {
		desc, defType := template.GetTrackDescription(*trackPtr)
		sb.WriteString(fmt.Sprintf("**Track:** %s\n", trackFilter))
		sb.WriteString(fmt.Sprintf("**Type:** %s\n", defType))
		sb.WriteString(fmt.Sprintf("**Description:** %s\n\n", desc))

		// Show categories for this track
		categories := s.definitionLoader.GetCategories(*trackPtr)
		if len(categories) > 0 {
			sb.WriteString("**Categories:**\n")
			for _, cat := range categories {
				sb.WriteString(fmt.Sprintf("- %s (%d definitions)\n", cat.Name, cat.Count))
			}
			sb.WriteString("\n")
		}
	}

	if categoryFilter != "" {
		sb.WriteString(fmt.Sprintf("Filtered by category: %s\n\n", categoryFilter))
	}

	// Group by track
	byTrack := make(map[template.Track][]*template.DefinitionInfo)
	for _, def := range definitions {
		byTrack[def.Track] = append(byTrack[def.Track], def)
	}

	trackOrder := []template.Track{template.TrackProduct, template.TrackStrategy, template.TrackOrgOps, template.TrackCommercial}
	for _, track := range trackOrder {
		defs := byTrack[track]
		if len(defs) == 0 {
			continue
		}

		desc, defType := template.GetTrackDescription(track)
		trackLabel := "📚 EXAMPLES"
		if defType == template.DefinitionTypeCanonical {
			trackLabel = "✅ CANONICAL"
		}

		sb.WriteString(fmt.Sprintf("## %s Track (%s)\n", strings.Title(string(track)), trackLabel))
		sb.WriteString(fmt.Sprintf("%s\n\n", desc))

		for _, def := range defs {
			sb.WriteString(fmt.Sprintf("- **%s**: %s\n", def.ID, def.Name))
			if def.Category != "" {
				sb.WriteString(fmt.Sprintf("  Category: %s\n", def.Category))
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString(fmt.Sprintf("---\nTotal: %d definitions\n", len(definitions)))
	sb.WriteString("\n📚 EXAMPLES = learn patterns, write your own\n✅ CANONICAL = adopt directly into your instance\n")

	return mcp.NewToolResultText(sb.String()), nil
}

// DefinitionResponse represents the response for epf_get_definition
type DefinitionResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Track       string `json:"track"`
	Type        string `json:"type"`
	Category    string `json:"category,omitempty"`
	Content     string `json:"content"`
	Description string `json:"description"`
	UsageHint   string `json:"usage_hint"`
}

// handleGetDefinition handles the epf_get_definition tool
func (s *Server) handleGetDefinition(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	id, err := request.RequireString("id")
	if err != nil {
		return mcp.NewToolResultError("id parameter is required"), nil
	}

	if s.definitionLoader == nil || s.definitionLoader.DefinitionCount() == 0 {
		return mcp.NewToolResultError("Definitions not loaded. Ensure EPF definitions directory exists."), nil
	}

	def, err := s.definitionLoader.GetDefinition(id)
	if err != nil {
		// Try to suggest based on prefix
		track, trackErr := template.GetTrackForID(id)
		if trackErr == nil {
			defs := s.definitionLoader.ListDefinitionsByTrack(track)
			var ids []string
			for _, d := range defs {
				ids = append(ids, d.ID)
			}
			if len(ids) > 0 {
				sort.Strings(ids)
				return mcp.NewToolResultError(fmt.Sprintf("Definition '%s' not found. Available %s track definitions: %s", id, track, strings.Join(ids, ", "))), nil
			}
		}
		return mcp.NewToolResultError(fmt.Sprintf("Definition not found: %s. Use epf_list_definitions to see available definitions.", id)), nil
	}

	// Build response
	response := DefinitionResponse{
		ID:          def.ID,
		Name:        def.Name,
		Track:       string(def.Track),
		Type:        string(def.Type),
		Category:    def.Category,
		Content:     def.Content,
		Description: def.Description,
		UsageHint:   def.UsageHint,
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Relationship Intelligence Tools
// =============================================================================

// getRelationshipAnalyzer returns a cached analyzer for the given instance path.
func (s *Server) getRelationshipAnalyzer(instancePath string) (*relationships.Analyzer, error) {
	// Check cache with read lock
	s.analyzerMu.RLock()
	analyzer, ok := s.analyzers[instancePath]
	s.analyzerMu.RUnlock()

	if ok {
		return analyzer, nil
	}

	// Create new analyzer with write lock
	s.analyzerMu.Lock()
	defer s.analyzerMu.Unlock()

	// Double-check after acquiring write lock
	if analyzer, ok := s.analyzers[instancePath]; ok {
		return analyzer, nil
	}

	// Create and load new analyzer
	analyzer = relationships.NewAnalyzer(instancePath)
	if err := analyzer.Load(); err != nil {
		return nil, fmt.Errorf("failed to load relationship analyzer: %w", err)
	}

	s.analyzers[instancePath] = analyzer
	return analyzer, nil
}

// Guidance provides next steps, warnings, and tips for MCP tool responses.
type Guidance struct {
	NextSteps []string `json:"next_steps,omitempty"`
	Warnings  []string `json:"warnings,omitempty"`
	Tips      []string `json:"tips,omitempty"`
}

// =============================================================================
// epf_explain_value_path
// =============================================================================

// ExplainPathResponse is the response for epf_explain_value_path
type ExplainPathResponse struct {
	Path                 string                  `json:"path"`
	CanonicalPath        string                  `json:"canonical_path,omitempty"`
	IsValid              bool                    `json:"is_valid"`
	Track                string                  `json:"track,omitempty"`
	Depth                int                     `json:"depth,omitempty"`
	Layer                *ExplainPathLayerInfo   `json:"layer,omitempty"`
	Component            *ExplainPathCompInfo    `json:"component,omitempty"`
	SubComponent         *ExplainPathSubCompInfo `json:"sub_component,omitempty"`
	ContributingFeatures []string                `json:"contributing_features,omitempty"`
	TargetingKRs         []string                `json:"targeting_krs,omitempty"`
	ErrorMessage         string                  `json:"error_message,omitempty"`
	Guidance             Guidance                `json:"guidance"`
}

// ExplainPathLayerInfo contains layer information for path explanation
type ExplainPathLayerInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// ExplainPathCompInfo contains component information for path explanation
type ExplainPathCompInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Maturity    string `json:"maturity,omitempty"`
}

// ExplainPathSubCompInfo contains sub-component information for path explanation
type ExplainPathSubCompInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Active   bool   `json:"active"`
	Maturity string `json:"maturity,omitempty"`
}

// handleExplainValuePath handles the epf_explain_value_path tool
func (s *Server) handleExplainValuePath(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	path, err := request.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError("path parameter is required"), nil
	}

	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	// Get analyzer for this instance
	analyzer, err := s.getRelationshipAnalyzer(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load instance: %s", err.Error())), nil
	}

	// Explain the path
	explanation, explainErr := analyzer.ExplainPath(path)

	response := &ExplainPathResponse{
		Path:     path,
		IsValid:  explanation != nil && explanation.IsValid,
		Guidance: Guidance{},
	}

	if explanation != nil {
		response.CanonicalPath = explanation.CanonicalPath
		response.Track = explanation.Track
		response.Depth = explanation.Depth
		response.ContributingFeatures = explanation.ContributingFeatures
		response.TargetingKRs = explanation.TargetingKRs

		if explanation.Layer != nil {
			response.Layer = &ExplainPathLayerInfo{
				ID:          explanation.Layer.ID,
				Name:        explanation.Layer.Name,
				Description: explanation.Layer.Description,
			}
		}

		if explanation.Component != nil {
			response.Component = &ExplainPathCompInfo{
				ID:          explanation.Component.ID,
				Name:        explanation.Component.Name,
				Description: explanation.Component.Description,
				Maturity:    explanation.Component.Maturity,
			}
		}

		if explanation.SubComponent != nil {
			response.SubComponent = &ExplainPathSubCompInfo{
				ID:       explanation.SubComponent.ID,
				Name:     explanation.SubComponent.Name,
				Active:   explanation.SubComponent.Active,
				Maturity: explanation.SubComponent.Maturity,
			}
		}

		if !explanation.IsValid {
			response.ErrorMessage = explanation.ErrorMsg
		}
	}

	if explainErr != nil {
		response.ErrorMessage = explainErr.Error()
	}

	// Build guidance
	if response.IsValid {
		if len(response.ContributingFeatures) == 0 {
			response.Guidance.Warnings = append(response.Guidance.Warnings, "No features currently contribute to this path")
			response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Consider creating a feature that contributes to this value model component")
		}
		if len(response.TargetingKRs) > 0 {
			response.Guidance.Tips = append(response.Guidance.Tips, fmt.Sprintf("%d KR(s) target this path - features here support measured objectives", len(response.TargetingKRs)))
		}
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Use epf_get_strategic_context to see full details on any contributing feature")
	} else {
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Check the path spelling and format (use PascalCase)")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Use epf_analyze_coverage to see all valid paths in this instance")
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// epf_get_strategic_context
// =============================================================================

// StrategicContextResponse is the response for epf_get_strategic_context
type StrategicContextResponse struct {
	Feature       StrategicContextFeature `json:"feature"`
	ContributesTo []StrategicContextPath  `json:"contributes_to"`
	RelatedKRs    []StrategicContextKR    `json:"related_krs,omitempty"`
	Dependencies  StrategicContextDeps    `json:"dependencies"`
	Guidance      Guidance                `json:"guidance"`
}

// StrategicContextFeature contains feature info for strategic context
type StrategicContextFeature struct {
	ID          string   `json:"id"`
	Slug        string   `json:"slug,omitempty"`
	Name        string   `json:"name"`
	Status      string   `json:"status"`
	Description string   `json:"description,omitempty"`
	Tracks      []string `json:"tracks,omitempty"`
}

// StrategicContextPath contains a resolved contributes_to path
type StrategicContextPath struct {
	Path          string `json:"path"`
	CanonicalPath string `json:"canonical_path,omitempty"`
	IsValid       bool   `json:"is_valid"`
	Track         string `json:"track,omitempty"`
	LayerName     string `json:"layer_name,omitempty"`
	ComponentName string `json:"component_name,omitempty"`
	ErrorMessage  string `json:"error_message,omitempty"`
}

// StrategicContextKR contains related KR info
type StrategicContextKR struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	TargetPath  string `json:"target_path,omitempty"`
}

// StrategicContextDeps contains dependency relationships
type StrategicContextDeps struct {
	Requires []StrategicContextDepFeature `json:"requires,omitempty"`
	Enables  []StrategicContextDepFeature `json:"enables,omitempty"`
}

// StrategicContextDepFeature contains info about a dependent feature
type StrategicContextDepFeature struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// handleGetStrategicContext handles the epf_get_strategic_context tool
func (s *Server) handleGetStrategicContext(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	featureID, err := request.RequireString("feature_id")
	if err != nil {
		return mcp.NewToolResultError("feature_id parameter is required"), nil
	}

	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	// Get analyzer for this instance
	analyzer, err := s.getRelationshipAnalyzer(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load instance: %s", err.Error())), nil
	}

	// Get strategic context
	context, err := analyzer.GetStrategicContext(featureID)
	if err != nil {
		// Feature not found - provide helpful error
		features := analyzer.GetFeatures()
		var featureIDs []string
		for id := range features.ByID {
			featureIDs = append(featureIDs, id)
		}
		sort.Strings(featureIDs)
		return mcp.NewToolResultError(fmt.Sprintf("Feature not found: %s. Available features: %s", featureID, strings.Join(featureIDs, ", "))), nil
	}

	// Build response
	response := &StrategicContextResponse{
		Feature: StrategicContextFeature{
			ID:          context.Feature.ID,
			Slug:        context.Feature.Slug,
			Name:        context.Feature.Name,
			Status:      string(context.Feature.Status),
			Description: context.Feature.Definition.JobToBeDone,
			Tracks:      context.Feature.StrategicContext.Tracks,
		},
		ContributesTo: make([]StrategicContextPath, 0),
		RelatedKRs:    make([]StrategicContextKR, 0),
		Dependencies:  StrategicContextDeps{},
		Guidance:      Guidance{},
	}

	// Map contributes_to paths
	invalidPathCount := 0
	for _, pathExpl := range context.ContributesTo {
		ctPath := StrategicContextPath{
			Path:          pathExpl.Path,
			CanonicalPath: pathExpl.CanonicalPath,
			IsValid:       pathExpl.IsValid,
			Track:         pathExpl.Track,
		}
		if pathExpl.Layer != nil {
			ctPath.LayerName = pathExpl.Layer.Name
		}
		if pathExpl.Component != nil {
			ctPath.ComponentName = pathExpl.Component.Name
		}
		if !pathExpl.IsValid {
			ctPath.ErrorMessage = pathExpl.ErrorMsg
			invalidPathCount++
		}
		response.ContributesTo = append(response.ContributesTo, ctPath)
	}

	// Map related KRs
	for _, krEntry := range context.RelatedKRs {
		targetPath := ""
		if krEntry.KR.ValueModelTarget != nil {
			targetPath = krEntry.KR.ValueModelTarget.Track + "." + krEntry.KR.ValueModelTarget.ComponentPath
		}
		response.RelatedKRs = append(response.RelatedKRs, StrategicContextKR{
			ID:          krEntry.KR.ID,
			Description: krEntry.KR.Description,
			TargetPath:  targetPath,
		})
	}

	// Map dependencies
	for _, reqFeature := range context.RequiresFeatures {
		response.Dependencies.Requires = append(response.Dependencies.Requires, StrategicContextDepFeature{
			ID:     reqFeature.ID,
			Name:   reqFeature.Name,
			Status: string(reqFeature.Status),
		})
	}
	for _, enablesFeature := range context.EnablesFeatures {
		response.Dependencies.Enables = append(response.Dependencies.Enables, StrategicContextDepFeature{
			ID:     enablesFeature.ID,
			Name:   enablesFeature.Name,
			Status: string(enablesFeature.Status),
		})
	}

	// Build guidance
	if invalidPathCount > 0 {
		response.Guidance.Warnings = append(response.Guidance.Warnings, fmt.Sprintf("%d contributes_to path(s) are invalid - run epf_validate_relationships for details", invalidPathCount))
	}
	if len(response.ContributesTo) == 0 {
		response.Guidance.Warnings = append(response.Guidance.Warnings, "Feature has no contributes_to paths - it may be strategically orphaned")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Add strategic_context.contributes_to paths to connect this feature to value model components")
	}
	if len(response.RelatedKRs) > 0 {
		response.Guidance.Tips = append(response.Guidance.Tips, fmt.Sprintf("This feature supports %d KR(s) - delivering it helps meet measurable objectives", len(response.RelatedKRs)))
	}
	if len(response.Dependencies.Requires) > 0 {
		response.Guidance.Tips = append(response.Guidance.Tips, fmt.Sprintf("Depends on %d other feature(s) - check their status before planning", len(response.Dependencies.Requires)))
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// epf_analyze_coverage
// =============================================================================

// CoverageResponse is the response for epf_analyze_coverage
type CoverageResponse struct {
	Track                    string                       `json:"track"`
	TotalL2Components        int                          `json:"total_l2_components"`
	CoveredCount             int                          `json:"covered_count"`
	CoveragePercent          float64                      `json:"coverage_percent"`
	UncoveredPaths           []string                     `json:"uncovered_paths,omitempty"`
	MissingTracks            []string                     `json:"missing_tracks,omitempty"`
	ByLayer                  map[string]CoverageLayerInfo `json:"by_layer,omitempty"`
	OrphanFeatures           []CoverageOrphanFeature      `json:"orphan_features,omitempty"`
	MostContributed          []CoverageMostContributed    `json:"most_contributed,omitempty"`
	KRTargetsWithoutFeatures []string                     `json:"kr_targets_without_features,omitempty"`
	Guidance                 Guidance                     `json:"guidance"`
}

// CoverageLayerInfo contains coverage info for a single layer
type CoverageLayerInfo struct {
	LayerName       string   `json:"layer_name"`
	TotalComponents int      `json:"total_components"`
	CoveredCount    int      `json:"covered_count"`
	CoveragePercent float64  `json:"coverage_percent"`
	UncoveredPaths  []string `json:"uncovered_paths,omitempty"`
}

// CoverageOrphanFeature represents a feature with no contributes_to paths
type CoverageOrphanFeature struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// CoverageMostContributed shows paths with the most feature contributions
type CoverageMostContributed struct {
	Path          string   `json:"path"`
	FeatureCount  int      `json:"feature_count"`
	FeatureIDs    []string `json:"feature_ids"`
	HasKRTargeted bool     `json:"has_kr_targeted"`
}

// handleAnalyzeCoverage handles the epf_analyze_coverage tool
func (s *Server) handleAnalyzeCoverage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	track, _ := request.RequireString("track")

	// Get analyzer for this instance
	analyzer, err := s.getRelationshipAnalyzer(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load instance: %s", err.Error())), nil
	}

	// Analyze coverage
	analysis := analyzer.AnalyzeCoverage(track)

	// Build response
	response := &CoverageResponse{
		Track:             analysis.Track,
		TotalL2Components: analysis.TotalL2Components,
		CoveredCount:      analysis.CoveredL2Components,
		CoveragePercent:   analysis.CoveragePercent,
		UncoveredPaths:    analysis.UncoveredL2Components,
		ByLayer:           make(map[string]CoverageLayerInfo),
		Guidance:          Guidance{},
	}

	// Map by-layer coverage
	for layerPath, layerCov := range analysis.ByLayer {
		response.ByLayer[layerPath] = CoverageLayerInfo{
			LayerName:       layerCov.LayerName,
			TotalComponents: layerCov.TotalComponents,
			CoveredCount:    layerCov.CoveredCount,
			CoveragePercent: layerCov.CoveragePercent,
			UncoveredPaths:  layerCov.UncoveredPaths,
		}
	}

	// Map orphan features
	for _, orphan := range analysis.OrphanFeatures {
		response.OrphanFeatures = append(response.OrphanFeatures, CoverageOrphanFeature{
			ID:     orphan.ID,
			Name:   orphan.Name,
			Status: string(orphan.Status),
		})
	}

	// Map most contributed
	for _, mc := range analysis.MostContributed {
		response.MostContributed = append(response.MostContributed, CoverageMostContributed{
			Path:          mc.Path,
			FeatureCount:  mc.FeatureCount,
			FeatureIDs:    mc.FeatureIDs,
			HasKRTargeted: mc.HasKRTargeted,
		})
	}

	// Map KR targets without features
	response.KRTargetsWithoutFeatures = analysis.KRTargetsWithoutFeatures

	// Map missing tracks
	response.MissingTracks = analysis.MissingTracks

	// Build guidance
	if len(response.MissingTracks) > 0 {
		response.Guidance.Warnings = append(response.Guidance.Warnings,
			fmt.Sprintf("Missing value models for %d of 4 tracks: %s. Coverage analysis is incomplete without all tracks loaded.",
				len(response.MissingTracks), strings.Join(response.MissingTracks, ", ")))
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			"Add value model files for missing tracks to FIRE/value_models/ (canonical templates ship with active: false)")
	}
	if response.CoveragePercent < 50 {
		response.Guidance.Warnings = append(response.Guidance.Warnings, fmt.Sprintf("Low coverage (%.0f%%) - many value model components lack feature investment", response.CoveragePercent))
	}
	if len(response.OrphanFeatures) > 0 {
		response.Guidance.Warnings = append(response.Guidance.Warnings, fmt.Sprintf("%d feature(s) have no contributes_to paths (orphaned)", len(response.OrphanFeatures)))
	}
	if len(response.KRTargetsWithoutFeatures) > 0 {
		response.Guidance.Warnings = append(response.Guidance.Warnings, fmt.Sprintf("%d KR target path(s) have no features contributing to them", len(response.KRTargetsWithoutFeatures)))
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Review KR targets without features - these represent commitment gaps")
	}
	if len(response.UncoveredPaths) > 0 {
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, fmt.Sprintf("Consider adding features for %d uncovered value model components", len(response.UncoveredPaths)))
	}
	response.Guidance.Tips = append(response.Guidance.Tips, "Use epf_explain_value_path to understand any specific path in detail")

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// epf_validate_relationships
// =============================================================================

// ValidateRelationshipsResponse is the response for epf_validate_relationships
type ValidateRelationshipsResponse struct {
	Valid    bool                                    `json:"valid"`
	Stats    ValidateRelationshipsStats              `json:"stats"`
	Errors   []ValidateRelationshipsError            `json:"errors,omitempty"`
	BySource map[string][]ValidateRelationshipsError `json:"by_source,omitempty"`
	Guidance Guidance                                `json:"guidance"`
}

// ValidateRelationshipsStats contains validation statistics
type ValidateRelationshipsStats struct {
	TotalFeaturesChecked int `json:"total_features_checked"`
	TotalKRsChecked      int `json:"total_krs_checked"`
	TotalPathsChecked    int `json:"total_paths_checked"`
	ValidPaths           int `json:"valid_paths"`
	InvalidPaths         int `json:"invalid_paths"`
	ErrorCount           int `json:"error_count"`
	WarningCount         int `json:"warning_count"`
}

// ValidateRelationshipsError contains a validation error with helpful context
type ValidateRelationshipsError struct {
	Severity       string   `json:"severity"`
	Source         string   `json:"source"`
	SourceType     string   `json:"source_type"`
	Field          string   `json:"field"`
	InvalidPath    string   `json:"invalid_path"`
	Message        string   `json:"message"`
	AvailablePaths []string `json:"available_paths,omitempty"`
	DidYouMean     string   `json:"did_you_mean,omitempty"`
	Hint           string   `json:"hint,omitempty"`
}

// handleValidateRelationships handles the epf_validate_relationships tool
func (s *Server) handleValidateRelationships(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	// Get analyzer for this instance
	analyzer, err := s.getRelationshipAnalyzer(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load instance: %s", err.Error())), nil
	}

	// Validate all relationships
	result := analyzer.ValidateAll()

	// Build response
	response := &ValidateRelationshipsResponse{
		Valid: result.Valid,
		Stats: ValidateRelationshipsStats{
			TotalFeaturesChecked: result.Stats.TotalFeaturesChecked,
			TotalKRsChecked:      result.Stats.TotalKRsChecked,
			TotalPathsChecked:    result.Stats.TotalPathsChecked,
			ValidPaths:           result.Stats.ValidPaths,
			InvalidPaths:         result.Stats.InvalidPaths,
			ErrorCount:           result.Stats.ErrorCount,
			WarningCount:         result.Stats.WarningCount,
		},
		Errors:   make([]ValidateRelationshipsError, 0),
		BySource: make(map[string][]ValidateRelationshipsError),
		Guidance: Guidance{},
	}

	// Map errors
	for _, valErr := range result.Errors {
		errItem := ValidateRelationshipsError{
			Severity:       string(valErr.Severity),
			Source:         valErr.Source,
			SourceType:     valErr.SourceType,
			Field:          valErr.Field,
			InvalidPath:    valErr.InvalidPath,
			Message:        valErr.Message,
			AvailablePaths: valErr.AvailablePaths,
			DidYouMean:     valErr.DidYouMean,
			Hint:           valErr.Hint,
		}
		response.Errors = append(response.Errors, errItem)
		response.BySource[valErr.Source] = append(response.BySource[valErr.Source], errItem)
	}

	// Build guidance
	if result.Valid {
		response.Guidance.Tips = append(response.Guidance.Tips, "All relationship paths are valid")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, "Use epf_analyze_coverage to check for coverage gaps")
	} else {
		response.Guidance.Warnings = append(response.Guidance.Warnings, fmt.Sprintf("Found %d error(s) and %d warning(s)", result.Stats.ErrorCount, result.Stats.WarningCount))

		// Count unique sources with errors
		sourceCount := len(response.BySource)
		response.Guidance.NextSteps = append(response.Guidance.NextSteps, fmt.Sprintf("Fix invalid paths in %d artifact(s)", sourceCount))

		// Check if any errors have suggestions
		hasSuggestions := false
		for _, err := range result.Errors {
			if err.DidYouMean != "" {
				hasSuggestions = true
				break
			}
		}
		if hasSuggestions {
			response.Guidance.Tips = append(response.Guidance.Tips, "Check 'did_you_mean' suggestions for likely corrections")
		}
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// =============================================================================
// Migration Intelligence Tools
// =============================================================================

// MigrationStatusResponse is the response for epf_check_migration_status
type MigrationStatusResponse struct {
	NeedsMigration  bool     `json:"needs_migration"`
	CurrentVersion  string   `json:"current_version,omitempty"`
	TargetVersion   string   `json:"target_version"`
	Summary         string   `json:"summary"`
	TotalFiles      int      `json:"total_files"`
	FilesNeedingFix int      `json:"files_needing_fix"`
	UpToDateFiles   int      `json:"up_to_date_files"`
	Guidance        Guidance `json:"guidance"`
}

// handleCheckMigrationStatus handles the epf_check_migration_status tool
func (s *Server) handleCheckMigrationStatus(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	detector, err := migration.NewDetector(s.schemasDir)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create migration detector: %s", err.Error())), nil
	}

	status, err := detector.DetectMigrationStatus(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to detect migration status: %s", err.Error())), nil
	}

	response := &MigrationStatusResponse{
		NeedsMigration:  status.NeedsMigration,
		CurrentVersion:  status.CurrentVersion,
		TargetVersion:   status.TargetVersion,
		Summary:         status.Summary,
		TotalFiles:      status.TotalFiles,
		FilesNeedingFix: status.FilesNeedingFix,
		UpToDateFiles:   status.UpToDateFiles,
		Guidance:        Guidance{},
	}

	// Build guidance
	if status.NeedsMigration {
		response.Guidance.Warnings = append(response.Guidance.Warnings,
			fmt.Sprintf("%d file(s) need migration to version %s", status.FilesNeedingFix, status.TargetVersion))
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			"Run epf_get_migration_guide for detailed per-file instructions")
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			"Run `epf-cli migrate` to auto-update version numbers")
	} else {
		response.Guidance.Tips = append(response.Guidance.Tips,
			fmt.Sprintf("All %d files are up to date with schema version %s", status.TotalFiles, status.TargetVersion))
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// MigrationGuideResponse is the response for epf_get_migration_guide
type MigrationGuideResponse struct {
	InstancePath    string                   `json:"instance_path"`
	CurrentVersion  string                   `json:"current_version,omitempty"`
	TargetVersion   string                   `json:"target_version"`
	Summary         string                   `json:"summary"`
	TotalChanges    int                      `json:"total_changes"`
	BreakingChanges int                      `json:"breaking_changes"`
	AutoFixable     int                      `json:"auto_fixable"`
	ManualRequired  int                      `json:"manual_required"`
	FileGuides      []MigrationFileGuideItem `json:"file_guides,omitempty"`
	Guidance        Guidance                 `json:"guidance"`
}

// MigrationFileGuideItem represents a single file's migration guide
type MigrationFileGuideItem struct {
	Path             string                `json:"path"`
	ArtifactType     string                `json:"artifact_type"`
	CurrentVersion   string                `json:"current_version,omitempty"`
	TargetVersion    string                `json:"target_version"`
	Priority         string                `json:"priority"`
	Changes          []MigrationChangeItem `json:"changes"`
	ValidationErrors []string              `json:"validation_errors,omitempty"`
}

// MigrationChangeItem represents a single change needed
type MigrationChangeItem struct {
	Type           string      `json:"type"`
	Path           string      `json:"path"`
	Description    string      `json:"description"`
	SuggestedValue interface{} `json:"suggested_value,omitempty"`
	IsBreaking     bool        `json:"is_breaking"`
	IsAutoFixable  bool        `json:"is_auto_fixable"`
	Hint           string      `json:"hint,omitempty"`
}

// handleGetMigrationGuide handles the epf_get_migration_guide tool
func (s *Server) handleGetMigrationGuide(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	filePath, _ := request.RequireString("file_path")

	// Get templates directory
	templatesDir := filepath.Join(s.epfRoot, "templates")

	generator, err := migration.NewGuideGenerator(s.schemasDir, templatesDir)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to create guide generator: %s", err.Error())), nil
	}

	// If specific file requested, generate guide for just that file
	if filePath != "" {
		fileGuide, err := generator.GenerateFileGuide(filePath)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to generate file guide: %s", err.Error())), nil
		}

		// Convert to single-file response
		response := &MigrationGuideResponse{
			InstancePath:   instancePath,
			TargetVersion:  fileGuide.TargetVersion,
			CurrentVersion: fileGuide.CurrentVersion,
			Summary:        fmt.Sprintf("Migration guide for %s", filepath.Base(filePath)),
			TotalChanges:   len(fileGuide.Changes),
			FileGuides:     []MigrationFileGuideItem{convertFileGuide(fileGuide)},
			Guidance:       Guidance{},
		}

		for _, change := range fileGuide.Changes {
			if change.IsBreaking {
				response.BreakingChanges++
			}
			if change.IsAutoFixable {
				response.AutoFixable++
			} else {
				response.ManualRequired++
			}
		}

		buildMigrationGuidance(response)

		jsonBytes, err := json.MarshalIndent(response, "", "  ")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
		}

		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	// Generate full instance guide
	guide, err := generator.GenerateMigrationGuide(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to generate migration guide: %s", err.Error())), nil
	}

	response := &MigrationGuideResponse{
		InstancePath:    guide.InstancePath,
		CurrentVersion:  guide.CurrentVersion,
		TargetVersion:   guide.TargetVersion,
		Summary:         guide.Summary,
		TotalChanges:    guide.TotalChanges,
		BreakingChanges: guide.BreakingChanges,
		AutoFixable:     guide.AutoFixable,
		ManualRequired:  guide.ManualRequired,
		FileGuides:      make([]MigrationFileGuideItem, 0, len(guide.FileGuides)),
		Guidance:        Guidance{},
	}

	for _, fg := range guide.FileGuides {
		response.FileGuides = append(response.FileGuides, convertFileGuide(&fg))
	}

	// Map guidance from the generated guide
	response.Guidance.NextSteps = guide.Guidance.NextSteps
	response.Guidance.Warnings = guide.Guidance.Warnings
	response.Guidance.Tips = guide.Guidance.Tips

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// convertFileGuide converts internal FileGuide to MCP response format
func convertFileGuide(fg *migration.FileGuide) MigrationFileGuideItem {
	item := MigrationFileGuideItem{
		Path:           fg.Path,
		ArtifactType:   fg.ArtifactType,
		CurrentVersion: fg.CurrentVersion,
		TargetVersion:  fg.TargetVersion,
		Priority:       fg.Priority,
		Changes:        make([]MigrationChangeItem, 0, len(fg.Changes)),
	}

	for _, change := range fg.Changes {
		item.Changes = append(item.Changes, MigrationChangeItem{
			Type:           string(change.Type),
			Path:           change.Path,
			Description:    change.Description,
			SuggestedValue: change.SuggestedValue,
			IsBreaking:     change.IsBreaking,
			IsAutoFixable:  change.IsAutoFixable,
			Hint:           change.Hint,
		})
	}

	for _, ve := range fg.ValidationErrors {
		item.ValidationErrors = append(item.ValidationErrors, ve.Message)
	}

	return item
}

// buildMigrationGuidance adds guidance to a migration response
func buildMigrationGuidance(response *MigrationGuideResponse) {
	if response.AutoFixable > 0 {
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			fmt.Sprintf("Run `epf-cli migrate` to auto-fix %d version-related changes", response.AutoFixable))
	}

	if response.ManualRequired > 0 {
		response.Guidance.NextSteps = append(response.Guidance.NextSteps,
			fmt.Sprintf("Manually update %d field(s) that require content decisions", response.ManualRequired))
	}

	if response.BreakingChanges > 0 {
		response.Guidance.Warnings = append(response.Guidance.Warnings,
			fmt.Sprintf("%d breaking change(s) require attention", response.BreakingChanges))
	}

	response.Guidance.NextSteps = append(response.Guidance.NextSteps,
		"Run `epf-cli validate` to verify all files pass schema validation after migration")

	response.Guidance.Tips = append(response.Guidance.Tips,
		"Use `epf-cli templates show <artifact_type>` to see the current template structure")
}

// =============================================================================
// Relationship Maintenance Tools
// =============================================================================

// handleAddImplementationReference handles the epf_add_implementation_reference tool
func (s *Server) handleAddImplementationReference(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	featureID, err := request.RequireString("feature_id")
	if err != nil {
		return mcp.NewToolResultError("feature_id parameter is required"), nil
	}

	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	refType, err := request.RequireString("ref_type")
	if err != nil {
		return mcp.NewToolResultError("ref_type parameter is required"), nil
	}

	title, err := request.RequireString("title")
	if err != nil {
		return mcp.NewToolResultError("title parameter is required"), nil
	}

	url, err := request.RequireString("url")
	if err != nil {
		return mcp.NewToolResultError("url parameter is required"), nil
	}

	// Optional parameters
	status, _ := request.RequireString("status")
	description, _ := request.RequireString("description")

	// Validate ref_type
	validRefTypes := map[string]bool{
		"spec": true, "issue": true, "pr": true, "code": true, "documentation": true, "test": true,
	}
	if !validRefTypes[refType] {
		return mcp.NewToolResultError("ref_type must be one of: spec, issue, pr, code, documentation, test"), nil
	}

	// Create writer and add reference
	writer := relationships.NewWriter(instancePath)
	result, err := writer.AddImplementationReference(featureID, refType, title, url, status, description)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to add implementation reference: %s", err.Error())), nil
	}

	jsonBytes, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleUpdateCapabilityMaturity handles the epf_update_capability_maturity tool
func (s *Server) handleUpdateCapabilityMaturity(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	featureID, err := request.RequireString("feature_id")
	if err != nil {
		return mcp.NewToolResultError("feature_id parameter is required"), nil
	}

	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	capabilityID, err := request.RequireString("capability_id")
	if err != nil {
		return mcp.NewToolResultError("capability_id parameter is required"), nil
	}

	maturity, err := request.RequireString("maturity")
	if err != nil {
		return mcp.NewToolResultError("maturity parameter is required"), nil
	}

	evidence, err := request.RequireString("evidence")
	if err != nil {
		return mcp.NewToolResultError("evidence parameter is required"), nil
	}

	// Optional parameter
	deliveredByKR, _ := request.RequireString("delivered_by_kr")

	// Validate maturity level
	validMaturity := map[string]bool{
		"hypothetical": true, "emerging": true, "proven": true, "scaled": true,
	}
	if !validMaturity[maturity] {
		return mcp.NewToolResultError("maturity must be one of: hypothetical, emerging, proven, scaled"), nil
	}

	// Create writer and update maturity
	writer := relationships.NewWriter(instancePath)
	result, err := writer.UpdateCapabilityMaturity(featureID, capabilityID, maturity, evidence, deliveredByKR)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to update capability maturity: %s", err.Error())), nil
	}

	jsonBytes, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleAddMappingArtifact handles the epf_add_mapping_artifact tool
func (s *Server) handleAddMappingArtifact(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	subComponentID, err := request.RequireString("sub_component_id")
	if err != nil {
		return mcp.NewToolResultError("sub_component_id parameter is required"), nil
	}

	artifactType, err := request.RequireString("artifact_type")
	if err != nil {
		return mcp.NewToolResultError("artifact_type parameter is required"), nil
	}

	url, err := request.RequireString("url")
	if err != nil {
		return mcp.NewToolResultError("url parameter is required"), nil
	}

	description, err := request.RequireString("description")
	if err != nil {
		return mcp.NewToolResultError("description parameter is required"), nil
	}

	// Validate artifact_type
	validArtifactTypes := map[string]bool{
		"code": true, "design": true, "documentation": true, "test": true,
	}
	if !validArtifactTypes[artifactType] {
		return mcp.NewToolResultError("artifact_type must be one of: code, design, documentation, test"), nil
	}

	// Create writer and add artifact
	writer := relationships.NewWriter(instancePath)
	result, err := writer.AddMappingArtifact(subComponentID, artifactType, url, description)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to add mapping artifact: %s", err.Error())), nil
	}

	jsonBytes, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleSuggestRelationships handles the epf_suggest_relationships tool
func (s *Server) handleSuggestRelationships(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	artifactType, err := request.RequireString("artifact_type")
	if err != nil {
		return mcp.NewToolResultError("artifact_type parameter is required"), nil
	}

	artifactPath, err := request.RequireString("artifact_path")
	if err != nil {
		return mcp.NewToolResultError("artifact_path parameter is required"), nil
	}

	// Optional parameter
	includeCodeAnalysisStr, _ := request.RequireString("include_code_analysis")
	includeCodeAnalysis := strings.ToLower(includeCodeAnalysisStr) == "true"

	// Validate artifact_type
	validArtifactTypes := map[string]bool{
		"feature": true, "code_file": true, "pr": true,
	}
	if !validArtifactTypes[artifactType] {
		return mcp.NewToolResultError("artifact_type must be one of: feature, code_file, pr"), nil
	}

	// Create writer and suggest relationships
	writer := relationships.NewWriter(instancePath)
	result, err := writer.SuggestRelationships(artifactType, artifactPath, includeCodeAnalysis)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to suggest relationships: %s", err.Error())), nil
	}

	jsonBytes, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// ==========================================================================
// AI Agent Validation Handlers (v0.11.0)
// ==========================================================================

// handleValidateWithPlan handles the epf_validate_with_plan tool
func (s *Server) handleValidateWithPlan(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	path, err := request.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError("path parameter is required"), nil
	}

	// Get AI-friendly validation result
	aiResult, err := s.validator.ValidateFileAIFriendly(path)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Validation failed: %s", err.Error())), nil
	}

	// If valid, return a simple success response
	if aiResult.Valid {
		response := map[string]interface{}{
			"file":          path,
			"artifact_type": aiResult.ArtifactType,
			"valid":         true,
			"total_errors":  0,
			"total_chunks":  0,
			"message":       "File is valid, no fixes needed",
		}
		jsonBytes, _ := json.MarshalIndent(response, "", "  ")
		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	// Generate fix plan from validation errors
	gen := fixplan.NewGenerator(fixplan.GeneratorOptions{
		MaxErrorsPerChunk: 10,
		MaxCharsPerChunk:  6000,
		IncludeExamples:   true,
	})

	// Load template for this artifact type if available
	if s.templateLoader != nil && aiResult.ArtifactType != "" {
		artifactType, typeErr := schema.ArtifactTypeFromString(aiResult.ArtifactType)
		if typeErr == nil {
			if tmpl, tmplErr := s.templateLoader.GetTemplate(artifactType); tmplErr == nil {
				gen.SetTemplate(aiResult.ArtifactType, tmpl.Content)
			}
		}
	}

	plan := gen.Generate(aiResult)

	jsonBytes, err := json.MarshalIndent(plan, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize fix plan: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleValidateSection handles the epf_validate_section tool
func (s *Server) handleValidateSection(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	path, err := request.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError("path parameter is required"), nil
	}

	section, err := request.RequireString("section")
	if err != nil {
		return mcp.NewToolResultError("section parameter is required"), nil
	}

	// Use the new section-based AI-friendly validation
	aiResult, err := s.validator.ValidateSectionAIFriendly(path, section)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Validation failed: %s", err.Error())), nil
	}

	jsonBytes, err := json.MarshalIndent(aiResult, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize result: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleGetSectionExample handles the epf_get_section_example tool
func (s *Server) handleGetSectionExample(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	artifactTypeStr, err := request.RequireString("artifact_type")
	if err != nil {
		return mcp.NewToolResultError("artifact_type parameter is required"), nil
	}

	section, err := request.RequireString("section")
	if err != nil {
		return mcp.NewToolResultError("section parameter is required"), nil
	}

	// Get the template for this artifact type
	artifactType, err := schema.ArtifactTypeFromString(artifactTypeStr)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Invalid artifact type: %s", err.Error())), nil
	}

	templateInfo, err := s.templateLoader.GetTemplate(artifactType)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("No template available for artifact type '%s': %s", artifactTypeStr, err.Error())), nil
	}

	// Parse the template YAML
	var templateData map[string]interface{}
	if err := yaml.Unmarshal([]byte(templateInfo.Content), &templateData); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to parse template: %s", err.Error())), nil
	}

	// Extract the requested section
	sectionData, err := extractSectionFromTemplate(templateData, section)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Section '%s' not found in template: %s", section, err.Error())), nil
	}

	// Convert section back to YAML for display
	sectionYAML, err := yaml.Marshal(map[string]interface{}{section: sectionData})
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize section: %s", err.Error())), nil
	}

	// Build response
	response := map[string]interface{}{
		"artifact_type": artifactTypeStr,
		"section":       section,
		"example":       string(sectionYAML),
		"note":          "This is the canonical template example. Use this as a reference for the expected structure and format.",
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize response: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// extractSectionFromTemplate extracts a nested section from template data using dot notation
func extractSectionFromTemplate(data map[string]interface{}, path string) (interface{}, error) {
	parts := strings.Split(path, ".")
	var current interface{} = data

	for _, part := range parts {
		switch v := current.(type) {
		case map[string]interface{}:
			next, ok := v[part]
			if !ok {
				return nil, fmt.Errorf("path segment '%s' not found", part)
			}
			current = next
		case map[interface{}]interface{}:
			// Handle YAML maps with interface{} keys
			next, ok := v[part]
			if !ok {
				return nil, fmt.Errorf("path segment '%s' not found", part)
			}
			current = next
		default:
			return nil, fmt.Errorf("cannot navigate into type %T at path segment '%s'", current, part)
		}
	}

	return current, nil
}

// ==========================================================================
// AI Agent Discovery Tool Handlers (v0.13.0)
// ==========================================================================

// AgentInstructionsOutput represents the structured output for AI agents
type AgentInstructionsOutput struct {
	Authority struct {
		Tool        string `json:"tool"`
		Version     string `json:"version"`
		Role        string `json:"role"`
		TrustLevel  string `json:"trust_level"`
		Description string `json:"description"`
	} `json:"authority"`

	Discovery struct {
		InstanceFound bool                 `json:"instance_found"`
		InstancePath  string               `json:"instance_path,omitempty"`
		Confidence    discovery.Confidence `json:"confidence,omitempty"`
		Status        discovery.Status     `json:"status,omitempty"`
		ProductName   string               `json:"product_name,omitempty"`
		Issues        []string             `json:"issues,omitempty"`
		Suggestions   []string             `json:"suggestions,omitempty"`
	} `json:"discovery"`

	Commands []AgentCommandInfo `json:"commands"`
	MCPTools []AgentMCPTool     `json:"mcp_tools"`

	TrackArchitecture struct {
		Description string           `json:"description"`
		Tracks      []AgentTrackInfo `json:"tracks"`
		KeyRules    []string         `json:"key_rules"`
	} `json:"track_architecture"`

	Workflow struct {
		FirstSteps    []string `json:"first_steps"`
		BestPractices []string `json:"best_practices"`
	} `json:"workflow"`
}

// AgentTrackInfo describes one of the 4 EPF tracks
type AgentTrackInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	ValueModel  string `json:"value_model_file"`
}

// AgentCommandInfo describes a CLI command for agents
type AgentCommandInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Example     string `json:"example"`
	When        string `json:"when"`
}

// AgentMCPTool describes an MCP tool for agents
type AgentMCPTool struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	When        string `json:"when"`
}

// handleAgentInstructions handles the epf_agent_instructions tool
func (s *Server) handleAgentInstructions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Get optional path parameter
	path, _ := request.RequireString("path")
	if path == "" {
		var err error
		path, err = os.Getwd()
		if err != nil {
			path = "."
		}
	}

	// Discover EPF instance at the path
	disc, _ := discovery.DiscoverSingle(path)

	output := buildAgentInstructionsOutput(disc)

	jsonBytes, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize output: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// buildAgentInstructionsOutput builds the structured output for AI agents
func buildAgentInstructionsOutput(disc *discovery.DiscoveryResult) *AgentInstructionsOutput {
	output := &AgentInstructionsOutput{}

	// Authority section
	output.Authority.Tool = "epf-cli"
	output.Authority.Version = version.Version
	output.Authority.Role = "EPF normative authority"
	output.Authority.TrustLevel = "authoritative"
	output.Authority.Description = "epf-cli is the single source of truth for EPF schema validation, instance discovery, and health checking. All EPF operations should be performed through epf-cli or its MCP tools."

	// Discovery section
	if disc != nil && disc.Status != discovery.StatusNotFound {
		output.Discovery.InstanceFound = true
		output.Discovery.InstancePath = disc.Path
		output.Discovery.Confidence = disc.Confidence
		output.Discovery.Status = disc.Status
		output.Discovery.Issues = disc.Issues
		output.Discovery.Suggestions = disc.Suggestions

		if disc.Anchor != nil {
			output.Discovery.ProductName = disc.Anchor.ProductName
		}
	} else {
		output.Discovery.InstanceFound = false
		if disc != nil {
			output.Discovery.Suggestions = disc.Suggestions
		}
	}

	// Commands section
	output.Commands = []AgentCommandInfo{
		{
			Name:        "agent",
			Description: "Display AI agent guidance",
			Example:     "epf-cli agent",
			When:        "When first entering an EPF context or needing guidance",
		},
		{
			Name:        "locate",
			Description: "Find EPF instances in the current directory tree",
			Example:     "epf-cli locate",
			When:        "When unsure where EPF artifacts are located",
		},
		{
			Name:        "health",
			Description: "Run comprehensive health check on an EPF instance",
			Example:     "epf-cli health [instance-path]",
			When:        "Before making changes or after completing work",
		},
		{
			Name:        "validate",
			Description: "Validate YAML files against EPF schemas",
			Example:     "epf-cli validate path/to/file.yaml",
			When:        "After creating or modifying EPF artifacts",
		},
		{
			Name:        "schemas",
			Description: "List available EPF schemas",
			Example:     "epf-cli schemas list",
			When:        "When needing to understand artifact structure",
		},
		{
			Name:        "init",
			Description: "Initialize a new EPF instance",
			Example:     "epf-cli init [path]",
			When:        "When creating a new product EPF structure",
		},
		{
			Name:        "migrate-anchor",
			Description: "Add anchor file to legacy EPF instance",
			Example:     "epf-cli migrate-anchor [instance-path]",
			When:        "When working with legacy instances lacking _epf.yaml",
		},
	}

	// MCP Tools section
	output.MCPTools = []AgentMCPTool{
		{
			Name:        "epf_validate_file",
			Description: "Validate a single EPF artifact file",
			When:        "After editing EPF YAML files",
		},
		{
			Name:        "epf_health_check",
			Description: "Run comprehensive instance health check",
			When:        "Before/after making changes to verify state",
		},
		{
			Name:        "epf_get_schema",
			Description: "Get JSON schema for an artifact type",
			When:        "When creating new artifacts or debugging validation",
		},
		{
			Name:        "epf_get_template",
			Description: "Get starting template for an artifact type",
			When:        "When creating new EPF artifacts",
		},
		{
			Name:        "epf_list_wizards",
			Description: "List available EPF wizards",
			When:        "When looking for guided workflows",
		},
		{
			Name:        "epf_get_wizard_for_task",
			Description: "Get recommended wizard for a task",
			When:        "When unsure which wizard to use",
		},
		{
			Name:        "epf_locate_instance",
			Description: "Find EPF instances programmatically",
			When:        "When building automation or discovery",
		},
		{
			Name:        "epf_agent_instructions",
			Description: "Get this guidance programmatically",
			When:        "When initializing EPF agent context",
		},
	}

	// Track Architecture section
	output.TrackArchitecture.Description = "EPF uses 4 braided tracks that together form a complete product operating system. Every EPF instance should have value models for all 4 tracks in FIRE/value_models/."
	output.TrackArchitecture.Tracks = []AgentTrackInfo{
		{
			Name:        "Product",
			Description: "Core product capabilities, user experiences, and technical infrastructure. Built from scratch per product — unique to each instance.",
			ValueModel:  "product.value_model.yaml",
		},
		{
			Name:        "Strategy",
			Description: "Market positioning, competitive intelligence, growth strategy, and value creation. Ships as a canonical template — activate relevant sub-components.",
			ValueModel:  "strategy.value_model.yaml",
		},
		{
			Name:        "OrgOps",
			Description: "Development processes, team operations, strategy execution, and organizational capabilities. Ships as a canonical template — activate relevant sub-components.",
			ValueModel:  "org_ops.value_model.yaml",
		},
		{
			Name:        "Commercial",
			Description: "Revenue generation, client relationships, proposal generation, and commercial operations. Ships as a canonical template — activate relevant sub-components.",
			ValueModel:  "commercial.value_model.yaml",
		},
	}
	output.TrackArchitecture.KeyRules = []string{
		"All 4 tracks must have value model files in FIRE/value_models/",
		"Product track is built from scratch — unique to each product",
		"Strategy, OrgOps, and Commercial ship as canonical templates with sub-components set to active: false",
		"Activate sub-components by setting active: true as the organization invests in those areas",
		"Feature contributes_to paths, roadmap KR targets, and coverage analysis all reference value model paths",
		"Missing tracks cause dangling references and incomplete coverage analysis",
		"Run 'epf health' to check track completeness — it warns about missing tracks",
	}

	// Workflow guidance
	output.Workflow.FirstSteps = []string{
		"1. Call epf_agent_instructions to understand available tools",
		"2. Call epf_locate_instance to find EPF instances",
		"3. Call epf_health_check on the instance to assess current state",
		"4. Use appropriate MCP tools (epf_*) for specific operations",
	}

	output.Workflow.BestPractices = []string{
		"Always validate files after editing: epf_validate_file",
		"Run health check before and after major changes",
		"Use wizards for guided artifact creation",
		"Never guess artifact structure - use schemas and templates",
		"Prefer MCP tools over direct file manipulation when available",
	}

	return output
}

// LocateInstanceOutput represents the output for epf_locate_instance
type LocateInstanceOutput struct {
	SearchPath string                       `json:"search_path"`
	Instances  []*discovery.DiscoveryResult `json:"instances"`
	Summary    struct {
		Total  int `json:"total"`
		Valid  int `json:"valid"`
		Legacy int `json:"legacy"`
		Broken int `json:"broken"`
	} `json:"summary"`
}

// handleLocateInstance handles the epf_locate_instance tool
func (s *Server) handleLocateInstance(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Get optional path parameter
	path, _ := request.RequireString("path")
	if path == "" {
		var err error
		path, err = os.Getwd()
		if err != nil {
			path = "."
		}
	}

	// Get optional max_depth parameter
	maxDepth := 5
	if maxDepthStr, _ := request.RequireString("max_depth"); maxDepthStr != "" {
		if parsed, err := fmt.Sscanf(maxDepthStr, "%d", &maxDepth); err != nil || parsed != 1 {
			maxDepth = 5
		}
	}

	// Get optional require_anchor parameter
	requireAnchor := false
	if requireAnchorStr, _ := request.RequireString("require_anchor"); requireAnchorStr != "" {
		requireAnchor = strings.ToLower(requireAnchorStr) == "true"
	}

	// Build discovery options
	opts := &discovery.DiscoveryOptions{
		MaxDepth:      maxDepth,
		IncludeLegacy: !requireAnchor,
		RequireAnchor: requireAnchor,
	}

	// Get absolute path
	absPath, err := filepath.Abs(path)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Invalid path: %s", err.Error())), nil
	}

	// Run discovery
	results, err := discovery.Discover(absPath, opts)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Discovery failed: %s", err.Error())), nil
	}

	// Build output
	output := &LocateInstanceOutput{
		SearchPath: absPath,
		Instances:  results,
	}

	// Calculate summary
	for _, r := range results {
		output.Summary.Total++
		switch r.Status {
		case discovery.StatusValid:
			output.Summary.Valid++
		case discovery.StatusLegacy:
			output.Summary.Legacy++
		case discovery.StatusBroken:
			output.Summary.Broken++
		}
	}

	jsonBytes, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize output: %s", err.Error())), nil
	}

	return mcp.NewToolResultText(string(jsonBytes)), nil
}
