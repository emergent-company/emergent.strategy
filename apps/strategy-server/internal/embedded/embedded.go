// Package embedded provides access to EPF framework artifacts compiled into the
// strategy-server binary via go:embed.
//
// Content is synced from canonical EPF at build time using scripts/sync-embedded.sh.
// Run `task sync-embedded` before building to refresh to a new canonical-epf version.
//
// Directory layout (all under internal/embedded/):
//
//	schemas/      — JSON Schema files for artifact validation
//	templates/    — YAML artifact templates (READY/FIRE/AIM phases)
//	wizards/      — Legacy wizard markdown files
//	outputs/      — Generator definitions (legacy)
//	agents/       — Agent definitions (agent.yaml + prompt.md per agent)
//	skills/       — Skill definitions (skill.yaml + prompt.md per skill)
package embedded

import (
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"path"
	"strings"
)

// ---------------------------------------------------------------------------
// Embedded file systems
// ---------------------------------------------------------------------------

//go:embed schemas/*.json
var schemasFS embed.FS

//go:embed templates
var templatesFS embed.FS

//go:embed wizards/*.md
var wizardsFS embed.FS

//go:embed outputs
var generatorsFS embed.FS

//go:embed agents
var agentsFS embed.FS

//go:embed skills
var skillsFS embed.FS

//go:embed VERSION
var Version string

