package wizard

import (
	"regexp"
	"strings"
)

// Parser extracts metadata from wizard markdown content
type Parser struct{}

// NewParser creates a new wizard parser
func NewParser() *Parser {
	return &Parser{}
}

// ParsePurpose extracts the purpose from wizard content
// Looks for the first paragraph after the main heading, or extracts from
// a "You are the..." statement
func (p *Parser) ParsePurpose(content string) string {
	lines := strings.Split(content, "\n")

	// First, try to find "You are the..." pattern (common in agent prompts)
	youArePattern := regexp.MustCompile(`(?i)you are (?:the |an? )?(?:\*\*)?([^*\n]+)(?:\*\*)?[,.]`)
	if match := youArePattern.FindStringSubmatch(content); len(match) > 1 {
		purpose := strings.TrimSpace(match[1])
		// Clean up and make it a description
		if !strings.HasSuffix(purpose, ".") {
			// Find the rest of the sentence
			idx := strings.Index(content, match[0])
			if idx >= 0 {
				rest := content[idx+len(match[0]):]
				if periodIdx := strings.Index(rest, "."); periodIdx >= 0 && periodIdx < 200 {
					purpose = match[1] + rest[:periodIdx+1]
				}
			}
		}
		// Clean up markdown
		purpose = strings.ReplaceAll(purpose, "**", "")
		purpose = strings.TrimSpace(purpose)
		if len(purpose) > 10 && len(purpose) < 300 {
			return purpose
		}
	}

	// Look for purpose in the first heading's parenthetical
	// e.g., "# AI Knowledge Agent: Start EPF (Interactive Onboarding)"
	for _, line := range lines {
		if strings.HasPrefix(line, "# ") {
			if parenStart := strings.LastIndex(line, "("); parenStart > 0 {
				if parenEnd := strings.LastIndex(line, ")"); parenEnd > parenStart {
					return strings.TrimSpace(line[parenStart+1 : parenEnd])
				}
			}
			// Try to extract from heading content after colon
			if colonIdx := strings.Index(line, ":"); colonIdx > 0 {
				afterColon := strings.TrimSpace(line[colonIdx+1:])
				// Remove parenthetical if present
				if parenStart := strings.Index(afterColon, "("); parenStart > 0 {
					afterColon = strings.TrimSpace(afterColon[:parenStart])
				}
				if len(afterColon) > 5 && len(afterColon) < 100 {
					return afterColon
				}
			}
		}
	}

	// Look for first non-empty paragraph after heading
	foundHeading := false
	var paragraphLines []string
	for _, line := range lines {
		if strings.HasPrefix(line, "# ") {
			foundHeading = true
			continue
		}
		if foundHeading {
			trimmed := strings.TrimSpace(line)
			// Skip empty lines, horizontal rules, and secondary headings
			if trimmed == "" || trimmed == "---" || strings.HasPrefix(trimmed, "#") {
				if len(paragraphLines) > 0 {
					break
				}
				continue
			}
			paragraphLines = append(paragraphLines, trimmed)
			// Stop at reasonable length
			if len(strings.Join(paragraphLines, " ")) > 200 {
				break
			}
		}
	}

	if len(paragraphLines) > 0 {
		purpose := strings.Join(paragraphLines, " ")
		// Clean up markdown
		purpose = strings.ReplaceAll(purpose, "**", "")
		purpose = strings.ReplaceAll(purpose, "*", "")
		// Truncate if too long
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

// ParseTriggerPhrases extracts trigger phrases from wizard content
// Looks for "Trigger phrases:" sections or "When to Use" sections
func (p *Parser) ParseTriggerPhrases(content string) []string {
	var triggers []string

	// Pattern 1: "**Trigger phrases:**" followed by list
	triggerSection := regexp.MustCompile(`(?i)\*\*Trigger phrases:\*\*\s*\n((?:[-*]\s+[^\n]+\n?)+)`)
	if match := triggerSection.FindStringSubmatch(content); len(match) > 1 {
		listItems := regexp.MustCompile(`[-*]\s+"([^"]+)"`)
		for _, item := range listItems.FindAllStringSubmatch(match[1], -1) {
			if len(item) > 1 {
				triggers = append(triggers, strings.ToLower(strings.TrimSpace(item[1])))
			}
		}
	}

	// Pattern 2: User Says table
	userSaysPattern := regexp.MustCompile(`(?i)\|\s*User Says[^\|]*\|[^\n]*\n\|[-\s|]+\n((?:\|[^\n]+\n)+)`)
	if match := userSaysPattern.FindStringSubmatch(content); len(match) > 1 {
		rowPattern := regexp.MustCompile(`\|\s*"([^"]+)"`)
		for _, row := range rowPattern.FindAllStringSubmatch(match[1], -1) {
			if len(row) > 1 {
				triggers = append(triggers, strings.ToLower(strings.TrimSpace(row[1])))
			}
		}
	}

	// Pattern 3: "When to use:" bullet points
	whenToUsePattern := regexp.MustCompile(`(?i)(?:when to use|use this wizard when)[:\s]*\n((?:[-*]\s+[^\n]+\n?)+)`)
	if match := whenToUsePattern.FindStringSubmatch(content); len(match) > 1 {
		// Extract key phrases from bullet points
		listItems := regexp.MustCompile(`[-*]\s+(?:User says[:\s]*)?["']?([^"'\n]+)["']?`)
		for _, item := range listItems.FindAllStringSubmatch(match[1], -1) {
			if len(item) > 1 {
				phrase := strings.ToLower(strings.TrimSpace(item[1]))
				// Clean up and extract just the trigger part
				phrase = strings.TrimPrefix(phrase, "user says: ")
				phrase = strings.TrimPrefix(phrase, "user says ")
				if len(phrase) > 3 && len(phrase) < 100 {
					triggers = append(triggers, phrase)
				}
			}
		}
	}

	// Pattern 4: Direct quotes in "User says:" patterns
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

// ParseDuration extracts the estimated duration from wizard content
// Looks for duration mentions in tables or inline
func (p *Parser) ParseDuration(content string) string {
	// Pattern 1: Duration in table
	durationTablePattern := regexp.MustCompile(`(?i)\|\s*Duration\s*\|\s*\n\|[-\s|]+\n\|[^|]*\|[^|]*\|([^|]+)\|`)
	if match := durationTablePattern.FindStringSubmatch(content); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}

	// Pattern 2: Duration column in any table row for this wizard
	durationColPattern := regexp.MustCompile(`\|[^|]+\|[^|]+\|\s*(\d+[-–]\d+\s*(?:minutes?|hours?|hrs?|min))\s*\|`)
	if match := durationColPattern.FindStringSubmatch(content); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}

	// Pattern 3: Inline duration mention
	inlineDurationPattern := regexp.MustCompile(`(?i)(?:duration|time|takes?)[:\s]+(\d+[-–]\d+\s*(?:minutes?|hours?|hrs?|min))`)
	if match := inlineDurationPattern.FindStringSubmatch(content); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}

	// Pattern 4: Parenthetical duration
	parenDurationPattern := regexp.MustCompile(`\((\d+[-–]\d+\s*(?:minutes?|hours?|hrs?|min))\)`)
	if match := parenDurationPattern.FindStringSubmatch(content); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}

	return ""
}

