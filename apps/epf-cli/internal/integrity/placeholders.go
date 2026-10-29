package integrity

import "regexp"

// AdditionalPlaceholderPatterns are template markers that the placeholder lists
// in the validation and checks packages did not detect, although the distributed
// AGENTS.md said they did. Both lists append these so the two cannot drift.
//
// "e.g.," is deliberately not here: it appears in ordinary prose and would flag
// authored content.
var AdditionalPlaceholderPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\[FILL[^\]]*\]`),                                         // [FILL IN ...]
	regexp.MustCompile(`\b20XX\b`),                                                   // date placeholder
	regexp.MustCompile(`(?i)\bYour Organi[sz]ation( Name)?\b`),                       // sample organisation
	regexp.MustCompile(`(?i)\bProduct Name Here\b`),                                  // sample product
	regexp.MustCompile(`\bExample (Product|Key Result|Objective|Organi[sz]ation)\b`), // sample titles shipped in templates
}
