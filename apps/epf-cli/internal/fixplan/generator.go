// Package fixplan provides fix plan generation for AI agents.
// It takes validation errors and creates actionable, chunked fix plans
// that AI agents can process incrementally without context overflow.
package fixplan

import (
	"sort"
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/validator"
	"gopkg.in/yaml.v3"
)

// DefaultMaxErrorsPerChunk is the recommended number of errors per chunk
// to avoid overwhelming AI context windows
const DefaultMaxErrorsPerChunk = 10

// DefaultMaxCharsPerChunk is the estimated character limit per chunk
// (conservative estimate for ~8K token context)
const DefaultMaxCharsPerChunk = 6000

// ChunkPriority determines chunk processing order
type ChunkPriority string

const (
	ChunkPriorityUrgent ChunkPriority = "urgent" // Critical errors, fix first
	ChunkPriorityNormal ChunkPriority = "normal" // High/medium errors
	ChunkPriorityLow    ChunkPriority = "low"    // Low priority, fix last
)

// Chunk represents a set of related errors to fix together
type Chunk struct {
	ID            string                               `yaml:"id" json:"id"`
	Section       string                               `yaml:"section" json:"section"`
	Priority      ChunkPriority                        `yaml:"priority" json:"priority"`
	ErrorCount    int                                  `yaml:"error_count" json:"error_count"`
	EstimatedSize int                                  `yaml:"estimated_size" json:"estimated_size"` // Estimated chars
	Description   string                               `yaml:"description" json:"description"`
	Errors        []*validator.EnhancedValidationError `yaml:"errors" json:"errors"`
	FixStrategy   string                               `yaml:"fix_strategy" json:"fix_strategy"`
	Example       string                               `yaml:"example,omitempty" json:"example,omitempty"` // Template example if available
}

// WorkflowComplexity indicates the scale of work
type WorkflowComplexity string

const (
	ComplexityTrivial     WorkflowComplexity = "trivial"     // 1-3 errors, quick fixes
	ComplexityModerate    WorkflowComplexity = "moderate"    // 4-15 errors
	ComplexitySubstantial WorkflowComplexity = "substantial" // 16-40 errors
	ComplexityMajor       WorkflowComplexity = "major"       // 40+ errors
)

// WorkflowGuidance provides planning recommendations for AI agents
type WorkflowGuidance struct {
	PlanningRecommended bool               `yaml:"planning_recommended" json:"planning_recommended"`
	Complexity          WorkflowComplexity `yaml:"complexity" json:"complexity"`
	Reason              string             `yaml:"reason" json:"reason"`
	BeforeStarting      string             `yaml:"before_starting" json:"before_starting"`
	AfterCompleting     string             `yaml:"after_completing" json:"after_completing"`
}

// FixPlan is the complete plan for fixing all validation errors
type FixPlan struct {
	File          string   `yaml:"file" json:"file"`
	ArtifactType  string   `yaml:"artifact_type" json:"artifact_type"`
	TotalErrors   int      `yaml:"total_errors" json:"total_errors"`
	TotalChunks   int      `yaml:"total_chunks" json:"total_chunks"`
	EstimatedTime string   `yaml:"estimated_time" json:"estimated_time"` // Human-readable estimate
	Chunks        []*Chunk `yaml:"chunks" json:"chunks"`

	// Workflow guidance for AI agents
	WorkflowGuidance *WorkflowGuidance `yaml:"workflow_guidance,omitempty" json:"workflow_guidance,omitempty"`

	// Summary stats
	Summary FixPlanSummary `yaml:"summary" json:"summary"`
}

// FixPlanSummary provides high-level statistics
type FixPlanSummary struct {
	UrgentChunks     int      `yaml:"urgent_chunks" json:"urgent_chunks"`
	NormalChunks     int      `yaml:"normal_chunks" json:"normal_chunks"`
	LowChunks        int      `yaml:"low_chunks" json:"low_chunks"`
	AffectedSections []string `yaml:"affected_sections" json:"affected_sections"`
	RecommendedOrder []string `yaml:"recommended_order" json:"recommended_order"` // Chunk IDs in order
}

