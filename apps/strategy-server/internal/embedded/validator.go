// Package embedded — validator.go
//
// ValidateArtifact validates a JSON payload against the embedded EPF JSON schema
// for the given artifact type.  DetectArtifactType infers the artifact type from
// the payload's top-level keys when the caller does not know it in advance.
package embedded

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// ---------------------------------------------------------------------------
// Artifact type → schema filename mapping
// ---------------------------------------------------------------------------

// artifactTypeToSchema maps EPF artifact type strings to their embedded schema
// filename (relative to the schemas/ directory).  Types without a dedicated
// schema are validated with structural best-effort only.
var artifactTypeToSchema = map[string]string{
	"feature":                   "feature_definition_schema.json",
	"north_star":                "north_star_schema.json",
	"strategy_foundations":      "strategy_foundations_schema.json",
	"strategy_formula":          "strategy_formula_schema.json",
	"insight_analyses":          "insight_analyses_schema.json",
	"insight_opportunity":       "insight_opportunity_schema.json",
	"value_model":               "value_model_schema.json",
	"roadmap":                   "roadmap_recipe_schema.json",
	"roadmap_recipe":            "roadmap_recipe_schema.json",
	"assessment_report":         "assessment_report_schema.json",
	"living_reality_assessment": "living_reality_assessment_schema.json",
	"aim_trigger_config":        "aim_trigger_config_schema.json",
	"commercial_def":            "commercial_definition_schema.json",
	"org_ops_def":               "org_ops_definition_schema.json",
	"strategy_def":              "strategy_definition_schema.json",
	"product_portfolio":         "product_portfolio_schema.json",
	"mappings":                  "mappings_schema.json",
}

// SchemaForType returns the embedded schema filename for the given artifact type,
// and a bool indicating whether a schema is registered.
func SchemaForType(artifactType string) (string, bool) {
	s, ok := artifactTypeToSchema[artifactType]
	return s, ok
}

// ---------------------------------------------------------------------------
// Auto-detection heuristic
// ---------------------------------------------------------------------------

// payloadSignatures maps artifact type to a set of top-level keys that
// are uniquely present in that artifact's payload.
var payloadSignatures = []struct {
	artifactType string
	keys         []string // ALL must be present for a match
}{
	{"feature", []string{"id", "strategic_context", "definition"}},
	{"north_star", []string{"north_star"}},
	{"strategy_foundations", []string{"target_customer", "geographic_focus"}},
	{"strategy_formula", []string{"strategy"}},
	{"insight_analyses", []string{"market_analysis"}},
	{"insight_opportunity", []string{"opportunity"}},
	{"value_model", []string{"track_name", "maturity_stages"}},
	{"roadmap_recipe", []string{"roadmap"}},
	{"assessment_report", []string{"assessment_period", "okrs_assessed"}},
	{"living_reality_assessment", []string{"lra_id", "strategic_alignment"}},
	{"aim_trigger_config", []string{"trigger_thresholds"}},
	{"commercial_def", []string{"commercial_model"}},
	{"org_ops_def", []string{"org_model"}},
	{"strategy_def", []string{"strategy_definition"}},
	{"product_portfolio", []string{"portfolio"}},
	{"mappings", []string{"mappings"}},
}

// DetectArtifactType infers the artifact type from the top-level keys of a JSON
// payload.  Returns ("", false) when no type can be inferred.
func DetectArtifactType(payload []byte) (string, bool) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(payload, &raw); err != nil {
		return "", false
	}
	for _, sig := range payloadSignatures {
		match := true
		for _, k := range sig.keys {
			if _, ok := raw[k]; !ok {
				match = false
				break
			}
		}
		if match {
			return sig.artifactType, true
		}
	}
	return "", false
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

