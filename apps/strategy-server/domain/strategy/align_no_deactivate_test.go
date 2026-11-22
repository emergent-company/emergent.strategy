package strategy_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// epf-canonical's align-portfolio skill: "Activate only what the roadmap
// targets ... Leave everything the roadmap does not target untouched." The
// active flags of a track model are authored (an organisation activates what it
// needs), and a Key Result that does not target a component says nothing about it.
func TestAlignPortfolio_LeavesAuthoredActiveFlagsAloneAndNeverDeactivates(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe",
		buildRoadmapWithKRTarget("commercial", "l1-revenue.l2-recurring.l3-metering", ""))

	vm := map[string]any{"track_name": "commercial", "layers": []any{
		map[string]any{"id": "l1-revenue", "name": "l1-revenue", "active": true, "components": []any{
			map[string]any{"id": "l2-recurring", "name": "l2-recurring", "active": true, "subs": []any{
				map[string]any{"id": "l3-metering", "name": "l3-metering", "active": false},
				map[string]any{"id": "l3-billing", "name": "l3-billing", "active": true, "activation_notes": "Chosen by the team"},
			}},
			map[string]any{"id": "l2-licensing", "name": "l2-licensing", "active": true, "subs": []any{
				map[string]any{"id": "l3-royalties", "name": "l3-royalties", "active": true},
			}},
		}},
		map[string]any{"id": "l1-brand", "name": "l1-brand", "active": true, "components": []any{
			map[string]any{"id": "l2-identity", "name": "l2-identity", "active": true, "sub_components": []any{
				map[string]any{"id": "l3-naming", "name": "l3-naming", "active": true},
			}},
		}},
	}}
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.commercial", vm)

	res, err := svc.AlignPortfolio(ctx, instID)
	if err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}
	if res.TotalDeactivated != 0 {
		t.Errorf("TotalDeactivated = %d, want 0: alignment only activates", res.TotalDeactivated)
	}

	raw, err := svc.GetCurrentArtifact(ctx, instID, "value_model.commercial")
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	flags := map[string]bool{}
	var notes = map[string]any{}
	for _, lv := range got["layers"].([]any) {
		l := lv.(map[string]any)
		flags[l["id"].(string)], _ = l["active"].(bool)
		for _, cv := range l["components"].([]any) {
			c := cv.(map[string]any)
			flags[c["id"].(string)], _ = c["active"].(bool)
			for _, key := range []string{"subs", "sub_components"} {
				subs, _ := c[key].([]any)
				for _, sv := range subs {
					s := sv.(map[string]any)
					flags[s["id"].(string)], _ = s["active"].(bool)
					notes[s["id"].(string)] = s["activation_notes"]
				}
			}
		}
	}
	for id, want := range map[string]bool{
		"l3-metering": true,                                          // targeted: switched on
		"l3-billing":  true, "l3-royalties": true, "l3-naming": true, // authored active, not targeted: untouched
		"l2-recurring": true, "l2-licensing": true, "l2-identity": true,
		"l1-revenue": true, "l1-brand": true,
	} {
		if flags[id] != want {
			t.Errorf("%s active = %v, want %v", id, flags[id], want)
		}
	}
	if notes["l3-billing"] != "Chosen by the team" {
		t.Errorf("an authored activation note on an untargeted sub-component was changed: %v", notes["l3-billing"])
	}
}

// A component can be active with no active child, and a Key Result can target a
// component that has no sub-components; neither is switched off or lost.
func TestAlignPortfolio_ComponentWithoutSubComponentsStaysAndTargetActivatesIt(t *testing.T) {
	db := database.TestDB(t)
	instID, svc := seedInstance(t, db)
	ctx := audit.ContextWithSource(context.Background(), audit.SourceSystem)

	commitArtifact(t, db, instID, domain.ArtifactTypeRoadmap, "roadmap_recipe",
		buildRoadmapWithKRTarget("org_ops", "l1-people.l2-hiring", ""))
	vm := map[string]any{"track_name": "org_ops", "layers": []any{map[string]any{
		"id": "l1-people", "name": "l1-people", "active": false, "components": []any{
			map[string]any{"id": "l2-hiring", "name": "l2-hiring", "active": false},
			map[string]any{"id": "l2-payroll", "name": "l2-payroll", "active": true},
		}}}}
	commitArtifact(t, db, instID, domain.ArtifactTypeValueModel, "value_model.org_ops", vm)

	if _, err := svc.AlignPortfolio(ctx, instID); err != nil {
		t.Fatalf("AlignPortfolio: %v", err)
	}
	raw, _ := svc.GetCurrentArtifact(ctx, instID, "value_model.org_ops")
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	layer := got["layers"].([]any)[0].(map[string]any)
	comps := layer["components"].([]any)
	if a, _ := comps[0].(map[string]any)["active"].(bool); !a {
		t.Error("a component targeted by a Key Result must be active even with no sub-components")
	}
	if a, _ := comps[1].(map[string]any)["active"].(bool); !a {
		t.Error("an authored-active component with no sub-components was switched off")
	}
	if a, _ := layer["active"].(bool); !a {
		t.Error("the layer must be active when a component under it is")
	}
}
