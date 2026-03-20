// Package decompose — schema.go defines the EPF graph type contract.
//
// The decomposer code IS the schema source of truth. These type definitions
// are reconciled against the Memory project at ingest/sync time via Reconcile().
// There is no separate schema JSON file to maintain.
package decompose

// ObjectTypeDef defines an object type the decomposer produces.
type ObjectTypeDef struct {
	Name        string
	Label       string
	Description string
	InertiaTier int // 1-7, where 1 = highest inertia (hardest to change)
	Category    string
	Icon        string
	Color       string
	Properties  map[string]PropertyDef
}

// PropertyDef describes a property on an object or relationship type.
type PropertyDef struct {
	Type        string // always "string" for Memory compatibility
	Description string
}

// RelTypeDef defines a relationship type the decomposer produces.
type RelTypeDef struct {
	Name        string
	Label       string
	Description string
	EdgeSource  string // "structural", "semantic", or "causal"
	FromTypes   []string
	ToTypes     []string
	Properties  map[string]PropertyDef
}

// commonProps returns properties shared by all section-level objects.
func commonProps() map[string]PropertyDef {
	return map[string]PropertyDef{
		"inertia_tier":    {Type: "string", Description: "Inertia tier (1-7) in the EPF hierarchy"},
		"source_artifact": {Type: "string", Description: "Path to the source YAML file"},
		"section_path":    {Type: "string", Description: "YAML path within the artifact"},
	}
}

// mergeProps combines base properties with extras.
func mergeProps(base map[string]PropertyDef, extras map[string]PropertyDef) map[string]PropertyDef {
	merged := make(map[string]PropertyDef, len(base)+len(extras))
	for k, v := range base {
		merged[k] = v
	}
	for k, v := range extras {
		merged[k] = v
	}
	return merged
}

// weightEdgeProps are standard properties for structural edges.
var weightEdgeProps = map[string]PropertyDef{
	"weight":      {Type: "string", Description: "Edge weight (0.0-1.0)"},
	"edge_source": {Type: "string", Description: "Source: structural, semantic, or causal"},
}

// semanticEdgeProps are properties for semantic edges discovered via embeddings.
var semanticEdgeProps = map[string]PropertyDef{
	"confidence":  {Type: "string", Description: "Confidence score (0.0-1.0) from embedding similarity"},
	"weight":      {Type: "string", Description: "Edge weight (0.0-1.0)"},
	"edge_source": {Type: "string", Description: "Source: semantic"},
}

// causalEdgeProps are properties for causal edges.
var causalEdgeProps = map[string]PropertyDef{
	"strength":    {Type: "string", Description: "Causal strength (0.0-1.0)"},
	"weight":      {Type: "string", Description: "Edge weight (0.0-1.0)"},
	"edge_source": {Type: "string", Description: "Source: causal"},
}

