// Package skill provides skill discovery, loading, validation, and scaffolding for EPF.
package skill

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"gopkg.in/yaml.v3"
)

// Loader discovers and loads skills from multiple sources with three-tier
// priority: instance > framework > global. Supports both the new skill.yaml
// manifest format and legacy generator.yaml / .wizard.md formats.
//
// Directory scanning:
//   - skills/ AND generators/ are BOTH scanned at each tier (permanently)
//   - outputs/ is scanned for framework source (legacy canonical-epf dir)
//   - wizards/ is scanned for .wizard.md files (legacy skill-as-wizard format)
//
// Manifests are loaded eagerly at startup for fast listing.
// Prompt content is loaded lazily on demand via LoadPrompt().
type Loader struct {
	epfRoot      string // Path to EPF framework (docs/EPF)
	instanceRoot string // Path to current EPF instance (optional)
	globalRoot   string // Path to global skills (~/.epf-cli)

	skills      map[string]*SkillInfo
	loaded      bool
	useEmbedded bool   // Whether embedded generators are being used for framework
	source      string // Where framework skills were loaded from
}

// NewLoader creates a new skill loader.
func NewLoader(epfRoot string) *Loader {
	home, _ := os.UserHomeDir()
	globalRoot := ""
	if home != "" {
		globalRoot = filepath.Join(home, ".epf-cli")
	}

	return &Loader{
		epfRoot:    epfRoot,
		globalRoot: globalRoot,
		skills:     make(map[string]*SkillInfo),
	}
}

// NewEmbeddedLoader creates a loader that uses embedded generators as the
// framework source.
func NewEmbeddedLoader() *Loader {
	home, _ := os.UserHomeDir()
	globalRoot := ""
	if home != "" {
		globalRoot = filepath.Join(home, ".epf-cli")
	}

	return &Loader{
		epfRoot:     "",
		globalRoot:  globalRoot,
		skills:      make(map[string]*SkillInfo),
		useEmbedded: true,
		source:      "embedded v" + embedded.GetVersion(),
	}
}

// SetInstanceRoot sets the instance root for discovering instance-local skills.
func (l *Loader) SetInstanceRoot(instanceRoot string) {
	l.instanceRoot = instanceRoot
	l.loaded = false
}

// Load discovers skills from all sources. Skills are loaded in reverse
// priority order so that higher-priority sources overwrite lower ones.
func (l *Loader) Load() error {
	l.skills = make(map[string]*SkillInfo)

	// 3. Global skills (lowest priority)
	if l.globalRoot != "" {
		l.loadFromDir(filepath.Join(l.globalRoot, GlobalSkillsDir), SourceGlobal)
		l.loadFromDir(filepath.Join(l.globalRoot, GlobalGeneratorsDir), SourceGlobal)
	}

	// 2. Framework skills — try filesystem first, fall back to embedded
	frameworkLoaded := false
	if l.epfRoot != "" && !l.useEmbedded {
		// Try new skills/ directory
		if l.loadFromDir(filepath.Join(l.epfRoot, FrameworkSkillsDir), SourceFramework) > 0 {
			frameworkLoaded = true
			l.source = l.epfRoot
		}
		// Also scan legacy outputs/ directory
		if l.loadFromDir(filepath.Join(l.epfRoot, FrameworkOutputsDir), SourceFramework) > 0 {
			frameworkLoaded = true
			l.source = l.epfRoot
		}
		// Also scan legacy wizards/ for .wizard.md files
		l.loadLegacyWizards(filepath.Join(l.epfRoot, "wizards"), SourceFramework)
		if len(l.skills) > 0 && !frameworkLoaded {
			frameworkLoaded = true
			l.source = l.epfRoot
		}
	}

	// Fall back to embedded generators for framework source
	if !frameworkLoaded && embedded.HasEmbeddedArtifacts() {
		if err := l.loadFromEmbedded(); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to load embedded skills: %v\n", err)
		}
	}

	// 1. Instance skills (highest priority)
	if l.instanceRoot != "" {
		l.loadFromDir(filepath.Join(l.instanceRoot, InstanceSkillsDir), SourceInstance)
		l.loadFromDir(filepath.Join(l.instanceRoot, InstanceGeneratorsDir), SourceInstance)
	}

	l.loaded = true
	return nil
}

