// Package agent provides agent discovery, loading, and recommendation for EPF.
package agent

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"gopkg.in/yaml.v3"
)

// Loader discovers and loads agents from multiple sources with three-tier
// priority: instance > framework > global. Supports both the new agent.yaml
// manifest format and legacy wizard files (.agent_prompt.md, .wizard.md).
//
// Manifests are loaded eagerly at startup for fast listing and routing.
// Prompt content is loaded lazily on demand via LoadContent().
type Loader struct {
	epfRoot      string // Path to EPF framework (docs/EPF)
	instanceRoot string // Path to current EPF instance (optional)
	globalRoot   string // Path to global agents (~/.epf-cli/agents)

	agents      map[string]*AgentInfo
	loaded      bool
	useEmbedded bool   // Whether embedded wizards are being used for framework
	source      string // Where framework agents were loaded from
}

// NewLoader creates a new agent loader.
func NewLoader(epfRoot string) *Loader {
	home, _ := os.UserHomeDir()
	globalRoot := ""
	if home != "" {
		globalRoot = filepath.Join(home, ".epf-cli", GlobalDirName)
	}

	return &Loader{
		epfRoot:    epfRoot,
		globalRoot: globalRoot,
		agents:     make(map[string]*AgentInfo),
	}
}

// NewEmbeddedLoader creates a loader that uses embedded wizards as the
// framework source. This is the default when no filesystem EPF root is available.
func NewEmbeddedLoader() *Loader {
	home, _ := os.UserHomeDir()
	globalRoot := ""
	if home != "" {
		globalRoot = filepath.Join(home, ".epf-cli", GlobalDirName)
	}

	return &Loader{
		epfRoot:     "",
		globalRoot:  globalRoot,
		agents:      make(map[string]*AgentInfo),
		useEmbedded: true,
		source:      "embedded v" + embedded.GetVersion(),
	}
}

// SetInstanceRoot sets the instance root for discovering instance-local agents.
func (l *Loader) SetInstanceRoot(instanceRoot string) {
	l.instanceRoot = instanceRoot
	l.loaded = false // Force reload on next access
}

// Load discovers agents from all sources. Agents are loaded in reverse
// priority order so that higher-priority sources overwrite lower ones.
func (l *Loader) Load() error {
	l.agents = make(map[string]*AgentInfo)

	// Load in reverse priority order (lower priority first, higher overwrites)

	// 3. Global agents (lowest priority)
	if l.globalRoot != "" {
		if err := l.loadFromDirectory(l.globalRoot, SourceGlobal); err != nil {
			if !os.IsNotExist(err) {
				return fmt.Errorf("failed to load global agents: %w", err)
			}
		}
	}

	// 2. Framework agents — try filesystem first, fall back to embedded
	frameworkLoaded := false
	if l.epfRoot != "" && !l.useEmbedded {
		// Try new agents/ directory first
		agentsDir := filepath.Join(l.epfRoot, FrameworkDirName)
		if _, err := os.Stat(agentsDir); err == nil {
			if err := l.loadFromDirectory(agentsDir, SourceFramework); err == nil {
				frameworkLoaded = true
				l.source = l.epfRoot
			}
		}
		// Fall back to legacy wizards/ directory
		if !frameworkLoaded {
			wizardsDir := filepath.Join(l.epfRoot, "wizards")
			if _, err := os.Stat(wizardsDir); err == nil {
				if err := l.loadLegacyDirectory(wizardsDir, SourceFramework); err == nil {
					frameworkLoaded = true
					l.source = l.epfRoot
				}
			}
		}
	}

	// Fall back to embedded wizards for framework source
	if !frameworkLoaded && embedded.HasEmbeddedArtifacts() {
		if err := l.loadFromEmbedded(); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to load embedded agents: %v\n", err)
		}
	}

	// 1. Instance agents (highest priority)
	if l.instanceRoot != "" {
		agentsDir := filepath.Join(l.instanceRoot, InstanceDirName)
		if err := l.loadFromDirectory(agentsDir, SourceInstance); err != nil {
			if !os.IsNotExist(err) {
				return fmt.Errorf("failed to load instance agents: %w", err)
			}
		}
	}

	l.loaded = true
	return nil
}