// GeneratorOptions configures fix plan generation
type GeneratorOptions struct {
	MaxErrorsPerChunk int  // Max errors per chunk (default: 10)
	MaxCharsPerChunk  int  // Max estimated chars per chunk (default: 6000)
	IncludeExamples   bool // Include template examples when available
}

// Generator creates fix plans from validation errors
type Generator struct {
	options   GeneratorOptions
	templates map[string]string // artifact_type -> template content
}

// NewGenerator creates a new fix plan generator
func NewGenerator(opts GeneratorOptions) *Generator {
	if opts.MaxErrorsPerChunk <= 0 {
		opts.MaxErrorsPerChunk = DefaultMaxErrorsPerChunk
	}
	if opts.MaxCharsPerChunk <= 0 {
		opts.MaxCharsPerChunk = DefaultMaxCharsPerChunk
	}

	return &Generator{
		options:   opts,
		templates: make(map[string]string),
	}
}

// SetTemplate adds a template for example extraction
func (g *Generator) SetTemplate(artifactType, content string) {
	g.templates[artifactType] = content
}

// Generate creates a fix plan from AI-friendly validation results
func (g *Generator) Generate(result *validator.AIFriendlyResult) *FixPlan {
	plan := &FixPlan{
		File:         result.File,
		ArtifactType: result.ArtifactType,
		TotalErrors:  result.ErrorCount,
	}

	if result.Valid || result.ErrorCount == 0 {
		plan.EstimatedTime = "0 minutes"
		return plan
	}

	// Generate chunks from sections
	chunks := g.generateChunks(result)
	plan.Chunks = chunks
	plan.TotalChunks = len(chunks)

	// Calculate estimated time (rough: 2 min per chunk for AI agent)
	plan.EstimatedTime = estimateTime(len(chunks))

	// Build summary
	plan.Summary = g.buildSummary(chunks)

	// Add workflow guidance based on complexity
	plan.WorkflowGuidance = generateWorkflowGuidance(result.ErrorCount, len(chunks), len(plan.Summary.AffectedSections))

	return plan
}

// generateWorkflowGuidance creates planning recommendations based on work complexity
func generateWorkflowGuidance(errorCount, chunkCount, sectionCount int) *WorkflowGuidance {
	complexity := determineComplexity(errorCount)

	guidance := &WorkflowGuidance{
		Complexity:      complexity,
		AfterCompleting: "Run 'epf-cli health <instance>' to verify all issues are resolved.",
	}

	switch complexity {
	case ComplexityTrivial:
		guidance.PlanningRecommended = false
		guidance.Reason = "Small number of errors - straightforward to fix directly."
		guidance.BeforeStarting = ""

	case ComplexityModerate:
		guidance.PlanningRecommended = false
		guidance.Reason = itoa(errorCount) + " errors across " + itoa(sectionCount) + " section(s) - consider tracking progress."
		guidance.BeforeStarting = `Consider creating a simple checklist to track which chunks you've completed.`

	case ComplexitySubstantial:
		guidance.PlanningRecommended = true
		guidance.Reason = itoa(errorCount) + " errors in " + itoa(chunkCount) + " chunks is substantial work that benefits from explicit planning."
		guidance.BeforeStarting = generatePlanningCheckpoint(errorCount, chunkCount, sectionCount, false)

	case ComplexityMajor:
		guidance.PlanningRecommended = true
		guidance.Reason = itoa(errorCount) + " errors is major work - planning strongly recommended to avoid losing track."
		guidance.BeforeStarting = generatePlanningCheckpoint(errorCount, chunkCount, sectionCount, true)
	}

	return guidance
}

// determineComplexity categorizes the work based on error count
func determineComplexity(errorCount int) WorkflowComplexity {
	switch {
	case errorCount <= 3:
		return ComplexityTrivial
	case errorCount <= 15:
		return ComplexityModerate
	case errorCount <= 40:
		return ComplexitySubstantial
	default:
		return ComplexityMajor
	}
}

