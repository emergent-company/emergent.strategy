package ui

import "testing"

// formatWait exists because a review can run for days, while formatDuration
// tops out at minutes. A gate parked for three months rendering as "131400m"
// would hide exactly the signal this display was added to surface.
func TestFormatWait(t *testing.T) {
	tests := []struct {
		name string
		sec  float64
		want string
	}{
		{"seconds", 45, "45s"},
		{"exactly a minute", 60, "1m"},
		{"minutes", 25 * 60, "25m"},
		{"exactly an hour", 3600, "1h"},
		{"hours and minutes", 3600 + 30*60, "1h 30m"},
		{"just under a day", 23*3600 + 59*60, "23h 59m"},
		{"exactly a day", 86400, "1d"},
		{"days and hours", 86400 + 6*3600, "1d 6h"},
		{"the run parked since June", 91 * 86400, "91d"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := formatWait(tc.sec); got != tc.want {
				t.Errorf("formatWait(%v) = %q, want %q", tc.sec, got, tc.want)
			}
		})
	}
}
