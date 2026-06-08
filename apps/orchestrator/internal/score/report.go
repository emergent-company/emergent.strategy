package score

import (
	"context"

	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/openspec"
)

// ScoreChanges builds a scorecard for each change and ranks them under the given
// posture. It performs the MCP queries via the supplied Scorer (which is already
// bound to a strategy instance). Changes are processed in input order; ranking
// reorders the output by attention.
//
// This is the public entry point the CLI uses once an MCP endpoint is
// configured. When no endpoint is available the CLI skips this entirely and
// emits only the deterministic wave plan.
func ScoreChanges(_ context.Context, changes []openspec.Change, s Scorer, p Posture) []Ranked {
	cards := make([]Card, 0, len(changes))
	for _, c := range changes {
		cards = append(cards, Build(c, s))
	}
	return Rank(cards, p)
}
