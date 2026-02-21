package template

import (
	"testing"
)

func TestIsCanonicalTrack(t *testing.T) {
	tests := []struct {
		track    Track
		expected bool
	}{
		{TrackStrategy, true},
		{TrackOrgOps, true},
		{TrackCommercial, true},
		{TrackProduct, false},
		{Track("unknown"), false},
		{Track(""), false},
	}

	for _, tt := range tests {
		t.Run(string(tt.track), func(t *testing.T) {
			got := IsCanonicalTrack(tt.track)
			if got != tt.expected {
				t.Errorf("IsCanonicalTrack(%q) = %v, want %v", tt.track, got, tt.expected)
			}
		})
	}
}

func TestIsCanonicalTrackString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"strategy lowercase", "strategy", true},
		{"org_ops lowercase", "org_ops", true},
		{"orgops no underscore", "orgops", true},
		{"commercial lowercase", "commercial", true},
		{"product is not canonical", "product", false},
		{"Strategy mixed case", "Strategy", true},
		{"OrgOps mixed case", "OrgOps", true},
		{"Commercial mixed case", "Commercial", true},
		{"Product mixed case", "Product", false},
		{"org-ops with hyphen", "org-ops", true},
		{"empty string", "", false},
		{"unknown", "unknown", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsCanonicalTrackString(tt.input)
			if got != tt.expected {
				t.Errorf("IsCanonicalTrackString(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestIsCanonicalDefinitionID(t *testing.T) {
	tests := []struct {
		name     string
		id       string
		expected bool
	}{
		{"strategy definition", "sd-001", true},
		{"strategy multi-digit", "sd-012", true},
		{"org_ops definition", "pd-005", true},
		{"commercial definition", "cd-001", true},
		{"product definition", "fd-001", false},
		{"product multi-digit", "fd-014", false},
		{"no prefix", "001", false},
		{"no hyphen", "sd001", false},
		{"empty string", "", false},
		{"just prefix", "sd", false},
		{"unknown prefix", "xx-001", false},
		{"strategy with slug", "sd-market-001", true},
		{"commercial with slug", "cd-gtm-002", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsCanonicalDefinitionID(tt.id)
			if got != tt.expected {
				t.Errorf("IsCanonicalDefinitionID(%q) = %v, want %v", tt.id, got, tt.expected)
			}
		})
	}
}

func TestIsCanonicalArtifact(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected bool
	}{
		// Definition file prefixes
		{"strategy definition file", "FIRE/definitions/strategy/sd-001.yaml", true},
		{"org_ops definition file", "FIRE/definitions/org_ops/pd-005.yaml", true},
		{"commercial definition file", "FIRE/definitions/commercial/cd-001.yaml", true},
		{"product definition file", "FIRE/definitions/product/fd-001.yaml", false},

		// Bare filenames
		{"bare strategy definition", "sd-001.yaml", true},
		{"bare product definition", "fd-001.yaml", false},

		// Value model files
		{"strategy value model", "FIRE/value_models/strategy_value_model.yaml", true},
		{"org_ops value model", "FIRE/value_models/org_ops_value_model.yaml", true},
		{"commercial value model", "FIRE/value_models/commercial_value_model.yaml", true},
		{"product value model", "FIRE/value_models/product_value_model.yaml", false},

		// Definition directory detection
		{"file in strategy definitions dir", "definitions/strategy/some-file.yaml", true},
		{"file in org_ops definitions dir", "definitions/org_ops/some-file.yaml", true},
		{"file in commercial definitions dir", "definitions/commercial/some-file.yaml", true},
		{"file in product definitions dir", "definitions/product/some-file.yaml", false},

		// Nested paths
		{"nested strategy definition", "docs/EPF/_instances/emergent/FIRE/definitions/strategy/sd-001.yaml", true},
		{"nested product definition", "docs/EPF/_instances/emergent/FIRE/definitions/product/fd-001.yaml", false},

		// Non-definition files
		{"north star", "READY/00_north_star.yaml", false},
		{"roadmap", "READY/05_roadmap_recipe.yaml", false},
		{"generic yaml", "config.yaml", false},
		{"empty path", "", false},

		// Windows-style paths (should normalize)
		{"windows strategy definition", "READY\\definitions\\strategy\\sd-001.yaml", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsCanonicalArtifact(tt.path)
			if got != tt.expected {
				t.Errorf("IsCanonicalArtifact(%q) = %v, want %v", tt.path, got, tt.expected)
			}
		})
	}
}

