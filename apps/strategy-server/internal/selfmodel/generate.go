package selfmodel

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/navigation"
)

// serviceName and serviceDescription are the only two hand-authored strings
// in this entire package. Everything else in Generate's output is read back
// from a live source (the real tool registration path, the real phase
// artifact map, the real navigation graph) — these two are pure identity
// and have no other source to derive from, matching how every reconciled
// card shape treats "name"/"description" as authored fields
// (research.md §2's table).
const (
	serviceName        = "strategy-server"
	serviceDescription = "Emergent Strategy platform backend — EPF strategy authoring, AIM lifecycle orchestration, and ripple coherence, exposed over MCP and a web UI."
)

// Generate assembles the current self-model from strategy-server's real,
// live sources — never from a second, hand-maintained copy:
//
//   - Tools + categories: internal/mcpserver.NewMCPServerForIntrospection's
//     actual tool registration (ListTools()), joined against
//     mcpserver.ToolCategories/CategoryDescriptions/CategoryOrder. This is
//     the same registration path cmd_serve.go's real /mcp endpoint uses —
//     introspecting it, rather than hand-copying tool names, is what makes
//     drift structurally impossible rather than merely policed by review
//     (see internal/mcpserver/introspection.go's doc comment).
//   - Phases + artifacts: internal/mcpserver.PhaseArtifacts, the same map
//     the get_phase_artifacts MCP tool itself serves.
//   - Screens: internal/navigation.DefaultGraph(), the single source of
//     truth for the web UI's routes (internal/navigation/navigation.go's
//     own package doc: "single source of truth for the web UI").
//
// Output is sorted deterministically throughout (tools and categories by
// name, phases in a fixed READY/FIRE/AIM order, screens in graph order)
// specifically so two calls to Generate produce byte-identical JSON — the
// property the drift check (generate_test.go,
// TestModel_CommittedFileMatchesGenerated) depends on. Map iteration order
// in Go is randomized per-process; without explicit sorting this would be
// non-deterministic and the drift check would be a false positive generator,
// not a real check.
func Generate() (*Model, error) {
	srv := mcpserver.NewMCPServerForIntrospection()
	registered := srv.ListTools()

	tools := make([]Tool, 0, len(registered))
	for name, st := range registered {
		category, ok := mcpserver.ToolCategories[name]
		if !ok {
			// Matches toolCategoryFilter's own safety net
			// (internal/mcpserver/tool_filter.go): an uncategorized tool is
			// a real gap worth being visible about, not a reason to drop
			// the tool from the published model.
			category = "uncategorized"
		}
		schemaJSON, err := json.Marshal(st.Tool.InputSchema)
		if err != nil {
			return nil, fmt.Errorf("selfmodel: marshal input schema for %q: %w", name, err)
		}
		tool := Tool{
			Name:        name,
			Description: st.Tool.Description,
			Category:    category,
			InputSchema: schemaJSON,
		}

		// Only tools that actually declare an output schema carry one. An
		// empty ToolOutputSchema marshals to a bare {"type":""} object, which
		// would read as "this tool publishes a contract" when it does not.
		if st.Tool.OutputSchema.Type != "" {
			outJSON, err := json.Marshal(st.Tool.OutputSchema)
			if err != nil {
				return nil, fmt.Errorf("selfmodel: marshal output schema for %q: %w", name, err)
			}
			tool.OutputSchema = outJSON
		}

		tools = append(tools, tool)
	}
	sort.Slice(tools, func(i, j int) bool { return tools[i].Name < tools[j].Name })

	counts := make(map[string]int, len(mcpserver.CategoryOrder))
	for _, cat := range mcpserver.ToolCategories {
		counts[cat]++
	}
	categories := make([]Category, 0, len(mcpserver.CategoryOrder))
	for _, name := range mcpserver.CategoryOrder {
		categories = append(categories, Category{
			Name:        name,
			Description: mcpserver.CategoryDescriptions[name],
			ToolCount:   counts[name],
		})
	}

	// Fixed order, not map iteration order: PhaseArtifacts is a
	// map[string][]PhaseArtifactInfo, and Go map iteration order is
	// randomized per-process. READY/FIRE/AIM is the EPF phase sequence
	// itself, not an arbitrary display choice.
	phaseNames := []string{"READY", "FIRE", "AIM"}
	phases := make([]Phase, 0, len(phaseNames))
	for _, name := range phaseNames {
		infos, ok := mcpserver.PhaseArtifacts[name]
		if !ok {
			continue
		}
		artifacts := make([]Artifact, 0, len(infos))
		for _, info := range infos {
			artifacts = append(artifacts, Artifact{
				ArtifactType: info.ArtifactType,
				Description:  info.Description,
				SchemaFile:   info.SchemaFile,
			})
		}
		phases = append(phases, Phase{Name: name, Artifacts: artifacts})
	}

	graph := navigation.DefaultGraph()
	ctx := context.Background() // deterministic: langs.T(ctx, key) resolves to LocaleEN with no locale in ctx
	screens := make([]Screen, 0, len(graph.Screens))
	for _, sc := range graph.Screens {
		if !sc.WebRoute {
			// Not a reachable URL — nothing for a remote agent to route a
			// human to. Excluded rather than published with an empty URL,
			// which would look like a bug in the self-model rather than a
			// deliberate omission.
			continue
		}
		screens = append(screens, Screen{
			ID:       string(sc.ID),
			Title:    langs.T(ctx, string(sc.Title)),
			URL:      sc.URLPattern,
			TabGroup: string(sc.TabGroup),
			Parent:   string(sc.Parent),
		})
	}
	sort.Slice(screens, func(i, j int) bool { return screens[i].ID < screens[j].ID })

	return &Model{
		SchemaVersion: SchemaVersion,
		Service:       Identity{Name: serviceName, Description: serviceDescription},
		Categories:    categories,
		Tools:         tools,
		Phases:        phases,
		Screens:       screens,
	}, nil
}

// MarshalIndent renders m as the exact byte sequence this package commits
// and serves — one canonical rendering, so "the committed file" and "what
// /.well-known serves" and "what the drift check compares against" can
// never disagree about formatting.
func MarshalIndent(m *Model) ([]byte, error) {
	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}
