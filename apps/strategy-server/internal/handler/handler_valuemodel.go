package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// valueModelContent extracts rich data from a value_model payload
// and returns a bespoke ValueModelContent component.
func (s *Server) valueModelContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
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
					comp := ui.ValueModelComponent{
						ID:          payloadStr(cm, "id"),
						Name:        payloadStr(cm, "name"),
						Description: payloadStr(cm, "description"),
						Active:      payloadBool(cm, "active"),
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
