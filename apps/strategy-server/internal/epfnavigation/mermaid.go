package navigation

import (
	"fmt"
	"strings"
)

// MermaidOptions controls how the Mermaid diagram is rendered.
type MermaidOptions struct {
	// Direction: TD (top-down), LR (left-right). Default: TD.
	Direction string
	// Group: if set, only show contexts in this group (plus entry context).
	Group string
	// Profile: if set, color reachable nodes green and blocked nodes red.
	Profile *GuardProfile
	// Source: the starting context for reachability (default: entry_context).
	Source string
	// ShowGuards: annotate guarded transitions with lock icon and guard name.
	ShowGuards bool
	// ShowGroups: render subgraphs for each group.
	ShowGroups bool
	// Title: diagram title (shown as a note if set).
	Title string
}

// ToMermaid renders the graph as a Mermaid flowchart string.
func (g *Graph) ToMermaid(opts *MermaidOptions) string {
	if opts == nil {
		opts = &MermaidOptions{}
	}
	if opts.Direction == "" {
		opts.Direction = "TD"
	}
	if opts.Source == "" {
		opts.Source = g.EntryContext
	}

	var b strings.Builder

	b.WriteString(fmt.Sprintf("graph %s\n", opts.Direction))

	// Compute reachability if a profile is provided.
	var reachable map[string]bool
	if opts.Profile != nil {
		paths := Reachable(g, opts.Source, opts.Profile)
		reachable = make(map[string]bool)
		for id := range paths {
			reachable[id] = true
		}
	}

	// Determine which contexts to include.
	includeContext := func(c Context) bool {
		if opts.Group == "" {
			return true
		}
		return c.Group == opts.Group || c.ID == g.EntryContext
	}

	// Build context set for transition filtering.
	contextSet := make(map[string]bool)
	for _, c := range g.Contexts {
		if includeContext(c) {
			contextSet[c.ID] = true
		}
	}

	// Group contexts by group for subgraph rendering.
	type groupInfo struct {
		Title    string
		Contexts []Context
	}
	groups := make(map[string]*groupInfo)
	var ungrouped []Context

	for _, c := range g.Contexts {
		if !includeContext(c) {
			continue
		}
		if c.Group != "" && opts.ShowGroups {
			gi, ok := groups[c.Group]
			if !ok {
				title := c.Group
				for _, grp := range g.Groups {
					if grp.ID == c.Group {
						title = grp.Title
						break
					}
				}
				gi = &groupInfo{Title: title}
				groups[c.Group] = gi
			}
			gi.Contexts = append(gi.Contexts, c)
		} else {
			ungrouped = append(ungrouped, c)
		}
	}

	// Render subgraphs.
	if opts.ShowGroups {
		for gID, gi := range groups {
			b.WriteString(fmt.Sprintf("    subgraph %s[\"%s\"]\n", mermaidID(gID), gi.Title))
			for _, c := range gi.Contexts {
				writeNode(&b, c, g.EntryContext, reachable, "        ")
			}
			b.WriteString("    end\n")
		}
	}

	// Render ungrouped contexts (or all contexts if not using subgraphs).
	if opts.ShowGroups {
		for _, c := range ungrouped {
			writeNode(&b, c, g.EntryContext, reachable, "    ")
		}
	} else {
		// Flat rendering — all included contexts without subgraphs.
		for _, c := range g.Contexts {
			if !includeContext(c) {
				continue
			}
			writeNode(&b, c, g.EntryContext, reachable, "    ")
		}
	}

	b.WriteString("\n")

	// Render transitions.
	for _, t := range g.Transitions {
		if !contextSet[t.From] || !contextSet[t.To] {
			continue
		}
		label := t.Label
		if label == "" {
			label = t.ID
		}
		if opts.ShowGuards && t.Guard != "" {
			guard := g.GuardByID(t.Guard)
			guardName := t.Guard
			if guard != nil {
				guardName = guard.ID
			}
			label += fmt.Sprintf(" #lpar;%s#rpar;", guardName)
		}
		b.WriteString(fmt.Sprintf("    %s -->|%s| %s\n", mermaidID(t.From), label, mermaidID(t.To)))
	}

	// Style nodes based on reachability.
	if reachable != nil {
		b.WriteString("\n")
		var reachableIDs, blockedIDs []string
		for _, c := range g.Contexts {
			if !includeContext(c) {
				continue
			}
			if reachable[c.ID] {
				reachableIDs = append(reachableIDs, mermaidID(c.ID))
			} else {
				blockedIDs = append(blockedIDs, mermaidID(c.ID))
			}
		}
		if len(reachableIDs) > 0 {
			b.WriteString("    classDef reachable fill:#d4edda,stroke:#28a745,color:#155724\n")
			writeClassBatches(&b, reachableIDs, "reachable")
		}
		if len(blockedIDs) > 0 {
			b.WriteString("    classDef blocked fill:#f8d7da,stroke:#dc3545,color:#721c24\n")
			writeClassBatches(&b, blockedIDs, "blocked")
		}
	}

	// Style entry context.
	b.WriteString(fmt.Sprintf("\n    classDef entry fill:#cce5ff,stroke:#004085,color:#004085,stroke-width:3px\n"))
	b.WriteString(fmt.Sprintf("    class %s entry\n", mermaidID(g.EntryContext)))

	return b.String()
}

