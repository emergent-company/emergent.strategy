package navigation

import (
	"fmt"
	"time"
)

// GuardProfile represents the set of guards and guard groups that are satisfied,
// simulating a particular user type or entity state.
type GuardProfile struct {
	// Guards lists individual guard IDs that pass.
	Guards map[string]bool `json:"guards,omitempty"`
	// GuardGroups lists guard group names that pass (all guards in the group pass).
	GuardGroups map[string]bool `json:"guard_groups,omitempty"`
}

// NewGuardProfile creates an empty guard profile.
func NewGuardProfile() *GuardProfile {
	return &GuardProfile{
		Guards:      make(map[string]bool),
		GuardGroups: make(map[string]bool),
	}
}

// Satisfies checks whether a guard is satisfied under this profile.
// A guard passes if:
//   - It is explicitly listed in the profile, OR
//   - Its guard_group is listed in the profile
func (p *GuardProfile) Satisfies(guard *Guard) bool {
	if guard == nil {
		return true // No guard means always allowed
	}
	if p.Guards[guard.ID] {
		return true
	}
	if guard.GuardGroup != "" && p.GuardGroups[guard.GuardGroup] {
		return true
	}
	return false
}

// ToggleGuard adds or removes a guard from the profile.
func (p *GuardProfile) ToggleGuard(id string) {
	p.Guards[id] = !p.Guards[id]
	if !p.Guards[id] {
		delete(p.Guards, id)
	}
}

// ToggleGuardGroup adds or removes a guard group from the profile.
func (p *GuardProfile) ToggleGuardGroup(group string) {
	p.GuardGroups[group] = !p.GuardGroups[group]
	if !p.GuardGroups[group] {
		delete(p.GuardGroups, group)
	}
}

// HistoryEntry records a single traversal step.
type HistoryEntry struct {
	FromContext   string    `json:"from_context"`
	ToContext     string    `json:"to_context"`
	TransitionID string    `json:"transition_id"`
	Timestamp    time.Time `json:"timestamp"`
}

// AvailableTransition annotates a transition with whether it is passable
// under the current guard profile.
type AvailableTransition struct {
	Transition Transition `json:"transition"`
	Allowed    bool       `json:"allowed"`
	// BlockedBy is set when Allowed is false — the guard that blocked it.
	BlockedBy *Guard `json:"blocked_by,omitempty"`
}

// Runner is a graph state machine runner. It maintains current state,
// evaluates guard profiles, and tracks traversal history.
type Runner struct {
	graph   *Graph
	current string
	profile *GuardProfile
	history []HistoryEntry
}

// NewRunner creates a runner for the given graph, starting at the entry context.
func NewRunner(g *Graph, profile *GuardProfile) *Runner {
	if profile == nil {
		profile = NewGuardProfile()
	}
	return &Runner{
		graph:   g,
		current: g.EntryContext,
		profile: profile,
	}
}

// Graph returns the underlying graph.
func (r *Runner) Graph() *Graph {
	return r.graph
}

// Current returns the current context ID.
func (r *Runner) Current() string {
	return r.current
}

// CurrentContext returns the current context struct.
func (r *Runner) CurrentContext() *Context {
	return r.graph.ContextByID(r.current)
}

// Profile returns the current guard profile.
func (r *Runner) Profile() *GuardProfile {
	return r.profile
}

// History returns the traversal history.
func (r *Runner) History() []HistoryEntry {
	return r.history
}

// Available returns all outbound transitions from the current context,
// annotated with whether each is passable under the current profile.
func (r *Runner) Available() []AvailableTransition {
	transitions := r.graph.TransitionsFrom(r.current)
	result := make([]AvailableTransition, 0, len(transitions))
	for _, t := range transitions {
		at := AvailableTransition{Transition: t, Allowed: true}
		if t.Guard != "" {
			guard := r.graph.GuardByID(t.Guard)
			if guard != nil && !r.profile.Satisfies(guard) {
				at.Allowed = false
				at.BlockedBy = guard
			}
		}
		result = append(result, at)
	}
	return result
}

// Traverse attempts to follow a transition by ID. Returns an error if:
//   - The transition does not exist
//   - The transition does not originate from the current context
//   - The transition's guard is not satisfied
func (r *Runner) Traverse(transitionID string) error {
	for _, t := range r.graph.Transitions {
		if t.ID != transitionID {
			continue
		}
		if t.From != r.current {
			return fmt.Errorf("transition %q originates from %q, not current context %q", transitionID, t.From, r.current)
		}
		if t.Guard != "" {
			guard := r.graph.GuardByID(t.Guard)
			if guard != nil && !r.profile.Satisfies(guard) {
				return fmt.Errorf("transition %q blocked by guard %q: %s", transitionID, guard.ID, guard.Message)
			}
		}
		r.history = append(r.history, HistoryEntry{
			FromContext:   r.current,
			ToContext:     t.To,
			TransitionID:  t.ID,
			Timestamp:     time.Now(),
		})
		r.current = t.To
		return nil
	}
	return fmt.Errorf("transition %q not found", transitionID)
}

