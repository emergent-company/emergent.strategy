package strategy_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// The canonical strategy, commercial and org_ops value models write their L3
// sub-components under "subs"; the product models in the same instance may use
// "sub_components", and one model can use both. Alignment must see either spelling,
// or a component with "subs" looks childless and is switched off along with its layer.
func TestAlignPortfolio_ReadsSubComponentsWrittenAsSubs(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe",
		buildRoadmapWithKRTarget("commercial", "l1-revenue.l2-recurring.l3-metering", ""))

	vm := map[string]any{"track_name": "commercial", "layers": []any{map[string]any{
		"id": "l1-revenue", "name": "l1-revenue", "active": true,
		"components": []any{
			map[string]any{"id": "l2-recurring", "name": "l2-recurring", "active": true, "subs": []any{
				map[string]any{"id": "l3-metering", "name": "l3-metering", "active": true},
				map[string]any{"id": "l3-billing", "name": "l3-billing", "active": false},
			}},
			map[string]any{"id": "l2-licensing", "name": "l2-licensing", "active": false, "sub_components": []any{
				map[string]any{"id": "l3-royalties", "name": "l3-royalties", "active": false},
			}},
		},
	}}}
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.commercial", vm)

	if _, err := svc.AlignPortfolio(ctx, instID); err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}

	raw, err := svc.GetCurrentArtifact(ctx, instID, "value_model.commercial")
	if err != nil {
		t.Fatalf("GetCurrentArtifact: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	layer := got["layers"].([]any)[0].(map[string]any)
	recurring := layer["components"].([]any)[0].(map[string]any)
	licensing := layer["components"].([]any)[1].(map[string]any)

	if active, _ := layer["active"].(bool); !active {
		t.Error("the layer was switched off although a sub-component under it is targeted")
	}
	if active, _ := recurring["active"].(bool); !active {
		t.Error("a component whose sub-components are written as \"subs\" was switched off although one is targeted")
	}
	subs, _ := recurring["subs"].([]any)
	if len(subs) != 2 {
		t.Fatalf("subs = %v, want both sub-components kept under \"subs\"", recurring["subs"])
	}
	if active, _ := subs[0].(map[string]any)["active"].(bool); !active {
		t.Error("the targeted sub-component must be active")
	}
	if v, present := recurring["sub_components"]; present {
		t.Errorf("alignment added sub_components=%v to a component that wrote its children as \"subs\"", v)
	}
	if _, present := licensing["subs"]; present {
		t.Error("alignment added \"subs\" to a component that wrote its children as \"sub_components\"")
	}
	if l3, _ := licensing["sub_components"].([]any); len(l3) != 1 {
		t.Errorf("sub_components = %v, want the one sub-component kept", licensing["sub_components"])
	}
}

// An earlier version wrote "sub_components": null into every component of a model
// that spells its children "subs". The null fails the schema (an array is
// expected), and nothing else removes it, so alignment does.
func TestAlignPortfolio_RemovesTheNullSubComponentsAnEarlierRunWrote(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe",
		buildRoadmapWithKRTarget("commercial", "l1-revenue.l2-recurring.l3-metering", ""))
	vm := map[string]any{"track_name": "commercial", "layers": []any{map[string]any{
		"id": "l1-revenue", "name": "l1-revenue", "active": true,
		"components": []any{
			map[string]any{"id": "l2-recurring", "name": "l2-recurring", "active": true, "sub_components": nil, "subs": []any{
				map[string]any{"id": "l3-metering", "name": "l3-metering", "active": true},
			}},
			map[string]any{"id": "l2-licensing", "name": "l2-licensing", "active": false, "sub_components": nil},
		},
	}}}
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.commercial", vm)

	if _, err := svc.AlignPortfolio(ctx, instID); err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}
	raw, err := svc.GetCurrentArtifact(ctx, instID, "value_model.commercial")
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	for _, cv := range got["layers"].([]any)[0].(map[string]any)["components"].([]any) {
		c := cv.(map[string]any)
		if v, present := c["sub_components"]; present {
			t.Errorf("%v still has sub_components=%v", c["id"], v)
		}
	}
	recurring := got["layers"].([]any)[0].(map[string]any)["components"].([]any)[0].(map[string]any)
	if subs, _ := recurring["subs"].([]any); len(subs) != 1 {
		t.Errorf("subs = %v, want the one sub-component kept", recurring["subs"])
	}
}
