package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
)

// valueModelContent builds the bespoke ValueModelContent component of a
// value_model payload. ctx and instanceID are needed to load definitions per
// component.
func (s *Server) valueModelContent(ctx context.Context, instanceID, track string, navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	// track is the DB artifact track column (e.g. "strategy", "org_ops", "orgops", "product", "commercial").
	// vmTrackDefConfig normalizes "orgops" → "org_ops" internally.
	defsByComp := s.loadVMDefinitionsByComponent(ctx, instanceID, track, payload)
	return ui.ValueModelContent(valueModelData(navCtx, artifactKey, name, status, payload, defsByComp))
}

// valueModelData extracts the view data from a value_model payload.
//
// The page never drops stored content. Whatever the readers below do not show, as
// listed in valueModelShownPaths, is handed to the generic renderer under a notice
// (data.Unshown). That covers the free-form high_level_model, which the schema
// leaves to the product, and any property a later canonical release adds.
func valueModelData(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any, defsByComp map[string][]ui.VMComponentDefinition) ui.ValueModelViewData {
	data := ui.ValueModelViewData{
		NavContext:      navCtx,
		ArtifactKey:     artifactKey,
		Name:            name,
		Status:          status,
		TrackName:       tolStr(payload, "track_name"),
		Description:     tolStr(payload, "description"),
		Version:         tolStr(payload, "version"),
		LastUpdated:     tolStr(payload, "last_updated"),
		PackagedDefault: payload["packaged_default"] == true,
		ActivationNotes: tolStr(payload, "activation_notes"),
	}
	if ms := tolStr(payload, "status"); ms != status {
		data.ModelStatus = ms
	}

	if hlm := tolMap(payload, "high_level_model"); hlm != nil {
		data.ProductMission = tolStr(hlm, "product_mission")
		data.MainGoal = tolStr(hlm, "main_goal")
		data.ProductGoals = tolStrs(hlm, "product_goals")
	}
	data.Records = readRecords(payload, valueModelRecordSpecs)

	for _, lm := range tolItems(payload["layers"], "name") {
		layer := ui.ValueModelLayer{
			ID:            tolStr(lm, "id"),
			PathSegment:   tolStr(lm, "path_segment"),
			Name:          tolStr(lm, "name"),
			Description:   tolStr(lm, "description"),
			ActiveLabel:   activeLabel(lm),
			Maturity:      maturitySummaryFacts(tolMap(lm, "maturity_summary"), "l2_distribution"),
			SolutionSteps: readSolutionSteps(lm["solution_steps"]),
		}
		for _, cm := range tolItems(lm["components"], "name") {
			compID := tolStr(cm, "id")
			comp := ui.ValueModelComponent{
				ID:          compID,
				PathSegment: tolStr(cm, "path_segment"),
				Name:        tolStr(cm, "name"),
				Description: tolStr(cm, "description"),
				Active:      payloadBool(cm, "active"),
				Maturity:    maturitySummaryFacts(tolMap(cm, "maturity_summary"), "l3_distribution"),
				Definitions: defsByComp[compID],
			}
			// L3 sub-components are written under either key, and both can occur
			// in one component. The shared parser reads both.
			for _, key := range vmSubKeys {
				comp.SubComponents = append(comp.SubComponents, extractValueModelSubs(cm, key)...)
			}
			layer.Components = append(layer.Components, comp)
		}
		data.Layers = append(data.Layers, layer)
	}

	data.Unshown = valueModelUnshown(payload)
	return data
}

// vmSubKeys are the two keys a component's sub-components are written under.
var vmSubKeys = []string{"sub_components", "subs"}

// valueModelUnshown returns the stored content the page has no dedicated view for.
func valueModelUnshown(payload map[string]any) map[string]any {
	return unshownContent(payload, valueModelShownPaths)
}

// activeLabel says whether a layer is marked active. A layer need not carry the
// flag: the schema does not define it, the canonical templates do.
func activeLabel(m map[string]any) string {
	active, ok := m["active"].(bool)
	switch {
	case !ok:
		return ""
	case active:
		return "active"
	}
	return "inactive"
}

func readSolutionSteps(v any) []ui.VMSolutionStep {
	var out []ui.VMSolutionStep
	for _, sm := range tolItems(v, "step") {
		st := ui.VMSolutionStep{Step: tolStr(sm, "step"), Outcome: tolStr(sm, "outcome")}
		if st != (ui.VMSolutionStep{}) {
			out = append(out, st)
		}
	}
	return out
}

// maturitySummaryFacts reads a layer's or component's maturity summary: the
// calculated stage, whether it is overridden, and how many of the level below sit
// at each stage.
func maturitySummaryFacts(ms map[string]any, distKey string) []ui.RecordFact {
	if ms == nil {
		return nil
	}
	var out []ui.RecordFact
	add := func(label, v string) {
		if v != "" {
			out = append(out, ui.RecordFact{Label: label, Value: v})
		}
	}
	add("Calculated stage", tolStr(ms, "calculated_stage"))
	add("Stage override", tolStr(ms, "stage_override"))
	dist := tolMap(ms, distKey)
	for _, stage := range vmStages {
		add(stage.label, tolStr(dist, stage.key))
	}
	return out
}

