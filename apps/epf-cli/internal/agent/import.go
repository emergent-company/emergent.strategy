// Package agent — import.go provides importing agents from external formats.
package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ImportFormat identifies the source format for import.
type ImportFormat string

const (
	ImportFormatAuto   ImportFormat = "auto"
	ImportFormatRaw    ImportFormat = "raw"
	ImportFormatCrewAI ImportFormat = "crewai"
	ImportFormatOpenAI ImportFormat = "openai"
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
	case "openai":
		return ImportFormatOpenAI, nil
	default:
		return "", fmt.Errorf("unknown import format: %q (valid: auto, raw, crewai, openai)", s)
	}
}

// ImportResult contains the outcome of an import operation.
type ImportResult struct {
	AgentName    string   `json:"agent_name"`
	AgentDir     string   `json:"agent_dir"`
	ManifestPath string   `json:"manifest_path"`
	PromptPath   string   `json:"prompt_path"`
	Format       string   `json:"format_detected"`
	TodoFields   []string `json:"todo_fields,omitempty"`
}

// crewAIAgent represents a CrewAI agent YAML structure.
type crewAIAgent struct {
	Role      string   `yaml:"role"`
	Goal      string   `yaml:"goal"`
	Backstory string   `yaml:"backstory"`
	Tools     []string `yaml:"tools,omitempty"`
	Verbose   bool     `yaml:"verbose,omitempty"`
}