// ParseOutputs extracts what artifacts the wizard creates
func (p *Parser) ParseOutputs(content string) []string {
	var outputs []string

	// Pattern 1: "What you'll create:" section
	createSection := regexp.MustCompile(`(?i)(?:what you'?ll create|outputs?|creates?)[:\s]*\n((?:[-*]\s+[^\n]+\n?)+)`)
	if match := createSection.FindStringSubmatch(content); len(match) > 1 {
		listItems := regexp.MustCompile(`[-*]\s+([^\n]+)`)
		for _, item := range listItems.FindAllStringSubmatch(match[1], -1) {
			if len(item) > 1 {
				output := strings.TrimSpace(item[1])
				// Clean up markdown
				output = strings.ReplaceAll(output, "**", "")
				output = strings.ReplaceAll(output, "*", "")
				if len(output) > 2 {
					outputs = append(outputs, output)
				}
			}
		}
	}

	// Pattern 2: Output column in tables
	outputTablePattern := regexp.MustCompile(`(?i)\|\s*Output\s*\|\s*\n\|[-\s|]+\n((?:\|[^\n]+\n)+)`)
	if match := outputTablePattern.FindStringSubmatch(content); len(match) > 1 {
		// Extract last column from each row
		rowPattern := regexp.MustCompile(`\|[^|]+\|[^|]+\|[^|]+\|([^|]+)\|`)
		for _, row := range rowPattern.FindAllStringSubmatch(match[1], -1) {
			if len(row) > 1 {
				output := strings.TrimSpace(row[1])
				if len(output) > 2 {
					outputs = append(outputs, output)
				}
			}
		}
	}

	// Pattern 3: YAML file references
	yamlPattern := regexp.MustCompile(`\x60([0-9]{2}_[a-z_]+\.yaml)\x60`)
	for _, match := range yamlPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			outputs = append(outputs, match[1])
		}
	}

	// Deduplicate
	seen := make(map[string]bool)
	var unique []string
	for _, o := range outputs {
		if !seen[o] {
			seen[o] = true
			unique = append(unique, o)
		}
	}

	return unique
}

