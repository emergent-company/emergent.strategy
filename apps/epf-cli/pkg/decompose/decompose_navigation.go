package decompose

import (
	"fmt"
	"path/filepath"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/pkg/navigation"
)

// decomposeNavigationGraph decomposes a navigation graph artifact into
// InteractionContext objects, NavigationGuard objects, and navigation_transition
// relationships.
func (d *Decomposer) decomposeNavigationGraph(result *Result) {
	// Try to find a navigation graph in the instance
	g, filePath := d.findNavigationGraph()
	if g == nil {
		return // No navigation graph — not an error
	}

	// Create Artifact parent node
	artKey := d.addArtifactNode(result,
		filePath, "navigation_graph", "FIRE",
		fmt.Sprintf("Navigation Graph — %s", g.Title), "5")

	// Decompose contexts into InteractionContext objects
	for _, ctx := range g.Contexts {
		key := objectKey("InteractionContext", fmt.Sprintf("nav:%s:%s", g.Name, ctx.ID))
		scopedStr := "false"
		if ctx.Scoped {
			scopedStr = "true"
		}
		mode := ctx.Mode
		if mode == "" {
			mode = "default"
		}

		d.addObject(result, GraphObject{
			Type: "InteractionContext",
			Key:  key,
			Properties: map[string]any{
				"name":            ctx.Title,
				"description":     truncate(ctx.Description, 500),
				"group":           ctx.Group,
				"category":        ctx.Category,
				"mode":            mode,
				"scoped":          scopedStr,
				"context_id":      ctx.ID,
				"inertia_tier":    "5",
				"source_artifact": filePath,
				"section_path":    fmt.Sprintf("contexts[%s]", ctx.ID),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "InteractionContext")

		// Link to value model components via contributes_to
		for _, vmPath := range ctx.ContributesTo {
			vmKey := objectKey("ValueModelComponent", vmPath)
			d.addRel(result, "realizes",
				key, "InteractionContext",
				vmKey, "ValueModelComponent",
				map[string]any{
					"weight":      "1.0",
					"edge_source": "structural",
				})
		}
	}

	// Decompose guards into NavigationGuard objects
	for _, guard := range g.Guards {
		key := objectKey("NavigationGuard", fmt.Sprintf("nav:%s:%s", g.Name, guard.ID))
		guardType := guard.Type
		if guardType == "" {
			guardType = "domain-rule"
		}

		d.addObject(result, GraphObject{
			Type: "NavigationGuard",
			Key:  key,
			Properties: map[string]any{
				"name":            guard.Description,
				"description":     guard.Description,
				"guard_type":      guardType,
				"guard_group":     guard.GuardGroup,
				"guard_id":        guard.ID,
				"inertia_tier":    "5",
				"source_artifact": filePath,
				"section_path":    fmt.Sprintf("guards[%s]", guard.ID),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "NavigationGuard")
	}

	// Decompose transitions into navigation_transition edges
	for _, t := range g.Transitions {
		fromKey := objectKey("InteractionContext", fmt.Sprintf("nav:%s:%s", g.Name, t.From))
		toKey := objectKey("InteractionContext", fmt.Sprintf("nav:%s:%s", g.Name, t.To))
		category := t.Category
		if category == "" {
			category = "navigation"
		}

		props := map[string]any{
			"weight":        "1.0",
			"edge_source":   "structural",
			"label":         t.Label,
			"guard":         t.Guard,
			"category":      category,
			"transition_id": t.ID,
		}

		d.addRel(result, "navigation_transition",
			fromKey, "InteractionContext",
			toKey, "InteractionContext",
			props)

		// If this transition has a guard, add a "guards" edge from guard to target context
		if t.Guard != "" {
			guardKey := objectKey("NavigationGuard", fmt.Sprintf("nav:%s:%s", g.Name, t.Guard))
			d.addRel(result, "guards",
				guardKey, "NavigationGuard",
				toKey, "InteractionContext",
				map[string]any{
					"weight":      "1.0",
					"edge_source": "structural",
				})
		}
	}
}

// findNavigationGraph looks for a navigation graph in the EPF instance.
// Returns the parsed graph and its relative file path, or nil if not found.
func (d *Decomposer) findNavigationGraph() (*navigation.Graph, string) {
	// Try standard file patterns
	patterns := []string{
		"FIRE/navigation_graph.yaml",
		"FIRE/navigation_graph.yml",
	}

	for _, relPath := range patterns {
		var raw struct {
			Name string `yaml:"name"`
		}
		if err := d.readYAML(relPath, &raw); err == nil && raw.Name != "" {
			g, err := d.loadNavigationGraphFromYAML(relPath)
			if err == nil {
				return g, relPath
			}
		}
	}

	// Try *_navigation.yaml pattern
	navFiles, _ := filepath.Glob(filepath.Join(d.instancePath, "FIRE", "*_navigation.yaml"))
	if len(navFiles) == 0 {
		navFiles, _ = filepath.Glob(filepath.Join(d.instancePath, "FIRE", "*_navigation.yml"))
	}
	for _, absPath := range navFiles {
		relPath, _ := filepath.Rel(d.instancePath, absPath)
		g, err := d.loadNavigationGraphFromYAML(relPath)
		if err == nil {
			return g, relPath
		}
	}

	// Try navigation/*.yaml directory
	navDirFiles, _ := filepath.Glob(filepath.Join(d.instancePath, "FIRE", "navigation", "*.yaml"))
	if len(navDirFiles) == 0 {
		navDirFiles, _ = filepath.Glob(filepath.Join(d.instancePath, "FIRE", "navigation", "*.yml"))
	}
	for _, absPath := range navDirFiles {
		relPath, _ := filepath.Rel(d.instancePath, absPath)
		g, err := d.loadNavigationGraphFromYAML(relPath)
		if err == nil {
			return g, relPath
		}
	}

	return nil, ""
}

// loadNavigationGraphFromYAML reads a YAML file relative to the instance root
// and parses it as a navigation graph.
func (d *Decomposer) loadNavigationGraphFromYAML(relPath string) (*navigation.Graph, error) {
	var g navigation.Graph
	if err := d.readYAML(relPath, &g); err != nil {
		return nil, err
	}
	if g.Name == "" || len(g.Contexts) == 0 {
		return nil, fmt.Errorf("not a valid navigation graph: %s", relPath)
	}
	return &g, nil
}