// JourneyScenario defines a scripted journey test.
type JourneyScenario struct {
	Name        string   `yaml:"name" json:"name"`
	Description string   `yaml:"description,omitempty" json:"description,omitempty"`
	StartAt     string   `yaml:"start_at,omitempty" json:"start_at,omitempty"` // defaults to entry_context
	Steps       []string `yaml:"steps" json:"steps"`                           // transition IDs
	// Guards and GuardGroups to enable in the profile.
	Guards      []string `yaml:"guards,omitempty" json:"guards,omitempty"`
	GuardGroups []string `yaml:"guard_groups,omitempty" json:"guard_groups,omitempty"`
	// ExpectedEnd is the context ID where the journey should end.
	ExpectedEnd string `yaml:"expected_end,omitempty" json:"expected_end,omitempty"`
}

// JourneyResult reports the outcome of a scripted journey run.
type JourneyResult struct {
	Scenario    string `json:"scenario"`
	Passed      bool   `json:"passed"`
	FinalState  string `json:"final_state"`
	StepsRun    int    `json:"steps_run"`
	TotalSteps  int    `json:"total_steps"`
	// FailedAt is set when the journey fails — the step index (0-based) and reason.
	FailedAt    int    `json:"failed_at,omitempty"`
	FailReason  string `json:"fail_reason,omitempty"`
}

// RunScenario executes a journey scenario against the graph and returns the result.
func RunScenario(g *Graph, scenario JourneyScenario) JourneyResult {
	profile := NewGuardProfile()
	for _, gID := range scenario.Guards {
		profile.Guards[gID] = true
	}
	for _, gg := range scenario.GuardGroups {
		profile.GuardGroups[gg] = true
	}

	runner := NewRunner(g, profile)

	// Override start if specified
	if scenario.StartAt != "" {
		if g.ContextByID(scenario.StartAt) == nil {
			return JourneyResult{
				Scenario:   scenario.Name,
				Passed:     false,
				FinalState: "",
				TotalSteps: len(scenario.Steps),
				FailReason: fmt.Sprintf("start_at context %q not found", scenario.StartAt),
			}
		}
		runner.current = scenario.StartAt
	}

	for i, step := range scenario.Steps {
		if err := runner.Traverse(step); err != nil {
			return JourneyResult{
				Scenario:   scenario.Name,
				Passed:     false,
				FinalState: runner.current,
				StepsRun:   i,
				TotalSteps: len(scenario.Steps),
				FailedAt:   i,
				FailReason: err.Error(),
			}
		}
	}

	result := JourneyResult{
		Scenario:   scenario.Name,
		Passed:     true,
		FinalState: runner.current,
		StepsRun:   len(scenario.Steps),
		TotalSteps: len(scenario.Steps),
	}

	if scenario.ExpectedEnd != "" && runner.current != scenario.ExpectedEnd {
		result.Passed = false
		result.FailReason = fmt.Sprintf("expected to end at %q, but ended at %q", scenario.ExpectedEnd, runner.current)
	}

	return result
}

// Reachable returns all contexts reachable from the given source context
// under the given guard profile, along with the paths to reach them.
func Reachable(g *Graph, sourceID string, profile *GuardProfile) map[string][]string {
	if profile == nil {
		profile = NewGuardProfile()
	}

	// BFS
	visited := make(map[string]bool)
	paths := make(map[string][]string)
	queue := []string{sourceID}
	visited[sourceID] = true
	paths[sourceID] = nil

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		for _, t := range g.TransitionsFrom(current) {
			if visited[t.To] {
				continue
			}
			// Check guard
			if t.Guard != "" {
				guard := g.GuardByID(t.Guard)
				if guard != nil && !profile.Satisfies(guard) {
					continue
				}
			}
			visited[t.To] = true
			path := make([]string, len(paths[current]))
			copy(path, paths[current])
			path = append(path, t.ID)
			paths[t.To] = path
			queue = append(queue, t.To)
		}
	}

	return paths
}

// ShortestPath finds the shortest path between two contexts under the given
// guard profile. Returns the transition IDs along the path, or nil if unreachable.
func ShortestPath(g *Graph, fromID, toID string, profile *GuardProfile) []string {
	paths := Reachable(g, fromID, profile)
	if path, ok := paths[toID]; ok {
		return path
	}
	return nil
}