// loadFromDirectory scans a directory for agents. It looks for both:
//   - Subdirectories containing agent.yaml (new format)
//   - Legacy wizard files (.agent_prompt.md, .wizard.md) at the top level
func (l *Loader) loadFromDirectory(dir string, source AgentSource) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		name := entry.Name()

		if entry.IsDir() {
			// Skip hidden/special directories
			if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
				continue
			}

			agentDir := filepath.Join(dir, name)

			// Check for agent.yaml manifest (new format)
			manifestPath := filepath.Join(agentDir, ManifestFile)
			if _, err := os.Stat(manifestPath); err == nil {
				info, err := l.loadManifestAgent(agentDir, name, source)
				if err != nil {
					fmt.Fprintf(os.Stderr, "Warning: failed to load agent %s: %v\n", name, err)
					continue
				}
				l.agents[info.Name] = info
				continue
			}
		} else {
			// Legacy wizard file at top level
			if isLegacyWizardFile(name) {
				info := l.loadLegacyFile(filepath.Join(dir, name), name, source)
				if info != nil {
					l.agents[info.Name] = info
				}
			}
		}
	}

	return nil
}

// loadLegacyDirectory loads only legacy wizard files from a directory.
// Used when scanning the old wizards/ directory structure.
func (l *Loader) loadLegacyDirectory(dir string, source AgentSource) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if isLegacyWizardFile(name) {
			info := l.loadLegacyFile(filepath.Join(dir, name), name, source)
			if info != nil {
				l.agents[info.Name] = info
			}
		}
	}

	return nil
}

// loadFromEmbedded loads agents from embedded agent manifests and legacy wizard files.
func (l *Loader) loadFromEmbedded() error {
	l.useEmbedded = true
	l.source = "embedded v" + embedded.GetVersion()

	// First, load legacy wizard files (lower priority — will be overwritten by new format)
	wizardNames, err := embedded.ListWizards()
	if err == nil {
		for _, name := range wizardNames {
			if !isLegacyWizardFile(name) {
				continue
			}

			// Skip README and template files
			if strings.ToLower(name) == "readme.md" || strings.Contains(name, "template") {
				continue
			}

			content, err := embedded.GetWizard(name)
			if err != nil {
				continue
			}

			info := l.parseLegacyWizard(name, string(content), SourceFramework)
			if info != nil {
				info.Path = filepath.Join("wizards", name)
				l.agents[info.Name] = info
			}
		}
	}

	// Then, load new-format agents from embedded agents/ directory (higher priority)
	agentNames, err := embedded.ListAgents()
	if err == nil {
		for _, name := range agentNames {
			info, err := l.loadManifestAgentFromEmbeddedFS(name)
			if err != nil {
				continue
			}
			// Overwrite any legacy agent with same name
			l.agents[info.Name] = info

			// Also remove the underscore variant so we don't get duplicates
			// (legacy: "start_epf", new: "start-epf")
			underscoreName := strings.ReplaceAll(info.Name, "-", "_")
			if underscoreName != info.Name {
				delete(l.agents, underscoreName)
			}
		}
	}

	// Remove legacy agents that are now new-format skills (not agents).
	// Legacy .agent_prompt.md files were used for both agents and skills,
	// but new format separates them. If something exists as a skill but NOT
	// as an agent in the new format, remove the legacy agent entry.
	newAgentSet := make(map[string]bool)
	if agentNames != nil {
		for _, name := range agentNames {
			newAgentSet[name] = true
			// Also register underscore variant
			newAgentSet[strings.ReplaceAll(name, "-", "_")] = true
		}
	}
	skillNames, _ := embedded.ListSkills()
	for _, skillName := range skillNames {
		// If this skill has no corresponding new-format agent, remove legacy agent entries
		if !newAgentSet[skillName] {
			delete(l.agents, skillName)
			// Also try underscore variant
			underscoreName := strings.ReplaceAll(skillName, "-", "_")
			delete(l.agents, underscoreName)
			// Also try numbered prefix variants (e.g., "trend-scout" -> "01_trend_scout")
			for agentName := range l.agents {
				stripped := regexp.MustCompile(`^\d+_`).ReplaceAllString(agentName, "")
				if stripped == underscoreName || stripped == skillName {
					delete(l.agents, agentName)
				}
			}
		}
	}

	if len(l.agents) == 0 {
		return fmt.Errorf("no embedded agents found")
	}

	return nil
}