// ParseRelatedWizards extracts references to other wizards
func (p *Parser) ParseRelatedWizards(content string) []string {
	var related []string

	// Pattern: wizard file references
	wizardRefPattern := regexp.MustCompile(`\x60?([a-z0-9_]+)\.(?:agent_prompt|wizard)\.md\x60?`)
	for _, match := range wizardRefPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			related = append(related, match[1])
		}
	}

	// Pattern: wizard references in links
	linkPattern := regexp.MustCompile(`\[([^\]]+)\]\(([^)]*(?:agent_prompt|wizard)\.md)\)`)
	for _, match := range linkPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 2 {
			// Extract wizard name from path
			path := match[2]
			if lastSlash := strings.LastIndex(path, "/"); lastSlash >= 0 {
				path = path[lastSlash+1:]
			}
			name := strings.TrimSuffix(strings.TrimSuffix(path, ".agent_prompt.md"), ".wizard.md")
			if len(name) > 0 {
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

// ParseRelatedTemplates extracts template references
func (p *Parser) ParseRelatedTemplates(content string) []string {
	var templates []string

	// Pattern: template file references
	templatePattern := regexp.MustCompile(`templates?/(?:READY|FIRE|AIM)/([a-z0-9_]+\.yaml)`)
	for _, match := range templatePattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			templates = append(templates, match[1])
		}
	}

	// Pattern: template mentions
	templateMentionPattern := regexp.MustCompile(`\x60([a-z0-9_]+_template\.yaml)\x60`)
	for _, match := range templateMentionPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			templates = append(templates, match[1])
		}
	}

	// Deduplicate
	seen := make(map[string]bool)
	var unique []string
	for _, t := range templates {
		if !seen[t] {
			seen[t] = true
			unique = append(unique, t)
		}
	}

	return unique
}

// ParseRelatedSchemas extracts schema references
func (p *Parser) ParseRelatedSchemas(content string) []string {
	var schemas []string

	// Pattern: schema file references
	schemaPattern := regexp.MustCompile(`schemas?/([a-z_]+)\.schema\.json`)
	for _, match := range schemaPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			schemas = append(schemas, match[1])
		}
	}

	// Pattern: artifact type mentions that have schemas
	artifactTypes := []string{
		"north_star", "insight_analyses", "strategy_foundations",
		"insight_opportunity", "strategy_formula", "roadmap_recipe",
		"feature_definition", "value_model", "mappings",
		"assessment_report", "calibration_memo",
	}
	contentLower := strings.ToLower(content)
	for _, at := range artifactTypes {
		if strings.Contains(contentLower, at) || strings.Contains(contentLower, strings.ReplaceAll(at, "_", " ")) {
			schemas = append(schemas, at)
		}
	}

	// Deduplicate
	seen := make(map[string]bool)
	var unique []string
	for _, s := range schemas {
		if !seen[s] {
			seen[s] = true
			unique = append(unique, s)
		}
	}

	return unique
}
