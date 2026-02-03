package generator

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Loader discovers and loads generators from multiple sources
type Loader struct {
	epfRoot      string // Path to EPF framework (docs/EPF)
	instanceRoot string // Path to current EPF instance (optional)
	globalRoot   string // Path to global generators (~/.epf-cli/generators)

	generators map[string]*GeneratorInfo // Loaded generators by name
	loaded     bool
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

	// 2. Framework generators (EPF canonical)
	if l.epfRoot != "" {
		outputsDir := filepath.Join(l.epfRoot, "outputs")
		if err := l.loadFromDirectory(outputsDir, SourceFramework); err != nil {
			// Outputs directory may not exist
			if !os.IsNotExist(err) {
				return fmt.Errorf("failed to load framework generators: %w", err)
			}
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
