package agent

import _ "embed"

//go:embed answering_rules.md
var answeringRules string

// AnsweringRules is the general guidance for answering questions from a
// company's strategy. get_outline carries it, so a client receives it without
// fetching a prompt. Rules that belong to one company are not here: they are
// installed in that instance as the answering-rules skill.
func AnsweringRules() string { return answeringRules }
