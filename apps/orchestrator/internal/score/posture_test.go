package score

import "testing"

func cardWith(id string, levels map[Dimension]Level, tensions int) Card {
	var dims []DimensionResult
	for _, d := range AllDimensions {
		dims = append(dims, DimensionResult{Dimension: d, Level: levels[d], LevelName: levels[d].String()})
	}
	c := Card{ChangeID: id, Dimensions: dims}
	for i := 0; i < tensions; i++ {
		c.Tensions = append(c.Tensions, Tension{Between: []Dimension{Traceability, Maturity}, Note: "t"})
	}
	return c
}

func TestRankAlignedCardNeedsLeastAttention(t *testing.T) {
	allStrong := map[Dimension]Level{
		Traceability: Strong, Contradiction: Strong, Maturity: Strong, Scope: Strong, Sequencing: Strong,
	}
	allWeak := map[Dimension]Level{
		Traceability: Weak, Contradiction: Weak, Maturity: Weak, Scope: Weak, Sequencing: Weak,
	}
	cards := []Card{cardWith("aligned", allStrong, 0), cardWith("concerning", allWeak, 0)}

	ranked := Rank(cards, PostureBalanced)
	if ranked[0].Card.ChangeID != "concerning" {
		t.Fatalf("expected concerning change first (most attention), got %s", ranked[0].Card.ChangeID)
	}
	if ranked[len(ranked)-1].Card.ChangeID != "aligned" {
		t.Fatalf("expected aligned change last, got %s", ranked[len(ranked)-1].Card.ChangeID)
	}
	if ranked[0].Attention <= ranked[1].Attention {
		t.Fatal("attention scores should be strictly ordered here")
	}
}

func TestRankTensionRaisesAttention(t *testing.T) {
	levels := map[Dimension]Level{
		Traceability: Strong, Contradiction: Strong, Maturity: Strong, Scope: Strong, Sequencing: Strong,
	}
	cards := []Card{
		cardWith("calm", levels, 0),
		cardWith("contested", levels, 1), // identical except a tension
	}
	ranked := Rank(cards, PostureBalanced)
	if ranked[0].Card.ChangeID != "contested" {
		t.Fatalf("a tension should raise attention above an otherwise-identical card; got order %s, %s",
			ranked[0].Card.ChangeID, ranked[1].Card.ChangeID)
	}
}

func TestPostureChangesOrdering(t *testing.T) {
	// changeA: weak Scope only. changeB: weak Maturity only.
	a := cardWith("a", map[Dimension]Level{
		Traceability: Strong, Contradiction: Strong, Maturity: Strong, Scope: Weak, Sequencing: Strong,
	}, 0)
	b := cardWith("b", map[Dimension]Level{
		Traceability: Strong, Contradiction: Strong, Maturity: Weak, Scope: Strong, Sequencing: Strong,
	}, 0)
	cards := []Card{a, b}

	// venture-early up-weights Scope → a (weak scope) needs more attention.
	early := Rank(cards, PostureVentureEarly)
	if early[0].Card.ChangeID != "a" {
		t.Errorf("venture-early should surface weak-scope change first, got %s", early[0].Card.ChangeID)
	}

	// scaling up-weights Maturity → b (weak maturity) needs more attention.
	scaling := Rank(cards, PostureScaling)
	if scaling[0].Card.ChangeID != "b" {
		t.Errorf("scaling should surface weak-maturity change first, got %s", scaling[0].Card.ChangeID)
	}
}

func TestRankIsDeterministic(t *testing.T) {
	levels := map[Dimension]Level{Traceability: Mixed, Contradiction: Mixed, Maturity: Mixed, Scope: Mixed, Sequencing: Mixed}
	cards := []Card{cardWith("x", levels, 0), cardWith("y", levels, 0), cardWith("z", levels, 0)}
	first := Rank(cards, PostureBalanced)
	for i := 0; i < 5; i++ {
		got := Rank(cards, PostureBalanced)
		for j := range first {
			if got[j].Card.ChangeID != first[j].Card.ChangeID {
				t.Fatal("ranking is not deterministic for tied scores")
			}
		}
	}
}
