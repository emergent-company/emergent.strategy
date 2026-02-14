package wizard

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
)

// Loader loads and manages EPF wizards
type Loader struct {
	epfRoot      string
	wizards      map[string]*WizardInfo
	instructions map[string]*AgentInstructionsInfo
	parser       *Parser
	useEmbedded  bool
	source       string
}

// NewLoader creates a new wizard loader
func NewLoader(epfRoot string) *Loader {
	return &Loader{
		epfRoot:      epfRoot,
		wizards:      make(map[string]*WizardInfo),
		instructions: make(map[string]*AgentInstructionsInfo),
		parser:       NewParser(),
	}
}

// NewEmbeddedLoader creates a loader that only uses embedded wizards
func NewEmbeddedLoader() *Loader {
	return &Loader{
		epfRoot:      "",
		wizards:      make(map[string]*WizardInfo),
		instructions: make(map[string]*AgentInstructionsInfo),
		parser:       NewParser(),
		useEmbedded:  true,
		source:       "embedded v" + embedded.GetVersion(),
	}
}

// Load loads all wizards and agent instructions from the EPF directory.
// Falls back to embedded wizards if filesystem is not available.
func (l *Loader) Load() error {
	// If explicitly configured for embedded, use embedded
	if l.useEmbedded {
		return l.loadFromEmbedded()
	}

	// Try filesystem first
	if l.epfRoot != "" {
		wizardsDir := filepath.Join(l.epfRoot, "wizards")
		if _, err := os.Stat(wizardsDir); err == nil {
			if err := l.loadWizards(wizardsDir); err == nil && len(l.wizards) > 0 {
				l.source = l.epfRoot
				l.loadAgentInstructions()
				return nil
			}
		}
	}

	// Fall back to embedded wizards
	if embedded.HasEmbeddedArtifacts() {
		return l.loadFromEmbedded()
	}

	return fmt.Errorf("wizards directory not found: %s (and no embedded wizards available)", l.epfRoot)
}

// loadFromEmbedded loads wizards from embedded files
func (l *Loader) loadFromEmbedded() error {
	l.useEmbedded = true
	l.source = "embedded v" + embedded.GetVersion()

	wizardNames, err := embedded.ListWizards()
	if err != nil {
		return fmt.Errorf("failed to list embedded wizards: %w", err)
	}

	readySubWizardPattern := regexp.MustCompile(ReadySubWizardPattern)

	for _, name := range wizardNames {
		// Skip non-wizard files
		if !strings.HasSuffix(name, AgentPromptSuffix) && !strings.HasSuffix(name, WizardSuffix) {
			continue
		}

		// Skip README and template files
		if strings.ToLower(name) == "readme.md" || strings.Contains(name, "template") {
			continue
		}

		content, err := embedded.GetWizard(name)
		if err != nil {
			continue // Skip files we can't read
		}

		// Determine wizard type
		var wizardType WizardType
		if readySubWizardPattern.MatchString(name) {
			wizardType = WizardTypeReadySubWizard
		} else if strings.HasSuffix(name, WizardSuffix) {
			wizardType = WizardTypeWizard
		} else {
			wizardType = WizardTypeAgentPrompt
		}

		// Extract wizard name from filename
		wizardName := name
		wizardName = strings.TrimSuffix(wizardName, AgentPromptSuffix)
		wizardName = strings.TrimSuffix(wizardName, WizardSuffix)

		// Parse metadata from content
		contentStr := string(content)

		wizard := &WizardInfo{
			Name:             wizardName,
			Type:             wizardType,
			Phase:            l.getPhaseForWizard(wizardName),
			Purpose:          l.parser.ParsePurpose(contentStr),
			TriggerPhrases:   l.parser.ParseTriggerPhrases(contentStr),
			Duration:         l.parser.ParseDuration(contentStr),
			Outputs:          l.parser.ParseOutputs(contentStr),
			RelatedWizards:   l.filterSelf(l.parser.ParseRelatedWizards(contentStr), wizardName),
			RelatedTemplates: l.parser.ParseRelatedTemplates(contentStr),
			RelatedSchemas:   l.parser.ParseRelatedSchemas(contentStr),
			FilePath:         filepath.Join("wizards", name),
			Content:          contentStr,
		}

		l.wizards[wizardName] = wizard
	}

	if len(l.wizards) == 0 {
		return fmt.Errorf("no embedded wizards found")
	}

	return nil
}

