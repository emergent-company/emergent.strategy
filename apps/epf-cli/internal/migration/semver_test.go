package migration

import (
	"testing"
)

func TestParseVersion(t *testing.T) {
	tests := []struct {
		input   string
		major   int
		minor   int
		patch   int
		wantErr bool
	}{
		{"1.0.0", 1, 0, 0, false},
		{"2.12.3", 2, 12, 3, false},
		{"2.1.0", 2, 1, 0, false},
		{"1.13.0", 1, 13, 0, false},
		{"v2.5.0", 2, 5, 0, false},  // leading v
		{"0.10.0", 0, 10, 0, false}, // CLI version style
		{"2.12", 2, 12, 0, false},   // two-part version
		{"", 0, 0, 0, true},         // empty
		{"unknown", 0, 0, 0, true},  // unknown
		{"abc", 0, 0, 0, true},      // garbage
		{"1.2.3.4", 0, 0, 0, true},  // too many parts
		{"a.b.c", 0, 0, 0, true},    // non-numeric
	}

	for _, tt := range tests {
		v, err := ParseVersion(tt.input)
		if tt.wantErr {
			if err == nil {
				t.Errorf("ParseVersion(%q): expected error, got nil", tt.input)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseVersion(%q): unexpected error: %v", tt.input, err)
			continue
		}
		if v.Major != tt.major || v.Minor != tt.minor || v.Patch != tt.patch {
			t.Errorf("ParseVersion(%q): got %d.%d.%d, want %d.%d.%d",
				tt.input, v.Major, v.Minor, v.Patch, tt.major, tt.minor, tt.patch)
		}
	}
}

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		a, b     string
		expected int
		wantErr  bool
	}{
		// Equal
		{"1.0.0", "1.0.0", 0, false},
		{"2.12.3", "2.12.3", 0, false},

		// a < b (upgrade)
		{"1.0.0", "2.0.0", -1, false},  // major upgrade
		{"1.0.0", "1.1.0", -1, false},  // minor upgrade
		{"1.0.0", "1.0.1", -1, false},  // patch upgrade
		{"2.1.0", "2.12.0", -1, false}, // THE BUG: 2.1.0 < 2.12.0 numerically
		{"1.9.0", "1.13.0", -1, false}, // 9 < 13
		{"1.13.0", "2.1.0", -1, false}, // major bump

		// a > b (downgrade)
		{"2.0.0", "1.0.0", 1, false},  // major downgrade
		{"2.12.0", "2.1.0", 1, false}, // THE BUG SCENARIO: 2.12.0 > 2.1.0
		{"1.13.0", "1.9.0", 1, false}, // 13 > 9
		{"1.0.1", "1.0.0", 1, false},  // patch downgrade

		// Errors
		{"", "1.0.0", 0, true},
		{"1.0.0", "unknown", 0, true},
	}

	for _, tt := range tests {
		result, err := CompareVersions(tt.a, tt.b)
		if tt.wantErr {
			if err == nil {
				t.Errorf("CompareVersions(%q, %q): expected error, got nil", tt.a, tt.b)
			}
			continue
		}
		if err != nil {
			t.Errorf("CompareVersions(%q, %q): unexpected error: %v", tt.a, tt.b, err)
			continue
		}
		if result != tt.expected {
			t.Errorf("CompareVersions(%q, %q): got %d, want %d", tt.a, tt.b, result, tt.expected)
		}
	}
}

func TestIsUpgrade(t *testing.T) {
	tests := []struct {
		from, to string
		expected bool
	}{
		{"1.0.0", "2.0.0", true},  // major upgrade
		{"2.1.0", "2.12.0", true}, // THE KEY TEST: 2.1.0 -> 2.12.0 is upgrade
		{"1.8.0", "1.13.0", true}, // minor upgrade
		{"1.0.0", "1.0.1", true},  // patch upgrade

		{"2.0.0", "1.0.0", false},  // downgrade
		{"2.12.0", "2.1.0", false}, // THE KEY TEST: 2.12.0 -> 2.1.0 is NOT upgrade
		{"1.0.0", "1.0.0", false},  // same version is not upgrade
		{"", "1.0.0", false},       // invalid from
		{"1.0.0", "", false},       // invalid to
	}

	for _, tt := range tests {
		result := IsUpgrade(tt.from, tt.to)
		if result != tt.expected {
			t.Errorf("IsUpgrade(%q, %q): got %v, want %v", tt.from, tt.to, result, tt.expected)
		}
	}
}

func TestIsDowngrade(t *testing.T) {
	tests := []struct {
		from, to string
		expected bool
	}{
		{"2.12.0", "2.1.0", true}, // THE BUG: this IS a downgrade
		{"2.0.0", "1.0.0", true},  // major downgrade
		{"1.13.0", "1.9.0", true}, // minor downgrade

		{"1.0.0", "2.0.0", false},  // upgrade, not downgrade
		{"1.0.0", "1.0.0", false},  // same version
		{"2.1.0", "2.12.0", false}, // upgrade, not downgrade
	}

	for _, tt := range tests {
		result := IsDowngrade(tt.from, tt.to)
		if result != tt.expected {
			t.Errorf("IsDowngrade(%q, %q): got %v, want %v", tt.from, tt.to, result, tt.expected)
		}
	}
}
