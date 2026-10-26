package strategy

import "testing"

func TestWorkPackageExportPaths(t *testing.T) {
	if dir := artifactTypeToDirPath("work_package"); dir != "work_packages" {
		t.Errorf("dir = %q, want work_packages", dir)
	}

	cases := []struct {
		key  string
		want string
	}{
		{"wp-001", "wp-001.yaml"},
		{"work_package:wp-042", "wp-042.yaml"},
		{"wp-001.yaml", "wp-001.yaml"}, // already has extension
	}
	for _, c := range cases {
		if got := artifactKeyToFilename("work_package", c.key); got != c.want {
			t.Errorf("artifactKeyToFilename(work_package, %q) = %q, want %q", c.key, got, c.want)
		}
	}
}

func TestArtifactExportRelPath(t *testing.T) {
	cases := []struct {
		artifactType string
		artifactKey  string
		want         string
	}{
		{"feature", "fd-035_business_directory", "FIRE/definitions/product/fd-035_business_directory.yaml"},
		{"commercial_def", "FIRE/definitions/commercial/financing/cd-010-investor-pitch-decks", "FIRE/definitions/commercial/financing/cd-010-investor-pitch-decks.yaml"},
		{"org_ops_def", "FIRE/definitions/org_ops/culture-communications/pd-037-investor-updates", "FIRE/definitions/org_ops/culture-communications/pd-037-investor-updates.yaml"},
		{"strategy_def", "FIRE/definitions/strategy/context/sd-001-trends-and-opportunities", "FIRE/definitions/strategy/context/sd-001-trends-and-opportunities.yaml"},
		{"commercial_def", "cd-010-investor-pitch-decks", "FIRE/definitions/commercial/cd-010-investor-pitch-decks.yaml"},
		{"artifact", "READY/06_product_portfolio", "READY/06_product_portfolio.yaml"},
		{"artifact", "FIRE/workflows/board_meeting_decision.config", "FIRE/workflows/board_meeting_decision.config.yaml"},
		{"living_reality_assessment", "AIM/living_reality_assessment", "AIM/living_reality_assessment.yaml"},
		{"value_model", "value_model_product.value_model", "FIRE/value_models/product.value_model.yaml"},
		{"value_model", "product.value_model", "FIRE/value_models/product.value_model.yaml"},
		{"mappings", "mappings", "FIRE/mappings.yaml"},
		{"north_star", "north_star", "READY/00_north_star.yaml"},
		{"roadmap_recipe", "roadmap_recipe", "READY/05_roadmap_recipe.yaml"},
	}
	for _, c := range cases {
		if got := artifactExportRelPath(c.artifactType, c.artifactKey); got != c.want {
			t.Errorf("artifactExportRelPath(%q, %q) = %q, want %q", c.artifactType, c.artifactKey, got, c.want)
		}
	}
}