// loadWizards loads all wizard files from the wizards directory
func (l *Loader) loadWizards(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	readySubWizardPattern := regexp.MustCompile(ReadySubWizardPattern)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()

		// Skip non-wizard files
		if !strings.HasSuffix(name, AgentPromptSuffix) && !strings.HasSuffix(name, WizardSuffix) {
			continue
		}

		// Skip README and template files
		if strings.ToLower(name) == "readme.md" || strings.Contains(name, "template") {
			continue
		}

		filePath := filepath.Join(dir, name)
		content, err := os.ReadFile(filePath)
		if err != nil {
			continue // Skip files we can't read
		}

		// Determine wizard type
		var wizardType WizardType
		if readySubWizardPattern.MatchString(name) {
			wizardType = WizardTypeReadySubWizard
		} else if strings.HasSuffix(name, WizardSuffix) {
			wizardType = WizardTypeWizard
		} else {
			wizardType = WizardTypeAgentPrompt
		}

		// Extract wizard name from filename
		wizardName := name
		wizardName = strings.TrimSuffix(wizardName, AgentPromptSuffix)
		wizardName = strings.TrimSuffix(wizardName, WizardSuffix)

		// Parse metadata from content
		contentStr := string(content)

		wizard := &WizardInfo{
			Name:             wizardName,
			Type:             wizardType,
			Phase:            l.getPhaseForWizard(wizardName),
			Purpose:          l.parser.ParsePurpose(contentStr),
			TriggerPhrases:   l.parser.ParseTriggerPhrases(contentStr),
			Duration:         l.parser.ParseDuration(contentStr),
			Outputs:          l.parser.ParseOutputs(contentStr),
			RelatedWizards:   l.filterSelf(l.parser.ParseRelatedWizards(contentStr), wizardName),
			RelatedTemplates: l.parser.ParseRelatedTemplates(contentStr),
			RelatedSchemas:   l.parser.ParseRelatedSchemas(contentStr),
			FilePath:         filepath.Join("wizards", name),
			Content:          contentStr,
		}

		l.wizards[wizardName] = wizard
	}

	return nil
}

// filterSelf removes self-references from related wizards
func (l *Loader) filterSelf(related []string, self string) []string {
	var filtered []string
	for _, r := range related {
		if r != self {
			filtered = append(filtered, r)
		}
	}
	return filtered
}

// getPhaseForWizard returns the phase for a wizard name
func (l *Loader) getPhaseForWizard(name string) schema.Phase {
	if phase, ok := PhaseForWizard[name]; ok {
		return phase
	}
	return ""
}

// loadAgentInstructions loads agent instruction files from known locations
func (l *Loader) loadAgentInstructions() {
	// AGENTS.md in EPF root
	l.loadInstructionFile("AGENTS.md", filepath.Join(l.epfRoot, "AGENTS.md"))

	// copilot-instructions.md in .github
	l.loadInstructionFile("copilot-instructions.md", filepath.Join(l.epfRoot, ".github", "copilot-instructions.md"))

	// .ai-agent-instructions.md in EPF root
	l.loadInstructionFile(".ai-agent-instructions.md", filepath.Join(l.epfRoot, ".ai-agent-instructions.md"))
}

