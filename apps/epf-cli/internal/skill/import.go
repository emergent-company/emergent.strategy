// Package skill — import.go provides importing skills from external formats.
package skill

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/agent"
	"gopkg.in/yaml.v3"
)

// ImportFormat identifies the source format for skill import.
type ImportFormat string

const (
	ImportFormatAuto   ImportFormat = "auto"
	ImportFormatRaw    ImportFormat = "raw"
	ImportFormatCrewAI ImportFormat = "crewai"
)

// ImportFormatFromString converts a string to ImportFormat with validation.
func ImportFormatFromString(s string) (ImportFormat, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "auto":
		return ImportFormatAuto, nil
	case "raw":
		return ImportFormatRaw, nil
	case "crewai":
		return ImportFormatCrewAI, nil
	default:
		return "", fmt.Errorf("unknown import format: %q (valid: auto, raw, crewai)", s)
	}
}

// ImportResult contains the outcome of a skill import operation.
type ImportResult struct {
	SkillName    string   `json:"skill_name"`
	SkillDir     string   `json:"skill_dir"`
	ManifestPath string   `json:"manifest_path"`
	PromptPath   string   `json:"prompt_path"`
	Format       string   `json:"format_detected"`
	TodoFields   []string `json:"todo_fields,omitempty"`
}

// crewAITask represents a CrewAI task YAML structure.
type crewAITask struct {
	Description    string   `yaml:"description"`
	ExpectedOutput string   `yaml:"expected_output"`
	Tools          []string `yaml:"tools,omitempty"`
	Agent          string   `yaml:"agent,omitempty"`
}

// ImportSkill imports a skill from an external source file into an EPF instance.
// It auto-detects the format if format is ImportFormatAuto, creates the skill
// directory with skill.yaml and prompt.md, and returns the import result.
func ImportSkill(sourcePath, instancePath string, format ImportFormat, force bool) (*ImportResult, error) {
	// Read source file
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("reading source file: %w", err)
	}
	content := string(data)

	// Auto-detect format if needed
	if format == ImportFormatAuto || format == "" {
		format = detectSkillFormat(content, sourcePath)
	}

	// Parse and map to EPF skill format
	var manifest SkillManifest
	var promptContent string
	var todoFields []string

	switch format {
	case ImportFormatCrewAI:
		manifest, promptContent, todoFields, err = importCrewAITask(content)
	case ImportFormatRaw:
		manifest, promptContent, todoFields, err = importRawSkill(content, sourcePath)
	default:
		manifest, promptContent, todoFields, err = importRawSkill(content, sourcePath)
	}
	if err != nil {
		return nil, fmt.Errorf("parsing %s format: %w", format, err)
	}

	// Derive skill name from manifest or filename
	skillName := manifest.Name
	if skillName == "" {
		skillName = deriveNameFromPath(sourcePath)
		manifest.Name = skillName
	}

	// Create skill directory
	skillDir := filepath.Join(instancePath, InstanceSkillsDir, skillName)
	if !force {
		if _, err := os.Stat(skillDir); err == nil {
			return nil, fmt.Errorf("skill directory already exists: %s (use --force to overwrite)", skillDir)
		}
	}
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		return nil, fmt.Errorf("creating skill directory: %w", err)
	}

	// Write skill.yaml
	manifestPath := filepath.Join(skillDir, DefaultManifestFile)
	manifestData, err := yaml.Marshal(manifest)
	if err != nil {
		return nil, fmt.Errorf("marshaling skill manifest: %w", err)
	}
	if err := os.WriteFile(manifestPath, manifestData, 0o644); err != nil {
		return nil, fmt.Errorf("writing skill manifest: %w", err)
	}

	// Write prompt.md
	promptPath := filepath.Join(skillDir, DefaultPromptFile)
	if err := os.WriteFile(promptPath, []byte(promptContent), 0o644); err != nil {
		return nil, fmt.Errorf("writing skill prompt: %w", err)
	}

	return &ImportResult{
		SkillName:    skillName,
		SkillDir:     skillDir,
		ManifestPath: manifestPath,
		PromptPath:   promptPath,
		Format:       string(format),
		TodoFields:   todoFields,
	}, nil
}

// detectSkillFormat examines file content and extension to detect the format.
func detectSkillFormat(content, path string) ImportFormat {
	ext := strings.ToLower(filepath.Ext(path))

	// YAML file -> try CrewAI task
	if ext == ".yaml" || ext == ".yml" {
		var obj map[string]interface{}
		if yaml.Unmarshal([]byte(content), &obj) == nil {
			_, hasDescription := obj["description"]
			_, hasExpectedOutput := obj["expected_output"]
			if hasDescription && hasExpectedOutput {
				return ImportFormatCrewAI
			}
		}
	}

	// Default: raw text/markdown
	return ImportFormatRaw
}

