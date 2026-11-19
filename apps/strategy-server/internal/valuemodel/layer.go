package valuemodel

import (
	"fmt"
	"strings"
)

// ResolveLayer maps a two-segment path (Track.Layer) onto a layer of this
// model. Resolve reads such a path as a component and fails when it names a
// layer; a roadmap key result may legitimately target a whole layer, so
// callers that accept those try ResolveLayer after Resolve. The returned
// Match has only LayerID set.
func (m Model) ResolveLayer(path string) (Match, error) {
	parts := strings.Split(strings.TrimSpace(path), ".")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return Match{}, fmt.Errorf("value model path %q is not of the form Track.Layer", path)
	}
	if m.Track != "" && normalize(parts[0]) != normalize(m.Track) {
		return Match{}, fmt.Errorf("value model path %q is not in track %q", path, m.Track)
	}
	for _, l := range m.Layers {
		if denotes(parts[1], l.PathSegment, l.ID, l.Name) {
			return Match{LayerID: l.ID}, nil
		}
	}
	return Match{}, fmt.Errorf("no layer %q", parts[1])
}