// loadInstructionFile loads a single instruction file
func (l *Loader) loadInstructionFile(name, path string) {
	content, err := os.ReadFile(path)
	if err != nil {
		return // File doesn't exist or can't be read
	}

	info, ok := KnownAgentInstructions[name]
	if !ok {
		info = struct {
			Purpose string
			Scope   string
		}{
			Purpose: "Agent instructions",
			Scope:   "general",
		}
	}

	relPath := path
	if strings.HasPrefix(path, l.epfRoot) {
		relPath, _ = filepath.Rel(l.epfRoot, path)
	}

	l.instructions[name] = &AgentInstructionsInfo{
		Name:     name,
		Purpose:  info.Purpose,
		Scope:    info.Scope,
		FilePath: relPath,
		Content:  string(content),
	}
}

// ListWizards returns all loaded wizards, optionally filtered by phase and/or type
func (l *Loader) ListWizards(phase *schema.Phase, wizardType *WizardType) []*WizardInfo {
	var result []*WizardInfo

	for _, wizard := range l.wizards {
		// Apply phase filter
		if phase != nil && wizard.Phase != *phase {
			continue
		}
		// Apply type filter
		if wizardType != nil && wizard.Type != *wizardType {
			continue
		}
		result = append(result, wizard)
	}

	// Sort by phase order, then by name
	sort.Slice(result, func(i, j int) bool {
		phaseOrder := map[schema.Phase]int{
			"":                0, // Onboarding first
			schema.PhaseREADY: 1,
			schema.PhaseFIRE:  2,
			schema.PhaseAIM:   3,
		}
		if result[i].Phase != result[j].Phase {
			return phaseOrder[result[i].Phase] < phaseOrder[result[j].Phase]
		}
		return result[i].Name < result[j].Name
	})

	return result
}

// GetWizard returns a wizard by name
func (l *Loader) GetWizard(name string) (*WizardInfo, error) {
	// Try exact match
	if wizard, ok := l.wizards[name]; ok {
		return wizard, nil
	}

	// Try case-insensitive match
	nameLower := strings.ToLower(name)
	for key, wizard := range l.wizards {
		if strings.ToLower(key) == nameLower {
			return wizard, nil
		}
	}

	// Try partial match (for convenience)
	for key, wizard := range l.wizards {
		if strings.Contains(strings.ToLower(key), nameLower) {
			return wizard, nil
		}
	}

	return nil, fmt.Errorf("wizard not found: %s", name)
}

// ListAgentInstructions returns all loaded agent instruction files
func (l *Loader) ListAgentInstructions() []*AgentInstructionsInfo {
	var result []*AgentInstructionsInfo
	for _, inst := range l.instructions {
		result = append(result, inst)
	}

	// Sort by scope priority
	scopeOrder := map[string]int{
		"comprehensive":   1,
		"quick-reference": 2,
		"maintenance":     3,
		"general":         4,
	}
	sort.Slice(result, func(i, j int) bool {
		return scopeOrder[result[i].Scope] < scopeOrder[result[j].Scope]
	})

	return result
}

// GetAgentInstructions returns an agent instruction file by name
func (l *Loader) GetAgentInstructions(name string) (*AgentInstructionsInfo, error) {
	// Try exact match
	if inst, ok := l.instructions[name]; ok {
		return inst, nil
	}

	// Try case-insensitive match
	nameLower := strings.ToLower(name)
	for key, inst := range l.instructions {
		if strings.ToLower(key) == nameLower {
			return inst, nil
		}
	}

	return nil, fmt.Errorf("agent instructions not found: %s", name)
}

// WizardCount returns the number of loaded wizards
func (l *Loader) WizardCount() int {
	return len(l.wizards)
}

// InstructionsCount returns the number of loaded instruction files
func (l *Loader) InstructionsCount() int {
	return len(l.instructions)
}

// HasWizards returns true if any wizards are loaded
func (l *Loader) HasWizards() bool {
	return len(l.wizards) > 0
}

// GetWizardNames returns all wizard names
func (l *Loader) GetWizardNames() []string {
	var names []string
	for name := range l.wizards {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Source returns where wizards were loaded from (filesystem path or "embedded vX.X.X")
func (l *Loader) Source() string {
	return l.source
}

// IsEmbedded returns true if wizards were loaded from embedded files
func (l *Loader) IsEmbedded() bool {
	return l.useEmbedded
}
