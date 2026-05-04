package index_test

import (
	"encoding/json"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/index"
)

// ---------------------------------------------------------------------------
// ExtractArtifactFields
// ---------------------------------------------------------------------------

func TestExtractArtifactFields_Feature(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"name":   "Knowledge Graph Engine",
		"status": "in-progress",
		"strategic_context": map[string]any{
			"tracks": []any{"product"},
		},
	})

	f := index.ExtractArtifactFields("feature", payload)
	if f.Name != "Knowledge Graph Engine" {
		t.Errorf("Name = %q, want %q", f.Name, "Knowledge Graph Engine")
	}
	if f.Status != "in-progress" {
		t.Errorf("Status = %q, want %q", f.Status, "in-progress")
	}
	if f.Track != "product" {
		t.Errorf("Track = %q, want %q", f.Track, "product")
	}
}

func TestExtractArtifactFields_FeatureDefaultStatus(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"name": "My Feature",
	})
	f := index.ExtractArtifactFields("feature", payload)
	if f.Status != "active" {
		t.Errorf("Status = %q, want %q", f.Status, "active")
	}
}

func TestExtractArtifactFields_NorthStar(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"north_star": map[string]any{
			"organization": "Emergent",
		},
	})
	f := index.ExtractArtifactFields("north_star", payload)
	if f.Name != "Emergent" {
		t.Errorf("Name = %q, want %q", f.Name, "Emergent")
	}
}

func TestExtractArtifactFields_ValueModel(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"track_name": "Product",
		"status":     "active",
	})
	f := index.ExtractArtifactFields("value_model", payload)
	if f.Name != "Product" {
		t.Errorf("Name = %q, want %q", f.Name, "Product")
	}
	if f.Track != "product" {
		t.Errorf("Track = %q, want %q", f.Track, "product")
	}
}

func TestExtractArtifactFields_UnknownType(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"name":   "Some Thing",
		"status": "draft",
	})
	f := index.ExtractArtifactFields("unknown_type", payload)
	if f.Name != "Some Thing" {
		t.Errorf("Name = %q, want %q", f.Name, "Some Thing")
	}
	if f.Status != "draft" {
		t.Errorf("Status = %q, want %q", f.Status, "draft")
	}
}

func TestExtractArtifactFields_InvalidJSON(t *testing.T) {
	f := index.ExtractArtifactFields("feature", []byte("not-json"))
	if f.Status != "active" {
		t.Errorf("Status = %q, want %q", f.Status, "active")
	}
}

// ---------------------------------------------------------------------------
// ExtractRelationships — feature
// ---------------------------------------------------------------------------

func TestExtractRelationships_Feature_ContributesTo(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"strategic_context": map[string]any{
			"contributes_to": []any{
				"Product.MemoryReasoningEngine.KnowledgeGraph",
				"Product.MemoryReasoningEngine.DocumentIngestion",
			},
		},
	})

	rels := index.ExtractRelationships("feature", "fd-001", payload)
	got := relsByKind(rels, "contributes_to")
	if len(got) != 2 {
		t.Fatalf("contributes_to count = %d, want 2", len(got))
	}
	if got[0].TargetKey != "Product.MemoryReasoningEngine.KnowledgeGraph" {
		t.Errorf("TargetKey = %q", got[0].TargetKey)
	}
	if got[0].TargetType != "value_model_path" {
		t.Errorf("TargetType = %q", got[0].TargetType)
	}
}

func TestExtractRelationships_Feature_TestsAssumption(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"strategic_context": map[string]any{
			"assumptions_tested": []any{"asm-p-001", "asm-p-002"},
		},
	})

	rels := index.ExtractRelationships("feature", "fd-001", payload)
	got := relsByKind(rels, "tests_assumption")
	if len(got) != 2 {
		t.Fatalf("tests_assumption count = %d, want 2", len(got))
	}
	if got[0].TargetType != "assumption" {
		t.Errorf("TargetType = %q, want assumption", got[0].TargetType)
	}
}

func TestExtractRelationships_Feature_InTrack(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"strategic_context": map[string]any{
			"tracks": []any{"product", "strategy"},
		},
	})

	rels := index.ExtractRelationships("feature", "fd-001", payload)
	got := relsByKind(rels, "in_track")
	if len(got) != 2 {
		t.Fatalf("in_track count = %d, want 2", len(got))
	}
}

func TestExtractRelationships_Feature_Dependencies(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"dependencies": map[string]any{
			"requires": []any{
				map[string]any{"id": "fd-003", "reason": "needs auth"},
			},
			"enables": []any{
				map[string]any{"id": "fd-007", "reason": "unlocks integrations"},
			},
		},
	})

	rels := index.ExtractRelationships("feature", "fd-001", payload)

	deps := relsByKind(rels, "depends_on")
	if len(deps) != 1 || deps[0].TargetKey != "fd-003" {
		t.Errorf("depends_on: got %+v", deps)
	}

	enables := relsByKind(rels, "enables")
	if len(enables) != 1 || enables[0].TargetKey != "fd-007" {
		t.Errorf("enables: got %+v", enables)
	}
}