// loadFromDir scans a directory for skill bundles (subdirectories with
// skill.yaml or generator.yaml). Returns the number of skills loaded.
func (l *Loader) loadFromDir(dir string, source SkillSource) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}

	count := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		name := entry.Name()
		if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
			continue
		}

		skillDir := filepath.Join(dir, name)
		if !looksLikeSkill(skillDir) {
			continue
		}

		info, err := l.inferSkillInfo(skillDir, source)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to load skill %s: %v\n", name, err)
			continue
		}

		// Higher-priority sources overwrite lower ones
		l.skills[info.Name] = info
		count++
	}

	return count
}

// loadLegacyWizards scans a wizards/ directory for .wizard.md files and loads
// them as skills (type: creation). Only .wizard.md files become skills —
// .agent_prompt.md files become agents (handled by agent.Loader).
func (l *Loader) loadLegacyWizards(dir string, source SkillSource) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	wizardSuffix := ".wizard.md"

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if !strings.HasSuffix(name, wizardSuffix) {
			continue
		}

		// Skip README and template files
		if strings.ToLower(name) == "readme.md" || strings.Contains(name, "template") {
			continue
		}

		skillName := strings.TrimSuffix(name, wizardSuffix)
		filePath := filepath.Join(dir, name)

		// Read content for description extraction
		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		info := l.legacyWizardToSkill(skillName, name, filePath, string(content), source)
		l.skills[info.Name] = info
	}
}

// loadFromEmbedded loads skills from embedded generators, wizard files, and new-format skill bundles.
func (l *Loader) loadFromEmbedded() error {
	l.useEmbedded = true
	l.source = "embedded v" + embedded.GetVersion()

	// Load embedded generators (legacy, lower priority)
	genNames, err := embedded.ListGenerators()
	if err == nil {
		for _, name := range genNames {
			genContent, err := embedded.GetGeneratorContent(name)
			if err != nil {
				continue
			}

			info := l.embeddedGeneratorToSkill(name, genContent)
			l.skills[info.Name] = info
		}
	}

	// Load embedded .wizard.md files as skills (legacy, lower priority)
	wizardNames, err := embedded.ListWizards()
	if err == nil {
		wizardSuffix := ".wizard.md"
		for _, name := range wizardNames {
			if !strings.HasSuffix(name, wizardSuffix) {
				continue
			}
			if strings.ToLower(name) == "readme.md" || strings.Contains(name, "template") {
				continue
			}

			content, err := embedded.GetWizard(name)
			if err != nil {
				continue
			}

			skillName := strings.TrimSuffix(name, wizardSuffix)
			info := l.legacyWizardToSkill(skillName, name, filepath.Join("wizards", name), string(content), SourceFramework)
			// Store content immediately since it's already in memory
			info.SetPrompt(string(content))
			l.skills[info.Name] = info
		}
	}

	// Load new-format skills from embedded skills/ directory (highest priority)
	skillNames, err := embedded.ListSkills()
	if err == nil {
		for _, name := range skillNames {
			info, err := l.loadManifestSkillFromEmbeddedFS(name)
			if err != nil {
				continue
			}
			// Overwrite any legacy skill with same name
			l.skills[info.Name] = info

			// Also remove the underscore variant so we don't get duplicates
			// (legacy: "feature_definition", new: "feature-definition")
			underscoreName := strings.ReplaceAll(info.Name, "-", "_")
			if underscoreName != info.Name {
				delete(l.skills, underscoreName)
			}
		}
	}

	if len(l.skills) == 0 {
		return fmt.Errorf("no embedded skills found")
	}

	return nil
}

