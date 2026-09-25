package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
)

// valueModelContent extracts rich data from a value_model payload
// and returns a bespoke ValueModelContent component.
// ctx and instanceID are needed to load definitions per component.
func (s *Server) valueModelContent(ctx context.Context, instanceID, track string, navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data := ui.ValueModelViewData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		TrackName:   payloadStr(payload, "track_name"),
		Description: payloadStr(payload, "description"),
		Version:     payloadStr(payload, "version"),
		LastUpdated: payloadStr(payload, "last_updated"),
	}

	// ── High-Level Model ──
	if hlm, ok := payload["high_level_model"].(map[string]any); ok {
		data.ProductMission = payloadStr(hlm, "product_mission")
		data.MainGoal = payloadStr(hlm, "main_goal")
		data.ProductGoals = payloadStrSlice(hlm, "product_goals")
	}

	// ── Load definitions per component ──
	// track is the DB artifact track column (e.g. "strategy", "org_ops", "orgops", "product", "commercial").
	// vmTrackDefConfig normalizes "orgops" → "org_ops" internally.
	defsByComp := s.loadVMDefinitionsByComponent(ctx, instanceID, track, payload)

	// ── Layers ──
	if layers, ok := payload["layers"].([]any); ok {
		for _, item := range layers {
			lm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			layer := ui.ValueModelLayer{
				ID:          payloadStr(lm, "id"),
				Name:        payloadStr(lm, "name"),
				Description: payloadStr(lm, "description"),
			}

			if components, ok := lm["components"].([]any); ok {
				for _, cItem := range components {
					cm, ok := cItem.(map[string]any)
					if !ok {
						continue
					}
					compID := payloadStr(cm, "id")
					comp := ui.ValueModelComponent{
						ID:          compID,
						Name:        payloadStr(cm, "name"),
						Description: payloadStr(cm, "description"),
						Active:      payloadBool(cm, "active"),
						Definitions: defsByComp[compID],
					}

					// Sub-components can be under "sub_components" or "subs".
					subs := extractValueModelSubs(cm, "sub_components")
					if len(subs) == 0 {
						subs = extractValueModelSubs(cm, "subs")
					}
					comp.SubComponents = subs

					layer.Components = append(layer.Components, comp)
				}
			}

			data.Layers = append(data.Layers, layer)
		}
	}

	return ui.ValueModelContent(data)
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

	return d, contributesTo(p)
}

// contributesTo reads a definition's contributes_to paths from both locations
// the EPF schemas put them in.
//
// Features nest the list under strategic_context; strategy, org_ops and
// commercial definitions place it at the top level. Reading only the top level
// meant every feature contributed no paths at all, so the entire product track
// placed nothing — a value model rendered as untouched work when in fact 63
// paths pointed into it. The failure is silent by construction: an empty
// component looks the same whether nothing claims it or nothing was read.
func contributesTo(p map[string]any) []string {
	if p == nil {
		return nil
	}
	lists := []any{p["contributes_to"]}
	if sc, ok := p["strategic_context"].(map[string]any); ok {
		lists = append(lists, sc["contributes_to"])
	}

	var paths []string
	for _, raw := range lists {
		for _, v := range slice(raw) {
			if sv, ok := v.(string); ok && sv != "" {
				paths = append(paths, sv)
			}
		}
	}
	return paths
}

func slice(v any) []any {
	s, _ := v.([]any)
	return s
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
func extractValueModelSubs(parent map[string]any, key string) []ui.ValueModelSub {
	arr, ok := parent[key].([]any)
	if !ok {
		return nil
	}
	var out []ui.ValueModelSub
	for _, item := range arr {
		sm, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.ValueModelSub{
			ID:          payloadStr(sm, "id"),
			Name:        payloadStr(sm, "name"),
			Description: payloadStr(sm, "description"),
			Active:      payloadBool(sm, "active"),
			Maturity:    payloadStr(sm, "maturity"),
		})
	}
	return out
}
