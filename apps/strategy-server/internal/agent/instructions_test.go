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
