package integrity

import "testing"

func matchesAny(line string) bool {
	for _, p := range AdditionalPlaceholderPatterns {
		if p.MatchString(line) {
			return true
		}
	}
	return false
}

func TestAdditionalPlaceholderPatterns(t *testing.T) {
	flagged := []string{
		"  statement: '[FILL IN YOUR MISSION]'",
		"  review_date: 20XX-01-01",
		"  organization: Your Organization Name",
		"  organisation: Your Organisation",
		"  name: Product Name Here",
		"  objective: Example Product Objective",
		"  description: Example Key Result",
	}
	for _, l := range flagged {
		if !matchesAny(l) {
			t.Errorf("template marker not detected: %q", l)
		}
	}

	clean := []string{
		"  statement: We sell traceability to cocoa buyers",
		"  note: use a window, e.g., 12 months",
		"  organization: Acme AS",
		"  date: 2026-03-01",
		"  title: An example of how the loop runs",
	}
	for _, l := range clean {
		if matchesAny(l) {
			t.Errorf("ordinary content flagged as a template marker: %q", l)
		}
	}
}
