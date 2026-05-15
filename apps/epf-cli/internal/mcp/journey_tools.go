package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/navigation"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/pathutil"
	"github.com/mark3labs/mcp-go/mcp"
)

// registerJourneyTools registers all navigation graph MCP tools.
func (s *Server) registerJourneyTools() {
	// Tool: epf_journey_search
	s.mcpServer.AddTool(
		mcp.NewTool("epf_journey_search",
			mcp.WithDescription("[Query] USE WHEN you need to find interaction contexts in a navigation graph by keyword, title, category, or group. Returns matching contexts with their group, mode, and available transitions."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description(instancePathDesc),
			),
			mcp.WithString("query",
				mcp.Required(),
				mcp.Description("Search keyword to match against context titles, descriptions, categories, and groups"),
			),
		),
		s.handleJourneySearch,
	)

	// Tool: epf_journey_reachability
	s.mcpServer.AddTool(
		mcp.NewTool("epf_journey_reachability",
			mcp.WithDescription("[Query] USE WHEN you need to know what contexts are reachable from a source context under a specific guard profile. Returns all reachable contexts and the transition paths to reach them."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description(instancePathDesc),
			),
			mcp.WithString("source",
				mcp.Required(),
				mcp.Description("Source context ID to compute reachability from"),
			),
			mcp.WithString("guards",
				mcp.Description("Comma-separated guard IDs that are satisfied (e.g., 'admin-role,instance-active')"),
			),
			mcp.WithString("guard_groups",
				mcp.Description("Comma-separated guard group names that are satisfied (e.g., 'semantic-engine,premium')"),
			),
		),
		s.handleJourneyReachability,
	)

	// Tool: epf_journey_path
	s.mcpServer.AddTool(
		mcp.NewTool("epf_journey_path",
			mcp.WithDescription("[Query] USE WHEN you need to find the shortest path between two contexts. Returns each step, the transition taken, and any guards that must be satisfied."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description(instancePathDesc),
			),
			mcp.WithString("from",
				mcp.Required(),
				mcp.Description("Source context ID"),
			),
			mcp.WithString("to",
				mcp.Required(),
				mcp.Description("Target context ID"),
			),
			mcp.WithString("guards",
				mcp.Description("Comma-separated guard IDs that are satisfied"),
			),
			mcp.WithString("guard_groups",
				mcp.Description("Comma-separated guard group names that are satisfied"),
			),
		),
		s.handleJourneyPath,
	)

	// Tool: epf_journey_guards
	s.mcpServer.AddTool(
		mcp.NewTool("epf_journey_guards",
			mcp.WithDescription("[Query] USE WHEN you need to understand what guards affect access to a specific context — both inbound transition guards and group visibility guards."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description(instancePathDesc),
			),
			mcp.WithString("context_id",
				mcp.Required(),
				mcp.Description("Context ID to analyze guards for"),
			),
		),
		s.handleJourneyGuards,
	)

	// Tool: epf_journey_run
	s.mcpServer.AddTool(
		mcp.NewTool("epf_journey_run",
			mcp.WithDescription("[Validate] USE WHEN you need to test a customer journey scenario against the navigation graph. Executes a sequence of transitions with a guard profile and reports pass/fail."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description(instancePathDesc),
			),
			mcp.WithString("steps",
				mcp.Required(),
				mcp.Description("Comma-separated transition IDs to execute in order (e.g., 'list-to-workspace,workspace-to-instance,instance-to-vision')"),
			),
			mcp.WithString("guards",
				mcp.Description("Comma-separated guard IDs that are satisfied"),
			),
			mcp.WithString("guard_groups",
				mcp.Description("Comma-separated guard group names that are satisfied"),
			),
			mcp.WithString("start_at",
				mcp.Description("Context ID to start from (defaults to the graph's entry_context)"),
			),
			mcp.WithString("expected_end",
				mcp.Description("Context ID where the journey should end (fails if it ends elsewhere)"),
			),
		),
		s.handleJourneyRun,
	)
}