// ToMermaidComposed renders a composed multi-service graph with service subgraphs.
func ToMermaidComposed(cg *ComposedGraph, opts *MermaidOptions) string {
	merged := cg.Merge()
	if opts == nil {
		opts = &MermaidOptions{}
	}

	// Override to show service boundaries as subgraphs.
	if opts.Direction == "" {
		opts.Direction = "TD"
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("graph %s\n", opts.Direction))

	// Root service subgraph.
	b.WriteString(fmt.Sprintf("    subgraph root[\"%s\"]\n", cg.Graph.Title))
	for _, c := range cg.Graph.Contexts {
		writeNode(&b, c, cg.Graph.EntryContext, nil, "        ")
	}
	b.WriteString("    end\n")

	// Imported service subgraphs.
	for service, sub := range cg.Services {
		b.WriteString(fmt.Sprintf("    subgraph %s[\"%s\"]\n", mermaidID(service), sub.Title))
		for _, c := range sub.Contexts {
			prefixed := c
			prefixed.ID = service + ":" + c.ID
			writeNode(&b, prefixed, "", nil, "        ")
		}
		b.WriteString("    end\n")
	}

	b.WriteString("\n")

	// Render all transitions from merged graph.
	for _, t := range merged.Transitions {
		label := t.Label
		if label == "" {
			label = t.ID
		}
		// Mark portal edges with a different style.
		isPortal := false
		for _, pe := range cg.Graph.PortalEdges {
			if pe.ID == t.ID {
				isPortal = true
				break
			}
		}
		if isPortal {
			b.WriteString(fmt.Sprintf("    %s -.->|%s| %s\n", mermaidID(t.From), label, mermaidID(t.To)))
		} else {
			b.WriteString(fmt.Sprintf("    %s -->|%s| %s\n", mermaidID(t.From), label, mermaidID(t.To)))
		}
	}

	// Style entry and portal edges.
	b.WriteString(fmt.Sprintf("\n    classDef entry fill:#cce5ff,stroke:#004085,color:#004085,stroke-width:3px\n"))
	b.WriteString(fmt.Sprintf("    class %s entry\n", mermaidID(cg.Graph.EntryContext)))
	b.WriteString("    linkStyle default stroke:#666,stroke-width:1px\n")

	return b.String()
}

func writeNode(b *strings.Builder, c Context, entryID string, reachable map[string]bool, indent string) {
	title := c.Title
	if title == "" {
		title = c.ID
	}
	// Use different shapes for different modes.
	switch c.Mode {
	case "landing":
		b.WriteString(fmt.Sprintf("%s%s[[\"%s\"]]\n", indent, mermaidID(c.ID), title))
	default:
		if c.Scoped {
			b.WriteString(fmt.Sprintf("%s%s[\"%s\"]\n", indent, mermaidID(c.ID), title))
		} else {
			b.WriteString(fmt.Sprintf("%s%s(\"%s\")\n", indent, mermaidID(c.ID), title))
		}
	}
}

func mermaidID(id string) string {
	r := strings.ReplaceAll(id, "-", "_")
	r = strings.ReplaceAll(r, ":", "__")
	return r
}

// writeClassBatches writes class assignments in batches of 15 to avoid
// exceeding Mermaid's line-length parser limits.
func writeClassBatches(b *strings.Builder, ids []string, className string) {
	const batchSize = 15
	for i := 0; i < len(ids); i += batchSize {
		end := i + batchSize
		if end > len(ids) {
			end = len(ids)
		}
		b.WriteString(fmt.Sprintf("    class %s %s\n", strings.Join(ids[i:end], ","), className))
	}
}