// loadManifestSkillFromEmbeddedFS loads a skill from the embedded skills/ directory.
func (l *Loader) loadManifestSkillFromEmbeddedFS(dirName string) (*SkillInfo, error) {
	skillFS, err := embedded.GetSkill(dirName)
	if err != nil {
		return nil, fmt.Errorf("getting embedded skill %s: %w", dirName, err)
	}

	data, err := fs.ReadFile(skillFS, DefaultManifestFile)
	if err != nil {
		return nil, fmt.Errorf("reading embedded skill manifest %s: %w", dirName, err)
	}

	var manifest SkillManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("parsing embedded skill manifest %s: %w", dirName, err)
	}

	info := &SkillInfo{
		Name:        dirName,
		Source:      SourceFramework,
		Path:        filepath.Join("skills", dirName),
		HasManifest: true,
	}

	l.populateFromManifest(info, &manifest)

	// Use directory name as name if manifest didn't set one
	if info.Name == "" {
		info.Name = dirName
	}

	// Detect available files from embedded FS
	l.detectFilesFromEmbeddedFS(info, skillFS)

	return info, nil
}

// detectFilesFromEmbeddedFS checks which standard files exist in an embedded skill FS.
func (l *Loader) detectFilesFromEmbeddedFS(info *SkillInfo, skillFS fs.FS) {
	// Prompt: prompt.md or wizard.instructions.md
	for _, promptFile := range []string{DefaultPromptFile, LegacyPromptFile} {
		if _, err := fs.ReadFile(skillFS, promptFile); err == nil {
			info.HasPrompt = true
			info.PromptFile = promptFile
			if promptFile == LegacyPromptFile {
				info.LegacyPromptName = LegacyPromptFile
			}
			break
		}
	}

	// Schema
	if _, err := fs.ReadFile(skillFS, DefaultSchemaFile); err == nil {
		info.HasSchema = true
		info.SchemaFile = DefaultSchemaFile
	}

	// Validator
	if _, err := fs.ReadFile(skillFS, DefaultValidatorFile); err == nil {
		info.HasValidator = true
		info.ValidatorFile = DefaultValidatorFile
	}

	// Template: template.md, template.yaml, or template.html
	for _, tmpl := range []string{"template.md", "template.yaml", "template.html"} {
		if _, err := fs.ReadFile(skillFS, tmpl); err == nil {
			info.HasTemplate = true
			info.TemplateFile = tmpl
			break
		}
	}
}

// inferSkillInfo creates SkillInfo from a skill directory by reading the
// manifest (skill.yaml or generator.yaml) and detecting available files.
func (l *Loader) inferSkillInfo(skillDir string, source SkillSource) (*SkillInfo, error) {
	dirName := filepath.Base(skillDir)

	info := &SkillInfo{
		Name:   dirName,
		Source: source,
		Path:   skillDir,
	}

	// Try skill.yaml first, then generator.yaml
	manifestLoaded := false
	for _, manifestFile := range []string{DefaultManifestFile, LegacyManifestFile} {
		manifestPath := filepath.Join(skillDir, manifestFile)
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}

		var manifest SkillManifest
		if err := yaml.Unmarshal(data, &manifest); err != nil {
			return nil, fmt.Errorf("parsing %s: %w", manifestFile, err)
		}

		l.populateFromManifest(info, &manifest)
		info.HasManifest = true

		// Track legacy format
		if manifestFile == LegacyManifestFile {
			info.LegacyFormat = true
			info.LegacyManifestName = LegacyManifestFile
			// Infer type as generation if not set (legacy generators are always generation)
			if info.Type == "" {
				info.Type = SkillTypeGeneration
			}
		}

		manifestLoaded = true
		break
	}

	if !manifestLoaded {
		// No manifest — infer from directory name
		info.Version = "0.0.0"
		info.Category = CategoryCustom
	}

	// Use directory name as name if manifest didn't set one
	if info.Name == "" {
		info.Name = dirName
	}

	// Detect available files
	l.detectFiles(info, skillDir)

	return info, nil
}

