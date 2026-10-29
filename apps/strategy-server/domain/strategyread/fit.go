package strategyread

// JSONSize is the number of characters of v serialised as JSON.
func JSONSize(v any) int { return sizeOf(v) }

// FitPrefix returns how many leading rows fit in budget characters when
// serialised together as a JSON array. A row is never cut. It returns at least
// one for a non-empty slice, so a caller that pages always makes progress even
// when its budget is smaller than a single row.
func FitPrefix[T any](rows []T, budget int) int {
	used := 2
	for i, r := range rows {
		n := sizeOf(r)
		if i > 0 {
			n++
		}
		if i > 0 && used+n > budget {
			return i
		}
		used += n
	}
	return len(rows)
}

// CapStrings keeps at most maxItems strings, each cut to maxLen characters with
// a trailing ellipsis when it was longer, and says how many it dropped. The
// input is not modified.
func CapStrings(in []string, maxItems, maxLen int) (out []string, omitted int) {
	if len(in) > maxItems {
		omitted = len(in) - maxItems
		in = in[:maxItems]
	}
	out = make([]string, len(in))
	for i, s := range in {
		if r := []rune(s); len(r) > maxLen {
			s = string(r[:maxLen-1]) + "…"
		}
		out[i] = s
	}
	return out, omitted
}
