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

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/verdict"
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
	"work_package":              "work_package_schema.json",
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

// payloadSignatures says how to recognise each artifact type from its payload.
//
// Every entry here is derived from the type's own schema — the keys it declares
// `required`, and the value its `track` is pinned to by `const` where one
// applies. That is deliberate and worth keeping to. The previous table was
// written independently of the schemas and had drifted from all of them: nine
// of the seventeen entries named keys that are not properties of the schema
// they claim to detect, so those types could never be detected at all. On a
// real instance (emergent-company/emergent-epf, 177 artifacts) 146 were
// unclassifiable, including 131 of 131 across the three definition families.
// TestEverySignatureKeyIsDeclaredBySchema now makes that class of drift a test
// failure rather than something a consumer discovers.
//
// A match requires every key in keys to be present, and every entry in values
// to be present AND equal. Order matters only where two types could both match;
// the entries below are mutually exclusive on required keys.
var payloadSignatures = []struct {
	artifactType string
	keys         []string          // ALL must be present for a match
	values       map[string]string // ALL must be present and equal, when set
}{
	{artifactType: "feature", keys: []string{"id", "strategic_context", "definition"}},
	{artifactType: "north_star", keys: []string{"north_star"}},

	// Before strategy_formula, and the order is load-bearing: a mappings
	// payload has a top-level `strategy`, so the single-key signature below
	// would otherwise claim it. The old signature looked for a `mappings`
	// wrapper the schema does not declare.
	{artifactType: "mappings", keys: []string{"product", "strategy", "org_ops", "commercial"}},

	{artifactType: "strategy_formula", keys: []string{"strategy"}},
	{artifactType: "insight_opportunity", keys: []string{"opportunity"}},
	{artifactType: "roadmap_recipe", keys: []string{"roadmap"}},
	{artifactType: "product_portfolio", keys: []string{"portfolio"}},

	// Schema requires exactly this one top-level key, which wraps the content.
	// The old signature looked for target_customer/geographic_focus, fields
	// that live inside the wrapper and are not top-level properties.
	{artifactType: "strategy_foundations", keys: []string{"strategy_foundations"}},

	{artifactType: "insight_analyses", keys: []string{"last_updated", "confidence_level", "market_definition"}},
	{artifactType: "assessment_report", keys: []string{"roadmap_id", "cycle", "okr_assessments", "assumption_validations"}},
	{artifactType: "aim_trigger_config", keys: []string{"metadata", "adoption_level", "calendar_trigger", "value_driven_triggers"}},
	{artifactType: "living_reality_assessment", keys: []string{"metadata", "adoption_context", "track_baselines"}},
	{artifactType: "value_model", keys: []string{"track_name", "version", "status", "description"}},

	// The three track definitions share one base schema and are structurally
	// identical: the same eleven top-level keys, so no combination of key
	// presence can tell them apart. Each schema pins `track` with a const, and
	// that is the discriminator — which is why signatures carry values at all.
	{
		artifactType: "org_ops_def",
		keys:         trackDefinitionKeys,
		values:       map[string]string{"track": "org_ops"},
	},
	{
		artifactType: "strategy_def",
		keys:         trackDefinitionKeys,
		values:       map[string]string{"track": "strategy"},
	},
	{
		artifactType: "commercial_def",
		keys:         trackDefinitionKeys,
		values:       map[string]string{"track": "commercial"},
	},

	// Also carries `track`, with the same four values, but shares none of the
	// definition base's other required keys.
	{artifactType: "work_package", keys: []string{"track", "targets", "lifecycle"}},
}

// trackDefinitionKeys is required by track_definition_base_schema.json, which
// every track definition extends.
var trackDefinitionKeys = []string{
	"id", "name", "slug", "track", "status", "contributes_to", "maturity", "definition",
}

// DetectArtifactType infers the artifact type from the top-level keys of a JSON
// payload.  Returns ("", false) when no type can be inferred.
func DetectArtifactType(payload []byte) (string, bool) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(payload, &raw); err != nil {
		return "", false
	}
	for _, sig := range payloadSignatures {
		if signatureMatches(sig.keys, sig.values, raw) {
			return sig.artifactType, true
		}
	}
	return "", false
}

