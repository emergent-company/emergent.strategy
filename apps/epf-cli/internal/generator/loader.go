package generator

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/embedded"
)

// Loader discovers and loads generators from multiple sources
type Loader struct {
	epfRoot      string // Path to EPF framework (docs/EPF)
	instanceRoot string // Path to current EPF instance (optional)
	globalRoot   string // Path to global generators (~/.epf-cli/generators)

	generators  map[string]*GeneratorInfo // Loaded generators by name
	loaded      bool
	useEmbedded bool   // Whether embedded generators are being used for framework
	source      string // Where framework generators were loaded from
}

// NewEmbeddedLoader creates a loader that only uses embedded generators
func NewEmbeddedLoader() *Loader {
	// Determine global generators path
	home, _ := os.UserHomeDir()
	globalRoot := ""
	if home != "" {
		globalRoot = filepath.Join(home, ".epf-cli", "generators")
	}

	return &Loader{
		epfRoot:     "",
		globalRoot:  globalRoot,
		generators:  make(map[string]*GeneratorInfo),
		useEmbedded: true,
		source:      "embedded v" + embedded.GetVersion(),
	}
}

// NewLoader creates a new generator loader
func NewLoader(epfRoot string) *Loader {
	// Determine global generators path
	home, _ := os.UserHomeDir()
	globalRoot := ""
	if home != "" {
		globalRoot = filepath.Join(home, ".epf-cli", "generators")
	}

	return &Loader{
		epfRoot:    epfRoot,
		globalRoot: globalRoot,
		generators: make(map[string]*GeneratorInfo),
	}
}

// SetInstanceRoot sets the instance root for discovering instance-local generators
func (l *Loader) SetInstanceRoot(instanceRoot string) {
	l.instanceRoot = instanceRoot
	l.loaded = false // Force reload
}

// Load discovers generators from all sources
func (l *Loader) Load() error {
	l.generators = make(map[string]*GeneratorInfo)

	// Load in reverse priority order (lower priority first, so higher priority overwrites)
	// This way, instance generators override framework generators with same name

	// 3. Global generators (lowest priority)
	if l.globalRoot != "" {
		if err := l.loadFromDirectory(l.globalRoot, SourceGlobal); err != nil {
			// Global directory may not exist, that's OK
			if !os.IsNotExist(err) {
				return fmt.Errorf("failed to load global generators: %w", err)
			}
		}
	}

	// 2. Framework generators (EPF canonical) - with embedded fallback
	frameworkLoaded := false
	if l.epfRoot != "" && !l.useEmbedded {
		outputsDir := filepath.Join(l.epfRoot, "outputs")
		if _, err := os.Stat(outputsDir); err == nil {
			if err := l.loadFromDirectory(outputsDir, SourceFramework); err != nil {
				if !os.IsNotExist(err) {
					return fmt.Errorf("failed to load framework generators: %w", err)
				}
			} else {
				frameworkLoaded = true
				l.source = l.epfRoot
			}
		}
	}

	// Fall back to embedded generators for framework source
	if !frameworkLoaded && embedded.HasEmbeddedArtifacts() {
		if err := l.loadFromEmbedded(); err != nil {
			// Log but continue - embedded may have no generators
			fmt.Fprintf(os.Stderr, "Warning: failed to load embedded generators: %v\n", err)
		}
	}

	// 1. Instance generators (highest priority)
	if l.instanceRoot != "" {
		generatorsDir := filepath.Join(l.instanceRoot, "generators")
		if err := l.loadFromDirectory(generatorsDir, SourceInstance); err != nil {
			// Instance generators directory may not exist
			if !os.IsNotExist(err) {
				return fmt.Errorf("failed to load instance generators: %w", err)
			}
		}
	}

	l.loaded = true
	return nil
}

