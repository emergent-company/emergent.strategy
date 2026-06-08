// Package score produces a per-change strategic scorecard by interrogating
// strategy-server over MCP. It is the grounded equivalent of a "CEO review":
// instead of reasoning about strategy in a vacuum, each dimension is answered
// from the live strategy graph.
//
// Three principles govern this package, drawn directly from the design:
//
//  1. Preserve dimensionality. Each dimension is scored independently and
//     carries its own evidence. The scorecard NEVER collapses the dimensions
//     into a single accept/reject verdict — conflicting signals are the whole
//     point, and they are surfaced for a human to resolve.
//
//  2. Advisory only. The scorecard recommends attention; it never decides.
//     Weighting (in the weight subpackage) drives review ORDER, not outcomes.
//
//  3. Degrade gracefully. Any dimension whose backing tool is unavailable is
//     marked Unavailable rather than failing the whole scorecard. A partial
//     scorecard is still useful, and the deterministic wave plan is never
//     blocked by strategy-server being down.
package score

import "github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/openspec"

// Dimension identifies one strategic check.
type Dimension string

const (
	// Traceability: do the change's footprints map to live value paths?
	Traceability Dimension = "traceability"
	// Contradiction: does the change conflict with existing strategy?
	Contradiction Dimension = "contradiction"
	// Maturity: does the change target validated (vs hypothetical) capability?
	Maturity Dimension = "maturity"
	// Scope: adjacency signal — neighboring capabilities (the GStack "10-star"
	// move, reported as evidence, never as a faked-precision score).
	Scope Dimension = "scope"
	// Sequencing: does the change's timing fit the roadmap / KR windows?
	Sequencing Dimension = "sequencing"
)

// AllDimensions is the canonical ordered set of dimensions.
var AllDimensions = []Dimension{Traceability, Contradiction, Maturity, Scope, Sequencing}

// Level is a coarse, comparable score for a dimension. It is intentionally
// coarse: the scorecard's value is legibility and surfaced tension, not false
// precision. Unavailable is distinct from a low score — it means "not measured".
type Level int

const (
	// Unavailable: the dimension could not be measured (tool missing/unreachable).
	Unavailable Level = iota
	// Weak: the dimension is a concern for this change.
	Weak
	// Mixed: partial / ambiguous signal.
	Mixed
	// Strong: the dimension is clearly favorable.
	Strong
	// Signal: used for Scope — adjacency evidence exists, interpretation is the
	// human's. Not better or worse than Strong; a different KIND of result.
	Signal
)

func (l Level) String() string {
	switch l {
	case Weak:
		return "weak"
	case Mixed:
		return "mixed"
	case Strong:
		return "strong"
	case Signal:
		return "signal"
	default:
		return "unavailable"
	}
}

// Measured reports whether the dimension was actually evaluated.
func (l Level) Measured() bool { return l != Unavailable }

// DimensionResult is the outcome for a single dimension on a single change.
type DimensionResult struct {
	Dimension Dimension `json:"dimension"`
	Level     Level     `json:"-"`
	// LevelName is the string form of Level, for JSON consumers.
	LevelName string `json:"level"`
	// Summary is a one-line human-readable conclusion.
	Summary string `json:"summary"`
	// Evidence lists the concrete facts behind the score (cited from strategy).
	Evidence []string `json:"evidence,omitempty"`
}

// Card is the full strategic scorecard for one change. It deliberately has no
// single "score" or "ready" field — that omission is the design.
type Card struct {
	ChangeID   string            `json:"change_id"`
	Dimensions []DimensionResult `json:"dimensions"`
	// Tensions are conflicts between strong signals, named for human attention.
	Tensions []Tension `json:"tensions,omitempty"`
}

// Tension is a named conflict between dimensions that a human must resolve.
type Tension struct {
	Between []Dimension `json:"between"`
	Note    string      `json:"note"`
}

// Get returns the result for a dimension, or a zero (Unavailable) result.
func (c Card) Get(d Dimension) DimensionResult {
	for _, r := range c.Dimensions {
		if r.Dimension == d {
			return r
		}
	}
	return DimensionResult{Dimension: d, Level: Unavailable, LevelName: Unavailable.String()}
}

// MeasuredCount returns how many dimensions were actually evaluated.
func (c Card) MeasuredCount() int {
	n := 0
	for _, r := range c.Dimensions {
		if r.Level.Measured() {
			n++
		}
	}
	return n
}

// Scorer interrogates strategy for a single change. Implementations wrap the MCP
// client; tests provide stubs. Each method returns Unavailable on a tool error
// rather than failing, so the scorecard degrades per-dimension.
type Scorer interface {
	Traceability(c openspec.Change) DimensionResult
	Contradiction(c openspec.Change) DimensionResult
	Maturity(c openspec.Change) DimensionResult
	Scope(c openspec.Change) DimensionResult
	Sequencing(c openspec.Change) DimensionResult
}

// Build assembles a Card for a change by running every dimension scorer, then
// detecting tensions between the results. It performs no I/O itself — all
// strategy queries happen inside the Scorer.
func Build(c openspec.Change, s Scorer) Card {
	results := []DimensionResult{
		normalize(s.Traceability(c), Traceability),
		normalize(s.Contradiction(c), Contradiction),
		normalize(s.Maturity(c), Maturity),
		normalize(s.Scope(c), Scope),
		normalize(s.Sequencing(c), Sequencing),
	}
	card := Card{ChangeID: c.ID, Dimensions: results}
	card.Tensions = detectTensions(card)
	return card
}

// normalize fills in the dimension and the LevelName string, defaulting to the
// expected dimension if the scorer left it blank.
func normalize(r DimensionResult, d Dimension) DimensionResult {
	if r.Dimension == "" {
		r.Dimension = d
	}
	r.LevelName = r.Level.String()
	return r
}

// detectTensions finds conflicts that warrant human attention. The canonical
// case: strong strategic fit (traceability) on UNVALIDATED ground (weak
// maturity) — a "validate-while-building" bet only a human should take. Also: a
// strong/clear change that nonetheless contradicts existing strategy.
func detectTensions(c Card) []Tension {
	var tensions []Tension

	trace := c.Get(Traceability)
	maturity := c.Get(Maturity)
	contradiction := c.Get(Contradiction)
	scope := c.Get(Scope)

	if trace.Level == Strong && maturity.Level == Weak {
		tensions = append(tensions, Tension{
			Between: []Dimension{Traceability, Maturity},
			Note:    "high strategic fit but targets unvalidated capability — a validate-while-building bet; human call",
		})
	}
	if trace.Level == Strong && contradiction.Level == Weak {
		tensions = append(tensions, Tension{
			Between: []Dimension{Traceability, Contradiction},
			Note:    "traces cleanly to strategy yet conflicts with existing strategy — reconcile before building",
		})
	}
	if scope.Level == Signal && trace.Level == Strong {
		tensions = append(tensions, Tension{
			Between: []Dimension{Scope, Traceability},
			Note:    "well-scoped change sits on a richer value path — possible under-serving; expand-or-hold is a human call",
		})
	}

	return tensions
}
