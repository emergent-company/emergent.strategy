package embedded

// FieldMapping declares a field path that the decomposer reads from a given
// EPF artifact type. The reconciliation test verifies each path exists in the
// corresponding JSON schema.
type FieldMapping struct {
	// ArtifactType is the EPF artifact type (e.g. "feature_definition").
	ArtifactType string
	// SchemaFile is the JSON schema filename (e.g. "feature_definition_schema.json").
	SchemaFile string
	// JSONPath is the dot-separated path into the schema's properties tree.
	// Array elements are denoted with "[]" (e.g. "definition.capabilities[].name").
	JSONPath string
	// DecomposerFunc is the name of the decomposer function that reads this field.
	DecomposerFunc string
}

// DecomposerFieldManifest declares all field paths read by the decomposer from
// EPF artifact payloads. This manifest is verified against the embedded JSON
// schemas by TestDecomposerFieldsMatchSchemas.
//
// Maintain this list when adding new field extractions to the decomposer.
var DecomposerFieldManifest = []FieldMapping{
	// -----------------------------------------------------------------------
	// Feature definition (decomposeFeatureFile)
	// -----------------------------------------------------------------------
	{"feature_definition", "feature_definition_schema.json", "id", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "name", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "slug", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "status", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "strategic_context.contributes_to", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "strategic_context.tracks", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "strategic_context.assumptions_tested", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.job_to_be_done", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.solution_approach", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.personas[].name", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.personas[].role", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.personas[].description", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.personas[].goals", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.personas[].pain_points", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.capabilities[].name", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "definition.capabilities[].description", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "implementation.scenarios[].name", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "implementation.scenarios[].context", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "dependencies.requires", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "dependencies.enables", "decomposeFeatureFile"},
	{"feature_definition", "feature_definition_schema.json", "feature_maturity.overall_stage", "decomposeFeatureFile"},

	// -----------------------------------------------------------------------
	// North star (decomposeNorthStar)
	// -----------------------------------------------------------------------
	{"north_star", "north_star_schema.json", "north_star.organization", "decomposeNorthStar"},
	{"north_star", "north_star_schema.json", "north_star.purpose", "decomposeNorthStar"},
	{"north_star", "north_star_schema.json", "north_star.vision", "decomposeNorthStar"},
	{"north_star", "north_star_schema.json", "north_star.mission", "decomposeNorthStar"},

	// -----------------------------------------------------------------------
	// Strategy foundations (decomposeStrategyFoundations)
	// The schema nests fields under "strategy_foundations" object.
	// The decomposer reads the outer keys which map to properties at root.
	// -----------------------------------------------------------------------
	{"strategy_foundations", "strategy_foundations_schema.json", "strategy_foundations", "decomposeStrategyFoundations"},
	{"strategy_foundations", "strategy_foundations_schema.json", "consistency_validation", "decomposeStrategyFoundations"},

	// -----------------------------------------------------------------------
	// Strategy formula (decomposeStrategyFormula)
	// -----------------------------------------------------------------------
	{"strategy_formula", "strategy_formula_schema.json", "strategy.title", "decomposeStrategyFormula"},
	{"strategy_formula", "strategy_formula_schema.json", "strategy.positioning", "decomposeStrategyFormula"},
	{"strategy_formula", "strategy_formula_schema.json", "strategy.competitive_moat", "decomposeStrategyFormula"},
	{"strategy_formula", "strategy_formula_schema.json", "strategy.value_creation", "decomposeStrategyFormula"},
	{"strategy_formula", "strategy_formula_schema.json", "strategy.constraints", "decomposeStrategyFormula"},
	{"strategy_formula", "strategy_formula_schema.json", "strategy.risks", "decomposeStrategyFormula"},
	{"strategy_formula", "strategy_formula_schema.json", "strategy.success_metrics", "decomposeStrategyFormula"},
	{"strategy_formula", "strategy_formula_schema.json", "strategy.status", "decomposeStrategyFormula"},

	// -----------------------------------------------------------------------
	// Value model (decomposeValueModelFile)
	// -----------------------------------------------------------------------
	{"value_model", "value_model_schema.json", "track_name", "decomposeValueModelFile"},
	{"value_model", "value_model_schema.json", "version", "decomposeValueModelFile"},
	{"value_model", "value_model_schema.json", "status", "decomposeValueModelFile"},
	{"value_model", "value_model_schema.json", "description", "decomposeValueModelFile"},
	{"value_model", "value_model_schema.json", "layers", "decomposeValueModelFile"},
	{"value_model", "value_model_schema.json", "track_maturity", "decomposeValueModelFile"},

	// -----------------------------------------------------------------------
	// Roadmap recipe (decomposeRoadmap)
	// -----------------------------------------------------------------------
	{"roadmap_recipe", "roadmap_recipe_schema.json", "roadmap.tracks", "decomposeRoadmap"},
	{"roadmap_recipe", "roadmap_recipe_schema.json", "roadmap.execution_plan", "decomposeRoadmap"},
	{"roadmap_recipe", "roadmap_recipe_schema.json", "roadmap.status", "decomposeRoadmap"},

	// -----------------------------------------------------------------------
	// Insight analyses (decomposeInsightAnalyses)
	// -----------------------------------------------------------------------
	{"insight_analyses", "insight_analyses_schema.json", "trends", "decomposeInsightAnalyses"},
	{"insight_analyses", "insight_analyses_schema.json", "competitive_landscape", "decomposeInsightAnalyses"},
	{"insight_analyses", "insight_analyses_schema.json", "key_insights", "decomposeInsightAnalyses"},
	{"insight_analyses", "insight_analyses_schema.json", "market_definition", "decomposeInsightAnalyses"},
}