// populateFromManifest fills SkillInfo from a parsed manifest.
func (l *Loader) populateFromManifest(info *SkillInfo, m *SkillManifest) {
	if m.Name != "" {
		info.Name = m.Name
	}
	info.Version = m.Version
	info.Type = m.Type
	info.Phase = m.Phase
	info.Description = m.Description
	info.Category = m.Category
	info.Author = m.Author
	info.Regions = m.Regions

	if m.Requires != nil {
		info.RequiredArtifacts = m.Requires.Artifacts
		info.OptionalArtifacts = m.Requires.Optional
		info.RequiredTools = m.Requires.Tools
	}

	if m.Output != nil {
		info.OutputFormat = m.Output.Format
		info.ArtifactType = m.Output.ArtifactType
	}

	info.Capability = m.Capability
	info.Scope = m.Scope

	// Honor explicit file locations from manifest (overrides auto-detection)
	if m.Files != nil {
		if m.Files.Prompt != "" {
			info.PromptFile = m.Files.Prompt
		}
		if m.Files.Schema != "" {
			info.SchemaFile = m.Files.Schema
		}
		if m.Files.Validator != "" {
			info.ValidatorFile = m.Files.Validator
		}
		if m.Files.Template != "" {
			info.TemplateFile = m.Files.Template
		}
	}
}

// detectFiles checks which standard files exist in the skill directory.
// Checks both new and legacy file names.
func (l *Loader) detectFiles(info *SkillInfo, skillDir string) {
	// Prompt: prompt.md or wizard.instructions.md
	for _, promptFile := range []string{DefaultPromptFile, LegacyPromptFile} {
		if _, err := os.Stat(filepath.Join(skillDir, promptFile)); err == nil {
			info.HasPrompt = true
			info.PromptFile = promptFile
			if promptFile == LegacyPromptFile {
				info.LegacyPromptName = LegacyPromptFile
			}
			break
		}
	}

	// Schema
	if _, err := os.Stat(filepath.Join(skillDir, DefaultSchemaFile)); err == nil {
		info.HasSchema = true
		info.SchemaFile = DefaultSchemaFile
	}

	// Validator
	if _, err := os.Stat(filepath.Join(skillDir, DefaultValidatorFile)); err == nil {
		info.HasValidator = true
		info.ValidatorFile = DefaultValidatorFile
	}

	// Template: template.md, template.yaml, or template.html
	for _, tmplFile := range []string{DefaultTemplateFile, "template.yaml", "template.html"} {
		if _, err := os.Stat(filepath.Join(skillDir, tmplFile)); err == nil {
			info.HasTemplate = true
			info.TemplateFile = tmplFile
			break
		}
	}
}

// legacyWizardToSkill converts a legacy .wizard.md file to a SkillInfo.
func (l *Loader) legacyWizardToSkill(skillName, fileName, filePath, content string, source SkillSource) *SkillInfo {
	// Determine skill type from known names
	skillType := inferSkillType(skillName)

	info := &SkillInfo{
		Name:             skillName,
		Source:           source,
		Path:             filePath,
		Type:             skillType,
		Description:      parsePurpose(content),
		HasManifest:      false,
		HasPrompt:        true,
		PromptFile:       fileName,
		LegacyFormat:     true,
		LegacyPromptName: fileName,
	}

	return info
}

// embeddedGeneratorToSkill converts an embedded generator to a SkillInfo.
func (l *Loader) embeddedGeneratorToSkill(name string, genContent *embedded.GeneratorContent) *SkillInfo {
	info := &SkillInfo{
		Name:               name,
		Source:             SourceFramework,
		Path:               filepath.Join("outputs", name), // Virtual path
		Type:               SkillTypeGeneration,
		Category:           inferCategoryFromName(name),
		HasManifest:        genContent.Manifest != "",
		HasSchema:          genContent.Schema != "",
		HasPrompt:          genContent.Wizard != "",
		HasTemplate:        genContent.Template != "",
		LegacyFormat:       true,
		LegacyManifestName: LegacyManifestFile,
	}

	if info.HasSchema {
		info.SchemaFile = DefaultSchemaFile
	}
	if info.HasPrompt {
		info.PromptFile = LegacyPromptFile
	}
	if info.HasTemplate {
		info.TemplateFile = genContent.TemplateFile
	}

	// Parse description from manifest or wizard
	if genContent.Manifest != "" {
		info.Description = parseDescriptionFromManifest(genContent.Manifest)
	}
	if info.Description == "" && genContent.Wizard != "" {
		info.Description = parseDescriptionFromWizard(genContent.Wizard)
	}

	return info
}

