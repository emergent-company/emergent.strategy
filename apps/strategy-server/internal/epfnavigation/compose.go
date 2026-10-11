package navigation

import (
	"fmt"
	"path/filepath"
)

// ComposedGraph is a merged graph from a root graph and its imported sub-graphs.
// It contains all contexts and transitions from all services, with IDs prefixed
// by service name, plus portal edges wired as normal transitions.
type ComposedGraph struct {
	Graph    *Graph
	Services map[string]*Graph // service name -> loaded sub-graph
}

// Compose loads all imported sub-graphs relative to basePath, validates portal
// edges, and returns a merged ComposedGraph that can be used with the runner.
func Compose(root *Graph, basePath string) (*ComposedGraph, error) {
	composed := &ComposedGraph{
		Graph:    root,
		Services: make(map[string]*Graph),
	}

	// Load imported sub-graphs.
	for _, imp := range root.Imports {
		subPath := filepath.Join(basePath, imp.Path)
		sub, err := LoadFile(subPath)
		if err != nil {
			return nil, fmt.Errorf("load import %q from %q: %w", imp.Service, subPath, err)
		}
		composed.Services[imp.Service] = sub
	}

	return composed, nil
}

// Merge creates a single flat Graph containing all contexts and transitions from
// the root graph and imported sub-graphs, with sub-graph IDs prefixed by
// "service:" to avoid collisions. Portal edges become normal transitions
// connecting the namespaced contexts.
func (cg *ComposedGraph) Merge() *Graph {
	merged := &Graph{
		Name:         cg.Graph.Name + "-composed",
		Title:        cg.Graph.Title + " (composed)",
		Description:  cg.Graph.Description,
		EntryContext: cg.Graph.EntryContext,
	}

	// Copy root contexts, transitions, guards, groups.
	merged.Contexts = append(merged.Contexts, cg.Graph.Contexts...)
	merged.Transitions = append(merged.Transitions, cg.Graph.Transitions...)
	merged.Guards = append(merged.Guards, cg.Graph.Guards...)
	merged.Groups = append(merged.Groups, cg.Graph.Groups...)
	merged.Menus = append(merged.Menus, cg.Graph.Menus...)

	// Build set of root context IDs for portal edge resolution.
	rootContexts := make(map[string]bool)
	for _, c := range cg.Graph.Contexts {
		rootContexts[c.ID] = true
	}

	// Add sub-graph contexts and transitions with service prefix.
	for service, sub := range cg.Services {
		prefix := service + ":"

		for _, c := range sub.Contexts {
			prefixed := c
			prefixed.ID = prefix + c.ID
			if c.Parent != "" {
				prefixed.Parent = prefix + c.Parent
			}
			if c.Group != "" {
				prefixed.Group = prefix + c.Group
			}
			merged.Contexts = append(merged.Contexts, prefixed)
		}

		for _, t := range sub.Transitions {
			prefixed := t
			prefixed.ID = prefix + t.ID
			prefixed.From = prefix + t.From
			prefixed.To = prefix + t.To
			if t.Guard != "" {
				prefixed.Guard = prefix + t.Guard
			}
			merged.Transitions = append(merged.Transitions, prefixed)
		}

		for _, g := range sub.Guards {
			prefixed := g
			prefixed.ID = prefix + g.ID
			if g.Fallback != "" {
				prefixed.Fallback = prefix + g.Fallback
			}
			if g.GuardGroup != "" {
				prefixed.GuardGroup = prefix + g.GuardGroup
			}
			merged.Guards = append(merged.Guards, prefixed)
		}

		for _, grp := range sub.Groups {
			prefixed := grp
			prefixed.ID = prefix + grp.ID
			if grp.VisibilityGuard != "" {
				prefixed.VisibilityGuard = prefix + grp.VisibilityGuard
			}
			merged.Groups = append(merged.Groups, prefixed)
		}
	}

	// Wire portal edges as transitions.
	for _, pe := range cg.Graph.PortalEdges {
		source := cg.resolveContextID(pe.Source)
		target := cg.resolveContextID(pe.Target)
		merged.Transitions = append(merged.Transitions, Transition{
			ID:    pe.ID,
			From:  source,
			To:    target,
			Label: pe.Label,
			Guard: pe.Guard,
		})
	}

	return merged
}

// resolveContextID resolves a portal edge context reference.
// References can be:
//   - "context-id" — local to the root graph
//   - "service:context-id" — namespaced reference to an imported sub-graph
func (cg *ComposedGraph) resolveContextID(ref string) string {
	// If already namespaced, return as-is (it's already in "service:id" form).
	for service := range cg.Services {
		if len(ref) > len(service)+1 && ref[:len(service)+1] == service+":" {
			return ref
		}
	}
	// Otherwise it's a root graph reference — return as-is.
	return ref
}

// ValidateComposition checks that portal edges reference valid contexts in either
// the root graph or imported sub-graphs.
func ValidateComposition(g *Graph, services map[string]*Graph) []ValidationError {
	var errs []ValidationError

	// Build lookup of all available contexts: root + service-prefixed.
	available := make(map[string]bool)
	for _, c := range g.Contexts {
		available[c.ID] = true
	}
	for service, sub := range services {
		for _, c := range sub.Contexts {
			available[service+":"+c.ID] = true
		}
	}

	// Build set of imported service names.
	importedServices := make(map[string]bool)
	for _, imp := range g.Imports {
		importedServices[imp.Service] = true
	}

	// Validate imports: each must have a corresponding loaded service.
	for _, imp := range g.Imports {
		if _, ok := services[imp.Service]; !ok {
			errs = append(errs, ValidationError{
				Code:    "unresolved-import",
				Message: fmt.Sprintf("import %q could not be loaded from path %q", imp.Service, imp.Path),
				Context: imp.Service,
			})
		}
	}

	// Validate portal edges.
	guardSet := make(map[string]bool)
	for _, guard := range g.Guards {
		guardSet[guard.ID] = true
	}
	for service, sub := range services {
		for _, guard := range sub.Guards {
			guardSet[service+":"+guard.ID] = true
		}
	}

	portalIDs := make(map[string]int)
	for _, pe := range g.PortalEdges {
		portalIDs[pe.ID]++

		if !available[pe.Source] {
			errs = append(errs, ValidationError{
				Code:    "unresolved-portal-source",
				Message: fmt.Sprintf("portal edge %q source %q does not reference a defined context", pe.ID, pe.Source),
				Context: pe.ID,
			})
		}

		if !available[pe.Target] {
			errs = append(errs, ValidationError{
				Code:    "unresolved-portal-target",
				Message: fmt.Sprintf("portal edge %q target %q does not reference a defined context", pe.ID, pe.Target),
				Context: pe.ID,
			})
		}

		if pe.Guard != "" && !guardSet[pe.Guard] {
			errs = append(errs, ValidationError{
				Code:    "undefined-portal-guard",
				Message: fmt.Sprintf("portal edge %q references undefined guard %q", pe.ID, pe.Guard),
				Context: pe.ID,
			})
		}
	}

	for id, count := range portalIDs {
		if count > 1 {
			errs = append(errs, ValidationError{
				Code:    "duplicate-portal-id",
				Message: fmt.Sprintf("portal edge ID %q appears %d times", id, count),
				Context: id,
			})
		}
	}

	return errs
}
