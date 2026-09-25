// Package valuemodel resolves contributes_to paths against a value model.
//
// A contributes_to path is the edge from a mechanism (a feature or definition
// artifact) to the value generator it serves. It is the only link between FIRE
// definitions and the value-generating architecture, so anything reasoning
// about whether work serves the strategy depends on it resolving.
//
// It did not resolve. The previous implementation read the LAYER segment of a
// path and looked it up in a map keyed by COMPONENT names, so it matched
// essentially nothing, and every value model page showed no definitions placed
// against any component. Measured against the emergent-epf instance: 189
// contributes_to paths, none placed.
//
// Two things make this harder than a map lookup, and both are properties of
// real instance data rather than hypotheticals:
//
//  1. Segments are written in any of three forms — path_segment, id, or name —
//     so "FeedbackPerformance", "feedback-performance" and "Feedback &
//     Performance" all denote one component.
//
//  2. A three-segment path has two possible readings. Product writes
//     Track.Layer.Component ("Product.MemoryReasoningEngine.KnowledgeGraph");
//     OrgOps and Commercial omit the layer and write Track.Component.Sub
//     ("OrgOps.Feedback & Performance.performance-reviews"). Shape alone cannot
//     tell them apart, so both readings are attempted.
//
// Where both readings resolve, that is reported as an ambiguity rather than
// silently preferring one. A path that could mean two things is a defect in the
// data, and guessing would place a definition against a component nobody chose.
package valuemodel

import (
	"fmt"
	"strings"
)

// Sub is an L3 sub-component.
type Sub struct {
	ID          string
	Name        string
	PathSegment string
}

// Component is an L2 component.
type Component struct {
	ID          string
	Name        string
	PathSegment string
	Subs        []Sub
}

// Layer is an L1 layer.
type Layer struct {
	ID          string
	Name        string
	PathSegment string
	Components  []Component
}

// Model is one track's value model.
type Model struct {
	Track  string
	Layers []Layer
}

// Match is a resolved path.
type Match struct {
	// ComponentID is the L2 component the path lands on, which is what a
	// definition is placed against. Always set on a successful match.
	ComponentID string
	LayerID     string
	// SubID is set only when the path named an L3 sub-component.
	SubID string
}

// normalize reduces a segment to its comparable form. Instances write the same
// component as "FeedbackPerformance", "feedback-performance" and "Feedback &
// Performance"; all three must compare equal.
func normalize(s string) string {
	s = strings.ToLower(s)
	for _, ch := range []string{"-", "_", " ", "&", "/", "(", ")", ","} {
		s = strings.ReplaceAll(s, ch, "")
	}
	return s
}

// denotes reports whether search names this entity by path_segment, id or name.
func denotes(search, pathSegment, id, name string) bool {
	n := normalize(search)
	if n == "" {
		return false
	}
	for _, candidate := range []string{pathSegment, id, name} {
		if candidate != "" && normalize(candidate) == n {
			return true
		}
	}
	return false
}

// Resolve maps a contributes_to path onto a component of this model.
//
// Accepted forms, after the track segment:
//
//	Layer.Component            e.g. Product.MemoryReasoningEngine.KnowledgeGraph
//	Component.Sub              e.g. OrgOps.Feedback & Performance.performance-reviews
//	Layer.Component.Sub        the explicit four-segment form
//	Component                  a two-segment path naming a component directly
//
// The track segment is verified against the model's track when both are
// present, so a Commercial path cannot be resolved against the Product model.
func (m Model) Resolve(path string) (Match, error) {
	parts := strings.Split(strings.TrimSpace(path), ".")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	if len(parts) < 2 || parts[0] == "" {
		return Match{}, fmt.Errorf("value model path %q needs at least a track and one segment", path)
	}
	if m.Track != "" && normalize(parts[0]) != normalize(m.Track) {
		return Match{}, fmt.Errorf("value model path %q is not in track %q", path, m.Track)
	}
	rest := parts[1:]

	switch len(rest) {
	case 1:
		return m.matchComponent(path, rest[0], "")
	case 2:
		// Ambiguous by shape: Layer.Component or Component.Sub. Try both, and
		// refuse rather than guess if both land.
		viaLayer, layerErr := m.matchLayerComponent(path, rest[0], rest[1])
		viaSub, subErr := m.matchComponent(path, rest[0], rest[1])
		switch {
		case layerErr == nil && subErr == nil:
			if viaLayer.ComponentID == viaSub.ComponentID {
				return viaLayer, nil
			}
			return Match{}, fmt.Errorf(
				"value model path %q is ambiguous: reads as layer %q component %q, and as component %q sub %q",
				path, viaLayer.LayerID, viaLayer.ComponentID, viaSub.ComponentID, viaSub.SubID)
		case layerErr == nil:
			return viaLayer, nil
		case subErr == nil:
			return viaSub, nil
		default:
			return Match{}, fmt.Errorf("value model path %q resolves to no component: %w", path, layerErr)
		}
	default:
		// Three or more: Layer.Component.Sub. Extra segments are ignored rather
		// than failing — a deeper path still identifies the component, which is
		// what a definition is placed against.
		layer, comp, ok := m.findInLayer(rest[0], rest[1])
		if !ok {
			return Match{}, fmt.Errorf("value model path %q names no layer %q with component %q", path, rest[0], rest[1])
		}
		match := Match{LayerID: layer.ID, ComponentID: comp.ID}
		for _, s := range comp.Subs {
			if denotes(rest[2], s.PathSegment, s.ID, s.Name) {
				match.SubID = s.ID
				break
			}
		}
		return match, nil
	}
}

// matchLayerComponent resolves Layer.Component.
func (m Model) matchLayerComponent(path, layerSeg, compSeg string) (Match, error) {
	layer, comp, ok := m.findInLayer(layerSeg, compSeg)
	if !ok {
		return Match{}, fmt.Errorf("no layer %q with component %q", layerSeg, compSeg)
	}
	return Match{LayerID: layer.ID, ComponentID: comp.ID}, nil
}

// matchComponent resolves a component anywhere in the model, optionally with a
// sub-component. subSeg may be empty.
func (m Model) matchComponent(path, compSeg, subSeg string) (Match, error) {
	for _, layer := range m.Layers {
		for _, comp := range layer.Components {
			if !denotes(compSeg, comp.PathSegment, comp.ID, comp.Name) {
				continue
			}
			if subSeg == "" {
				return Match{LayerID: layer.ID, ComponentID: comp.ID}, nil
			}
			for _, s := range comp.Subs {
				if denotes(subSeg, s.PathSegment, s.ID, s.Name) {
					return Match{LayerID: layer.ID, ComponentID: comp.ID, SubID: s.ID}, nil
				}
			}
		}
	}
	if subSeg == "" {
		return Match{}, fmt.Errorf("no component %q", compSeg)
	}
	return Match{}, fmt.Errorf("no component %q with sub-component %q", compSeg, subSeg)
}

// findInLayer locates a layer and one of its components.
func (m Model) findInLayer(layerSeg, compSeg string) (Layer, Component, bool) {
	for _, layer := range m.Layers {
		if !denotes(layerSeg, layer.PathSegment, layer.ID, layer.Name) {
			continue
		}
		for _, comp := range layer.Components {
			if denotes(compSeg, comp.PathSegment, comp.ID, comp.Name) {
				return layer, comp, true
			}
		}
	}
	return Layer{}, Component{}, false
}