// generatePlanningCheckpoint creates the planning guidance text
func generatePlanningCheckpoint(errorCount, chunkCount, sectionCount int, isMajor bool) string {
	urgencyMarker := "PLANNING CHECKPOINT"
	if isMajor {
		urgencyMarker = "MAJOR WORK DETECTED - PLANNING STRONGLY RECOMMENDED"
	}

	return `┌─────────────────────────────────────────────────────────────────┐
│ ` + urgencyMarker + `
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Before making changes, answer these questions:                  │
│                                                                 │
│ 1. WHAT PLANNING TOOLS DO I HAVE ACCESS TO?                     │
│    Look at your available tools/capabilities. Most AI agents    │
│    have task lists, todo tools, or can create planning files.   │
│    Check if this repo has conventions (openspec/, .plan/, etc.) │
│                                                                 │
│ 2. SHOULD I CREATE A PLAN FOR THIS WORK?                        │
│    Consider: ` + itoa(chunkCount) + ` chunks, ` + itoa(sectionCount) + ` sections, ~` + itoa(chunkCount*2) + ` min estimated work.
│    A plan helps track state across chunks and gives the user    │
│    visibility into progress.                                    │
│                                                                 │
│ 3. DOES THE USER EXPECT TO SEE MY APPROACH FIRST?               │
│    For substantial work, users often appreciate seeing the      │
│    plan before execution starts.                                │
│                                                                 │
│ This checkpoint is a suggestion, not a requirement.             │
│ Use your judgment about what's appropriate for this context.    │
└─────────────────────────────────────────────────────────────────┘`
}

// generateChunks creates chunks from error sections
func (g *Generator) generateChunks(result *validator.AIFriendlyResult) []*Chunk {
	var chunks []*Chunk
	chunkID := 1

	// Parse template if available for example extraction
	var templateData map[string]interface{}
	if g.options.IncludeExamples {
		if tmpl, ok := g.templates[result.ArtifactType]; ok && tmpl != "" {
			yaml.Unmarshal([]byte(tmpl), &templateData)
		}
	}

	for _, section := range result.ErrorsBySection {
		sectionChunks := g.chunkSection(section, &chunkID, templateData)
		chunks = append(chunks, sectionChunks...)
	}

	// Sort chunks by priority
	sortChunksByPriority(chunks)

	return chunks
}

// chunkSection splits a section's errors into manageable chunks
func (g *Generator) chunkSection(section *validator.SectionErrors, chunkID *int, templateData map[string]interface{}) []*Chunk {
	var chunks []*Chunk

	// Group errors by type for more coherent chunks
	grouped := groupErrorsByType(section.Errors)

	// Extract section example from template if available
	var sectionExample string
	if templateData != nil && g.options.IncludeExamples {
		sectionExample = extractSectionExample(templateData, section.Section)
	}

	for errType, errors := range grouped {
		// Split into size-limited chunks
		for len(errors) > 0 {
			chunk := g.createChunk(*chunkID, section.Section, errType, &errors)
			// Add example to the first chunk for this section
			if sectionExample != "" && chunk.Example == "" {
				chunk.Example = sectionExample
				chunk.EstimatedSize += len(sectionExample)
				// Only include example in first chunk to save space
				sectionExample = ""
			}
			chunks = append(chunks, chunk)
			*chunkID++
		}
	}

	return chunks
}

// createChunk builds a single chunk, consuming errors from the slice
func (g *Generator) createChunk(id int, section string, errType validator.ErrorType, errors *[]*validator.EnhancedValidationError) *Chunk {
	chunk := &Chunk{
		ID:       formatChunkID(id),
		Section:  section,
		Priority: getChunkPriority(errType),
	}

	// Take errors up to the limit
	var taken []*validator.EnhancedValidationError
	estimatedSize := 0

	for len(*errors) > 0 && len(taken) < g.options.MaxErrorsPerChunk {
		err := (*errors)[0]
		errSize := estimateErrorSize(err)

		// Check if adding this error would exceed size limit
		if estimatedSize > 0 && estimatedSize+errSize > g.options.MaxCharsPerChunk {
			break
		}

		taken = append(taken, err)
		estimatedSize += errSize
		*errors = (*errors)[1:]
	}

	chunk.Errors = taken
	chunk.ErrorCount = len(taken)
	chunk.EstimatedSize = estimatedSize
	chunk.Description = generateChunkDescription(section, errType, len(taken))
	chunk.FixStrategy = generateFixStrategy(errType, taken)

	return chunk
}