// loadManifestAgentFromEmbeddedFS loads an agent from the embedded agents/ directory.
func (l *Loader) loadManifestAgentFromEmbeddedFS(dirName string) (*AgentInfo, error) {
	agentFS, err := embedded.GetAgent(dirName)
	if err != nil {
		return nil, fmt.Errorf("getting embedded agent %s: %w", dirName, err)
	}

	data, err := fs.ReadFile(agentFS, ManifestFile)
	if err != nil {
		return nil, fmt.Errorf("reading embedded agent manifest %s: %w", dirName, err)
	}

	var manifest AgentManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("parsing embedded agent manifest %s: %w", dirName, err)
	}

	agentName := manifest.Name
	if agentName == "" {
		agentName = dirName
	}

	// Resolve phase
	phase := schema.Phase(manifest.Phase)
	if phase == "" {
		if p, ok := PhaseForAgent[agentName]; ok {
			phase = p
		}
	}

	// Check for prompt file in embedded FS
	hasPrompt := false
	if _, err := fs.ReadFile(agentFS, PromptFile); err == nil {
		hasPrompt = true
	}

	info := &AgentInfo{
		Name:        agentName,
		Source:      SourceFramework,
		Path:        filepath.Join("agents", dirName),
		Type:        manifest.Type,
		Phase:       phase,
		Version:     manifest.Version,
		DisplayName: manifest.Identity.DisplayName,
		Description: manifest.Identity.Description,
		Capability:  manifest.Capability,
		HasManifest: true,
		HasPrompt:   hasPrompt,
	}

	// Routing
	if manifest.Routing != nil {
		info.TriggerPhrases = manifest.Routing.TriggerPhrases
		info.Keywords = manifest.Routing.Keywords
	}

	// Skills
	if manifest.Skills != nil {
		info.RequiredSkills = manifest.Skills.Required
		info.OptionalSkills = manifest.Skills.Optional
	}

	// Tools
	if manifest.Tools != nil {
		info.RequiredTools = manifest.Tools.Required
	}

	// Related agents
	info.RelatedAgents = manifest.RelatedAgents

	return info, nil
}

// loadManifestAgent loads an agent from a directory containing agent.yaml.
func (l *Loader) loadManifestAgent(dir, dirName string, source AgentSource) (*AgentInfo, error) {
	manifestPath := filepath.Join(dir, ManifestFile)
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("reading manifest: %w", err)
	}

	var manifest AgentManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("parsing manifest: %w", err)
	}

	// Use directory name as agent name if manifest doesn't specify one
	agentName := manifest.Name
	if agentName == "" {
		agentName = dirName
	}

	// Resolve phase
	phase := schema.Phase(manifest.Phase)
	if phase == "" {
		if p, ok := PhaseForAgent[agentName]; ok {
			phase = p
		}
	}

	// Check for prompt file
	promptPath := filepath.Join(dir, PromptFile)
	hasPrompt := false
	if _, err := os.Stat(promptPath); err == nil {
		hasPrompt = true
	}
	// Also check legacy prompt filename
	if !hasPrompt {
		legacyPrompt := filepath.Join(dir, agentName+LegacyAgentPromptSuffix)
		if _, err := os.Stat(legacyPrompt); err == nil {
			hasPrompt = true
		}
	}

	info := &AgentInfo{
		Name:        agentName,
		Source:      source,
		Path:        dir,
		Type:        manifest.Type,
		Phase:       phase,
		Version:     manifest.Version,
		DisplayName: manifest.Identity.DisplayName,
		Description: manifest.Identity.Description,
		Capability:  manifest.Capability,
		HasManifest: true,
		HasPrompt:   hasPrompt,
	}

	// Routing
	if manifest.Routing != nil {
		info.TriggerPhrases = manifest.Routing.TriggerPhrases
		info.Keywords = manifest.Routing.Keywords
	}

	// Skills
	if manifest.Skills != nil {
		info.RequiredSkills = manifest.Skills.Required
		info.OptionalSkills = manifest.Skills.Optional
	}

	// Tools
	if manifest.Tools != nil {
		info.RequiredTools = manifest.Tools.Required
	}

	// Related agents
	info.RelatedAgents = manifest.RelatedAgents

	return info, nil
}