// LoadPrompt lazily loads the prompt content for a skill if not already loaded.
func (l *Loader) LoadPrompt(info *SkillInfo) error {
	if info.PromptLoaded() {
		return nil
	}

	// Embedded framework skills
	if l.useEmbedded && info.Source == SourceFramework {
		// Try new-format embedded skill first (skills/{name}/prompt.md or wizard.instructions.md)
		if info.HasManifest && !info.LegacyFormat {
			skillFS, err := embedded.GetSkill(info.Name)
			if err == nil {
				// Try prompt.md, then wizard.instructions.md
				for _, promptFile := range []string{DefaultPromptFile, LegacyPromptFile} {
					if data, readErr := fs.ReadFile(skillFS, promptFile); readErr == nil {
						info.SetPrompt(string(data))
						return nil
					}
				}
			}
		}

		// Try embedded generator wizard
		genContent, err := embedded.GetGeneratorContent(info.Name)
		if err == nil && genContent.Wizard != "" {
			info.SetPrompt(genContent.Wizard)
			return nil
		}
		// Try embedded wizard file
		if info.PromptFile != "" {
			content, err := embedded.GetWizard(info.PromptFile)
			if err == nil {
				info.SetPrompt(string(content))
				return nil
			}
		}
		// Try by name with wizard suffix
		content, err := embedded.GetWizard(info.Name + ".wizard.md")
		if err == nil {
			info.SetPrompt(string(content))
			return nil
		}
		return fmt.Errorf("embedded prompt not found for skill %s", info.Name)
	}

	// Filesystem: skill bundle directory
	if info.HasManifest && info.PromptFile != "" {
		data, err := os.ReadFile(filepath.Join(info.Path, info.PromptFile))
		if err == nil {
			info.SetPrompt(string(data))
			return nil
		}
	}

	// Legacy wizard: Path IS the file
	if info.LegacyFormat && !info.HasManifest {
		data, err := os.ReadFile(info.Path)
		if err != nil {
			return fmt.Errorf("reading skill prompt: %w", err)
		}
		info.SetPrompt(string(data))
		return nil
	}

	// Try prompt files in skill directory
	if info.Path != "" {
		for _, promptFile := range []string{DefaultPromptFile, LegacyPromptFile} {
			data, err := os.ReadFile(filepath.Join(info.Path, promptFile))
			if err == nil {
				info.SetPrompt(string(data))
				return nil
			}
		}
	}

	return fmt.Errorf("prompt not found for skill %s", info.Name)
}

// GetSkillContent loads the full content of all files in a skill bundle.
func (l *Loader) GetSkillContent(name string) (*SkillContent, error) {
	info, err := l.GetSkill(name)
	if err != nil {
		return nil, err
	}

	content := &SkillContent{
		SkillInfo: info,
	}

	// If using embedded and this is a framework skill
	if l.useEmbedded && info.Source == SourceFramework {
		// Try new-format embedded skill first
		if info.HasManifest && !info.LegacyFormat {
			skillFS, err := embedded.GetSkill(name)
			if err == nil {
				l.loadContentFromEmbeddedFS(content, skillFS)
				return content, nil
			}
		}

		// Fall back to legacy generator content
		if info.Type == SkillTypeGeneration {
			embeddedContent, err := embedded.GetGeneratorContent(name)
			if err == nil {
				content.ManifestContent = embeddedContent.Manifest
				content.SchemaContent = embeddedContent.Schema
				content.PromptContent = embeddedContent.Wizard
				content.TemplateContent = embeddedContent.Template
				content.ReadmeContent = embeddedContent.Readme
				return content, nil
			}
		}
		// Fall through to filesystem loading
	}

	// Load from filesystem
	baseDir := info.Path

	// For legacy wizard files, Path is the file itself, not a directory
	if info.LegacyFormat && !info.HasManifest {
		data, err := os.ReadFile(info.Path)
		if err == nil {
			content.PromptContent = string(data)
		}
		return content, nil
	}

	// Manifest
	if info.HasManifest {
		manifestFile := DefaultManifestFile
		if info.LegacyManifestName != "" {
			manifestFile = info.LegacyManifestName
		}
		if data, err := os.ReadFile(filepath.Join(baseDir, manifestFile)); err == nil {
			content.ManifestContent = string(data)
		}
	}

	// Schema
	if info.HasSchema && info.SchemaFile != "" {
		if data, err := os.ReadFile(filepath.Join(baseDir, info.SchemaFile)); err == nil {
			content.SchemaContent = string(data)
		}
	}

	// Prompt
	if info.HasPrompt && info.PromptFile != "" {
		if data, err := os.ReadFile(filepath.Join(baseDir, info.PromptFile)); err == nil {
			content.PromptContent = string(data)
		}
	}

	// Validator
	if info.HasValidator && info.ValidatorFile != "" {
		if data, err := os.ReadFile(filepath.Join(baseDir, info.ValidatorFile)); err == nil {
			content.ValidatorContent = string(data)
		}
	}

	// Template
	if info.HasTemplate && info.TemplateFile != "" {
		if data, err := os.ReadFile(filepath.Join(baseDir, info.TemplateFile)); err == nil {
			content.TemplateContent = string(data)
		}
	}

	// README
	if data, err := os.ReadFile(filepath.Join(baseDir, DefaultReadmeFile)); err == nil {
		content.ReadmeContent = string(data)
	}

	return content, nil
}

