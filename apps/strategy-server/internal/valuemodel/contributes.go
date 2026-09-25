package valuemodel

// ContributesTo reads a definition's contributes_to paths from both locations
// the EPF schemas put them in.
//
// Features nest the list under strategic_context; strategy, org_ops and
// commercial definitions place it at the top level. There is no single correct
// location to normalise to — both are canonical for their artifact type.
//
// This lives here, beside the resolver that consumes it, because it previously
// lived in the one caller that needed it. When a second caller appeared the
// obvious move was a second reader, and a second reader is how the first one's
// blind spot survived: reading only the top level made every feature contribute
// nothing, and the product track placed nothing against its value models with
// no error anywhere. One authority per fact.
func ContributesTo(payload map[string]any) []string {
	if payload == nil {
		return nil
	}
	lists := []any{payload["contributes_to"]}
	if sc, ok := payload["strategic_context"].(map[string]any); ok {
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

// Active reports whether a component is in use by this instance.
//
// Value models for the strategy, org_ops and commercial tracks are canonical
// and shared across projects, so they describe every component such a track
// could have rather than the ones this project uses. On the emergent instance
// that is 53 components carrying 135 contributes_to paths, none of them active.
// Counting them makes coverage meaningless — a report over all 73 product
// components measures a catalogue, not a strategy.
func (c Component) Active() bool { return c.active }