// loadLegacyFile reads a single legacy wizard file and converts it to an AgentInfo.
// Content is NOT loaded (lazy loading). Only metadata is extracted from the filename.
func (l *Loader) loadLegacyFile(filePath, fileName string, source AgentSource) *AgentInfo {
	// Read file content for metadata extraction
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}

	info := l.parseLegacyWizard(fileName, string(content), source)
	if info != nil {
		info.Path = filePath
	}
	return info
}

// parseLegacyWizard extracts agent metadata from a legacy wizard filename and content.
// This replicates the logic from wizard.Loader but produces AgentInfo.
func (l *Loader) parseLegacyWizard(fileName, content string, source AgentSource) *AgentInfo {
	readySubWizardPattern := regexp.MustCompile(LegacySubWizardPattern)

	// Determine agent type from filename suffix
	var agentType AgentType
	if readySubWizardPattern.MatchString(fileName) {
		agentType = AgentTypeSpecialist // sub-wizards become specialists
	} else if strings.HasSuffix(fileName, LegacyWizardSuffix) {
		agentType = AgentTypeSpecialist // .wizard.md files are skills, not agents
	} else if strings.HasSuffix(fileName, LegacyAgentPromptSuffix) {
		agentType = AgentTypeGuide // .agent_prompt.md files are agents
	} else {
		return nil // Not a wizard file
	}

	// Extract name from filename
	agentName := fileName
	agentName = strings.TrimSuffix(agentName, LegacyAgentPromptSuffix)
	agentName = strings.TrimSuffix(agentName, LegacyWizardSuffix)

	// Determine phase
	phase := schema.Phase("")
	if p, ok := PhaseForAgent[agentName]; ok {
		phase = p
	}

	// Extract metadata via regex (same patterns as wizard.Parser)
	purpose := parsePurpose(content)
	triggerPhrases := parseTriggerPhrases(content)
	relatedAgents := parseRelatedWizards(content, agentName)

	// Infer agent type more precisely from known names
	agentType = inferAgentType(agentName, agentType)

	info := &AgentInfo{
		Name:           agentName,
		Source:         source,
		Type:           agentType,
		Phase:          phase,
		DisplayName:    formatDisplayName(agentName),
		Description:    purpose,
		TriggerPhrases: triggerPhrases,
		RelatedAgents:  relatedAgents,
		HasManifest:    false,
		HasPrompt:      true,
		LegacyFormat:   true,
		// Content is loaded eagerly for embedded (they're already in memory)
		// and lazily for filesystem
	}

	// For embedded sources, store content immediately since it's already loaded
	if source == SourceFramework {
		info.SetContent(content)
	}

	return info
}