// ValidationResult is the structured output of ValidateArtifact.
type ValidationResult struct {
	Valid        bool     `json:"valid"`
	ArtifactType string   `json:"artifact_type"`
	SchemaFile   string   `json:"schema_file,omitempty"`
	Errors       []string `json:"errors,omitempty"`
	Warnings     []string `json:"warnings,omitempty"`
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

// ValidateArtifact validates a JSON payload against the embedded EPF schema for
// artifactType.  If artifactType is empty, auto-detection is attempted first.
//
// When no schema is registered for the type, the function returns a result with
// Valid=true and a warning rather than an error — unknown types pass through.
func ValidateArtifact(artifactType string, payload []byte) ValidationResult {
	// Auto-detect if type is not provided.
	detected := false
	if artifactType == "" {
		t, ok := DetectArtifactType(payload)
		if !ok {
			return ValidationResult{
				Valid:        false,
				ArtifactType: "",
				Errors:       []string{"could not detect artifact type from payload structure"},
			}
		}
		artifactType = t
		detected = true
	}

	schemaFile, hasSchema := artifactTypeToSchema[artifactType]
	if !hasSchema {
		// No registered schema — pass through with a warning.
		result := ValidationResult{
			Valid:        true,
			ArtifactType: artifactType,
			Warnings:     []string{fmt.Sprintf("no schema registered for artifact type %q; structural validation skipped", artifactType)},
		}
		if detected {
			result.Warnings = append(result.Warnings, "artifact type was auto-detected")
		}
		return result
	}

	// Load the schema bytes.
	schemaBytes, err := GetSchema(schemaFile)
	if err != nil {
		return ValidationResult{
			Valid:        false,
			ArtifactType: artifactType,
			SchemaFile:   schemaFile,
			Errors:       []string{fmt.Sprintf("failed to load schema %q: %v", schemaFile, err)},
		}
	}

	// Compile the schema.
	schemaDoc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schemaBytes))
	if err != nil {
		return ValidationResult{
			Valid:        false,
			ArtifactType: artifactType,
			SchemaFile:   schemaFile,
			Errors:       []string{fmt.Sprintf("failed to parse schema %q: %v", schemaFile, err)},
		}
	}

	c := jsonschema.NewCompiler()
	if err := c.AddResource(schemaFile, schemaDoc); err != nil {
		return ValidationResult{
			Valid:        false,
			ArtifactType: artifactType,
			SchemaFile:   schemaFile,
			Errors:       []string{fmt.Sprintf("failed to register schema %q: %v", schemaFile, err)},
		}
	}

	sch, err := c.Compile(schemaFile)
	if err != nil {
		return ValidationResult{
			Valid:        false,
			ArtifactType: artifactType,
			SchemaFile:   schemaFile,
			Errors:       []string{fmt.Sprintf("failed to compile schema %q: %v", schemaFile, err)},
		}
	}

	// Unmarshal instance.
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return ValidationResult{
			Valid:        false,
			ArtifactType: artifactType,
			SchemaFile:   schemaFile,
			Errors:       []string{fmt.Sprintf("invalid JSON payload: %v", err)},
		}
	}

	// Validate.
	result := ValidationResult{
		ArtifactType: artifactType,
		SchemaFile:   schemaFile,
	}
	if detected {
		result.Warnings = append(result.Warnings, "artifact type was auto-detected")
	}

	if err := sch.Validate(instance); err != nil {
		result.Valid = false
		// Collect individual validation errors if the error is a *jsonschema.ValidationError.
		if ve, ok := err.(*jsonschema.ValidationError); ok {
			for _, e := range ve.Causes {
				result.Errors = append(result.Errors, e.Error())
			}
			if len(result.Errors) == 0 {
				result.Errors = []string{ve.Error()}
			}
		} else {
			result.Errors = []string{err.Error()}
		}
	} else {
		result.Valid = true
	}

	return result
}

// ---------------------------------------------------------------------------
// Content readiness scoring
// ---------------------------------------------------------------------------

// ReadinessReport is the output of CheckContentReadiness.
type ReadinessReport struct {
	ArtifactKey  string   `json:"artifact_key"`
	ArtifactType string   `json:"artifact_type"`
	Score        int      `json:"score"`   // 0–100
	Level        string   `json:"level"`   // "poor" | "fair" | "good" | "excellent"
	Missing      []string `json:"missing"` // recommended fields that are empty
	Suggestions  []string `json:"suggestions"`
}