//go:embed MANIFEST.txt
var Manifest string

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// ListSchemas returns the filenames of all embedded JSON Schema files.
func ListSchemas() ([]string, error) {
	entries, err := schemasFS.ReadDir("schemas")
	if err != nil {
		return nil, fmt.Errorf("list schemas: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

// GetSchema returns the raw JSON bytes of a schema file.
// filename is just the base name, e.g. "feature_definition_schema.json".
func GetSchema(filename string) ([]byte, error) {
	data, err := schemasFS.ReadFile(path.Join("schemas", filename))
	if err != nil {
		return nil, fmt.Errorf("get schema %q: %w", filename, err)
	}
	return data, nil
}

// SchemaFS returns an fs.FS rooted at the schemas directory.
func SchemaFS() (fs.FS, error) {
	return fs.Sub(schemasFS, "schemas")
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

// ListTemplates returns all template file paths relative to the templates root.
func ListTemplates() ([]string, error) {
	var paths []string
	err := fs.WalkDir(templatesFS, "templates", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if strings.HasSuffix(d.Name(), ".yaml") || strings.HasSuffix(d.Name(), ".yml") {
			paths = append(paths, strings.TrimPrefix(p, "templates/"))
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("list templates: %w", err)
	}
	return paths, nil
}

// GetTemplate returns the raw YAML bytes of a template file.
// templatePath is relative to the templates root, e.g. "READY/00_north_star.yaml".
func GetTemplate(templatePath string) ([]byte, error) {
	data, err := templatesFS.ReadFile(path.Join("templates", templatePath))
	if err != nil {
		return nil, fmt.Errorf("get template %q: %w", templatePath, err)
	}
	return data, nil
}

// TemplateFS returns an fs.FS rooted at the templates directory.
func TemplateFS() (fs.FS, error) {
	return fs.Sub(templatesFS, "templates")
}

// ---------------------------------------------------------------------------
// Wizards (legacy)
// ---------------------------------------------------------------------------

// ListWizards returns the filenames of all embedded wizard markdown files.
func ListWizards() ([]string, error) {
	entries, err := wizardsFS.ReadDir("wizards")
	if err != nil {
		return nil, fmt.Errorf("list wizards: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

// GetWizard returns the raw markdown bytes of a wizard file.
// filename is just the base name, e.g. "feature_definition.wizard.md".
func GetWizard(filename string) ([]byte, error) {
	data, err := wizardsFS.ReadFile(path.Join("wizards", filename))
	if err != nil {
		return nil, fmt.Errorf("get wizard %q: %w", filename, err)
	}
	return data, nil
}

// ---------------------------------------------------------------------------
// Generators (legacy outputs/) — deprecated; use ResolveSkill instead
// ---------------------------------------------------------------------------

// ListGenerators returns the names of all embedded generator directories.
//
// Deprecated: generators are now aliases for core skills of type "generation".
// Use ListSkills() which returns all skill names; generator names resolve
// transparently via ResolveSkill / GetSkillYAML.
func ListGenerators() ([]string, error) {
	slog.Warn("embedded.ListGenerators is deprecated; use ListSkills or ResolveSkill instead")
	entries, err := generatorsFS.ReadDir("outputs")
	if err != nil {
		return nil, fmt.Errorf("list generators: %w", err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

// GetGenerator returns an fs.FS rooted at a specific generator directory.
//
// Deprecated: use ResolveSkill(name) which falls through to generators automatically.
func GetGenerator(name string) (fs.FS, error) {
	slog.Warn("embedded.GetGenerator is deprecated; use ResolveSkill instead", "name", name)
	sub, err := fs.Sub(generatorsFS, path.Join("outputs", name))
	if err != nil {
		return nil, fmt.Errorf("get generator %q: %w", name, err)
	}
	return sub, nil
}

// ---------------------------------------------------------------------------
// CoreSkill — unified view of an embedded skill or generator alias
// ---------------------------------------------------------------------------

// CoreSkillSource identifies where a resolved core skill originates.
type CoreSkillSource string

const (
	// CoreSkillSourceEmbedded is a skill found in the skills/ embedded FS.
	CoreSkillSourceEmbedded CoreSkillSource = "canonical"
	// CoreSkillSourceGeneratorAlias is a legacy generator surfaced as a skill.
	CoreSkillSourceGeneratorAlias CoreSkillSource = "generator-alias"
)

// CoreSkill is the unified representation of an embedded skill resolved by name.
// It covers both the skills/ directory and the legacy outputs/ generators.
type CoreSkill struct {
	Name      string          // kebab-case skill name
	Type      string          // skill type: creation | review | generation | analysis
	SkillYAML []byte          // raw skill.yaml content (synthesised for generator aliases)
	PromptMD  []byte          // raw prompt markdown; nil if absent
	Source    CoreSkillSource // canonical | generator-alias
}

// ResolveSkill resolves a skill by name using the following priority order:
//  1. skills/ embedded FS (canonical)
//  2. outputs/ embedded FS (generator alias — synthesises a minimal skill.yaml)
//
// Returns an error wrapping fs.ErrNotExist if the skill is not found in either location.
func ResolveSkill(name string) (*CoreSkill, error) {
	// 1. Try canonical skills/ first.
	yamlData, err := GetSkillYAML(name)
	if err == nil {
		promptData, _ := GetSkillPrompt(name) // nil, nil is fine
		// Extract type from YAML for convenience; default to "prompt" if absent.
		skillType := extractYAMLField(yamlData, "type")
		if skillType == "" {
			skillType = "prompt"
		}
		return &CoreSkill{
			Name:      name,
			Type:      skillType,
			SkillYAML: yamlData,
			PromptMD:  promptData,
			Source:    CoreSkillSourceEmbedded,
		}, nil
	}
	if !isNotExist(err) {
		return nil, fmt.Errorf("resolve skill %q: %w", name, err)
	}

	// 2. Fall through to outputs/ generator alias.
	// fs.Sub does not error on a missing path; probe with ReadDir instead.
	genEntries, err2 := generatorsFS.ReadDir(path.Join("outputs", name))
	if err2 != nil {
		// Not found in outputs/ either.
		return nil, fmt.Errorf("resolve skill %q: %w", name, fs.ErrNotExist)
	}
	_ = genEntries

	// Read wizard.instructions.md as the prompt (generators use this filename).
	var promptData []byte
	if pd, err3 := generatorsFS.ReadFile(path.Join("outputs", name, "wizard.instructions.md")); err3 == nil {
		promptData = pd
	}

	// Synthesise a minimal skill.yaml for the generator alias.
	syntheticYAML := fmt.Appendf(nil,
		"name: %s\nversion: \"1.0.0\"\ntype: generation\ndescription: \"Legacy generator alias for %s\"\n",
		name, name,
	)

	return &CoreSkill{
		Name:      name,
		Type:      "generation",
		SkillYAML: syntheticYAML,
		PromptMD:  promptData,
		Source:    CoreSkillSourceGeneratorAlias,
	}, nil
}

// extractYAMLField does a simple line-scan to extract a top-level scalar field
// from YAML without importing a YAML parser. Only used for the "type" field on
// skill.yaml files which are always well-formed.
func extractYAMLField(data []byte, field string) string {
	prefix := field + ": "
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

// AgentMeta holds the top-level metadata fields from an agent.yaml.
type AgentMeta struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Type        string `json:"type"`
	Phase       string `json:"phase"`
	DisplayName string `json:"display_name,omitempty"`
	Description string `json:"description,omitempty"`
}

// ListAgents returns the directory names of all embedded agents.
func ListAgents() ([]string, error) {
	entries, err := agentsFS.ReadDir("agents")
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

// GetAgentYAML returns the raw agent.yaml bytes for the named agent.
func GetAgentYAML(name string) ([]byte, error) {
	data, err := agentsFS.ReadFile(path.Join("agents", name, "agent.yaml"))
	if err != nil {
		return nil, fmt.Errorf("get agent %q: %w", name, err)
	}
	return data, nil
}

// GetAgentPrompt returns the raw prompt.md bytes for the named agent.
// Returns nil, nil if no prompt file exists (not all agents have one).
func GetAgentPrompt(name string) ([]byte, error) {
	data, err := agentsFS.ReadFile(path.Join("agents", name, "prompt.md"))
	if err != nil {
		if isNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("get agent prompt %q: %w", name, err)
	}
	return data, nil
}

// AgentFS returns an fs.FS rooted at a specific agent directory.
func AgentFS(name string) (fs.FS, error) {
	sub, err := fs.Sub(agentsFS, path.Join("agents", name))
	if err != nil {
		return nil, fmt.Errorf("agent fs %q: %w", name, err)
	}
	return sub, nil
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

// SkillMeta holds the top-level metadata fields from a skill.yaml.
type SkillMeta struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Type        string `json:"type"`
	Phase       string `json:"phase"`
	Description string `json:"description,omitempty"`
}

// ListSkills returns the directory names of all embedded skills.
func ListSkills() ([]string, error) {
	entries, err := skillsFS.ReadDir("skills")
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

// GetSkillYAML returns the raw skill.yaml bytes for the named skill.
func GetSkillYAML(name string) ([]byte, error) {
	data, err := skillsFS.ReadFile(path.Join("skills", name, "skill.yaml"))
	if err != nil {
		return nil, fmt.Errorf("get skill %q: %w", name, err)
	}
	return data, nil
}

// GetSkillPrompt returns the raw prompt.md bytes for the named skill.
// Falls back to wizard.instructions.md if prompt.md is absent.
// Returns nil, nil if neither exists.
func GetSkillPrompt(name string) ([]byte, error) {
	for _, candidate := range []string{"prompt.md", "wizard.instructions.md"} {
		data, err := skillsFS.ReadFile(path.Join("skills", name, candidate))
		if err == nil {
			return data, nil
		}
		if !isNotExist(err) {
			return nil, fmt.Errorf("get skill prompt %q: %w", name, err)
		}
	}
	return nil, nil
}

// SkillFS returns an fs.FS rooted at a specific skill directory.
func SkillFS(name string) (fs.FS, error) {
	sub, err := fs.Sub(skillsFS, path.Join("skills", name))
	if err != nil {
		return nil, fmt.Errorf("skill fs %q: %w", name, err)
	}
	return sub, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// isNotExist reports whether err indicates a missing file inside an embed.FS.
// embed.FS wraps the error so errors.Is(err, fs.ErrNotExist) works correctly.
func isNotExist(err error) bool {
	return err != nil && strings.Contains(err.Error(), "file does not exist")
}