// ObjectTypes returns all object types the decomposer produces.
// This is the single source of truth for the EPF graph schema.
func ObjectTypes() []ObjectTypeDef {
	return []ObjectTypeDef{
		{
			Name: "Artifact", Label: "Artifact", InertiaTier: 0, Category: "Framework", Icon: "FileText", Color: "#6366F1",
			Description: "An EPF YAML artifact file. Parent node for section-level objects extracted from this file.",
			Properties: map[string]PropertyDef{
				"name":          {Type: "string", Description: "Artifact filename"},
				"description":   {Type: "string", Description: "What this artifact defines or contains"},
				"artifact_type": {Type: "string", Description: "EPF type: north_star, strategy_formula, etc."},
				"phase":         {Type: "string", Description: "EPF phase: READY, FIRE, or AIM"},
				"file_path":     {Type: "string", Description: "Relative path within the EPF instance"},
				"inertia_tier":  {Type: "string", Description: "Inertia tier based on artifact type"},
			},
		},
		{
			Name: "Belief", Label: "Belief", InertiaTier: 1, Category: "North Star", Icon: "Compass", Color: "#7C3AED",
			Description: "A single core belief from the North Star. Tier 1 — highest inertia, requires strong evidence to change.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Short label for the belief"}, "statement": {Type: "string", Description: "The belief statement"},
				"implication": {Type: "string", Description: "What this belief implies"}, "evidence": {Type: "string", Description: "Evidence supporting this belief"},
				"category": {Type: "string", Description: "Belief category"},
			}),
		},
		{
			Name: "Trend", Label: "Trend", InertiaTier: 2, Category: "Insights", Icon: "TrendingUp", Color: "#0EA5E9",
			Description: "A market, technology, or user behavior trend from insight analyses. Tier 2.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Trend name"}, "description": {Type: "string", Description: "What this trend is"},
				"trend_type": {Type: "string", Description: "Type: technology, market, user_behavior, regulatory"},
				"timeframe":  {Type: "string", Description: "Timeframe: near_term, medium_term, long_term"}, "impact": {Type: "string", Description: "Expected impact"},
			}),
		},
		{
			Name: "PainPoint", Label: "Pain Point", InertiaTier: 2, Category: "Insights", Icon: "AlertTriangle", Color: "#F97316",
			Description: "A specific persona pain point from insight analyses or feature definitions. Tier 2.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Short label"}, "description": {Type: "string", Description: "What the pain point is"},
				"severity": {Type: "string", Description: "Severity: critical, high, medium, low"}, "persona_ref": {Type: "string", Description: "Reference to persona"},
			}),
		},
		{
			Name: "Persona", Label: "Persona", InertiaTier: 2, Category: "Insights", Icon: "User", Color: "#F59E0B",
			Description: "A target user persona defined in the EPF strategy. Tier 2.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Persona name"}, "description": {Type: "string", Description: "Who this persona is"},
				"persona_id": {Type: "string", Description: "EPF persona identifier"}, "role": {Type: "string", Description: "Professional role"},
				"goals": {Type: "string", Description: "Primary goals"},
			}),
		},
		{
			Name: "Positioning", Label: "Positioning", InertiaTier: 3, Category: "Strategy", Icon: "Flag", Color: "#DC2626",
			Description: "A competitive positioning claim from the strategy formula. Tier 3.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Short label"}, "claim": {Type: "string", Description: "Positioning statement"},
				"vs_competitor": {Type: "string", Description: "Competitor this positions against"}, "moat_type": {Type: "string", Description: "Competitive advantage type"},
			}),
		},
		{
			Name: "OKR", Label: "OKR", InertiaTier: 4, Category: "Roadmap", Icon: "Target", Color: "#EF4444",
			Description: "An Objective or Key Result from the EPF roadmap. Tier 4.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "OKR title"}, "description": {Type: "string", Description: "What this OKR aims to achieve"},
				"okr_id": {Type: "string", Description: "Key Result ID"}, "track": {Type: "string", Description: "Track: product, strategy, org_ops, commercial"},
				"cycle": {Type: "string", Description: "Cycle reference"}, "status": {Type: "string", Description: "Status"},
				"target_value": {Type: "string", Description: "Target metric or outcome"},
			}),
		},
		{
			Name: "Assumption", Label: "Assumption", InertiaTier: 4, Category: "Roadmap", Icon: "HelpCircle", Color: "#FBBF24",
			Description: "A riskiest assumption from the roadmap. Tier 4.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Short label"}, "assumption_id": {Type: "string", Description: "EPF assumption ID"},
				"hypothesis": {Type: "string", Description: "Assumption statement"}, "category": {Type: "string", Description: "Category: feasibility, desirability, viability"},
				"criticality": {Type: "string", Description: "Criticality"}, "status": {Type: "string", Description: "Status: pending, validated, invalidated"},
			}),
		},
		{
			Name: "ValueModelComponent", Label: "Value Model Component", InertiaTier: 5, Category: "Value Model", Icon: "Layers", Color: "#10B981",
			Description: "A component in the EPF value model hierarchy (L1/L2/L3). Tier 5.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Component name"}, "description": {Type: "string", Description: "What value this delivers"},
				"value_path": {Type: "string", Description: "Full dotted path"}, "track": {Type: "string", Description: "Track"},
				"level": {Type: "string", Description: "Hierarchy level: L1, L2, L3"}, "maturity": {Type: "string", Description: "Maturity stage"},
			}),
		},
		{
			Name: "Feature", Label: "Feature", InertiaTier: 6, Category: "Execution", Icon: "Box", Color: "#3B82F6",
			Description: "A product feature from an EPF feature definition. Tier 6.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Feature name"}, "description": {Type: "string", Description: "What this feature does"},
				"feature_id": {Type: "string", Description: "EPF feature ID"}, "status": {Type: "string", Description: "Status"},
				"jtbd": {Type: "string", Description: "Jobs-to-be-done statement"},
			}),
		},
		{
			Name: "Scenario", Label: "Scenario", InertiaTier: 6, Category: "Execution", Icon: "Play", Color: "#2563EB",
			Description: "A user scenario from a feature definition. Tier 6.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Scenario name"}, "description": {Type: "string", Description: "The scenario narrative"},
				"persona_ref": {Type: "string", Description: "Reference to persona"}, "feature_ref": {Type: "string", Description: "Reference to parent feature"},
			}),
		},
		{
			Name: "Capability", Label: "Capability", InertiaTier: 7, Category: "Execution", Icon: "CheckCircle", Color: "#059669",
			Description: "A single capability within a feature definition. Tier 7 — lowest inertia.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Capability name"}, "description": {Type: "string", Description: "What this capability does"},
				"capability_id": {Type: "string", Description: "EPF capability ID"}, "maturity": {Type: "string", Description: "Maturity stage"},
				"evidence": {Type: "string", Description: "Evidence supporting maturity"}, "feature_ref": {Type: "string", Description: "Reference to parent feature"},
			}),
		},
		// New types from v2.1.0
		{
			Name: "Constraint", Label: "Constraint", InertiaTier: 3, Category: "Strategy", Icon: "Lock", Color: "#9CA3AF",
			Description: "A technical or strategic constraint from feature definitions or roadmap. Tier 3.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Constraint description"}, "description": {Type: "string", Description: "Full constraint text"},
				"constraint_type": {Type: "string", Description: "Type: technical, strategic, resource, regulatory"},
			}),
		},
		{
			Name: "CrossTrackDependency", Label: "Cross-Track Dependency", InertiaTier: 4, Category: "Roadmap", Icon: "GitBranch", Color: "#D97706",
			Description: "A dependency between key results across different tracks. Tier 4.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name": {Type: "string", Description: "Dependency description"}, "description": {Type: "string", Description: "Why this dependency exists"},
				"from_kr": {Type: "string", Description: "Source KR ID"}, "to_kr": {Type: "string", Description: "Target KR ID"},
				"dependency_type": {Type: "string", Description: "Type: requires, enables, blocks"},
			}),
		},
		// Evidence / reference documents (AIM phase)
		{
			Name: "ReferenceDocument", Label: "Reference Document", InertiaTier: 2, Category: "Evidence", Icon: "FileText", Color: "#64748B",
			Description: "Unstructured evidence from AIM/evidence/ — competitive intelligence, partner context, technical data, market analysis. Not authoritative — supplements formal EPF artifacts for AIM processes.",
			Properties: mergeProps(commonProps(), map[string]PropertyDef{
				"name":         {Type: "string", Description: "Document filename"},
				"description":  {Type: "string", Description: "Brief summary or first line of the document"},
				"category":     {Type: "string", Description: "Evidence category: competitive, partner, technical, market, narrative, product-specs, internal"},
				"content_hash": {Type: "string", Description: "SHA-256 hash for change detection during sync"},
				"file_format":  {Type: "string", Description: "File format: md, pdf, docx, html"},
			}),
		},

		// Agent and Skill types (tooling, not strategy — included for completeness)
		{
			Name: "Agent", Label: "Agent", InertiaTier: 6, Category: "AI", Icon: "Zap", Color: "#8B5CF6",
			Description: "An AI agent persona that orchestrates EPF workflows.",
			Properties: map[string]PropertyDef{
				"name": {Type: "string", Description: "Agent name"}, "description": {Type: "string", Description: "What this agent does"},
				"agent_type": {Type: "string", Description: "Type: guide, strategist, specialist, architect, reviewer"},
				"phase":      {Type: "string", Description: "EPF phase"}, "inertia_tier": {Type: "string", Description: "6"},
			},
		},
		{
			Name: "Skill", Label: "Skill", InertiaTier: 7, Category: "AI", Icon: "Shield", Color: "#EC4899",
			Description: "A bundled capability with prompts, prerequisites, and validation.",
			Properties: map[string]PropertyDef{
				"name": {Type: "string", Description: "Skill name"}, "description": {Type: "string", Description: "What this skill produces"},
				"skill_type": {Type: "string", Description: "Type: creation, generation, review, enrichment, analysis"},
				"category":   {Type: "string", Description: "Category"}, "inertia_tier": {Type: "string", Description: "7"},
			},
		},
	}
}