// groupErrorsByType organizes errors by their type for coherent chunking
func groupErrorsByType(errors []*validator.EnhancedValidationError) map[validator.ErrorType][]*validator.EnhancedValidationError {
	grouped := make(map[validator.ErrorType][]*validator.EnhancedValidationError)

	for _, err := range errors {
		grouped[err.ErrorType] = append(grouped[err.ErrorType], err)
	}

	return grouped
}

// getChunkPriority determines chunk priority from error type
func getChunkPriority(errType validator.ErrorType) ChunkPriority {
	switch errType {
	case validator.ErrorTypeMismatch, validator.ErrorMissingRequired:
		return ChunkPriorityUrgent
	case validator.ErrorInvalidEnum, validator.ErrorPatternMismatch:
		return ChunkPriorityNormal
	case validator.ErrorConstraintViolation:
		return ChunkPriorityNormal
	case validator.ErrorUnknownField:
		return ChunkPriorityLow
	default:
		return ChunkPriorityNormal
	}
}

// estimateErrorSize estimates the character count for an error in output
func estimateErrorSize(err *validator.EnhancedValidationError) int {
	// Base overhead for YAML structure
	size := 150

	// Add path, message, hint lengths
	size += len(err.Path) + len(err.Message) + len(err.FixHint)

	// Add details if present
	if len(err.Details.AllowedValues) > 0 {
		for _, v := range err.Details.AllowedValues {
			size += len(v) + 5
		}
	}
	if len(err.Details.MissingFields) > 0 {
		for _, f := range err.Details.MissingFields {
			size += len(f) + 5
		}
	}
	if len(err.Details.ExpectedStructure) > 0 {
		for k, v := range err.Details.ExpectedStructure {
			size += len(k) + len(v) + 10
		}
	}

	return size
}

// formatChunkID creates a human-readable chunk ID
func formatChunkID(id int) string {
	return strings.ToLower(strings.ReplaceAll(
		strings.TrimSpace(
			strings.Join([]string{"chunk", itoa(id)}, "-"),
		), " ", "-"))
}

// itoa converts int to string without fmt
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// generateChunkDescription creates a human-readable description
func generateChunkDescription(section string, errType validator.ErrorType, count int) string {
	typeDesc := map[validator.ErrorType]string{
		validator.ErrorTypeMismatch:        "type mismatches",
		validator.ErrorMissingRequired:     "missing required fields",
		validator.ErrorInvalidEnum:         "invalid enum values",
		validator.ErrorConstraintViolation: "constraint violations",
		validator.ErrorUnknownField:        "unknown fields",
		validator.ErrorPatternMismatch:     "pattern mismatches",
		validator.ErrorUnknown:             "validation errors",
	}

	desc := typeDesc[errType]
	if desc == "" {
		desc = "errors"
	}

	return "Fix " + itoa(count) + " " + desc + " in '" + section + "'"
}