func TestExtractRelationships_Feature_DeliveredByKR(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"feature_maturity": map[string]any{
			"capability_maturity": []any{
				map[string]any{
					"capability_id":   "cap-001",
					"delivered_by_kr": "kr-p-018",
				},
				map[string]any{
					"capability_id":   "cap-002",
					"delivered_by_kr": "",
				},
			},
		},
	})

	rels := index.ExtractRelationships("feature", "fd-001", payload)
	got := relsByKind(rels, "delivered_by_kr")
	if len(got) != 1 {
		t.Fatalf("delivered_by_kr count = %d, want 1 (empty kr skipped)", len(got))
	}
	if got[0].TargetKey != "kr-p-018" {
		t.Errorf("TargetKey = %q, want kr-p-018", got[0].TargetKey)
	}
}

func TestExtractRelationships_Feature_AllCombined(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"strategic_context": map[string]any{
			"contributes_to":     []any{"Product.X.Y"},
			"assumptions_tested": []any{"asm-p-001"},
			"tracks":             []any{"product"},
		},
		"dependencies": map[string]any{
			"requires": []any{map[string]any{"id": "fd-003", "reason": "core dep"}},
		},
		"feature_maturity": map[string]any{
			"capability_maturity": []any{
				map[string]any{"capability_id": "cap-001", "delivered_by_kr": "kr-p-001"},
			},
		},
	})

	rels := index.ExtractRelationships("feature", "fd-001", payload)
	if len(rels) != 5 {
		t.Errorf("total relationships = %d, want 5: contributes_to, tests_assumption, in_track, depends_on, delivered_by_kr", len(rels))
		for _, r := range rels {
			t.Logf("  %s -> %s (%s)", r.Relationship, r.TargetKey, r.TargetType)
		}
	}
}

// ---------------------------------------------------------------------------
// ExtractArtifactFields — strategy_def
// ---------------------------------------------------------------------------

func TestExtractArtifactFields_StrategyDef(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"id":     "sd-005",
		"name":   "Strengths And Weaknesses",
		"track":  "strategy",
		"status": "draft",
	})

	f := index.ExtractArtifactFields("strategy_def", payload)
	if f.Name != "Strengths And Weaknesses" {
		t.Errorf("Name = %q, want %q", f.Name, "Strengths And Weaknesses")
	}
	if f.Status != "draft" {
		t.Errorf("Status = %q, want %q", f.Status, "draft")
	}
	if f.Track != "strategy" {
		t.Errorf("Track = %q, want %q", f.Track, "strategy")
	}
}

func TestExtractArtifactFields_StrategyDefDefaultStatus(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"name": "Market Trends",
	})
	f := index.ExtractArtifactFields("strategy_def", payload)
	if f.Status != "active" {
		t.Errorf("Status = %q, want %q", f.Status, "active")
	}
	if f.Track != "strategy" {
		t.Errorf("Track = %q, want %q", f.Track, "strategy")
	}
}

// ---------------------------------------------------------------------------
// ExtractRelationships — org_ops_def / commercial_def
// ---------------------------------------------------------------------------

func TestExtractRelationships_OrgOpsDef(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"contributes_to": []any{"OrgOps.TalentManagement.Hiring"},
	})

	rels := index.ExtractRelationships("org_ops_def", "pd-001", payload)
	if len(rels) != 1 || rels[0].Relationship != "contributes_to" {
		t.Errorf("org_ops_def relationships: %+v", rels)
	}
}

func TestExtractRelationships_CommercialDef(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"contributes_to": []any{"Commercial.Sales.Pipeline", "Commercial.Marketing.Brand"},
	})

	rels := index.ExtractRelationships("commercial_def", "cd-010", payload)
	if len(rels) != 2 {
		t.Errorf("commercial_def relationship count = %d, want 2", len(rels))
	}
}

func TestExtractRelationships_StrategyDef(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"contributes_to": []any{"Strategy.Competitor Analysis.strengths-and-weaknesses"},
	})

	rels := index.ExtractRelationships("strategy_def", "FIRE/definitions/strategy/context/sd-005", payload)
	if len(rels) != 1 {
		t.Fatalf("strategy_def relationship count = %d, want 1", len(rels))
	}
	if rels[0].Relationship != "contributes_to" {
		t.Errorf("Relationship = %q, want contributes_to", rels[0].Relationship)
	}
	if rels[0].TargetType != "value_model_path" {
		t.Errorf("TargetType = %q, want value_model_path", rels[0].TargetType)
	}
}

func TestExtractRelationships_StrategyDefNoContributes(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"name": "Some Strategy Def",
	})

	rels := index.ExtractRelationships("strategy_def", "FIRE/definitions/strategy/context/sd-001", payload)
	if len(rels) != 0 {
		t.Errorf("expected 0 relationships, got %d", len(rels))
	}
}

