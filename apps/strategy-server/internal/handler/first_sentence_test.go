package handler

import "testing"

func TestFirstSentence(t *testing.T) {
	tests := []struct {
		name, in, want string
	}{
		{"empty", "  \n ", ""},
		{"wrapped block scalar", "We turn stored heat into\nuseful work. And more.\n", "We turn stored heat into useful work."},
		{"no period", "A headline that wraps\nonto a second line\n", "A headline that wraps onto a second line"},
		{"stops at blank line", "First paragraph without period\n\nSecond paragraph.", "First paragraph without period"},
		{"decimal", "Heat is stored at 1.5 times the density. More.", "Heat is stored at 1.5 times the density."},
		{"leading list number", "1. Prices are volatile.\n2. Grids are full.", "1. Prices are volatile."},
		{"sentence ending in number", "The target year is 2030. More.", "The target year is 2030."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := firstSentence(tt.in); got != tt.want {
				t.Errorf("firstSentence(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