// generateFixStrategy creates actionable guidance for a chunk
func generateFixStrategy(errType validator.ErrorType, errors []*validator.EnhancedValidationError) string {
	switch errType {
	case validator.ErrorTypeMismatch:
		return "For each error, convert the value to the expected type. " +
			"Check expected_structure field for object requirements. " +
			"Use 'epf-cli schemas show <type>' for full schema."

	case validator.ErrorMissingRequired:
		// Collect all unique missing fields
		fieldSet := make(map[string]bool)
		for _, err := range errors {
			for _, f := range err.Details.MissingFields {
				fieldSet[f] = true
			}
		}
		var fields []string
		for f := range fieldSet {
			fields = append(fields, f)
		}
		sort.Strings(fields)
		return "Add missing required fields: " + strings.Join(fields, ", ") + ". " +
			"Use 'epf-cli schemas show <type>' for field definitions."

	case validator.ErrorInvalidEnum:
		return "Replace invalid values with allowed enum values. " +
			"Check the allowed_values field for each error."

	case validator.ErrorConstraintViolation:
		return "Adjust values to meet constraints. " +
			"For minLength: expand content with more detail. " +
			"For minItems: add more array items."

	case validator.ErrorUnknownField:
		return "Remove or rename unknown fields. " +
			"Check spelling against 'epf-cli schemas show <type>'."

	case validator.ErrorPatternMismatch:
		return "Format values to match required patterns. " +
			"Check constraint_value for the expected pattern."

	default:
		return "Review each error and apply the fix_hint guidance."
	}
}

// sortChunksByPriority sorts chunks: urgent first, then normal, then low
func sortChunksByPriority(chunks []*Chunk) {
	priorityOrder := map[ChunkPriority]int{
		ChunkPriorityUrgent: 0,
		ChunkPriorityNormal: 1,
		ChunkPriorityLow:    2,
	}

	sort.Slice(chunks, func(i, j int) bool {
		if priorityOrder[chunks[i].Priority] != priorityOrder[chunks[j].Priority] {
			return priorityOrder[chunks[i].Priority] < priorityOrder[chunks[j].Priority]
		}
		// Secondary sort by error count (more errors first within same priority)
		return chunks[i].ErrorCount > chunks[j].ErrorCount
	})
}

// estimateTime provides a human-readable time estimate
func estimateTime(chunkCount int) string {
	if chunkCount == 0 {
		return "0 minutes"
	}

	// Estimate ~2 minutes per chunk for AI processing
	minutes := chunkCount * 2

	if minutes < 5 {
		return "under 5 minutes"
	}
	if minutes < 60 {
		return itoa(minutes) + " minutes"
	}

	hours := minutes / 60
	remainingMins := minutes % 60
	if remainingMins == 0 {
		return itoa(hours) + " hour(s)"
	}
	return itoa(hours) + " hour(s) " + itoa(remainingMins) + " minutes"
}

// buildSummary creates the fix plan summary
func (g *Generator) buildSummary(chunks []*Chunk) FixPlanSummary {
	summary := FixPlanSummary{}

	sectionSet := make(map[string]bool)

	for _, chunk := range chunks {
		switch chunk.Priority {
		case ChunkPriorityUrgent:
			summary.UrgentChunks++
		case ChunkPriorityNormal:
			summary.NormalChunks++
		case ChunkPriorityLow:
			summary.LowChunks++
		}

		sectionSet[chunk.Section] = true
		summary.RecommendedOrder = append(summary.RecommendedOrder, chunk.ID)
	}

	for section := range sectionSet {
		summary.AffectedSections = append(summary.AffectedSections, section)
	}
	sort.Strings(summary.AffectedSections)

	return summary
}

// extractSectionExample extracts a section from template data and converts it to YAML string
// The section parameter is the top-level field name (e.g., "target_users", "key_insights")
func extractSectionExample(templateData map[string]interface{}, section string) string {
	if templateData == nil {
		return ""
	}

	// Get the section data from template
	sectionData, ok := templateData[section]
	if !ok {
		return ""
	}

	// Convert to YAML for display
	yamlBytes, err := yaml.Marshal(map[string]interface{}{section: sectionData})
	if err != nil {
		return ""
	}

	// Truncate if too long (keep it reasonable for context)
	result := string(yamlBytes)
	const maxExampleSize = 1500
	if len(result) > maxExampleSize {
		// Find a good breaking point (end of a line)
		truncated := result[:maxExampleSize]
		lastNewline := strings.LastIndex(truncated, "\n")
		if lastNewline > maxExampleSize/2 {
			truncated = truncated[:lastNewline]
		}
		result = truncated + "\n# ... (truncated, use epf_get_section_example for full example)"
	}

	return result
}
