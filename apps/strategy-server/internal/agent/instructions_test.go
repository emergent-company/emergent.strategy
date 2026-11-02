package agent

import (
	"strings"
	"testing"
)

// The instructions are the one place a client that shows them can be told how to
// answer from a strategy. Each rule that stops a wrong answer is asserted here.
func TestServerInstructions_StateTheReadingRules(t *testing.T) {
	text := ServerInstructions()
	rules := []struct {
		name string
		want []string
	}{
		{"structured reads are authoritative", []string{"get_outline", "get_section", "authoritative"}},
		{"search is discovery only", []string{"search_strategy", "discovery"}},
		{"cite the section", []string{"cite_as"}},
		{"framework content is not the company's strategy", []string{"framework", "not the company"}},
		{"say when a part is not defined", []string{"not defined"}},
		{"do not fill gaps from general knowledge", []string{"do not fill"}},
		{"mark your own reading", []string{"my reading"}},
		{"use readable names, not internal codes", []string{"labels"}},
		{"follow the guidance the outline carries", []string{"guidance", "get_outline"}},
	}
	lower := strings.ToLower(text)
	for _, r := range rules {
		for _, w := range r.want {
			if !strings.Contains(lower, strings.ToLower(w)) {
				t.Errorf("rule %q: instructions do not contain %q", r.name, w)
			}
		}
	}
}

func TestServerInstructions_StayShortEnoughToBeASystemPrompt(t *testing.T) {
	if n := len(ServerInstructions()); n > 5000 {
		t.Errorf("instructions are %d characters; keep them a system prompt, not a tutorial", n)
	}
}

// The answering rules reach the model in the outline, not in the instructions,
// so each failure the evaluation found is asserted in the text itself.
func TestAnsweringRules_StateTheRulesThatMoveAnswers(t *testing.T) {
	text := strings.ToLower(AnsweringRules())
	for name, w := range map[string]string{
		"follow truncated reads":                  "over budget",
		"keyword search before saying not stated": "keyword search",
		"collect across tracks for a function":    "never name the function",
		"check the draft against the facts read":  "check it against the list",
		"keep exact dates":                        "30 june 2027",
		"say what is undecided":                   "leaves undecided",
		"my reading is marked and kept apart":     "my reading:",
		"no codes in the body":                    "no internal codes",
		"sources in a closing line":               "sources:",
	} {
		if !strings.Contains(text, w) {
			t.Errorf("rule %q: the answering rules do not contain %q", name, w)
		}
	}
	if n := len(AnsweringRules()); n > 6000 {
		t.Errorf("answering rules are %d characters; they ride on every outline, keep them under 6000", n)
	}
}
