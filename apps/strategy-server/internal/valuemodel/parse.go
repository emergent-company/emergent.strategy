package valuemodel

// ParseModel builds a Model from a value_model artifact payload.
//
// The payload arrives as a decoded JSON map from strategy_artifacts rather than
// as a typed struct, so every field is read defensively: a malformed or partial
// value model yields a Model with whatever resolved, never a panic.
func ParseModel(payload map[string]any) Model {
	m := Model{Track: str(payload["track_name"])}
	for _, rawLayer := range slice(payload["layers"]) {
		lm, ok := rawLayer.(map[string]any)
		if !ok {
			continue
		}
		layer := Layer{
			ID:          str(lm["id"]),
			Name:        str(lm["name"]),
			PathSegment: str(lm["path_segment"]),
		}
		for _, rawComp := range slice(lm["components"]) {
			cm, ok := rawComp.(map[string]any)
			if !ok {
				continue
			}
			comp := Component{
				ID:          str(cm["id"]),
				Name:        str(cm["name"]),
				PathSegment: str(cm["path_segment"]),
			}
			// L3 sub-components are written under either key. Both spellings
			// occur inside a single value model in the emergent instance
			// (product.epf-runtime uses sub_components for five components and
			// subs for nine), so this is not a per-file dialect that could be
			// normalised at the boundary. Reading only one key silently halves
			// that model's L3 surface, and the symptom — a Component.Sub path
			// reported as naming nothing — accuses the data of a defect that
			// belongs to the parser.
			for _, key := range []string{"subs", "sub_components"} {
				for _, rawSub := range slice(cm[key]) {
					sm, ok := rawSub.(map[string]any)
					if !ok {
						continue
					}
					comp.Subs = append(comp.Subs, Sub{
						ID:          str(sm["id"]),
						Name:        str(sm["name"]),
						PathSegment: str(sm["path_segment"]),
					})
				}
			}
			layer.Components = append(layer.Components, comp)
		}
		m.Layers = append(m.Layers, layer)
	}
	return m
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func slice(v any) []any {
	s, _ := v.([]any)
	return s
}