var vmStages = []struct{ key, label string }{
	{"hypothetical", "Hypothetical"}, {"emerging", "Emerging"}, {"proven", "Proven"}, {"scaled", "Scaled"},
}

// loadVMDefinitionsByComponent loads definitions/features for a value model and
// returns a map of component ID → []VMComponentDefinition, using contributes_to
// paths to assign definitions to components.
//
// For canonical tracks (strategy, org_ops, commercial) it loads *_def artifacts.
// For product track it loads feature artifacts and matches via their
// contributes_to path against the value model, using internal/valuemodel — see
// that package for why the match is not a map lookup.
func (s *Server) loadVMDefinitionsByComponent(
	ctx context.Context,
	instanceID, track string,
	vmPayload map[string]any,
) map[string][]ui.VMComponentDefinition {
	// Resolve artifact type and URL builder from track.
	dbType, viewURLFn := vmTrackDefConfig(instanceID, track)
	if dbType == "" {
		return nil
	}

	// The value model itself, parsed once, so each definition's contributes_to
	// paths can be resolved against it.
	model := valuemodel.ParseModel(vmPayload)
	if len(model.Layers) == 0 {
		return nil
	}

	// Load definitions from DB.
	var rows []struct {
		ArtifactKey string `bun:"artifact_key"`
		Name        string `bun:"name"`
		Status      string `bun:"status"`
		Payload     string `bun:"payload"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, name, status, payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", dbType).
		OrderExpr("name ASC").
		Scan(ctx, &rows)

	result := make(map[string][]ui.VMComponentDefinition)
	placed := make(map[string]bool) // "defKey|compID" dedup

	for _, r := range rows {
		d, paths := buildVMComponentDefinition(r.ArtifactKey, r.Name, r.Status, r.Payload, viewURLFn)
		placeVMDefinition(result, placed, d, paths, model)
	}

	return result
}

// buildVMComponentDefinition constructs a VMComponentDefinition from a definition
// row and returns it along with the contributes_to paths parsed from its payload.
func buildVMComponentDefinition(artifactKey, name, status, payloadStr string, viewURLFn func(string) string) (ui.VMComponentDefinition, []string) {
	dName := name
	if dName == "" {
		dName = artifactKey
	}

	tier := 0
	var p map[string]any
	if json.Unmarshal([]byte(payloadStr), &p) == nil {
		if mat, ok := p["maturity"].(map[string]any); ok {
			if t, ok := mat["current_tier"].(float64); ok {
				tier = int(t)
			}
		}
	}

	d := ui.VMComponentDefinition{
		Key:     artifactKey,
		Name:    dName,
		Status:  status,
		Tier:    tier,
		ViewURL: viewURLFn(artifactKey),
	}

	return d, valuemodel.ContributesTo(p)
}

// placeVMDefinition assigns a definition to each component its contributes_to
// paths resolve to, deduplicating via the placed set.
//
// A path that does not resolve is skipped and logged rather than dropped
// silently: it means a mechanism claims to serve a value generator that does
// not exist, which is a real defect in the instance and invisible if the only
// symptom is an empty component.
func placeVMDefinition(
	result map[string][]ui.VMComponentDefinition,
	placed map[string]bool,
	d ui.VMComponentDefinition,
	paths []string,
	model valuemodel.Model,
) {
	for _, path := range paths {
		match, err := model.Resolve(path)
		if err != nil {
			slog.Debug("value model: contributes_to path does not resolve",
				"definition", d.Key, "path", path, "error", err.Error())
			continue
		}
		placeKey := d.Key + "|" + match.ComponentID
		if placed[placeKey] {
			continue
		}
		placed[placeKey] = true
		result[match.ComponentID] = append(result[match.ComponentID], d)
	}
}

// vmTrackDefConfig returns the artifact type and a URL builder function for
// definitions belonging to the given track on the given instance.
func vmTrackDefConfig(instanceID, track string) (dbType string, viewURL func(key string) string) {
	base := "/strategies/" + instanceID
	// Normalize track — value_model artifacts use "orgops" (no underscore),
	// while definition artifacts use "org_ops" (with underscore).
	switch track {
	case "strategy":
		return "strategy_def", func(key string) string {
			return fmt.Sprintf("%s/fire/definitions/%s", base, key)
		}
	case "org_ops", "orgops":
		return "org_ops_def", func(key string) string {
			return fmt.Sprintf("%s/fire/definitions/%s", base, key)
		}
	case "commercial":
		return "commercial_def", func(key string) string {
			return fmt.Sprintf("%s/fire/definitions/%s", base, key)
		}
	case "product":
		return "feature", func(key string) string {
			return fmt.Sprintf("%s/fire/features/%s", base, key)
		}
	}
	return "", nil
}

// extractValueModelSubs extracts a slice of ValueModelSub from a parent map key.
// The maturity is a stage written as a string, or the schema's object with the
// stage, an override flag, the milestone reached and the evidence behind it.
func extractValueModelSubs(parent map[string]any, key string) []ui.ValueModelSub {
	var out []ui.ValueModelSub
	for _, sm := range tolItems(parent[key], "name") {
		sub := ui.ValueModelSub{
			ID:          tolStr(sm, "id"),
			PathSegment: tolStr(sm, "path_segment"),
			Name:        tolStr(sm, "name"),
			Description: tolStr(sm, "description"),
			UVP:         tolStr(sm, "uvp"),
			Active:      payloadBool(sm, "active"),
			Premium:     payloadBool(sm, "premium"),
		}
		switch mat := sm["maturity"].(type) {
		case map[string]any:
			sub.Maturity = tolStr(mat, "stage")
			for _, f := range []recordField{
				{"stage_override", "Stage override"}, {"milestone_achieved", "Milestone"}, {"milestone_notes", "Milestone notes"},
			} {
				if v := tolStr(mat, f.key); v != "" {
					sub.MaturityFacts = append(sub.MaturityFacts, ui.RecordFact{Label: f.label, Value: v})
				}
			}
			for _, em := range tolItems(mat["evidence"], "description") {
				if line := evidenceLine(em); line != "" {
					sub.Evidence = append(sub.Evidence, line)
				}
			}
		default:
			sub.Maturity = tolText(mat)
		}
		if sub.ID != "" || sub.PathSegment != "" || sub.Name != "" || sub.Description != "" || sub.UVP != "" || sub.Maturity != "" ||
			len(sub.MaturityFacts) > 0 || len(sub.Evidence) > 0 {
			out = append(out, sub)
		}
	}
	return out
}

// evidenceLine is one piece of maturity evidence as a line: its type and
// description, then where and when it comes from.
func evidenceLine(em map[string]any) string {
	var line string
	if t := tolStr(em, "type"); t != "" {
		line = t
	}
	if d := tolStr(em, "description"); d != "" {
		if line != "" {
			line += ": "
		}
		line += d
	}
	var origin []string
	for _, k := range []string{"source", "date"} {
		if v := tolStr(em, k); v != "" {
			origin = append(origin, v)
		}
	}
	if len(origin) > 0 {
		if line != "" {
			line += " "
		}
		line += "(" + strings.Join(origin, ", ") + ")"
	}
	return line
}

// ── record sections ──

// valueModelRecordSpecs are the sections of the value model whose entries share
// one card: the track's maturity.
var valueModelRecordSpecs = []recordSpec{
	{kind: ui.VMKindTrackMaturity, path: []string{"track_maturity"}, single: true,
		facts: []recordField{{"overall_stage", "Overall stage"}, {"stage_override", "Stage override"},
			{"value_domain", "Value domain"}, {"current_milestone", "Current milestone"}}},
	{kind: ui.VMKindNextMilestone, path: []string{"track_maturity", "next_milestone_criteria"}, head: "description",
		facts: []recordField{{"status", "Status"}}},
	{kind: ui.VMKindDistribution, path: []string{"track_maturity", "l1_distribution"}, single: true,
		facts: []recordField{{"hypothetical", "Hypothetical"}, {"emerging", "Emerging"}, {"proven", "Proven"}, {"scaled", "Scaled"}}},
}

// ── shown paths ──

// valueModelShownPaths lists every payload path the page renders. See
// unshownContent for the syntax. Anything not listed reaches the page through the
// generic fallback, so this list must hold only what the readers really show:
// TestValueModelViewShowsEveryFieldOfTheSchema renders a payload built from the
// embedded schema and checks that each field is on the page.
var valueModelShownPaths = buildValueModelShownPaths()

func buildValueModelShownPaths() []string {
	var paths []string
	add := func(p ...string) { paths = append(paths, p...) }

	add("track_name", "version", "status", "description", "last_updated", "packaged_default", "activation_notes")
	add("high_level_model.product_mission", "high_level_model.main_goal", "high_level_model.product_goals")
	add(recordPaths(valueModelRecordSpecs)...)

	dist := func(base string) {
		for _, stage := range vmStages {
			add(base + "." + stage.key)
		}
	}
	add(entryPaths("layers", "id", "path_segment", "name", "description", "active", "maturity_summary.calculated_stage", "maturity_summary.stage_override")...)
	add(entryPaths("layers.*.solution_steps", "step", "outcome")...)
	dist("layers.*.maturity_summary.l2_distribution")
	add(entryPaths("layers.*.components", "id", "path_segment", "name", "description", "active",
		"maturity_summary.calculated_stage", "maturity_summary.stage_override")...)
	dist("layers.*.components.*.maturity_summary.l3_distribution")
	for _, key := range vmSubKeys {
		base := "layers.*.components.*." + key
		add(entryPaths(base, "id", "path_segment", "name", "description", "uvp", "active", "premium", "maturity",
			"maturity.stage", "maturity.stage_override", "maturity.milestone_achieved", "maturity.milestone_notes")...)
		add(entryPaths(base+".*.maturity.evidence", "type", "description", "date", "source")...)
	}
	return paths
}
