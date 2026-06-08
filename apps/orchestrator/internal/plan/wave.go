// Package plan computes a parallel-safe execution schedule ("wave plan") from
// a set of OpenSpec changes, based purely on their declared footprints.
//
// This is the deterministic core of the planner. It makes NO strategic
// judgment and queries nothing external — collision safety is derived only
// from which specs each change touches. The strategic scorecard (grounded in
// strategy-server via MCP) is a separate, advisory layer added on top.
//
// Granularity is whole-change: each change is scheduled as one unit, dispatched
// to one agent in one isolated worktree. Two changes that touch a common
// footprint are mutually exclusive and must land in different waves.
package plan

import (
	"sort"

	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/openspec"
)

// Plan is the full schedule produced for a backlog of changes.
type Plan struct {
	// Waves are ordered sets of changes. All changes within a single wave have
	// pairwise-disjoint footprints and may run in parallel. Waves run in order.
	Waves [][]string
	// Collisions maps each shared footprint to the set of change IDs that touch
	// it (the edges of the collision graph). Only footprints touched by >1
	// change appear here.
	Collisions map[string][]string
	// NeedsReconciliation lists change IDs whose tasks.md references other
	// changes — a human reconciliation decision is required before dispatch.
	NeedsReconciliation []string
	// Skipped lists change IDs excluded from scheduling (e.g. already complete),
	// with the reason.
	Skipped map[string]string
}

// Options controls scheduling behavior.
type Options struct {
	// IncludeCompleted schedules changes whose tasks are all done. By default
	// completed changes are skipped (there is nothing to dispatch).
	IncludeCompleted bool
}

// Compute builds a wave plan from the given changes.
//
// Algorithm (greedy graph coloring by footprint):
//  1. Skip completed changes unless opts.IncludeCompleted.
//  2. For each remaining change, find the lowest-index wave in which none of
//     its footprints are already claimed; create a new wave if none fits.
//  3. A footprint-less change never collides and lands in the first wave.
//
// Changes are processed in a deterministic order (most footprints first, then
// by ID) so the most-constrained changes are placed earliest, which tends to
// minimize the number of waves. Output is fully deterministic.
func Compute(changes []openspec.Change, opts Options) Plan {
	p := Plan{
		Collisions: map[string][]string{},
		Skipped:    map[string]string{},
	}

	// Partition into schedulable vs skipped.
	var schedulable []openspec.Change
	for _, c := range changes {
		if c.Done() && !opts.IncludeCompleted {
			p.Skipped[c.ID] = "complete"
			continue
		}
		schedulable = append(schedulable, c)
		if len(c.CrossRefs) > 0 {
			p.NeedsReconciliation = append(p.NeedsReconciliation, c.ID)
		}
	}
	sort.Strings(p.NeedsReconciliation)

	p.Collisions = computeCollisions(schedulable)

	// Order changes: most-constrained (most footprints) first, ties by ID.
	order := make([]openspec.Change, len(schedulable))
	copy(order, schedulable)
	sort.Slice(order, func(i, j int) bool {
		if len(order[i].Footprints) != len(order[j].Footprints) {
			return len(order[i].Footprints) > len(order[j].Footprints)
		}
		return order[i].ID < order[j].ID
	})

	// Greedy placement. claimed[w] is the set of footprints used in wave w.
	var claimed []map[string]struct{}
	placement := map[string]int{} // change ID -> wave index

	for _, c := range order {
		w := firstFreeWave(claimed, c.Footprints)
		if w == len(claimed) {
			claimed = append(claimed, map[string]struct{}{})
		}
		for _, fp := range c.Footprints {
			claimed[w][fp] = struct{}{}
		}
		placement[c.ID] = w
	}

	// Materialize waves, sorting change IDs within each wave for stable output.
	p.Waves = make([][]string, len(claimed))
	for id, w := range placement {
		p.Waves[w] = append(p.Waves[w], id)
	}
	for w := range p.Waves {
		sort.Strings(p.Waves[w])
	}

	return p
}

// firstFreeWave returns the index of the lowest wave in which none of the given
// footprints are already claimed. If no existing wave fits, it returns
// len(claimed) (signaling a new wave is needed). A change with no footprints
// always fits the first wave (or wave 0 if none exist yet).
func firstFreeWave(claimed []map[string]struct{}, footprints []string) int {
	if len(footprints) == 0 {
		if len(claimed) == 0 {
			return 0
		}
		return 0
	}
	for w := range claimed {
		if !conflicts(claimed[w], footprints) {
			return w
		}
	}
	return len(claimed)
}

// conflicts reports whether any footprint is already present in the claimed set.
func conflicts(claimed map[string]struct{}, footprints []string) bool {
	for _, fp := range footprints {
		if _, ok := claimed[fp]; ok {
			return true
		}
	}
	return false
}

// computeCollisions builds the map of footprint -> change IDs for every
// footprint touched by more than one change. These are the contention points
// that force serialization across waves.
func computeCollisions(changes []openspec.Change) map[string][]string {
	byFootprint := map[string][]string{}
	for _, c := range changes {
		for _, fp := range c.Footprints {
			byFootprint[fp] = append(byFootprint[fp], c.ID)
		}
	}
	collisions := map[string][]string{}
	for fp, ids := range byFootprint {
		if len(ids) > 1 {
			sort.Strings(ids)
			collisions[fp] = ids
		}
	}
	return collisions
}