// LoadContent lazily loads the prompt content for an agent if not already loaded.
func (l *Loader) LoadContent(info *AgentInfo) error {
	if info.ContentLoaded() {
		return nil
	}

	if l.useEmbedded && info.Source == SourceFramework {
		// Try new-format embedded agent first (agents/{name}/prompt.md)
		if info.HasManifest {
			agentFS, err := embedded.GetAgent(info.Name)
			if err == nil {
				if data, readErr := fs.ReadFile(agentFS, PromptFile); readErr == nil {
					info.SetContent(string(data))
					return nil
				}
			}
		}

		// Fall back to legacy embedded wizard
		fileName := info.Name + LegacyAgentPromptSuffix
		content, err := embedded.GetWizard(fileName)
		if err != nil {
			// Try wizard suffix
			fileName = info.Name + LegacyWizardSuffix
			content, err = embedded.GetWizard(fileName)
			if err != nil {
				return fmt.Errorf("embedded content not found for agent %s", info.Name)
			}
		}
		info.SetContent(string(content))
		return nil
	}

	// Load from filesystem
	if info.HasManifest {
		// New format: read prompt.md from agent directory
		promptPath := filepath.Join(info.Path, PromptFile)
		data, err := os.ReadFile(promptPath)
		if err != nil {
			// Try legacy prompt filename in same directory
			legacyPath := filepath.Join(info.Path, info.Name+LegacyAgentPromptSuffix)
			data, err = os.ReadFile(legacyPath)
			if err != nil {
				return fmt.Errorf("prompt not found for agent %s", info.Name)
			}
		}
		info.SetContent(string(data))
		return nil
	}

	// Legacy format: the Path IS the file
	data, err := os.ReadFile(info.Path)
	if err != nil {
		return fmt.Errorf("reading agent content: %w", err)
	}
	info.SetContent(string(data))
	return nil
}

