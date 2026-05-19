package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
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
// For product track it loads feature artifacts and matches via their contributes_to
// path against the value model's component names.
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

	// Build comp name → comp ID lookup from the value model payload.
	// contributes_to paths use component names (not IDs), so we need both.
	type compInfo struct {
		id   string
		name string
	}
	var allComps []compInfo
	compByName := make(map[string]string) // lowercased name → id
	if layers, ok := vmPayload["layers"].([]any); ok {
		for _, lAny := range layers {
			lm, ok := lAny.(map[string]any)
			if !ok {
				continue
			}
			if rawComps, ok := lm["components"].([]any); ok {
				for _, cAny := range rawComps {
					cm, ok := cAny.(map[string]any)
					if !ok {
						continue
					}
					id, _ := cm["id"].(string)
					name, _ := cm["name"].(string)
					if id == "" {
						continue
					}
					allComps = append(allComps, compInfo{id: id, name: name})
					compByName[strings.ToLower(name)] = id
				}
			}
		}
	}
	if len(allComps) == 0 {
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
		dName := r.Name
		if dName == "" {
			dName = r.ArtifactKey
		}

		tier := 0
		var p map[string]any
		if json.Unmarshal([]byte(r.Payload), &p) == nil {
			if mat, ok := p["maturity"].(map[string]any); ok {
				if t, ok := mat["current_tier"].(float64); ok {
					tier = int(t)
				}
			}
		}

		d := ui.VMComponentDefinition{
			Key:     r.ArtifactKey,
			Name:    dName,
			Status:  r.Status,
			Tier:    tier,
			ViewURL: viewURLFn(r.ArtifactKey),
		}

		// Extract contributes_to paths.
		var paths []string
		if p != nil {
			if ct, ok := p["contributes_to"].([]any); ok {
				for _, v := range ct {
					if sv, ok := v.(string); ok {
						paths = append(paths, sv)
					}
				}
			}
		}

		for _, path := range paths {
			parts := strings.SplitN(path, ".", 3)
			if len(parts) < 2 {
				continue
			}
			compNameRaw := parts[1]
			compID, ok := compByName[strings.ToLower(compNameRaw)]
			if !ok {
				continue
			}
			placeKey := r.ArtifactKey + "|" + compID
			if placed[placeKey] {
				continue
			}
			placed[placeKey] = true
			result[compID] = append(result[compID], d)
		}
	}

	return result
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