// loadContentFromEmbeddedFS reads all skill bundle files from an embedded fs.FS.
func (l *Loader) loadContentFromEmbeddedFS(content *SkillContent, skillFS fs.FS) {
	info := content.SkillInfo

	// Manifest (skill.yaml)
	if data, err := fs.ReadFile(skillFS, DefaultManifestFile); err == nil {
		content.ManifestContent = string(data)
	}

	// Prompt (prompt.md or wizard.instructions.md)
	if info.HasPrompt && info.PromptFile != "" {
		if data, err := fs.ReadFile(skillFS, info.PromptFile); err == nil {
			content.PromptContent = string(data)
		}
	}

	// Schema
	if info.HasSchema {
		if data, err := fs.ReadFile(skillFS, DefaultSchemaFile); err == nil {
			content.SchemaContent = string(data)
		}
	}

	// Validator
	if info.HasValidator {
		if data, err := fs.ReadFile(skillFS, DefaultValidatorFile); err == nil {
			content.ValidatorContent = string(data)
		}
	}

	// Template
	if info.HasTemplate && info.TemplateFile != "" {
		if data, err := fs.ReadFile(skillFS, info.TemplateFile); err == nil {
			content.TemplateContent = string(data)
		}
	}

	// README
	if data, err := fs.ReadFile(skillFS, DefaultReadmeFile); err == nil {
		content.ReadmeContent = string(data)
	}
}

// ListSkills returns all loaded skills, optionally filtered by type, category,
// and/or source.
func (l *Loader) ListSkills(skillType *SkillType, category *Category, source *SkillSource) []*SkillInfo {
	var result []*SkillInfo

	for _, skill := range l.skills {
		if skillType != nil && skill.Type != *skillType {
			continue
		}
		if category != nil && *category != "" && skill.Category != *category {
			continue
		}
		if source != nil && skill.Source != *source {
			continue
		}
		result = append(result, skill)
	}

	// Sort by source priority, then by name
	sort.Slice(result, func(i, j int) bool {
		pi := SourcePriority(result[i].Source)
		pj := SourcePriority(result[j].Source)
		if pi != pj {
			return pi < pj
		}
		return result[i].Name < result[j].Name
	})

	return result
}

// normalizeName converts underscores to hyphens for consistent lookup.
func normalizeName(name string) string {
	return strings.ReplaceAll(name, "_", "-")
}

// GetSkill returns a skill by name.
// Supports exact match, hyphen/underscore normalization, case-insensitive, and partial matching.
func (l *Loader) GetSkill(name string) (*SkillInfo, error) {
	// Exact match
	if skill, ok := l.skills[name]; ok {
		return skill, nil
	}

	// Normalized match (underscores → hyphens)
	normalized := normalizeName(name)
	if normalized != name {
		if skill, ok := l.skills[normalized]; ok {
			return skill, nil
		}
	}

	// Case-insensitive match (with normalization) — sorted for determinism
	normalizedLower := strings.ToLower(normalized)
	for _, key := range l.GetSkillNames() {
		if strings.ToLower(normalizeName(key)) == normalizedLower {
			return l.skills[key], nil
		}
	}

	// Partial match (with normalization) — sorted for determinism
	sortedKeys := l.GetSkillNames() // already sorted
	for _, key := range sortedKeys {
		if strings.Contains(strings.ToLower(normalizeName(key)), normalizedLower) {
			return l.skills[key], nil
		}
	}

	available := l.GetSkillNames()
	return nil, fmt.Errorf("skill not found: %s\n\nAvailable skills:\n  %s",
		name, strings.Join(available, "\n  "))
}