// loadFromEmbedded loads generators from embedded files
func (l *Loader) loadFromEmbedded() error {
	l.useEmbedded = true
	l.source = "embedded v" + embedded.GetVersion()

	genNames, err := embedded.ListGenerators()
	if err != nil {
		return fmt.Errorf("failed to list embedded generators: %w", err)
	}

	for _, name := range genNames {
		genContent, err := embedded.GetGeneratorContent(name)
		if err != nil {
			continue // Skip generators we can't load
		}

		// Create GeneratorInfo from embedded content
		info := &GeneratorInfo{
			Name:        name,
			Source:      SourceFramework,
			Path:        filepath.Join("outputs", name), // Virtual path
			Category:    l.inferCategoryFromName(name),
			HasManifest: genContent.Manifest != "",
			HasSchema:   genContent.Schema != "",
			HasWizard:   genContent.Wizard != "",
			HasTemplate: genContent.Template != "",
		}

		// Set file names based on what's available
		if info.HasSchema {
			info.SchemaFile = DefaultSchemaFile
		}
		if info.HasWizard {
			info.WizardFile = DefaultWizardFile
		}
		if info.HasTemplate {
			info.TemplateFile = genContent.TemplateFile
		}

		// Parse description from manifest or wizard
		if genContent.Manifest != "" {
			info.Description = l.parseDescriptionFromManifest(genContent.Manifest)
		}
		if info.Description == "" && genContent.Wizard != "" {
			info.Description = l.parseDescriptionFromWizard(genContent.Wizard)
		}

		l.generators[name] = info
	}

	return nil
}

// inferCategoryFromName infers category from generator name
func (l *Loader) inferCategoryFromName(name string) GeneratorCategory {
	nameLower := strings.ToLower(name)
	if strings.Contains(nameLower, "compliance") || strings.Contains(nameLower, "legal") {
		return CategoryCompliance
	}
	if strings.Contains(nameLower, "marketing") {
		return CategoryMarketing
	}
	if strings.Contains(nameLower, "investor") {
		return CategoryInvestor
	}
	if strings.Contains(nameLower, "internal") {
		return CategoryInternal
	}
	if strings.Contains(nameLower, "development") || strings.Contains(nameLower, "dev") {
		return CategoryDevelopment
	}
	return CategoryCustom
}