// importCrewAITask maps a CrewAI task YAML to EPF skill format.
func importCrewAITask(content string) (SkillManifest, string, []string, error) {
	var task crewAITask
	if err := yaml.Unmarshal([]byte(content), &task); err != nil {
		return SkillManifest{}, "", nil, fmt.Errorf("parsing CrewAI task YAML: %w", err)
	}

	if task.Description == "" {
		return SkillManifest{}, "", nil, fmt.Errorf("CrewAI task missing required 'description' field")
	}

	// Infer skill type from content
	skillType := inferSkillTypeFromText(task.Description)

	manifest := SkillManifest{
		Name:        slugify(task.Description),
		Version:     "1.0.0",
		Type:        skillType,
		Description: task.Description,
		Capability: &agent.CapabilitySpec{
			Class:         agent.CapabilityBalanced, // TODO: review
			ContextBudget: agent.ContextBudgetMedium,
		},
	}

	// Map expected_output to output section
	if task.ExpectedOutput != "" {
		manifest.Output = &OutputSpec{
			Format: "markdown", // TODO: review
		}
	}

	// Build prompt from description and expected output
	var sb strings.Builder
	sb.WriteString("# Task\n\n")
	sb.WriteString(task.Description)
	sb.WriteString("\n\n")
	if task.ExpectedOutput != "" {
		sb.WriteString("## Expected Output\n\n")
		sb.WriteString(task.ExpectedOutput)
		sb.WriteString("\n")
	}
	promptContent := sb.String()

	todoFields := []string{
		"name — review generated name",
		"type — review inferred skill type",
		"capability.class — review if balanced is appropriate",
		"requires.artifacts — add required EPF artifacts",
		"scope.preferred_tools — add preferred MCP tools",
		"output.format — review output format",
	}

	return manifest, promptContent, todoFields, nil
}

// importRawSkill creates an EPF skill from a raw text/markdown file.
func importRawSkill(content, sourcePath string) (SkillManifest, string, []string, error) {
	name := deriveNameFromPath(sourcePath)

	manifest := SkillManifest{
		Name:        name,
		Version:     "1.0.0",
		Type:        SkillTypeCreation, // TODO: review
		Description: "",                // TODO: review
		Capability: &agent.CapabilitySpec{
			Class:         agent.CapabilityBalanced, // TODO: review
			ContextBudget: agent.ContextBudgetMedium,
		},
	}

	todoFields := []string{
		"type — set appropriate skill type (creation, generation, review, enrichment, analysis)",
		"description — add skill description",
		"capability.class — review if balanced is appropriate",
		"requires.artifacts — add required EPF artifacts",
		"scope.preferred_tools — add preferred MCP tools",
		"phase — set EPF phase (READY, FIRE, AIM)",
	}

	return manifest, content, todoFields, nil
}

// inferSkillTypeFromText guesses skill type from description text.
func inferSkillTypeFromText(description string) SkillType {
	lower := strings.ToLower(description)

	creationWords := []string{"create", "generate", "produce", "write", "build", "scaffold"}
	for _, w := range creationWords {
		if strings.Contains(lower, w) {
			return SkillTypeCreation
		}
	}

	reviewWords := []string{"review", "evaluate", "assess", "check", "audit", "validate"}
	for _, w := range reviewWords {
		if strings.Contains(lower, w) {
			return SkillTypeReview
		}
	}

	analysisWords := []string{"analyze", "analyse", "research", "investigate", "study", "map"}
	for _, w := range analysisWords {
		if strings.Contains(lower, w) {
			return SkillTypeAnalysis
		}
	}

	enrichmentWords := []string{"enrich", "enhance", "upgrade", "improve", "update", "migrate"}
	for _, w := range enrichmentWords {
		if strings.Contains(lower, w) {
			return SkillTypeEnrichment
		}
	}

	return SkillTypeCreation
}

// slugify converts a display name to a slug suitable for directory names.
// Truncates to a reasonable length for directory names.
func slugify(name string) string {
	s := strings.ToLower(name)
	var result []byte
	prevHyphen := false
	for _, ch := range []byte(s) {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			result = append(result, ch)
			prevHyphen = false
		} else if !prevHyphen && len(result) > 0 {
			result = append(result, '-')
			prevHyphen = true
		}
	}
	slug := strings.TrimRight(string(result), "-")
	// Truncate to reasonable length
	if len(slug) > 50 {
		// Find last hyphen before limit
		truncated := slug[:50]
		if lastHyphen := strings.LastIndex(truncated, "-"); lastHyphen > 20 {
			truncated = truncated[:lastHyphen]
		}
		slug = truncated
	}
	return slug
}

// deriveNameFromPath extracts a slug name from a file path.
func deriveNameFromPath(path string) string {
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	name := strings.TrimSuffix(base, ext)
	for _, suffix := range []string{"-prompt", "_prompt", "-skill", "_skill", "-task", "_task"} {
		name = strings.TrimSuffix(name, suffix)
	}
	return slugify(name)
}