// GetSkillNames returns all skill names, sorted.
func (l *Loader) GetSkillNames() []string {
	names := make([]string, 0, len(l.skills))
	for name := range l.skills {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// SkillCount returns the number of loaded skills.
func (l *Loader) SkillCount() int {
	return len(l.skills)
}

// HasSkills returns true if any skills are loaded.
func (l *Loader) HasSkills() bool {
	return len(l.skills) > 0
}

// SkillsBySource groups skills by their source.
func (l *Loader) SkillsBySource() map[SkillSource][]*SkillInfo {
	result := make(map[SkillSource][]*SkillInfo)
	for _, skill := range l.skills {
		result[skill.Source] = append(result[skill.Source], skill)
	}
	for source := range result {
		sort.Slice(result[source], func(i, j int) bool {
			return result[source][i].Name < result[source][j].Name
		})
	}
	return result
}

// SkillsByCategory groups skills by their category.
func (l *Loader) SkillsByCategory() map[Category][]*SkillInfo {
	result := make(map[Category][]*SkillInfo)
	for _, skill := range l.skills {
		cat := skill.Category
		if cat == "" {
			cat = CategoryCustom
		}
		result[cat] = append(result[cat], skill)
	}
	for cat := range result {
		sort.Slice(result[cat], func(i, j int) bool {
			return result[cat][i].Name < result[cat][j].Name
		})
	}
	return result
}

// SkillsByType groups skills by their type.
func (l *Loader) SkillsByType() map[SkillType][]*SkillInfo {
	result := make(map[SkillType][]*SkillInfo)
	for _, skill := range l.skills {
		t := skill.Type
		if t == "" {
			t = SkillTypeGeneration // Default for untyped
		}
		result[t] = append(result[t], skill)
	}
	for t := range result {
		sort.Slice(result[t], func(i, j int) bool {
			return result[t][i].Name < result[t][j].Name
		})
	}
	return result
}

// Source returns where framework skills were loaded from.
func (l *Loader) Source() string {
	return l.source
}

// IsEmbedded returns true if framework skills were loaded from embedded files.
func (l *Loader) IsEmbedded() bool {
	return l.useEmbedded
}

// --- Internal helpers ---

// looksLikeSkill checks if a directory appears to be a skill bundle.
// Must have at least one of: skill.yaml, generator.yaml, schema.json,
// prompt.md, wizard.instructions.md.
func looksLikeSkill(dir string) bool {
	candidates := []string{
		DefaultManifestFile, // skill.yaml
		LegacyManifestFile,  // generator.yaml
		DefaultSchemaFile,   // schema.json
		DefaultPromptFile,   // prompt.md
		LegacyPromptFile,    // wizard.instructions.md
	}
	for _, f := range candidates {
		if _, err := os.Stat(filepath.Join(dir, f)); err == nil {
			return true
		}
	}
	return false
}

// inferSkillType determines the skill type from known skill names.
func inferSkillType(name string) SkillType {
	switch name {
	// Creation skills (create new EPF artifacts)
	case "feature_definition", "roadmap_enrichment":
		return SkillTypeCreation

	// Enrichment skills (enhance existing artifacts)
	case "feature_enrichment":
		return SkillTypeEnrichment

	// Review skills (evaluate quality)
	case "value_model_review", "feature_quality_review",
		"strategic_coherence_review", "balance_checker":
		return SkillTypeReview

	// Analysis skills
	case "aim_trigger_assessment", "strategic_reality_check":
		return SkillTypeAnalysis

	// Generation skills (produce output documents)
	case "context_sheet_generator":
		return SkillTypeGeneration

	default:
		return SkillTypeCreation // Default for unknown wizard-based skills
	}
}

// inferCategoryFromName infers category from a skill/generator name.
func inferCategoryFromName(name string) Category {
	nameLower := strings.ToLower(name)
	switch {
	case strings.Contains(nameLower, "compliance") || strings.Contains(nameLower, "legal") || strings.Contains(nameLower, "skattefunn"):
		return CategoryCompliance
	case strings.Contains(nameLower, "marketing"):
		return CategoryMarketing
	case strings.Contains(nameLower, "investor"):
		return CategoryInvestor
	case strings.Contains(nameLower, "internal") || strings.Contains(nameLower, "context"):
		return CategoryInternal
	case strings.Contains(nameLower, "development") || strings.Contains(nameLower, "dev") || strings.Contains(nameLower, "brief"):
		return CategoryDevelopment
	default:
		return CategoryCustom
	}
}

// parsePurpose extracts a short purpose description from wizard markdown.
func parsePurpose(content string) string {
	lines := strings.Split(content, "\n")

	// Try "You are the..." pattern
	youArePattern := regexp.MustCompile(`(?i)you are (?:the |an? )?(?:\*\*)?([^*\n]+)(?:\*\*)?[,.]`)
	if match := youArePattern.FindStringSubmatch(content); len(match) > 1 {
		purpose := strings.ReplaceAll(strings.TrimSpace(match[1]), "**", "")
		if len(purpose) > 10 && len(purpose) < 300 {
			return purpose
		}
	}

	// Look for heading parenthetical or after-colon text
	for _, line := range lines {
		if strings.HasPrefix(line, "# ") {
			if parenStart := strings.LastIndex(line, "("); parenStart > 0 {
				if parenEnd := strings.LastIndex(line, ")"); parenEnd > parenStart {
					return strings.TrimSpace(line[parenStart+1 : parenEnd])
				}
			}
			if colonIdx := strings.Index(line, ":"); colonIdx > 0 {
				afterColon := strings.TrimSpace(line[colonIdx+1:])
				if parenStart := strings.Index(afterColon, "("); parenStart > 0 {
					afterColon = strings.TrimSpace(afterColon[:parenStart])
				}
				if len(afterColon) > 5 && len(afterColon) < 100 {
					return afterColon
				}
			}
		}
	}

	// First paragraph after heading
	foundHeading := false
	var paragraphLines []string
	for _, line := range lines {
		if strings.HasPrefix(line, "# ") {
			foundHeading = true
			continue
		}
		if foundHeading {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || trimmed == "---" || strings.HasPrefix(trimmed, "#") {
				if len(paragraphLines) > 0 {
					break
				}
				continue
			}
			paragraphLines = append(paragraphLines, trimmed)
			if len(strings.Join(paragraphLines, " ")) > 200 {
				break
			}
		}
	}
	if len(paragraphLines) > 0 {
		purpose := strings.Join(paragraphLines, " ")
		purpose = strings.ReplaceAll(purpose, "**", "")
		purpose = strings.ReplaceAll(purpose, "*", "")
		if len(purpose) > 200 {
			if periodIdx := strings.Index(purpose, "."); periodIdx > 20 && periodIdx < 200 {
				purpose = purpose[:periodIdx+1]
			} else {
				purpose = purpose[:197] + "..."
			}
		}
		return purpose
	}

	return ""
}

// parseDescriptionFromManifest extracts description from a YAML manifest string.
func parseDescriptionFromManifest(manifest string) string {
	for _, line := range strings.Split(manifest, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "description:") {
			desc := strings.TrimPrefix(line, "description:")
			desc = strings.TrimSpace(desc)
			desc = strings.Trim(desc, "\"'")
			return desc
		}
	}
	return ""
}

// parseDescriptionFromWizard extracts description from wizard markdown.
func parseDescriptionFromWizard(wizard string) string {
	lines := strings.Split(wizard, "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if strings.Contains(strings.ToUpper(line), "PURPOSE") {
			for j := i + 1; j < len(lines) && j < i+5; j++ {
				next := strings.TrimSpace(lines[j])
				if next != "" && !strings.HasPrefix(next, "#") && !strings.HasPrefix(next, "-") {
					return next
				}
			}
		}
	}
	return ""
}