func TestIsProductTrack(t *testing.T) {
	tests := []struct {
		track    Track
		expected bool
	}{
		{TrackProduct, true},
		{TrackStrategy, false},
		{TrackOrgOps, false},
		{TrackCommercial, false},
	}

	for _, tt := range tests {
		t.Run(string(tt.track), func(t *testing.T) {
			got := IsProductTrack(tt.track)
			if got != tt.expected {
				t.Errorf("IsProductTrack(%q) = %v, want %v", tt.track, got, tt.expected)
			}
		})
	}
}

func TestIsProductTrackString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"product lowercase", "product", true},
		{"Product mixed case", "Product", true},
		{"strategy is not product", "strategy", false},
		{"empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsProductTrackString(tt.input)
			if got != tt.expected {
				t.Errorf("IsProductTrackString(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestGetTrackCategory(t *testing.T) {
	tests := []struct {
		track    Track
		expected TrackCategory
	}{
		{TrackProduct, TrackCategoryProduct},
		{TrackStrategy, TrackCategoryCanonical},
		{TrackOrgOps, TrackCategoryCanonical},
		{TrackCommercial, TrackCategoryCanonical},
	}

	for _, tt := range tests {
		t.Run(string(tt.track), func(t *testing.T) {
			got := GetTrackCategory(tt.track)
			if got != tt.expected {
				t.Errorf("GetTrackCategory(%q) = %v, want %v", tt.track, got, tt.expected)
			}
		})
	}
}

func TestGetTrackCategoryString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected TrackCategory
	}{
		{"product", "product", TrackCategoryProduct},
		{"strategy", "strategy", TrackCategoryCanonical},
		{"org_ops", "org_ops", TrackCategoryCanonical},
		{"commercial", "commercial", TrackCategoryCanonical},
		{"OrgOps mixed", "OrgOps", TrackCategoryCanonical},
		{"unknown defaults to product", "unknown", TrackCategoryProduct},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetTrackCategoryString(tt.input)
			if got != tt.expected {
				t.Errorf("GetTrackCategoryString(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestClassifyValueModelPath(t *testing.T) {
	tests := []struct {
		name     string
		vmPath   string
		expected TrackCategory
	}{
		{"product path", "Product.Core.Search", TrackCategoryProduct},
		{"product discovery", "Product.Discovery.KnowledgeExploration", TrackCategoryProduct},
		{"strategy path", "Strategy.Growth.MarketExpansion", TrackCategoryCanonical},
		{"orgops path", "OrgOps.Process.Automation", TrackCategoryCanonical},
		{"commercial path", "Commercial.GTM.Positioning", TrackCategoryCanonical},
		{"empty path", "", TrackCategoryProduct},
		{"single segment unknown", "Unknown", TrackCategoryProduct},
		{"lowercase strategy", "strategy.Growth.X", TrackCategoryCanonical},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ClassifyValueModelPath(tt.vmPath)
			if got != tt.expected {
				t.Errorf("ClassifyValueModelPath(%q) = %v, want %v", tt.vmPath, got, tt.expected)
			}
		})
	}
}

// TestCanonicalConsistencyWithDefinitionType verifies that the canonical helpers
// are consistent with the existing DefinitionType system in definitions.go.
// This covers task 1.3: Verify DefinitionType constants align with new helpers.
func TestCanonicalConsistencyWithDefinitionType(t *testing.T) {
	// Verify that all tracks in idPrefixToTrack are correctly classified
	for prefix, track := range idPrefixToTrack {
		isCanonical := IsCanonicalTrack(track)
		isCanonicalPrefix := CanonicalDefinitionPrefixes[prefix]

		// For canonical tracks, the prefix should also be canonical
		if isCanonical && !isCanonicalPrefix {
			t.Errorf("Track %q is canonical but prefix %q is not in CanonicalDefinitionPrefixes", track, prefix)
		}
		// For non-canonical tracks, the prefix should not be canonical
		if !isCanonical && isCanonicalPrefix {
			t.Errorf("Track %q is not canonical but prefix %q is in CanonicalDefinitionPrefixes", track, prefix)
		}
	}

	// Verify that GetTrackDescription's DefinitionType aligns with IsCanonicalTrack
	for _, track := range AllTracks() {
		_, defType := GetTrackDescription(track)
		isCanonical := IsCanonicalTrack(track)

		if isCanonical && defType != DefinitionTypeCanonical {
			t.Errorf("Track %q is canonical but GetTrackDescription returns type %q", track, defType)
		}
		if !isCanonical && defType != DefinitionTypeExample {
			t.Errorf("Track %q is not canonical but GetTrackDescription returns type %q", track, defType)
		}
	}
}