// CheckContentReadiness scores the content quality of an artifact payload based
// on the presence of key fields for the given artifact type.
// It does not perform schema validation — call ValidateArtifact for that.
func CheckContentReadiness(artifactType, artifactKey string, payload []byte) ReadinessReport {
	report := ReadinessReport{
		ArtifactKey:  artifactKey,
		ArtifactType: artifactType,
	}

	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		report.Score = 0
		report.Level = "poor"
		report.Missing = []string{"payload could not be parsed as JSON"}
		return report
	}

	checks := readinessChecks(artifactType, raw)
	total := len(checks)
	if total == 0 {
		report.Score = 50
		report.Level = "fair"
		report.Suggestions = []string{"no content readiness rules defined for this artifact type"}
		return report
	}

	passed := 0
	for _, c := range checks {
		if c.present {
			passed++
		} else {
			report.Missing = append(report.Missing, c.field)
		}
	}

	report.Score = (passed * 100) / total
	switch {
	case report.Score >= 90:
		report.Level = "excellent"
	case report.Score >= 70:
		report.Level = "good"
	case report.Score >= 40:
		report.Level = "fair"
	default:
		report.Level = "poor"
	}

	if len(report.Missing) > 0 {
		report.Suggestions = append(report.Suggestions,
			fmt.Sprintf("complete missing fields: %s", strings.Join(report.Missing, ", ")))
	}

	return report
}

// readinessCheck is a single content presence check.
type readinessCheck struct {
	field   string
	present bool
}

// readinessChecks returns a list of field presence checks for the given artifact type.
func readinessChecks(artifactType string, raw map[string]any) []readinessCheck {
	has := func(keys ...string) bool {
		m := raw
		for i, k := range keys {
			v, ok := m[k]
			if !ok || v == nil {
				return false
			}
			if i == len(keys)-1 {
				// Last key — check non-empty.
				switch val := v.(type) {
				case string:
					return strings.TrimSpace(val) != ""
				case []any:
					return len(val) > 0
				case map[string]any:
					return len(val) > 0
				default:
					return true
				}
			}
			// Traverse into nested map.
			sub, ok := v.(map[string]any)
			if !ok {
				return false
			}
			m = sub
		}
		return false
	}

	switch artifactType {
	case "feature":
		return []readinessCheck{
			{"name", has("name")},
			{"status", has("status")},
			{"strategic_context.tracks", has("strategic_context", "tracks")},
			{"strategic_context.contributes_to", has("strategic_context", "contributes_to")},
			{"definition.problem_statement", has("definition", "problem_statement")},
			{"definition.value_proposition", has("definition", "value_proposition")},
			{"definition.capabilities", has("definition", "capabilities")},
		}
	case "north_star":
		return []readinessCheck{
			{"north_star.organization", has("north_star", "organization")},
			{"north_star.purpose", has("north_star", "purpose")},
			{"north_star.vision", has("north_star", "vision")},
		}
	case "strategy_foundations":
		return []readinessCheck{
			{"target_customer", has("target_customer")},
			{"geographic_focus", has("geographic_focus")},
			{"problem_space", has("problem_space")},
		}
	case "strategy_formula":
		return []readinessCheck{
			{"strategy.title", has("strategy", "title")},
			{"strategy.insight", has("strategy", "insight")},
			{"strategy.bet", has("strategy", "bet")},
			{"strategy.actions", has("strategy", "actions")},
		}
	case "value_model":
		return []readinessCheck{
			{"track_name", has("track_name")},
			{"maturity_stages", has("maturity_stages")},
			{"value_paths", has("value_paths")},
		}
	case "roadmap", "roadmap_recipe":
		return []readinessCheck{
			{"roadmap.tracks", has("roadmap", "tracks")},
			{"roadmap.milestones", has("roadmap", "milestones")},
		}
	case "insight_analyses":
		return []readinessCheck{
			{"market_analysis", has("market_analysis")},
			{"competitive_landscape", has("competitive_landscape")},
		}
	case "assessment_report":
		return []readinessCheck{
			{"assessment_period", has("assessment_period")},
			{"okrs_assessed", has("okrs_assessed")},
			{"findings", has("findings")},
		}
	default:
		// Generic: at least name/id and status.
		return []readinessCheck{
			{"name_or_id", has("name") || has("id")},
			{"status", has("status")},
		}
	}
}