// signatureMatches reports whether a payload satisfies one signature.
func signatureMatches(keys []string, values map[string]string, raw map[string]json.RawMessage) bool {
	for _, k := range keys {
		if _, ok := raw[k]; !ok {
			return false
		}
	}
	for k, want := range values {
		rawVal, ok := raw[k]
		if !ok {
			return false
		}
		var got string
		if err := json.Unmarshal(rawVal, &got); err != nil || got != want {
			// A non-string, or the wrong string. Either way not this type —
			// never an error, because detection is a guess by construction and
			// its failure mode is "we do not know", not "this is broken".
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// Schema source interface
// ---------------------------------------------------------------------------

// SchemaSource provides raw JSON Schema bytes by filename.
// The DB-backed registry implements this; the embedded filesystem is the default.
type SchemaSource interface {
	// GetSchemaBytes returns the raw JSON Schema document for the given filename.
	GetSchemaBytes(schemaName string) ([]byte, error)
}

// embeddedSchemaSource is the default SchemaSource backed by go:embed.
type embeddedSchemaSource struct{}

func (embeddedSchemaSource) GetSchemaBytes(schemaName string) ([]byte, error) {
	return GetSchema(schemaName)
}

// EmbeddedSchemaSource returns a SchemaSource backed by the embedded filesystem.
func EmbeddedSchemaSource() SchemaSource {
	return embeddedSchemaSource{}
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

	// Findings is the same information as Errors, kept structured.
	//
	// Errors is prose and stays exactly as it was — plenty of callers read it
	// and the web UI renders it. But prose cannot be baselined: a consumer
	// that wants to accept an existing backlog and fail only on new problems
	// needs findings whose identity survives the validation library rewording
	// a message. (Key, Rule, Path) does; a sentence does not.
	//
	// Findings does NOT correspond to Errors index-for-index. Errors keeps the
	// library's top-level grouping, where a single "allOf" entry can carry a
	// whole subtree of unrelated problems in one newline-delimited string.
	// Findings flattens to the leaves, so each is one actionable problem at
	// one location. On real data that is the difference between 1 finding
	// reading "'allOf' failed" and 18 findings naming the fields at fault.
	Findings []verdict.Finding `json:"findings,omitempty"`
}

// rule id prefixes. These are a public contract — consumers baseline on them,
// so renaming one breaks them. See internal/verdict.Finding.Rule.
const (
	ruleSchemaPrefix = "schema."
	// ruleSchemaInvalid is the fallback when the validation library reports a
	// failure with no keyword attached.
	ruleSchemaInvalid = "schema.invalid"
	// ruleSchemaUnavailable means the check could not be performed — the
	// schema was missing, unparseable, or would not compile. Distinct from a
	// violation so a consumer can tell "this artifact is wrong" from "we
	// could not tell whether it is wrong".
	ruleSchemaUnavailable = "schema.unavailable"
	// rulePayloadInvalidJSON means the subject itself could not be parsed.
	rulePayloadInvalidJSON = "payload.invalid_json"
	// ruleArtifactTypeUndetected means auto-detection failed, so no schema
	// could be selected.
	ruleArtifactTypeUndetected = "artifact_type.undetected"
)

// schemaRefBase is the synthetic base URI schemas are registered under.
//
// Registering a schema as a bare filename makes the library resolve it
// against the process working directory, so a relative "$ref" to a sibling
// schema turns into a file:// URL pointing at wherever the binary happens to
// be running from. A fixed base removes the dependency on cwd entirely and
// gives schemaSourceLoader a predictable URL to resolve.
const schemaRefBase = "https://schemas.epf.internal/"

// schemaSourceLoader resolves "$ref" targets through the SchemaSource instead
// of the filesystem.
//
// Without this, any schema containing a relative "$ref" fails to compile and
// every artifact of that type is reported as unvalidatable. That was live:
// commercial_definition_schema.json, org_ops_definition_schema.json and
// strategy_definition_schema.json all reference
// track_definition_base_schema.json, which is embedded and present, but was
// being looked for on disk.
type schemaSourceLoader struct{ source SchemaSource }

func (l schemaSourceLoader) Load(url string) (any, error) {
	name := strings.TrimPrefix(url, schemaRefBase)
	// Tolerate an absolute URL from any base — the schema set is flat, so the
	// filename is the identity.
	if i := strings.LastIndex(name, "/"); i >= 0 {
		name = name[i+1:]
	}
	b, err := l.source.GetSchemaBytes(name)
	if err != nil {
		return nil, fmt.Errorf("resolve $ref %q: %w", name, err)
	}
	return jsonschema.UnmarshalJSON(bytes.NewReader(b))
}

// blockedResult builds the result for a check that could not be performed.
//
// These stay ordinary results rather than becoming protocol errors: the
// existing contract returns Valid=false with an explanatory string, callers
// depend on that, and the distinct rule id gives a structured consumer the
// same information without a behaviour change.
func blockedResult(artifactType, schemaFile, rule, msg string) ValidationResult {
	return ValidationResult{
		Valid:        false,
		ArtifactType: artifactType,
		SchemaFile:   schemaFile,
		Errors:       []string{msg},
		Findings: []verdict.Finding{{
			Severity: verdict.SeverityError,
			Rule:     rule,
			Message:  msg,
		}},
	}
}

// collectValidationError populates Errors and Findings from a schema
// validation failure.
//
// Findings are derived from the structured error — InstanceLocation and
// ErrorKind.KeywordPath() — not by parsing the rendered message. Recovering a
// rule id by regex over English would be fragile and would break silently on
// a library upgrade, which is precisely the failure a baselining consumer
// cannot absorb.
//
// Errors keeps its existing derivation and ordering exactly. Findings does
// not mirror it: see the field comment on ValidationResult.Findings.
func (r *ValidationResult) collectValidationError(err error) {
	r.Valid = false

	ve, ok := err.(*jsonschema.ValidationError)
	if !ok {
		r.Errors = []string{err.Error()}
		r.Findings = []verdict.Finding{{
			Severity: verdict.SeverityError,
			Rule:     ruleSchemaInvalid,
			Message:  err.Error(),
		}}
		return
	}

	// A top-level error with no causes is itself the error.
	causes := ve.Causes
	if len(causes) == 0 {
		causes = []*jsonschema.ValidationError{ve}
	}
	for _, e := range causes {
		r.Errors = append(r.Errors, e.Error())
	}

	r.Findings = appendLeafFindings(nil, ve)
}

// appendLeafFindings walks a validation error tree and emits one finding per
// leaf — the deepest node, which is where the actual problem is.
//
// Intermediate nodes are applicator keywords: "allOf failed", "validation
// failed". They are true but useless. Emitting them instead of their leaves
// costs a consumer both of the things findings exist for: it cannot act on
// them (nothing names the offending field), and it cannot baseline them
// (every distinct problem inside one allOf collapses to the same
// (key, rule, path) triple, so fixing all but one looks identical to fixing
// none).
func appendLeafFindings(out []verdict.Finding, e *jsonschema.ValidationError) []verdict.Finding {
	if len(e.Causes) > 0 {
		for _, c := range e.Causes {
			out = appendLeafFindings(out, c)
		}
		return out
	}
	return append(out, verdict.Finding{
		Severity: verdict.SeverityError,
		Rule:     schemaRule(e),
		Path:     jsonPointer(e.InstanceLocation),
		Message:  e.Error(),
	})
}

// schemaRule maps a validation error to a stable rule id, e.g. "schema.required".
func schemaRule(e *jsonschema.ValidationError) string {
	if e.ErrorKind == nil {
		return ruleSchemaInvalid
	}
	kw := e.ErrorKind.KeywordPath()
	if len(kw) == 0 {
		return ruleSchemaInvalid
	}
	return ruleSchemaPrefix + strings.Join(kw, ".")
}

// jsonPointer renders an instance location as an RFC 6901 JSON pointer.
// The library's own helper is unexported, so this reimplements the escaping.
func jsonPointer(tokens []string) string {
	if len(tokens) == 0 {
		return ""
	}
	var sb strings.Builder
	for _, tok := range tokens {
		sb.WriteByte('/')
		sb.WriteString(strings.NewReplacer("~", "~0", "/", "~1").Replace(tok))
	}
	return sb.String()
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

// ValidateArtifact validates a JSON payload against the embedded EPF schema for
// artifactType.  If artifactType is empty, auto-detection is attempted first.
//
// When no schema is registered for the type, the function returns a result with
// Valid=true and a warning rather than an error — unknown types pass through.
//
// This convenience wrapper uses the embedded filesystem as the schema source.
// Use ValidateArtifactWithSource when a DB-backed registry is available.
func ValidateArtifact(artifactType string, payload []byte) ValidationResult {
	return ValidateArtifactWithSource(artifactType, payload, EmbeddedSchemaSource())
}

// ValidateArtifactFromBytes validates a JSON payload against a caller-supplied
// JSON Schema document (schemaBytes). artifactType is used only for labelling
// the result — it does not affect schema lookup.
//
// This is used by the skill executor to validate LLM output against a skill's
// output_schema.json without going through the artifact-type registry.
func ValidateArtifactFromBytes(artifactType string, payload, schemaBytes []byte) ValidationResult {
	const schemaID = "inline-schema.json"

	schemaDoc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schemaBytes))
	if err != nil {
		return blockedResult(artifactType, "", ruleSchemaUnavailable,
			fmt.Sprintf("failed to parse schema: %v", err))
	}

	c := jsonschema.NewCompiler()
	if err := c.AddResource(schemaID, schemaDoc); err != nil {
		return blockedResult(artifactType, "", ruleSchemaUnavailable,
			fmt.Sprintf("failed to register schema: %v", err))
	}

	sch, err := c.Compile(schemaID)
	if err != nil {
		return blockedResult(artifactType, "", ruleSchemaUnavailable,
			fmt.Sprintf("failed to compile schema: %v", err))
	}

	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return blockedResult(artifactType, "", rulePayloadInvalidJSON,
			fmt.Sprintf("invalid JSON payload: %v", err))
	}

	result := ValidationResult{ArtifactType: artifactType}
	if err := sch.Validate(instance); err != nil {
		result.collectValidationError(err)
	} else {
		result.Valid = true
	}
	return result
}

// ValidateArtifactWithSource validates a JSON payload against the schema for
// artifactType using the provided SchemaSource.  If artifactType is empty,
// auto-detection is attempted first.
func ValidateArtifactWithSource(artifactType string, payload []byte, source SchemaSource) ValidationResult {
	if source == nil {
		source = EmbeddedSchemaSource()
	}

	// Auto-detect if type is not provided.
	detected := false
	if artifactType == "" {
		t, ok := DetectArtifactType(payload)
		if !ok {
			return blockedResult("", "", ruleArtifactTypeUndetected,
				"could not detect artifact type from payload structure")
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

	// Load the schema bytes from the provided source.
	schemaBytes, err := source.GetSchemaBytes(schemaFile)
	if err != nil {
		return blockedResult(artifactType, schemaFile, ruleSchemaUnavailable,
			fmt.Sprintf("failed to load schema %q: %v", schemaFile, err))
	}

	// Compile the schema.
	schemaDoc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schemaBytes))
	if err != nil {
		return blockedResult(artifactType, schemaFile, ruleSchemaUnavailable,
			fmt.Sprintf("failed to parse schema %q: %v", schemaFile, err))
	}

	c := jsonschema.NewCompiler()
	// Sibling "$ref"s are resolved from the same SchemaSource rather than the
	// filesystem; see schemaSourceLoader.
	c.UseLoader(schemaSourceLoader{source: source})
	schemaURL := schemaRefBase + schemaFile
	if err := c.AddResource(schemaURL, schemaDoc); err != nil {
		return blockedResult(artifactType, schemaFile, ruleSchemaUnavailable,
			fmt.Sprintf("failed to register schema %q: %v", schemaFile, err))
	}

	sch, err := c.Compile(schemaURL)
	if err != nil {
		return blockedResult(artifactType, schemaFile, ruleSchemaUnavailable,
			fmt.Sprintf("failed to compile schema %q: %v", schemaFile, err))
	}

	// Unmarshal instance.
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return blockedResult(artifactType, schemaFile, rulePayloadInvalidJSON,
			fmt.Sprintf("invalid JSON payload: %v", err))
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
		result.collectValidationError(err)
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
