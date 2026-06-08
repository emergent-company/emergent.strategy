package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
)

// ScorecardCategories are the strategy-server tool categories the scorecard
// needs enabled. strategy-server defaults to exposing only core tools, so these
// must be activated via the tool filter before the strategic queries are
// callable. Category names verified against internal/mcpserver/tool_filter.go.
//
// Note: search_strategy is in "core" (always active, no filter needed); the
// other scorecard tools require these categories:
var ScorecardCategories = []string{
	"semantic", // get_neighbors, detect_contradictions
	"features", // list_features
	"strategy", // get_roadmap
}

// EnsureCategories asks the server to enable the given tool categories via the
// set_tool_filter meta-tool. It is best-effort: a server that does not gate
// tools (or exposes everything already) may not implement the meta-tool, in
// which case the error is returned for the caller to treat as non-fatal.
//
// It returns the list of tools visible AFTER applying the filter.
func (c *Client) EnsureCategories(ctx context.Context, categories []string) ([]Tool, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("mcp: no endpoint configured")
	}
	// set_tool_filter is a meta-tool; arguments shape mirrors strategy-server.
	if _, err := c.CallTool(ctx, "set_tool_filter", map[string]any{
		"categories": categories,
	}); err != nil {
		return nil, fmt.Errorf("mcp: enable categories: %w", err)
	}
	return c.ListTools(ctx)
}

// Discovery is the result of connecting and self-configuring the client.
type Discovery struct {
	// Available is the set of tool names visible after enabling scorecard
	// categories.
	Available map[string]struct{}
	// Tools is the full advertised tool list (name + description).
	Tools []Tool
	// FilterApplied reports whether set_tool_filter succeeded. When false, the
	// client fell back to whatever tools were already exposed.
	FilterApplied bool
}

// Has reports whether a tool of the given name is available.
func (d Discovery) Has(name string) bool {
	_, ok := d.Available[name]
	return ok
}

// Names returns the sorted list of available tool names (useful for diagnostics).
func (d Discovery) Names() []string {
	names := make([]string, 0, len(d.Available))
	for n := range d.Available {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// Connect performs the standard scorecard handshake: enable the needed tool
// categories, then list the resulting tools. If enabling the filter fails
// (server does not gate tools, or lacks the meta-tool), it falls back to listing
// whatever tools are already exposed, so the scorecard can still use any that
// happen to be available.
func (c *Client) Connect(ctx context.Context) (Discovery, error) {
	if !c.Enabled() {
		return Discovery{}, fmt.Errorf("mcp: no endpoint configured")
	}

	// MCP streamable-HTTP requires an initialize handshake to establish a session
	// before any tools/* call.
	if err := c.Initialize(ctx); err != nil {
		return Discovery{}, fmt.Errorf("mcp: connect: %w", err)
	}

	d := Discovery{Available: map[string]struct{}{}}

	tools, err := c.EnsureCategories(ctx, ScorecardCategories)
	if err != nil {
		// Fall back: the server may expose tools without a filter.
		tools, err = c.ListTools(ctx)
		if err != nil {
			return Discovery{}, fmt.Errorf("mcp: connect: %w", err)
		}
	} else {
		d.FilterApplied = true
	}

	d.Tools = tools
	for _, t := range tools {
		d.Available[t.Name] = struct{}{}
	}
	return d, nil
}

// CallJSON invokes a tool and unmarshals its text result as JSON into out.
// Convenience for tools that return a JSON document as their text content.
func (c *Client) CallJSON(ctx context.Context, name string, args map[string]any, out any) error {
	text, err := c.CallTool(ctx, name, args)
	if err != nil {
		return err
	}
	if err := json.Unmarshal([]byte(text), out); err != nil {
		return fmt.Errorf("mcp: tool %q: decode json result: %w", name, err)
	}
	return nil
}
