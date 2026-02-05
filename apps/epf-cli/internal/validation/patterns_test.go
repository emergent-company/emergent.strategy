package validation

import "testing"

func TestIsTemplateContent(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		expected bool
	}{
		// Positive cases - should be detected as template content
		{"TBD marker", "This is TBD", true},
		{"TODO marker", "TODO: implement this", true},
		{"FIXME marker", "FIXME: broken logic", true},
		{"INSERT placeholder", "[INSERT your name here]", true},
		{"PLACEHOLDER bracket", "[PLACEHOLDER]", true},
		{"YOUR bracket", "[YOUR company name]", true},
		{"here bracket", "[write your description here]", true},
		{"INSERT angle", "<INSERT value>", true},
		{"PLACEHOLDER angle", "<PLACEHOLDER>", true},
		{"YOUR angle", "<YOUR organization>", true},
		{"here angle", "<put your text here>", true},
		// Note: "example:" pattern requires start of line (^), so inline won't match
		// But it will match when used in actual file scanning (line-by-line)
		{"placeholder word", "This is a placeholder value", true},
		{"date placeholder", "Created on YYYY-MM-DD", true},
		{"lorem ipsum", "Lorem ipsum dolor sit amet", true},
		{"your X here", "Enter your email address here", true},
		{"XXX placeholder", "XXX needs attention", true},

		// Negative cases - should NOT be detected (exclusions or no match)
		{"for example phrase", "You can use this for example", false},
		{"example usage", "example usage: see below", false},
		{"TODO comment doc", "Supports TODO comment detection", false},
		{"hash TODO", "# TODO: this is a comment", false},
		{"placeholder field", "placeholder_text: actual content", false},
		{"zero TBD metric", "Found 0 TBD markers", false},
		{"TBD markers discussion", "Detects TBD markers in content", false},
		{"listing terms", "Checks for TODO, PLACEHOLDER, and TBD", false},
		{"detection feature", "Detects TBD and TODO in files", false},
		{"example domain", "Visit example.com for details", false},
		{"date format docs", "Use YYYY-MM-DD format for dates", false},
		{"normal content", "The product helps teams collaborate", false},
		{"no placeholders", "A comprehensive guide to implementation", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsTemplateContent(tt.value)
			if result != tt.expected {
				t.Errorf("IsTemplateContent(%q) = %v, expected %v", tt.value, result, tt.expected)
			}
		})
	}
}

func TestDetectTemplatePlaceholder(t *testing.T) {
	tests := []struct {
		name          string
		fieldPath     string
		value         string
		shouldDetect  bool
		patternExists bool // Whether a pattern string should be returned
	}{
		{
			name:          "TBD in mission",
			fieldPath:     "mission",
			value:         "Our mission is TBD",
			shouldDetect:  true,
			patternExists: true,
		},
		{
			name:          "TODO in description",
			fieldPath:     "description",
			value:         "TODO: write description",
			shouldDetect:  true,
			patternExists: true,
		},
		{
			name:          "INSERT placeholder",
			fieldPath:     "company_name",
			value:         "[INSERT company name]",
			shouldDetect:  true,
			patternExists: true,
		},
		{
			name:          "Normal content",
			fieldPath:     "mission",
			value:         "Empowering teams with AI",
			shouldDetect:  false,
			patternExists: false,
		},
		{
			name:          "Excluded: for example",
			fieldPath:     "description",
			value:         "You can use this for example",
			shouldDetect:  false,
			patternExists: false,
		},
		{
			name:          "Excluded: example.com",
			fieldPath:     "url",
			value:         "Visit https://example.com",
			shouldDetect:  false,
			patternExists: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			detected, pattern := DetectTemplatePlaceholder(tt.fieldPath, tt.value)

			if detected != tt.shouldDetect {
				t.Errorf("DetectTemplatePlaceholder(%q, %q) detected = %v, expected %v",
					tt.fieldPath, tt.value, detected, tt.shouldDetect)
			}

			if tt.patternExists && pattern == "" {
				t.Errorf("Expected pattern string to be returned, got empty string")
			}

			if !tt.patternExists && pattern != "" {
				t.Errorf("Expected no pattern string, got %q", pattern)
			}
		})
	}
}

func TestPlaceholderPatterns_Coverage(t *testing.T) {
	// Ensure we have reasonable coverage of patterns
	if len(PlaceholderPatterns) < 15 {
		t.Errorf("Expected at least 15 placeholder patterns, got %d", len(PlaceholderPatterns))
	}

	if len(ExclusionPatterns) < 10 {
		t.Errorf("Expected at least 10 exclusion patterns, got %d", len(ExclusionPatterns))
	}
}

func TestPlaceholderPatterns_CaseInsensitive(t *testing.T) {
	// Test that patterns are case-insensitive
	tests := []struct {
		value    string
		expected bool
	}{
		{"TBD", true},
		{"tbd", true},
		{"Tbd", true},
		{"TODO", true},
		{"todo", true},
		{"ToDo", true},
		{"FIXME", true},
		{"fixme", true},
		{"FixMe", true},
	}

	for _, tt := range tests {
		t.Run(tt.value, func(t *testing.T) {
			result := IsTemplateContent(tt.value)
			if result != tt.expected {
				t.Errorf("IsTemplateContent(%q) = %v, expected %v (case sensitivity issue)",
					tt.value, result, tt.expected)
			}
		})
	}
}