// openAIAssistant represents an OpenAI Assistants JSON structure.
type openAIAssistant struct {
	ID           string          `json:"id,omitempty"`
	Name         string          `json:"name"`
	Description  string          `json:"description,omitempty"`
	Instructions string          `json:"instructions"`
	Model        string          `json:"model,omitempty"`
	Tools        []openAITool    `json:"tools,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
}

type openAITool struct {
	Type string `json:"type"`
}

// ImportAgent imports an agent from an external source file into an EPF instance.
// It auto-detects the format if format is ImportFormatAuto, creates the agent
// directory with agent.yaml and prompt.md, and returns the import result.
func ImportAgent(sourcePath, instancePath string, format ImportFormat, force bool) (*ImportResult, error) {
	// Read source file
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("reading source file: %w", err)
	}
	content := string(data)

	// Auto-detect format if needed
	if format == ImportFormatAuto || format == "" {
		format = detectAgentFormat(content, sourcePath)
	}

	// Parse and map to EPF agent format
	var manifest AgentManifest
	var promptContent string
	var todoFields []string

	switch format {
	case ImportFormatCrewAI:
		manifest, promptContent, todoFields, err = importCrewAIAgent(content)
	case ImportFormatOpenAI:
		manifest, promptContent, todoFields, err = importOpenAIAgent(content)
	case ImportFormatRaw:
		manifest, promptContent, todoFields, err = importRawAgent(content, sourcePath)
	default:
		manifest, promptContent, todoFields, err = importRawAgent(content, sourcePath)
	}
	if err != nil {
		return nil, fmt.Errorf("parsing %s format: %w", format, err)
	}

	// Derive agent name from manifest or filename
	agentName := manifest.Name
	if agentName == "" {
		agentName = deriveNameFromPath(sourcePath)
		manifest.Name = agentName
	}

	// Create agent directory
	agentDir := filepath.Join(instancePath, InstanceDirName, agentName)
	if !force {
		if _, err := os.Stat(agentDir); err == nil {
			return nil, fmt.Errorf("agent directory already exists: %s (use --force to overwrite)", agentDir)
		}
	}
	if err := os.MkdirAll(agentDir, 0o755); err != nil {
		return nil, fmt.Errorf("creating agent directory: %w", err)
	}

	// Write agent.yaml
	manifestPath := filepath.Join(agentDir, ManifestFile)
	manifestData, err := yaml.Marshal(manifest)
	if err != nil {
		return nil, fmt.Errorf("marshaling agent manifest: %w", err)
	}
	if err := os.WriteFile(manifestPath, manifestData, 0o644); err != nil {
		return nil, fmt.Errorf("writing agent manifest: %w", err)
	}

	// Write prompt.md
	promptPath := filepath.Join(agentDir, PromptFile)
	if err := os.WriteFile(promptPath, []byte(promptContent), 0o644); err != nil {
		return nil, fmt.Errorf("writing agent prompt: %w", err)
	}

	return &ImportResult{
		AgentName:    agentName,
		AgentDir:     agentDir,
		ManifestPath: manifestPath,
		PromptPath:   promptPath,
		Format:       string(format),
		TodoFields:   todoFields,
	}, nil
}

// detectAgentFormat examines file content and extension to detect the format.
func detectAgentFormat(content, path string) ImportFormat {
	ext := strings.ToLower(filepath.Ext(path))

	// JSON file -> try OpenAI
	if ext == ".json" {
		var obj map[string]interface{}
		if json.Unmarshal([]byte(content), &obj) == nil {
			if _, hasInstructions := obj["instructions"]; hasInstructions {
				return ImportFormatOpenAI
			}
		}
		return ImportFormatRaw
	}

	// YAML file -> try CrewAI
	if ext == ".yaml" || ext == ".yml" {
		var obj map[string]interface{}
		if yaml.Unmarshal([]byte(content), &obj) == nil {
			_, hasRole := obj["role"]
			_, hasGoal := obj["goal"]
			_, hasBackstory := obj["backstory"]
			if hasRole && hasGoal && hasBackstory {
				return ImportFormatCrewAI
			}
		}
	}

	// Default: raw text/markdown
	return ImportFormatRaw
}

// importCrewAIAgent maps CrewAI agent YAML to EPF agent format.
func importCrewAIAgent(content string) (AgentManifest, string, []string, error) {
	var crew crewAIAgent
	if err := yaml.Unmarshal([]byte(content), &crew); err != nil {
		return AgentManifest{}, "", nil, fmt.Errorf("parsing CrewAI YAML: %w", err)
	}

	if crew.Role == "" {
		return AgentManifest{}, "", nil, fmt.Errorf("CrewAI agent missing required 'role' field")
	}

	// Infer agent type from role
	agentType := inferAgentTypeFromText(crew.Role)

	// Map fields
	manifest := AgentManifest{
		Name:    slugify(crew.Role),
		Version: "1.0.0",
		Type:    agentType,
		Identity: IdentitySpec{
			DisplayName: crew.Role,
			Description: crew.Goal,
		},
		Capability: &CapabilitySpec{
			Class:         CapabilityBalanced, // TODO: review
			ContextBudget: ContextBudgetMedium,
		},
	}

	// Map tools
	if len(crew.Tools) > 0 {
		manifest.Tools = &AgentToolsSpec{
			Required: crew.Tools,
		}
	}

	// Backstory becomes the prompt
	promptContent := crew.Backstory
	if promptContent == "" {
		promptContent = fmt.Sprintf("# %s\n\nYou are %s.\n\n%s\n", crew.Role, crew.Role, crew.Goal)
	}

	todoFields := []string{
		"capability.class — review if balanced is appropriate",
		"routing.trigger_phrases — add trigger phrases",
		"routing.keywords — add routing keywords",
		"skills — add required/optional skills",
	}

	return manifest, promptContent, todoFields, nil
}

// importOpenAIAgent maps OpenAI Assistant JSON to EPF agent format.
func importOpenAIAgent(content string) (AgentManifest, string, []string, error) {
	var assistant openAIAssistant
	if err := json.Unmarshal([]byte(content), &assistant); err != nil {
		return AgentManifest{}, "", nil, fmt.Errorf("parsing OpenAI JSON: %w", err)
	}

	if assistant.Instructions == "" && assistant.Name == "" {
		return AgentManifest{}, "", nil, fmt.Errorf("OpenAI assistant missing both 'instructions' and 'name'")
	}

	// Infer capability class from model
	capClass := inferCapabilityFromModel(assistant.Model)

	// Map tools
	var toolNames []string
	for _, t := range assistant.Tools {
		if t.Type != "" {
			toolNames = append(toolNames, t.Type)
		}
	}

	name := slugify(assistant.Name)
	if name == "" {
		name = "imported-assistant"
	}

	manifest := AgentManifest{
		Name:    name,
		Version: "1.0.0",
		Type:    inferAgentTypeFromText(assistant.Name),
		Identity: IdentitySpec{
			DisplayName: assistant.Name,
			Description: assistant.Description,
		},
		Capability: &CapabilitySpec{
			Class:         capClass,
			ContextBudget: ContextBudgetMedium,
		},
	}

	if len(toolNames) > 0 {
		manifest.Tools = &AgentToolsSpec{
			Required: toolNames,
		}
	}

	promptContent := assistant.Instructions
	if promptContent == "" {
		promptContent = fmt.Sprintf("# %s\n\n%s\n", assistant.Name, assistant.Description)
	}

	todoFields := []string{
		"type — review inferred agent type",
		"routing.trigger_phrases — add trigger phrases",
		"routing.keywords — add routing keywords",
		"skills — add required/optional skills",
		"phase — set EPF phase (READY, FIRE, AIM)",
	}

	return manifest, promptContent, todoFields, nil
}

// importRawAgent creates an EPF agent from a raw text/markdown file.
func importRawAgent(content, sourcePath string) (AgentManifest, string, []string, error) {
	name := deriveNameFromPath(sourcePath)

	manifest := AgentManifest{
		Name:    name,
		Version: "1.0.0",
		Type:    AgentTypeSpecialist, // TODO: review
		Identity: IdentitySpec{
			DisplayName: titleFromSlug(name),
			Description: "", // TODO: review
		},
		Capability: &CapabilitySpec{
			Class:         CapabilityBalanced, // TODO: review
			ContextBudget: ContextBudgetMedium,
		},
	}

	todoFields := []string{
		"type — set appropriate agent type (guide, strategist, specialist, architect, reviewer)",
		"identity.display_name — review generated display name",
		"identity.description — add agent description",
		"capability.class — review if balanced is appropriate",
		"routing.trigger_phrases — add trigger phrases",
		"routing.keywords — add routing keywords",
		"skills — add required/optional skills",
		"phase — set EPF phase (READY, FIRE, AIM)",
	}

	return manifest, content, todoFields, nil
}

// inferAgentTypeFromText guesses agent type from role/name description.
func inferAgentTypeFromText(roleOrName string) AgentType {
	lower := strings.ToLower(roleOrName)

	strategyWords := []string{"strategist", "analyst", "strategy", "planner", "advisor"}
	for _, w := range strategyWords {
		if strings.Contains(lower, w) {
			return AgentTypeStrategist
		}
	}

	architectWords := []string{"architect", "designer", "engineer", "builder"}
	for _, w := range architectWords {
		if strings.Contains(lower, w) {
			return AgentTypeArchitect
		}
	}

	reviewWords := []string{"reviewer", "auditor", "checker", "validator", "qa"}
	for _, w := range reviewWords {
		if strings.Contains(lower, w) {
			return AgentTypeReviewer
		}
	}

	guideWords := []string{"guide", "onboarding", "mentor", "helper", "assistant"}
	for _, w := range guideWords {
		if strings.Contains(lower, w) {
			return AgentTypeGuide
		}
	}

	return AgentTypeSpecialist
}

// inferCapabilityFromModel guesses capability class from an OpenAI model name.
func inferCapabilityFromModel(model string) CapabilityClass {
	lower := strings.ToLower(model)
	switch {
	case strings.Contains(lower, "gpt-4o") && !strings.Contains(lower, "mini"):
		return CapabilityHighReasoning
	case strings.Contains(lower, "gpt-4") && !strings.Contains(lower, "mini"):
		return CapabilityHighReasoning
	case strings.Contains(lower, "o1"), strings.Contains(lower, "o3"):
		return CapabilityHighReasoning
	case strings.Contains(lower, "mini"), strings.Contains(lower, "gpt-3"):
		return CapabilityFastExec
	default:
		return CapabilityBalanced
	}
}

// slugify converts a display name to a slug suitable for directory names.
func slugify(name string) string {
	// Lowercase
	s := strings.ToLower(name)
	// Replace non-alphanumeric with hyphens
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
	// Trim trailing hyphens
	return strings.TrimRight(string(result), "-")
}

// titleFromSlug converts a slug to a title-case display name.
func titleFromSlug(slug string) string {
	parts := strings.Split(slug, "-")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, " ")
}

// deriveNameFromPath extracts a slug name from a file path.
func deriveNameFromPath(path string) string {
	base := filepath.Base(path)
	// Remove extension
	ext := filepath.Ext(base)
	name := strings.TrimSuffix(base, ext)
	// Remove common suffixes
	for _, suffix := range []string{"-prompt", "_prompt", "-agent", "_agent", ".agent_prompt"} {
		name = strings.TrimSuffix(name, suffix)
	}
	return slugify(name)
}
