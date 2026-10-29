package mcpserver

import (
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

// The text of a validation response is what a model reads; the verdict in
// structuredContent is what a program gates on. The verdict stays complete. The
// text keeps its full detail when that fits the budget and otherwise falls back
// to a summary that says what it left out.
const (
	validationErrorsPerItem = 5
	validationErrorChars    = 300
	// validationFixedChars is room for the fields around the list.
	validationFixedChars = 1200
)

// compactErrors keeps the first few errors of one artifact, shortened.
func compactErrors(errs []string) ([]string, int) {
	return strategyread.CapStrings(errs, validationErrorsPerItem, validationErrorChars)
}

// validationHints explains a summary: where the complete findings are, what is
// not listed, and how to get more.
func validationHints(omitted int, what string, capped bool) []string {
	hints := []string{
		"this text is a summary: every finding, in full, is in structuredContent.findings",
	}
	if omitted > 0 {
		hints = append(hints, fmt.Sprintf("%d more %s are not listed; raise max_chars (cap %d) or pass full=true", omitted, what, strategyread.HardMaxChars))
	}
	if capped {
		hints = append(hints, fmt.Sprintf("max_chars was capped at %d", strategyread.HardMaxChars))
	}
	return hints
}

// fitsBudget reports whether detail serialises within budget characters.
func fitsBudget(detail any, budget int) bool {
	return strategyread.JSONSize(detail) <= budget
}
