package navigation

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// LoadFile loads a navigation graph from a YAML file.
func LoadFile(path string) (*Graph, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read navigation graph: %w", err)
	}
	return Load(data)
}

// Load parses a navigation graph from YAML bytes.
func Load(data []byte) (*Graph, error) {
	var g Graph
	if err := yaml.Unmarshal(data, &g); err != nil {
		return nil, fmt.Errorf("parse navigation graph: %w", err)
	}
	return &g, nil
}

// ContextByID returns the context with the given ID, or nil if not found.
func (g *Graph) ContextByID(id string) *Context {
	for i := range g.Contexts {
		if g.Contexts[i].ID == id {
			return &g.Contexts[i]
		}
	}
	return nil
}

// GuardByID returns the guard with the given ID, or nil if not found.
func (g *Graph) GuardByID(id string) *Guard {
	for i := range g.Guards {
		if g.Guards[i].ID == id {
			return &g.Guards[i]
		}
	}
	return nil
}

// GroupByID returns the group with the given ID, or nil if not found.
func (g *Graph) GroupByID(id string) *Group {
	for i := range g.Groups {
		if g.Groups[i].ID == id {
			return &g.Groups[i]
		}
	}
	return nil
}

// TransitionsFrom returns all transitions originating from the given context ID.
func (g *Graph) TransitionsFrom(contextID string) []Transition {
	var result []Transition
	for _, t := range g.Transitions {
		if t.From == contextID {
			result = append(result, t)
		}
	}
	return result
}

// TransitionsTo returns all transitions targeting the given context ID.
func (g *Graph) TransitionsTo(contextID string) []Transition {
	var result []Transition
	for _, t := range g.Transitions {
		if t.To == contextID {
			result = append(result, t)
		}
	}
	return result
}