// RelationshipTypes returns all relationship types the decomposer produces or
// that semantic-edges creates. This is the complete edge type registry.
func RelationshipTypes() []RelTypeDef {
	return []RelTypeDef{
		// === Structural edges (created by the decomposer) ===
		{Name: "contains", Label: "Contains", EdgeSource: "structural",
			Description: "An artifact contains a section-level object, or a feature contains capabilities/scenarios",
			FromTypes:   []string{"Artifact", "Feature", "OKR"}, ToTypes: []string{"Belief", "Trend", "PainPoint", "Positioning", "Assumption", "Capability", "Scenario", "Persona", "OKR", "Constraint", "CrossTrackDependency"},
			Properties: weightEdgeProps},
		{Name: "contributes_to", Label: "Contributes To", EdgeSource: "structural",
			Description: "A feature contributes value to a value model component",
			FromTypes:   []string{"Feature"}, ToTypes: []string{"ValueModelComponent"}, Properties: weightEdgeProps},
		{Name: "targets", Label: "Targets", EdgeSource: "structural",
			Description: "An OKR targets advancement of a value model component",
			FromTypes:   []string{"OKR"}, ToTypes: []string{"ValueModelComponent"}, Properties: weightEdgeProps},
		{Name: "serves", Label: "Serves", EdgeSource: "structural",
			Description: "A feature serves a specific persona",
			FromTypes:   []string{"Feature"}, ToTypes: []string{"Persona"}, Properties: weightEdgeProps},
		{Name: "depends_on", Label: "Depends On", EdgeSource: "structural",
			Description: "A feature depends on another feature",
			FromTypes:   []string{"Feature"}, ToTypes: []string{"Feature"}, Properties: weightEdgeProps},
		{Name: "tests_assumption", Label: "Tests Assumption", EdgeSource: "structural",
			Description: "A feature or OKR tests a riskiest assumption",
			FromTypes:   []string{"Feature", "OKR"}, ToTypes: []string{"Assumption"}, Properties: weightEdgeProps},
		{Name: "uses_skill", Label: "Uses Skill", EdgeSource: "structural",
			Description: "An agent requires or uses a skill",
			FromTypes:   []string{"Agent"}, ToTypes: []string{"Skill"}, Properties: weightEdgeProps},
		{Name: "delivers", Label: "Delivers", EdgeSource: "structural",
			Description: "An OKR delivers or advances a feature",
			FromTypes:   []string{"OKR"}, ToTypes: []string{"Feature"}, Properties: weightEdgeProps},
		{Name: "shared_technology", Label: "Shared Technology", EdgeSource: "structural",
			Description: "Two features share contributes_to paths to the same value model component",
			FromTypes:   []string{"Feature"}, ToTypes: []string{"Feature"},
			Properties: mergeProps(weightEdgeProps, map[string]PropertyDef{
				"shared_component": {Type: "string", Description: "Value model path they share"},
			})},
		{Name: "converges_at", Label: "Converges At", EdgeSource: "structural",
			Description: "A cross-track dependency converges at a KR",
			FromTypes:   []string{"CrossTrackDependency"}, ToTypes: []string{"OKR"}, Properties: weightEdgeProps},

		// === Semantic edges (created by semantic-edges, NOT decomposer) ===
		{Name: "supports", Label: "Supports", EdgeSource: "semantic",
			Description: "One node semantically supports or reinforces another",
			FromTypes:   nil, ToTypes: nil, Properties: semanticEdgeProps},
		{Name: "contradicts", Label: "Contradicts", EdgeSource: "semantic",
			Description: "One node semantically contradicts another",
			FromTypes:   nil, ToTypes: nil, Properties: semanticEdgeProps},
		{Name: "elaborates", Label: "Elaborates", EdgeSource: "semantic",
			Description: "One node provides more detail for another",
			FromTypes:   nil, ToTypes: nil, Properties: semanticEdgeProps},
		{Name: "parallels", Label: "Parallels", EdgeSource: "semantic",
			Description: "Two nodes express similar concepts in different contexts",
			FromTypes:   nil, ToTypes: nil, Properties: semanticEdgeProps},

		// === Causal edges (created by decomposer for structural, semantic-edges for inferred) ===
		{Name: "informs", Label: "Informs", EdgeSource: "causal",
			Description: "A higher-tier node informs a lower-tier node (Belief → Positioning)",
			FromTypes:   nil, ToTypes: nil, Properties: causalEdgeProps},
		{Name: "validates", Label: "Validates", EdgeSource: "causal",
			Description: "Proven capability validates an assumption",
			FromTypes:   nil, ToTypes: []string{"Belief", "Assumption"}, Properties: causalEdgeProps},
		{Name: "invalidates", Label: "Invalidates", EdgeSource: "causal",
			Description: "AIM evidence invalidates a belief or assumption",
			FromTypes:   nil, ToTypes: []string{"Belief", "Assumption"}, Properties: causalEdgeProps},
		{Name: "constrains", Label: "Constrains", EdgeSource: "causal",
			Description: "An assumption constrains a feature (reverse of tests_assumption)",
			FromTypes:   nil, ToTypes: nil, Properties: causalEdgeProps},
	}
}

