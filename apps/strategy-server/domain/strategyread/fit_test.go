package strategyread_test

import (
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

func TestFitPrefix(t *testing.T) {
	row := func(n int) map[string]string { return map[string]string{"t": strings.Repeat("x", n)} }
	each := strategyread.JSONSize(row(100)) + 1

	cases := []struct {
		name   string
		rows   int
		budget int
		want   int
	}{
		{"empty", 0, 1000, 0},
		{"all fit", 3, 3*each + 10, 3},
		{"cuts at the budget", 10, 4*each + 10, 4},
		{"never cuts a row in half", 10, 4*each - 1, 3},
		{"a budget smaller than one row still returns one so a caller always progresses", 5, 10, 1},
	}
	for _, c := range cases {
		rows := make([]map[string]string, c.rows)
		for i := range rows {
			rows[i] = row(100)
		}
		if got := strategyread.FitPrefix(rows, c.budget); got != c.want {
			t.Errorf("%s: FitPrefix = %d, want %d", c.name, got, c.want)
		}
	}
}

func TestFitPrefixCountsMultibyteCharactersAsCharacters(t *testing.T) {
	rows := []string{strings.Repeat("é", 50), strings.Repeat("é", 50), strings.Repeat("é", 50)}
	one := strategyread.JSONSize(rows[0])
	if got := strategyread.FitPrefix(rows, 2+2*one+1); got != 2 {
		t.Errorf("FitPrefix = %d, want 2: the budget is in characters, not bytes", got)
	}
}

func TestCapStrings(t *testing.T) {
	in := []string{"one", "two", strings.Repeat("y", 50), "four"}
	out, omitted := strategyread.CapStrings(in, 3, 10)
	if len(out) != 3 || omitted != 1 {
		t.Fatalf("got %d kept and %d omitted, want 3 and 1", len(out), omitted)
	}
	if out[0] != "one" {
		t.Errorf("a short string must be kept as it is, got %q", out[0])
	}
	if got := []rune(out[2]); len(got) != 10 || got[len(got)-1] != '…' {
		t.Errorf("a long string must be cut to 10 characters and end with an ellipsis, got %q", out[2])
	}
	if in[2] != strings.Repeat("y", 50) {
		t.Error("the input was modified")
	}

	short, none := strategyread.CapStrings([]string{"a"}, 3, 10)
	if len(short) != 1 || none != 0 {
		t.Errorf("under the cap: got %d kept and %d omitted", len(short), none)
	}
}