// findNavigationGraph locates and loads the navigation graph from an EPF instance.
// Searches for FIRE/navigation_graph.yaml, FIRE/*_navigation.yaml, FIRE/navigation/*.yaml.
func findNavigationGraph(instancePath string) (*navigation.Graph, error) {
	patterns := []string{
		filepath.Join(instancePath, "FIRE", "navigation_graph.yaml"),
		filepath.Join(instancePath, "FIRE", "navigation_graph.yml"),
	}

	// Try exact files first
	for _, p := range patterns {
		if _, err := os.Stat(p); err == nil {
			return navigation.LoadFile(p)
		}
	}

	// Try *_navigation.yaml pattern
	matches, _ := filepath.Glob(filepath.Join(instancePath, "FIRE", "*_navigation.yaml"))
	if len(matches) == 0 {
		matches, _ = filepath.Glob(filepath.Join(instancePath, "FIRE", "*_navigation.yml"))
	}
	if len(matches) > 0 {
		return navigation.LoadFile(matches[0])
	}

	// Try navigation/*.yaml directory
	matches, _ = filepath.Glob(filepath.Join(instancePath, "FIRE", "navigation", "*.yaml"))
	if len(matches) == 0 {
		matches, _ = filepath.Glob(filepath.Join(instancePath, "FIRE", "navigation", "*.yml"))
	}
	if len(matches) > 0 {
		return navigation.LoadFile(matches[0])
	}

	return nil, fmt.Errorf("no navigation graph found in %s (looked for FIRE/navigation_graph.yaml, FIRE/*_navigation.yaml, FIRE/navigation/*.yaml)", instancePath)
}

// parseGuardProfile builds a GuardProfile from comma-separated parameter strings.
func parseGuardProfile(guardsStr, guardGroupsStr string) *navigation.GuardProfile {
	profile := navigation.NewGuardProfile()
	if guardsStr != "" {
		for _, g := range strings.Split(guardsStr, ",") {
			g = strings.TrimSpace(g)
			if g != "" {
				profile.Guards[g] = true
			}
		}
	}
	if guardGroupsStr != "" {
		for _, gg := range strings.Split(guardGroupsStr, ",") {
			gg = strings.TrimSpace(gg)
			if gg != "" {
				profile.GuardGroups[gg] = true
			}
		}
	}
	return profile
}