// ---------------------------------------------------------------------------
// ExtractRelationships — roadmap
// ---------------------------------------------------------------------------

func TestExtractRelationships_Roadmap_CrossTrackDeps(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"roadmap": map[string]any{
			"cross_track_dependencies": []any{
				map[string]any{
					"from_kr":         "kr-p-001",
					"to_kr":           "kr-s-002",
					"dependency_type": "requires",
				},
			},
		},
	})

	rels := index.ExtractRelationships("roadmap", "roadmap_recipe", payload)
	got := relsByKind(rels, "cross_track_dep")
	if len(got) != 1 {
		t.Fatalf("cross_track_dep count = %d, want 1", len(got))
	}
	if got[0].TargetKey != "kr-s-002" {
		t.Errorf("TargetKey = %q, want kr-s-002", got[0].TargetKey)
	}
}

func TestExtractRelationships_Roadmap_AssumptionLinkedToKR(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"roadmap": map[string]any{
			"tracks": map[string]any{
				"product": map[string]any{
					"okrs": []any{
						map[string]any{
							"id": "okr-p-001",
							"riskiest_assumptions": []any{
								map[string]any{
									"id":           "asm-p-001",
									"linked_to_kr": []any{"kr-p-001", "kr-p-002"},
								},
							},
						},
					},
				},
			},
		},
	})

	rels := index.ExtractRelationships("roadmap", "roadmap_recipe", payload)
	got := relsByKind(rels, "linked_to_kr")
	if len(got) != 2 {
		t.Fatalf("linked_to_kr count = %d, want 2", len(got))
	}
}

// ---------------------------------------------------------------------------
// ExtractRelationships — portfolio
// ---------------------------------------------------------------------------

func TestExtractRelationships_Portfolio(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"portfolio": map[string]any{
			"product_lines": []any{
				map[string]any{
					"id":              "pl-emergent-memory",
					"value_model_ref": "FIRE/value_models/product.emergent-memory.value_model.yaml",
				},
				map[string]any{
					"id":              "pl-diane",
					"value_model_ref": "FIRE/value_models/product.diane.value_model.yaml",
				},
			},
		},
	})

	rels := index.ExtractRelationships("product_portfolio", "product_portfolio", payload)
	got := relsByKind(rels, "uses_value_model")
	if len(got) != 2 {
		t.Fatalf("uses_value_model count = %d, want 2", len(got))
	}
}

// ---------------------------------------------------------------------------
// ExtractRelationships — assessment report
// ---------------------------------------------------------------------------

func TestExtractRelationships_AssessmentReport(t *testing.T) {
	payload := mustMarshal(map[string]any{
		"okr_assessments": []any{
			map[string]any{
				"okr_id": "okr-p-001",
				"key_result_outcomes": []any{
					map[string]any{"kr_id": "kr-p-001"},
					map[string]any{"kr_id": "kr-p-002"},
				},
			},
		},
		"assumption_validations": []any{
			map[string]any{"id": "asm-p-001", "status": "validated"},
		},
	})

	rels := index.ExtractRelationships("assessment_report", "assessment_report", payload)

	okrRels := relsByKind(rels, "assesses_okr")
	if len(okrRels) != 1 {
		t.Errorf("assesses_okr count = %d, want 1", len(okrRels))
	}
	krRels := relsByKind(rels, "assesses_kr")
	if len(krRels) != 2 {
		t.Errorf("assesses_kr count = %d, want 2", len(krRels))
	}
	asmRels := relsByKind(rels, "validates_assumption")
	if len(asmRels) != 1 {
		t.Errorf("validates_assumption count = %d, want 1", len(asmRels))
	}
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

func TestExtractRelationships_EmptyPayload(t *testing.T) {
	rels := index.ExtractRelationships("feature", "fd-001", []byte(`{}`))
	if len(rels) != 0 {
		t.Errorf("expected 0 relationships for empty payload, got %d", len(rels))
	}
}

func TestExtractRelationships_InvalidJSON(t *testing.T) {
	rels := index.ExtractRelationships("feature", "fd-001", []byte("not-json"))
	if rels != nil {
		t.Errorf("expected nil for invalid JSON, got %+v", rels)
	}
}

func TestExtractRelationships_UnknownType(t *testing.T) {
	payload := mustMarshal(map[string]any{"contributes_to": []any{"X.Y.Z"}})
	rels := index.ExtractRelationships("totally_unknown", "key", payload)
	if len(rels) != 0 {
		t.Errorf("expected 0 relationships for unknown type, got %d", len(rels))
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func mustMarshal(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

func relsByKind(rels []index.Relationship, kind string) []index.Relationship {
	var result []index.Relationship
	for _, r := range rels {
		if r.Relationship == kind {
			result = append(result, r)
		}
	}
	return result
}