// ListAgents returns all loaded agents, optionally filtered by phase and/or type.
func (l *Loader) ListAgents(phase *schema.Phase, agentType *AgentType) []*AgentInfo {
	var result []*AgentInfo

	for _, agent := range l.agents {
		if phase != nil && agent.Phase != *phase {
			continue
		}
		if agentType != nil && agent.Type != *agentType {
			continue
		}
		result = append(result, agent)
	}

	// Sort by source priority, then phase order, then name
	sort.Slice(result, func(i, j int) bool {
		pi := SourcePriority(result[i].Source)
		pj := SourcePriority(result[j].Source)
		if pi != pj {
			return pi < pj
		}

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

// GetAgent returns an agent by name.
func (l *Loader) GetAgent(name string) (*AgentInfo, error) {
	// Exact match
	if agent, ok := l.agents[name]; ok {
		return agent, nil
	}

	// Case-insensitive match
	nameLower := strings.ToLower(name)
	for key, agent := range l.agents {
		if strings.ToLower(key) == nameLower {
			return agent, nil
		}
	}

	// Partial match
	for key, agent := range l.agents {
		if strings.Contains(strings.ToLower(key), nameLower) {
			return agent, nil
		}
	}

	available := l.GetAgentNames()
	return nil, fmt.Errorf("agent not found: %s\n\nAvailable agents:\n  %s",
		name, strings.Join(available, "\n  "))
}

// GetAgentWithContent returns an agent with its prompt content loaded.
func (l *Loader) GetAgentWithContent(name string) (*AgentInfo, error) {
	agent, err := l.GetAgent(name)
	if err != nil {
		return nil, err
	}
	if err := l.LoadContent(agent); err != nil {
		return nil, err
	}
	return agent, nil
}

// GetAgentNames returns all agent names, sorted.
func (l *Loader) GetAgentNames() []string {
	names := make([]string, 0, len(l.agents))
	for name := range l.agents {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// AgentCount returns the number of loaded agents.
func (l *Loader) AgentCount() int {
	return len(l.agents)
}

// HasAgents returns true if any agents are loaded.
func (l *Loader) HasAgents() bool {
	return len(l.agents) > 0
}

// AgentsBySource groups agents by their source.
func (l *Loader) AgentsBySource() map[AgentSource][]*AgentInfo {
	result := make(map[AgentSource][]*AgentInfo)
	for _, agent := range l.agents {
		result[agent.Source] = append(result[agent.Source], agent)
	}
	for source := range result {
		sort.Slice(result[source], func(i, j int) bool {
			return result[source][i].Name < result[source][j].Name
		})
	}
	return result
}

// AgentsByType groups agents by their type.
func (l *Loader) AgentsByType() map[AgentType][]*AgentInfo {
	result := make(map[AgentType][]*AgentInfo)
	for _, agent := range l.agents {
		result[agent.Type] = append(result[agent.Type], agent)
	}
	for t := range result {
		sort.Slice(result[t], func(i, j int) bool {
			return result[t][i].Name < result[t][j].Name
		})
	}
	return result
}

// Source returns where framework agents were loaded from.
func (l *Loader) Source() string {
	return l.source
}

// IsEmbedded returns true if framework agents were loaded from embedded files.
func (l *Loader) IsEmbedded() bool {
	return l.useEmbedded
}

// --- Internal helpers ---

// isLegacyWizardFile checks if a filename matches a legacy wizard pattern.
func isLegacyWizardFile(name string) bool {
	return strings.HasSuffix(name, LegacyAgentPromptSuffix) ||
		strings.HasSuffix(name, LegacyWizardSuffix)
}

// inferAgentType refines the agent type based on known agent names.
func inferAgentType(name string, fallback AgentType) AgentType {
	switch name {
	// Onboarding guide
	case "start_epf", "onboarding-guide":
		return AgentTypeGuide

	// Strategists (multi-step planning)
	case "pathfinder", "lean_start", "lean-start-strategist",
		"ready-phase-strategist", "aim-phase-strategist",
		"synthesizer":
		return AgentTypeStrategist

	// Architects (design/structure)
	case "product_architect", "fire-phase-architect":
		return AgentTypeArchitect

	// Reviewers (quality assurance)
	case "value_model_review", "feature_quality_review",
		"strategic_coherence_review", "balance_checker":
		return AgentTypeReviewer

	// Specialists (domain-specific skills)
	case "01_trend_scout", "02_market_mapper",
		"03_internal_mirror", "04_problem_detective",
		"feature_definition", "feature_enrichment",
		"roadmap_enrichment", "aim_trigger_assessment",
		"strategic_reality_check", "context_sheet_generator":
		return AgentTypeSpecialist
	}

	return fallback
}

// formatDisplayName converts an agent name (snake_case or kebab-case) to a
// human-readable display name.
func formatDisplayName(name string) string {
	// Handle numbered sub-wizards (e.g., "01_trend_scout" -> "Trend Scout")
	if len(name) > 3 && name[2] == '_' && name[0] >= '0' && name[0] <= '9' {
		name = name[3:]
	}

	// Replace separators with spaces
	name = strings.ReplaceAll(name, "_", " ")
	name = strings.ReplaceAll(name, "-", " ")

	// Title case
	words := strings.Fields(name)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}

	return strings.Join(words, " ")
}

// --- Lightweight metadata parsers (replicate wizard.Parser patterns) ---

// parsePurpose extracts the purpose from wizard markdown content.
func parsePurpose(content string) string {
	lines := strings.Split(content, "\n")

	// Try "You are the..." pattern
	youArePattern := regexp.MustCompile(`(?i)you are (?:the |an? )?(?:\*\*)?([^*\n]+)(?:\*\*)?[,.]`)
	if match := youArePattern.FindStringSubmatch(content); len(match) > 1 {
		purpose := strings.TrimSpace(match[1])
		if !strings.HasSuffix(purpose, ".") {
			idx := strings.Index(content, match[0])
			if idx >= 0 {
				rest := content[idx+len(match[0]):]
				if periodIdx := strings.Index(rest, "."); periodIdx >= 0 && periodIdx < 200 {
					purpose = match[1] + rest[:periodIdx+1]
				}
			}
		}
		purpose = strings.ReplaceAll(purpose, "**", "")
		purpose = strings.TrimSpace(purpose)
		if len(purpose) > 10 && len(purpose) < 300 {
			return purpose
		}
	}

	// Look for purpose in heading parenthetical
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

// parseTriggerPhrases extracts trigger phrases from wizard content.
func parseTriggerPhrases(content string) []string {
	var triggers []string

	// Trigger phrases section
	triggerSection := regexp.MustCompile(`(?i)\*\*Trigger phrases:\*\*\s*\n((?:[-*]\s+[^\n]+\n?)+)`)
	if match := triggerSection.FindStringSubmatch(content); len(match) > 1 {
		listItems := regexp.MustCompile(`[-*]\s+"([^"]+)"`)
		for _, item := range listItems.FindAllStringSubmatch(match[1], -1) {
			if len(item) > 1 {
				triggers = append(triggers, strings.ToLower(strings.TrimSpace(item[1])))
			}
		}
	}

	// User Says table
	userSaysPattern := regexp.MustCompile(`(?i)\|\s*User Says[^\|]*\|[^\n]*\n\|[-\s|]+\n((?:\|[^\n]+\n)+)`)
	if match := userSaysPattern.FindStringSubmatch(content); len(match) > 1 {
		rowPattern := regexp.MustCompile(`\|\s*"([^"]+)"`)
		for _, row := range rowPattern.FindAllStringSubmatch(match[1], -1) {
			if len(row) > 1 {
				triggers = append(triggers, strings.ToLower(strings.TrimSpace(row[1])))
			}
		}
	}

	// "When to use" bullet points
	whenToUsePattern := regexp.MustCompile(`(?i)(?:when to use|use this wizard when)[:\s]*\n((?:[-*]\s+[^\n]+\n?)+)`)
	if match := whenToUsePattern.FindStringSubmatch(content); len(match) > 1 {
		listItems := regexp.MustCompile(`[-*]\s+(?:User says[:\s]*)?["']?([^"'\n]+)["']?`)
		for _, item := range listItems.FindAllStringSubmatch(match[1], -1) {
			if len(item) > 1 {
				phrase := strings.ToLower(strings.TrimSpace(item[1]))
				phrase = strings.TrimPrefix(phrase, "user says: ")
				phrase = strings.TrimPrefix(phrase, "user says ")
				if len(phrase) > 3 && len(phrase) < 100 {
					triggers = append(triggers, phrase)
				}
			}
		}
	}

	// Direct "User says:" quotes
	userSaysQuotes := regexp.MustCompile(`(?i)user says[:\s]+["']([^"']+)["']`)
	for _, match := range userSaysQuotes.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			triggers = append(triggers, strings.ToLower(strings.TrimSpace(match[1])))
		}
	}

	// Deduplicate
	seen := make(map[string]bool)
	var unique []string
	for _, t := range triggers {
		if !seen[t] {
			seen[t] = true
			unique = append(unique, t)
		}
	}

	return unique
}

// parseRelatedWizards extracts references to other wizards/agents from content.
func parseRelatedWizards(content string, selfName string) []string {
	var related []string

	// Wizard file references
	wizardRefPattern := regexp.MustCompile("`?([a-z0-9_]+)\\.(?:agent_prompt|wizard)\\.md`?")
	for _, match := range wizardRefPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 && match[1] != selfName {
			related = append(related, match[1])
		}
	}

	// Wizard references in links
	linkPattern := regexp.MustCompile(`\[([^\]]+)\]\(([^)]*(?:agent_prompt|wizard)\.md)\)`)
	for _, match := range linkPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 2 {
			path := match[2]
			if lastSlash := strings.LastIndex(path, "/"); lastSlash >= 0 {
				path = path[lastSlash+1:]
			}
			name := strings.TrimSuffix(strings.TrimSuffix(path, ".agent_prompt.md"), ".wizard.md")
			if len(name) > 0 && name != selfName {
				related = append(related, name)
			}
		}
	}

	// Deduplicate
	seen := make(map[string]bool)
	var unique []string
	for _, r := range related {
		if !seen[r] {
			seen[r] = true
			unique = append(unique, r)
		}
	}

	return unique
}