// handleJourneySearch handles the epf_journey_search tool.
func (s *Server) handleJourneySearch(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}
	if errMsg := IsRemotePath(instancePath); errMsg != "" {
		return mcp.NewToolResultError(errMsg), nil
	}
	instancePath = pathutil.ExpandTilde(instancePath)

	query, err := request.RequireString("query")
	if err != nil {
		return mcp.NewToolResultError("query parameter is required"), nil
	}
	queryLower := strings.ToLower(query)

	g, err := findNavigationGraph(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load navigation graph: %s", err.Error())), nil
	}

	var results []map[string]interface{}
	for _, c := range g.Contexts {
		if matchesQuery(c, queryLower) {
			outbound := g.TransitionsFrom(c.ID)
			transitionSummaries := make([]map[string]interface{}, 0, len(outbound))
			for _, t := range outbound {
				ts := map[string]interface{}{
					"id": t.ID,
					"to": t.To,
				}
				if t.Label != "" {
					ts["label"] = t.Label
				}
				if t.Guard != "" {
					ts["guard"] = t.Guard
				}
				transitionSummaries = append(transitionSummaries, ts)
			}

			result := map[string]interface{}{
				"id":          c.ID,
				"title":       c.Title,
				"transitions": transitionSummaries,
			}
			if c.Description != "" {
				result["description"] = c.Description
			}
			if c.Group != "" {
				result["group"] = c.Group
			}
			if c.Mode != "" {
				result["mode"] = c.Mode
			}
			if c.Category != "" {
				result["category"] = c.Category
			}
			results = append(results, result)
		}
	}

	response := map[string]interface{}{
		"query":   query,
		"count":   len(results),
		"results": results,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// matchesQuery checks if a context matches the search query.
func matchesQuery(c navigation.Context, queryLower string) bool {
	return strings.Contains(strings.ToLower(c.Title), queryLower) ||
		strings.Contains(strings.ToLower(c.Description), queryLower) ||
		strings.Contains(strings.ToLower(c.Category), queryLower) ||
		strings.Contains(strings.ToLower(c.Group), queryLower) ||
		strings.Contains(strings.ToLower(c.ID), queryLower)
}

// handleJourneyReachability handles the epf_journey_reachability tool.
func (s *Server) handleJourneyReachability(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}
	if errMsg := IsRemotePath(instancePath); errMsg != "" {
		return mcp.NewToolResultError(errMsg), nil
	}
	instancePath = pathutil.ExpandTilde(instancePath)

	sourceID, err := request.RequireString("source")
	if err != nil {
		return mcp.NewToolResultError("source parameter is required"), nil
	}

	guardsStr, _ := request.RequireString("guards")
	guardGroupsStr, _ := request.RequireString("guard_groups")
	profile := parseGuardProfile(guardsStr, guardGroupsStr)

	g, err := findNavigationGraph(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load navigation graph: %s", err.Error())), nil
	}

	if g.ContextByID(sourceID) == nil {
		return mcp.NewToolResultError(fmt.Sprintf("Context %q not found in navigation graph", sourceID)), nil
	}

	reachable := navigation.Reachable(g, sourceID, profile)

	var reachableContexts []map[string]interface{}
	for contextID, path := range reachable {
		if contextID == sourceID {
			continue // Skip the source itself
		}
		ctx := g.ContextByID(contextID)
		entry := map[string]interface{}{
			"id":    contextID,
			"title": ctx.Title,
			"path":  path,
			"steps": len(path),
		}
		if ctx.Group != "" {
			entry["group"] = ctx.Group
		}
		reachableContexts = append(reachableContexts, entry)
	}

	// Find blocked contexts (reachable without guards but not with current profile)
	allReachable := navigation.Reachable(g, sourceID, &navigation.GuardProfile{
		Guards:      makeAllGuardsTrue(g),
		GuardGroups: makeAllGroupsTrue(g),
	})
	var blockedContexts []map[string]interface{}
	for contextID, path := range allReachable {
		if contextID == sourceID {
			continue
		}
		if _, ok := reachable[contextID]; !ok {
			ctx := g.ContextByID(contextID)
			entry := map[string]interface{}{
				"id":    contextID,
				"title": ctx.Title,
				"steps": len(path),
			}
			// Find the blocking guard on the first unreachable transition
			for _, tID := range path {
				for _, t := range g.Transitions {
					if t.ID == tID && t.Guard != "" {
						guard := g.GuardByID(t.Guard)
						if guard != nil && !profile.Satisfies(guard) {
							entry["blocked_by"] = map[string]interface{}{
								"guard_id":    guard.ID,
								"description": guard.Description,
								"type":        guard.Type,
							}
							break
						}
					}
				}
				if entry["blocked_by"] != nil {
					break
				}
			}
			blockedContexts = append(blockedContexts, entry)
		}
	}

	response := map[string]interface{}{
		"source":           sourceID,
		"reachable_count":  len(reachableContexts),
		"reachable":        reachableContexts,
		"blocked_count":    len(blockedContexts),
		"blocked_contexts": blockedContexts,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// makeAllGuardsTrue creates a map with all guard IDs set to true.
func makeAllGuardsTrue(g *navigation.Graph) map[string]bool {
	m := make(map[string]bool)
	for _, guard := range g.Guards {
		m[guard.ID] = true
	}
	return m
}

// makeAllGroupsTrue creates a map with all guard group names set to true.
func makeAllGroupsTrue(g *navigation.Graph) map[string]bool {
	m := make(map[string]bool)
	for _, guard := range g.Guards {
		if guard.GuardGroup != "" {
			m[guard.GuardGroup] = true
		}
	}
	return m
}

// handleJourneyPath handles the epf_journey_path tool.
func (s *Server) handleJourneyPath(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}
	if errMsg := IsRemotePath(instancePath); errMsg != "" {
		return mcp.NewToolResultError(errMsg), nil
	}
	instancePath = pathutil.ExpandTilde(instancePath)

	fromID, err := request.RequireString("from")
	if err != nil {
		return mcp.NewToolResultError("from parameter is required"), nil
	}
	toID, err := request.RequireString("to")
	if err != nil {
		return mcp.NewToolResultError("to parameter is required"), nil
	}

	guardsStr, _ := request.RequireString("guards")
	guardGroupsStr, _ := request.RequireString("guard_groups")
	profile := parseGuardProfile(guardsStr, guardGroupsStr)

	g, err := findNavigationGraph(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load navigation graph: %s", err.Error())), nil
	}

	if g.ContextByID(fromID) == nil {
		return mcp.NewToolResultError(fmt.Sprintf("Context %q not found", fromID)), nil
	}
	if g.ContextByID(toID) == nil {
		return mcp.NewToolResultError(fmt.Sprintf("Context %q not found", toID)), nil
	}

	path := navigation.ShortestPath(g, fromID, toID, profile)
	if path == nil {
		// Try with all guards to explain what's blocking
		allProfile := &navigation.GuardProfile{
			Guards:      makeAllGuardsTrue(g),
			GuardGroups: makeAllGroupsTrue(g),
		}
		unguardedPath := navigation.ShortestPath(g, fromID, toID, allProfile)
		if unguardedPath != nil {
			// Path exists but is blocked by guards
			var blockingGuards []map[string]interface{}
			for _, tID := range unguardedPath {
				for _, t := range g.Transitions {
					if t.ID == tID && t.Guard != "" {
						guard := g.GuardByID(t.Guard)
						if guard != nil && !profile.Satisfies(guard) {
							blockingGuards = append(blockingGuards, map[string]interface{}{
								"transition_id": t.ID,
								"guard_id":      guard.ID,
								"description":   guard.Description,
								"type":          guard.Type,
							})
						}
					}
				}
			}
			response := map[string]interface{}{
				"from":             fromID,
				"to":               toID,
				"reachable":        false,
				"reason":           "Path exists but is blocked by guards",
				"blocking_guards":  blockingGuards,
				"unguarded_steps":  len(unguardedPath),
			}
			jsonBytes, _ := json.MarshalIndent(response, "", "  ")
			return mcp.NewToolResultText(string(jsonBytes)), nil
		}

		response := map[string]interface{}{
			"from":      fromID,
			"to":        toID,
			"reachable": false,
			"reason":    "No path exists between these contexts",
		}
		jsonBytes, _ := json.MarshalIndent(response, "", "  ")
		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	// Build step-by-step path
	var steps []map[string]interface{}
	currentCtx := fromID
	for _, tID := range path {
		for _, t := range g.Transitions {
			if t.ID == tID {
				step := map[string]interface{}{
					"transition_id": t.ID,
					"from":          currentCtx,
					"to":            t.To,
				}
				if t.Label != "" {
					step["label"] = t.Label
				}
				if t.Guard != "" {
					guard := g.GuardByID(t.Guard)
					step["guard"] = map[string]interface{}{
						"id":          guard.ID,
						"description": guard.Description,
					}
				}
				steps = append(steps, step)
				currentCtx = t.To
				break
			}
		}
	}

	response := map[string]interface{}{
		"from":      fromID,
		"to":        toID,
		"reachable": true,
		"steps":     len(steps),
		"path":      steps,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleJourneyGuards handles the epf_journey_guards tool.
func (s *Server) handleJourneyGuards(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}
	if errMsg := IsRemotePath(instancePath); errMsg != "" {
		return mcp.NewToolResultError(errMsg), nil
	}
	instancePath = pathutil.ExpandTilde(instancePath)

	contextID, err := request.RequireString("context_id")
	if err != nil {
		return mcp.NewToolResultError("context_id parameter is required"), nil
	}

	g, err := findNavigationGraph(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load navigation graph: %s", err.Error())), nil
	}

	c := g.ContextByID(contextID)
	if c == nil {
		return mcp.NewToolResultError(fmt.Sprintf("Context %q not found", contextID)), nil
	}

	// Collect inbound transition guards
	inbound := g.TransitionsTo(contextID)
	var inboundGuards []map[string]interface{}
	for _, t := range inbound {
		if t.Guard == "" {
			continue
		}
		guard := g.GuardByID(t.Guard)
		if guard == nil {
			continue
		}
		inboundGuards = append(inboundGuards, map[string]interface{}{
			"transition_id": t.ID,
			"from":          t.From,
			"guard_id":      guard.ID,
			"description":   guard.Description,
			"type":          guard.Type,
			"fallback":      guard.Fallback,
			"message":       guard.Message,
		})
	}

	// Check group visibility guard
	var groupGuard map[string]interface{}
	if c.Group != "" {
		grp := g.GroupByID(c.Group)
		if grp != nil && grp.VisibilityGuard != "" {
			guard := g.GuardByID(grp.VisibilityGuard)
			if guard != nil {
				groupGuard = map[string]interface{}{
					"group_id":    grp.ID,
					"group_title": grp.Title,
					"guard_id":    guard.ID,
					"description": guard.Description,
					"type":        guard.Type,
				}
			}
		}
	}

	response := map[string]interface{}{
		"context_id":     contextID,
		"context_title":  c.Title,
		"inbound_guards": inboundGuards,
		"group_guard":    groupGuard,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleJourneyRun handles the epf_journey_run tool.
func (s *Server) handleJourneyRun(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}
	if errMsg := IsRemotePath(instancePath); errMsg != "" {
		return mcp.NewToolResultError(errMsg), nil
	}
	instancePath = pathutil.ExpandTilde(instancePath)

	stepsStr, err := request.RequireString("steps")
	if err != nil {
		return mcp.NewToolResultError("steps parameter is required"), nil
	}

	guardsStr, _ := request.RequireString("guards")
	guardGroupsStr, _ := request.RequireString("guard_groups")
	startAt, _ := request.RequireString("start_at")
	expectedEnd, _ := request.RequireString("expected_end")

	g, err := findNavigationGraph(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load navigation graph: %s", err.Error())), nil
	}

	var steps []string
	for _, step := range strings.Split(stepsStr, ",") {
		step = strings.TrimSpace(step)
		if step != "" {
			steps = append(steps, step)
		}
	}

	scenario := navigation.JourneyScenario{
		Name:        "mcp-journey-run",
		Steps:       steps,
		StartAt:     startAt,
		ExpectedEnd: expectedEnd,
	}
	if guardsStr != "" {
		for _, g := range strings.Split(guardsStr, ",") {
			g = strings.TrimSpace(g)
			if g != "" {
				scenario.Guards = append(scenario.Guards, g)
			}
		}
	}
	if guardGroupsStr != "" {
		for _, gg := range strings.Split(guardGroupsStr, ",") {
			gg = strings.TrimSpace(gg)
			if gg != "" {
				scenario.GuardGroups = append(scenario.GuardGroups, gg)
			}
		}
	}

	result := navigation.RunScenario(g, scenario)

	response := map[string]interface{}{
		"passed":      result.Passed,
		"final_state": result.FinalState,
		"steps_run":   result.StepsRun,
		"total_steps": result.TotalSteps,
	}
	if !result.Passed {
		response["failed_at"] = result.FailedAt
		response["fail_reason"] = result.FailReason
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}
