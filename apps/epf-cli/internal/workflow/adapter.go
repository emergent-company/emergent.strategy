package workflow

import (
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/navigation"
)

// ToNavigationGraph converts a workflow state machine into a navigation.Graph
// so that the same runner engine (Runner, Reachable, ShortestPath, RunScenario)
// can be used for both navigation graphs and workflow state machines.
//
// Mapping:
//   - States become Contexts (id = state name, title = state name)
//   - Transitions become navigation.Transitions (one per from state for multi-source)
//   - initial_state becomes entry_context
//   - No guards (workflow guards live in configurations, not state machine definitions)
//   - No groups, menus, imports, or portal edges
func ToNavigationGraph(sm *StateMachine) *navigation.Graph {
	g := &navigation.Graph{
		Name:         sm.Name,
		Title:        sm.Name,
		EntryContext: sm.InitialState,
	}

	// Convert states to contexts.
	for _, s := range sm.States {
		g.Contexts = append(g.Contexts, navigation.Context{
			ID:    s,
			Title: s,
		})
	}

	// Convert transitions. For multi-source transitions, create one
	// navigation transition per source state with a disambiguated ID.
	for _, t := range sm.Transitions {
		for _, from := range t.From.Values {
			id := t.Name
			if t.From.IsMulti() {
				id = fmt.Sprintf("%s-from-%s", t.Name, from)
			}
			g.Transitions = append(g.Transitions, navigation.Transition{
				ID:   id,
				From: from,
				To:   t.To,
				Label: t.Name,
			})
		}
	}

	return g
}