// ObjectTypeNames returns just the names for use in validation lists.
func ObjectTypeNames() []string {
	types := ObjectTypes()
	names := make([]string, len(types))
	for i, t := range types {
		names[i] = t.Name
	}
	return names
}

// GenerateTemplatePack produces a template pack JSON structure from the Go type definitions.
// This is used by the reconciliation logic to install the schema into Memory.
func GenerateTemplatePack() map[string]any {
	objTypes := ObjectTypes()
	relTypes := RelationshipTypes()

	var objectTypeSchemas []map[string]any
	for _, ot := range objTypes {
		props := map[string]any{}
		for k, v := range ot.Properties {
			props[k] = map[string]any{"type": v.Type, "description": v.Description}
		}
		objectTypeSchemas = append(objectTypeSchemas, map[string]any{
			"name":        ot.Name,
			"label":       ot.Label,
			"description": ot.Description,
			"properties":  props,
		})
	}

	var relationshipTypeSchemas []map[string]any
	for _, rt := range relTypes {
		props := map[string]any{}
		for k, v := range rt.Properties {
			props[k] = map[string]any{"type": v.Type, "description": v.Description}
		}
		from := rt.FromTypes
		to := rt.ToTypes
		if from == nil {
			from = []string{}
		}
		if to == nil {
			to = []string{}
		}
		relationshipTypeSchemas = append(relationshipTypeSchemas, map[string]any{
			"name":        rt.Name,
			"label":       rt.Label,
			"description": rt.Description,
			"fromTypes":   from,
			"toTypes":     to,
			"properties":  props,
		})
	}

	uiConfigs := map[string]any{}
	for _, ot := range objTypes {
		if ot.Icon != "" {
			uiConfigs[ot.Name] = map[string]any{
				"icon":     ot.Icon,
				"color":    ot.Color,
				"category": ot.Category,
			}
		}
	}

	return map[string]any{
		"name":              "epf-engine",
		"version":           "2.1.0",
		"description":       "Semantic strategy runtime schema — section-level strategy artifacts as graph nodes with structural, semantic, and causal edges. Auto-managed by epf-cli.",
		"author":            "emergent-company",
		"objectTypes":       objectTypeSchemas,
		"relationshipTypes": relationshipTypeSchemas,
		"ui_configs":        uiConfigs,
	}
}