// parseDescriptionFromManifest extracts description from YAML manifest
func (l *Loader) parseDescriptionFromManifest(manifest string) string {
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

// parseDescriptionFromWizard extracts description from wizard markdown
func (l *Loader) parseDescriptionFromWizard(wizard string) string {
	lines := strings.Split(wizard, "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		// Look for PURPOSE section
		if strings.Contains(strings.ToUpper(line), "PURPOSE") {
			// Get the next non-empty line
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

// loadFromDirectory scans a directory for generators
func (l *Loader) loadFromDirectory(dir string, source GeneratorSource) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		// Skip hidden directories and special directories
		name := entry.Name()
		if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
			continue
		}

		genDir := filepath.Join(dir, name)

		// Check if this looks like a generator (has at least schema or wizard)
		if !l.looksLikeGenerator(genDir) {
			continue
		}

		info, err := InferGeneratorInfo(genDir, source)
		if err != nil {
			// Log warning but continue with other generators
			fmt.Fprintf(os.Stderr, "Warning: failed to load generator %s: %v\n", name, err)
			continue
		}

		// Store generator (overwrites lower priority generators with same name)
		l.generators[info.Name] = info
	}

	return nil
}

// looksLikeGenerator checks if a directory appears to be a generator
func (l *Loader) looksLikeGenerator(dir string) bool {
	// Must have at least one of: generator.yaml, schema.json, wizard.instructions.md
	files := []string{
		DefaultManifestFile,
		DefaultSchemaFile,
		DefaultWizardFile,
	}

	for _, f := range files {
		if _, err := os.Stat(filepath.Join(dir, f)); err == nil {
			return true
		}
	}

	return false
}

// HasGenerators returns true if any generators were loaded
func (l *Loader) HasGenerators() bool {
	return len(l.generators) > 0
}

// GeneratorCount returns the number of loaded generators
func (l *Loader) GeneratorCount() int {
	return len(l.generators)
}

// ListGenerators returns generators matching optional filters
func (l *Loader) ListGenerators(category *GeneratorCategory, source *GeneratorSource) []*GeneratorInfo {
	var result []*GeneratorInfo

	for _, gen := range l.generators {
		// Filter by category
		if category != nil && *category != "" && gen.Category != *category {
			continue
		}

		// Filter by source
		if source != nil && gen.Source != *source {
			continue
		}

		result = append(result, gen)
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

// GetGenerator returns a generator by name
func (l *Loader) GetGenerator(name string) (*GeneratorInfo, error) {
	gen, ok := l.generators[name]
	if !ok {
		// Try to find similar names for helpful error
		available := l.availableNames()
		return nil, fmt.Errorf("generator not found: %s\n\nAvailable generators:\n  %s",
			name, strings.Join(available, "\n  "))
	}
	return gen, nil
}

// GetGeneratorContent loads the full content of a generator
func (l *Loader) GetGeneratorContent(name string) (*GeneratorContent, error) {
	info, err := l.GetGenerator(name)
	if err != nil {
		return nil, err
	}

	content := &GeneratorContent{
		GeneratorInfo: info,
	}

	// If using embedded and this is a framework generator, load from embedded
	if l.useEmbedded && info.Source == SourceFramework {
		embeddedContent, err := embedded.GetGeneratorContent(name)
		if err == nil {
			content.Manifest = embeddedContent.Manifest
			content.Schema = embeddedContent.Schema
			content.Wizard = embeddedContent.Wizard
			content.Template = embeddedContent.Template
			content.Readme = embeddedContent.Readme
			return content, nil
		}
		// Fall through to filesystem loading if embedded fails
	}

	// Load from filesystem
	// Load manifest
	if info.HasManifest {
		data, err := os.ReadFile(filepath.Join(info.Path, DefaultManifestFile))
		if err == nil {
			content.Manifest = string(data)
		}
	}

	// Load schema
	if info.HasSchema && info.SchemaFile != "" {
		data, err := os.ReadFile(filepath.Join(info.Path, info.SchemaFile))
		if err == nil {
			content.Schema = string(data)
		}
	}

	// Load wizard
	if info.HasWizard && info.WizardFile != "" {
		data, err := os.ReadFile(filepath.Join(info.Path, info.WizardFile))
		if err == nil {
			content.Wizard = string(data)
		}
	}

	// Load validator
	if info.HasValidator && info.ValidatorFile != "" {
		data, err := os.ReadFile(filepath.Join(info.Path, info.ValidatorFile))
		if err == nil {
			content.Validator = string(data)
		}
	}

	// Load template
	if info.HasTemplate && info.TemplateFile != "" {
		data, err := os.ReadFile(filepath.Join(info.Path, info.TemplateFile))
		if err == nil {
			content.Template = string(data)
		}
	}

	// Load README
	readmePath := filepath.Join(info.Path, DefaultReadmeFile)
	if data, err := os.ReadFile(readmePath); err == nil {
		content.Readme = string(data)
	}

	return content, nil
}

// availableNames returns sorted list of available generator names
func (l *Loader) availableNames() []string {
	names := make([]string, 0, len(l.generators))
	for name := range l.generators {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// GeneratorsBySource groups generators by their source
func (l *Loader) GeneratorsBySource() map[GeneratorSource][]*GeneratorInfo {
	result := make(map[GeneratorSource][]*GeneratorInfo)

	for _, gen := range l.generators {
		result[gen.Source] = append(result[gen.Source], gen)
	}

	// Sort each group by name
	for source := range result {
		sort.Slice(result[source], func(i, j int) bool {
			return result[source][i].Name < result[source][j].Name
		})
	}

	return result
}

// GeneratorsByCategory groups generators by their category
func (l *Loader) GeneratorsByCategory() map[GeneratorCategory][]*GeneratorInfo {
	result := make(map[GeneratorCategory][]*GeneratorInfo)

	for _, gen := range l.generators {
		cat := gen.Category
		if cat == "" {
			cat = CategoryCustom
		}
		result[cat] = append(result[cat], gen)
	}

	// Sort each group by name
	for cat := range result {
		sort.Slice(result[cat], func(i, j int) bool {
			return result[cat][i].Name < result[cat][j].Name
		})
	}

	return result
}

// Source returns where framework generators were loaded from (filesystem path or "embedded vX.X.X")
func (l *Loader) Source() string {
	return l.source
}

// IsEmbedded returns true if framework generators were loaded from embedded files
func (l *Loader) IsEmbedded() bool {
	return l.useEmbedded
}
