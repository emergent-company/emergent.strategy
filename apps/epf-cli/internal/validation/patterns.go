package validation

import "regexp"

// PlaceholderPatterns are patterns that indicate placeholder/template content
// These patterns are shared between content readiness checking (health command)
// and validation context (validate command)
var PlaceholderPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bTBD\b`),
	regexp.MustCompile(`(?i)\bTODO\b`),
	regexp.MustCompile(`(?i)\bFIXME\b`),
	regexp.MustCompile(`(?i)\[INSERT[^\]]*\]`),         // [INSERT something] or [insert something]
	regexp.MustCompile(`(?i)\[PLACEHOLDER[^\]]*\]`),    // [PLACEHOLDER] or [placeholder]
	regexp.MustCompile(`(?i)\[YOUR[^\]]*\]`),           // [YOUR something] or [your something]
	regexp.MustCompile(`(?i)\[[^\]]*\bhere\b[^\]]*\]`), // [... here ...] - brackets with "here" inside
	regexp.MustCompile(`(?i)<INSERT[^>]*>`),            // <INSERT something> or <insert something>
	regexp.MustCompile(`(?i)<PLACEHOLDER[^>]*>`),       // <PLACEHOLDER> or <placeholder>
	regexp.MustCompile(`(?i)<YOUR[^>]*>`),              // <YOUR something> or <your something>
	regexp.MustCompile(`(?i)<[^>]*\bhere\b[^>]*>`),     // <... here ...> - angle brackets with "here" inside
	regexp.MustCompile(`(?i)^example:`),                // Lines starting with "example:" (YAML key)
	regexp.MustCompile(`(?i)\bplaceholder\b`),          // Word "placeholder"
	regexp.MustCompile(`YYYY-MM-DD`),                   // Date placeholder
	regexp.MustCompile(`(?i)lorem ipsum`),              // Lorem ipsum
	regexp.MustCompile(`(?i)your .{1,30} here\b`),      // "your X here" pattern
	regexp.MustCompile(`XXX+`),                         // XXX placeholders
}

// ExclusionPatterns are patterns that should not be flagged as placeholders
// These help reduce false positives when content legitimately discusses
// these terms (e.g., documentation about TODO detection)
var ExclusionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)for example`),
	regexp.MustCompile(`(?i)example.*:`),          // "example usage:"
	regexp.MustCompile(`(?i)TODO comment`),        // Documentation about TODOs
	regexp.MustCompile(`(?i)#.*TODO`),             // Comments mentioning TODO
	regexp.MustCompile(`(?i)placeholder_[a-z]+:`), // "placeholder_text:" as a YAML field name
	regexp.MustCompile(`(?i)0 TBD`),               // "0 TBD markers" - metrics about TBD
	regexp.MustCompile(`(?i)TBD markers`),         // Discussing TBD as a concept
	regexp.MustCompile(`(?i)TODO, PLACEHOLDER`),   // Listing terms as documentation
	regexp.MustCompile(`(?i)Detects.*TBD`),        // Feature descriptions about detection
	regexp.MustCompile(`(?i)example\.com`),        // Example URLs
	regexp.MustCompile(`(?i)yyyy-mm-dd.*format`),  // Discussing date format
}

// IsTemplateContent checks if a value appears to be template/placeholder content
// Returns true if the value matches placeholder patterns and doesn't match exclusions
func IsTemplateContent(value string) bool {
	// Check exclusions first (faster to reject)
	for _, pattern := range ExclusionPatterns {
		if pattern.MatchString(value) {
			return false
		}
	}

	// Check if matches any placeholder pattern
	for _, pattern := range PlaceholderPatterns {
		if pattern.MatchString(value) {
			return true
		}
	}

	return false
}

// DetectTemplatePlaceholder checks if a field value contains template content
// and returns the matched text if found
func DetectTemplatePlaceholder(fieldPath string, value string) (bool, string) {
	// Check exclusions first
	for _, pattern := range ExclusionPatterns {
		if pattern.MatchString(value) {
			return false, ""
		}
	}

	// Check placeholder patterns - return the actual matched text
	for _, pattern := range PlaceholderPatterns {
		if match := pattern.FindString(value); match != "" {
			return true, match
		}
	}

	return false, ""
}
