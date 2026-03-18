package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	mcp "github.com/mark3labs/mcp-go/mcp"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/propagation"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/reasoning"
)

// registerSemanticTools registers the semantic strategy engine MCP tools.
// Only registers when Memory API is configured (EPF_MEMORY_URL set).
// Without Memory, these tools would always error — no point showing them to the LLM.
func (s *Server) registerSemanticTools() {
	if os.Getenv("EPF_MEMORY_URL") == "" {
		return // Memory not configured — don't register tools the LLM can't use
	}

	s.mcpServer.AddTool(
		mcp.NewTool("epf_contradictions",
			mcp.WithDescription("[Semantic] USE WHEN you want to find inconsistencies in the strategy graph. Detects orphaned references, status conflicts, broken dependencies, and maturity gaps. Requires Memory API config."),
		),
		s.handleContradictions,
	)

	s.mcpServer.AddTool(
		mcp.NewTool("epf_semantic_search",
			mcp.WithDescription("[Semantic] USE WHEN you want to search the strategy graph by meaning, not just text. Finds semantically related strategy nodes via emergent.memory embeddings. Requires Memory API config."),
			mcp.WithString("query", mcp.Required(), mcp.Description("Search query")),
			mcp.WithString("limit", mcp.Description("Maximum results (default: 10)")),
			mcp.WithString("type", mcp.Description("Filter by object type (e.g., Belief, Feature, OKR)")),
		),
		s.handleSemanticSearch,
	)

	s.mcpServer.AddTool(
		mcp.NewTool("epf_semantic_neighbors",
			mcp.WithDescription("[Semantic] USE WHEN you need to see how a strategy node connects to others in the graph. Returns all incoming and outgoing edges with types and weights. Requires Memory API config."),
			mcp.WithString("node_key", mcp.Required(), mcp.Description("Node key (e.g., Belief:north_star:purpose, Feature:feature:fd-012)")),
		),
		s.handleSemanticNeighbors,
	)

	s.mcpServer.AddTool(
		mcp.NewTool("epf_semantic_impact",
			mcp.WithDescription("[Semantic] USE WHEN you want to analyze what would be affected if a strategy node changed. Runs the propagation circuit in dry-run mode showing the cascade trace. Requires Memory API config."),
			mcp.WithString("node_key", mcp.Required(), mcp.Description("Source node key where the change originates")),
			mcp.WithString("description", mcp.Required(), mcp.Description("Description of the change")),
			mcp.WithString("signal_strength", mcp.Description("Initial signal strength 0.0-1.0 (default: 1.0)")),
			mcp.WithString("mode", mcp.Description("Cascade mode: interactive (default), automatic, scenario")),
		),
		s.handleSemanticImpact,
	)
}

// getMemoryClient creates a Memory client from environment variables.
func (s *Server) getMemoryClient() (*memory.Client, error) {
	url := os.Getenv("EPF_MEMORY_URL")
	project := os.Getenv("EPF_MEMORY_PROJECT")
	token := os.Getenv("EPF_MEMORY_TOKEN")

	if url == "" || project == "" || token == "" {
		return nil, fmt.Errorf("Memory API not configured. Set EPF_MEMORY_URL, EPF_MEMORY_PROJECT, EPF_MEMORY_TOKEN environment variables")
	}

	return memory.NewClient(memory.Config{
		BaseURL:   url,
		ProjectID: project,
		Token:     token,
		Timeout:   30 * time.Second,
	})
}

// handleSemanticSearch searches the strategy graph semantically.
func (s *Server) handleSemanticSearch(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	query, _ := request.RequireString("query")
	if query == "" {
		return mcp.NewToolResultError("query parameter is required"), nil
	}

	limit := 10
	if limitStr, _ := request.RequireString("limit"); limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil {
			limit = n
		}
	}

	typeFilter, _ := request.RequireString("type")

	client, err := s.getMemoryClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Use search-with-neighbors endpoint (the working one)
	results, err := client.SearchWithNeighbors(ctx, memory.SearchRequest{
		Query: query,
		Limit: limit,
	})
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Search failed: %v", err)), nil
	}

	// Filter by type if specified and format results
	var formatted []map[string]any
	for _, r := range results {
		if typeFilter != "" && r.Object.Type != typeFilter {
			continue
		}
		entry := map[string]any{
			"key":   r.Object.Key,
			"type":  r.Object.Type,
			"score": r.Score,
			"name":  r.Object.Properties["name"],
		}
		if desc, ok := r.Object.Properties["description"].(string); ok && desc != "" {
			if len(desc) > 200 {
				desc = desc[:200] + "..."
			}
			entry["description"] = desc
		}
		if tier, ok := r.Object.Properties["inertia_tier"]; ok {
			entry["inertia_tier"] = tier
		}
		formatted = append(formatted, entry)
	}

	response := map[string]any{
		"query":   query,
		"results": formatted,
		"count":   len(formatted),
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleSemanticNeighbors returns the semantic neighborhood of a node.
func (s *Server) handleSemanticNeighbors(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	nodeKey, _ := request.RequireString("node_key")
	if nodeKey == "" {
		return mcp.NewToolResultError("node_key parameter is required"), nil
	}

	client, err := s.getMemoryClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Load graph snapshot
	graph, err := propagation.LoadGraphSnapshot(ctx, client)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load graph: %v", err)), nil
	}

	node, ok := graph.Nodes[nodeKey]
	if !ok {
		return mcp.NewToolResultError(fmt.Sprintf("Node %q not found in graph (%d nodes)", nodeKey, len(graph.Nodes))), nil
	}

	// Build neighborhood response
	var outgoing []map[string]any
	for _, e := range node.Outgoing {
		target := graph.Nodes[e.TargetKey]
		entry := map[string]any{
			"edge_type":   e.Type,
			"target_key":  e.TargetKey,
			"weight":      e.Weight,
			"edge_source": e.EdgeSource,
		}
		if target != nil {
			entry["target_type"] = target.Type
			entry["target_name"] = target.Properties["name"]
			entry["target_tier"] = target.InertiaTier
		}
		outgoing = append(outgoing, entry)
	}

	var incoming []map[string]any
	for _, e := range node.Incoming {
		source := graph.Nodes[e.TargetKey]
		entry := map[string]any{
			"edge_type":   e.Type,
			"source_key":  e.TargetKey,
			"weight":      e.Weight,
			"edge_source": e.EdgeSource,
		}
		if source != nil {
			entry["source_type"] = source.Type
			entry["source_name"] = source.Properties["name"]
			entry["source_tier"] = source.InertiaTier
		}
		incoming = append(incoming, entry)
	}

	response := map[string]any{
		"node": map[string]any{
			"key":          node.Key,
			"type":         node.Type,
			"inertia_tier": node.InertiaTier,
			"properties":   node.Properties,
		},
		"outgoing":       outgoing,
		"incoming":       incoming,
		"outgoing_count": len(outgoing),
		"incoming_count": len(incoming),
		"total_edges":    len(outgoing) + len(incoming),
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleSemanticImpact runs impact analysis via the propagation circuit.
func (s *Server) handleSemanticImpact(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	nodeKey, _ := request.RequireString("node_key")
	description, _ := request.RequireString("description")
	if nodeKey == "" || description == "" {
		return mcp.NewToolResultError("node_key and description parameters are required"), nil
	}

	signalStrength := 1.0
	if ss, _ := request.RequireString("signal_strength"); ss != "" {
		if f, err := strconv.ParseFloat(ss, 64); err == nil {
			signalStrength = f
		}
	}

	mode := propagation.ModeInteractive
	if m, _ := request.RequireString("mode"); m != "" {
		switch m {
		case "automatic":
			mode = propagation.ModeAutomatic
		case "scenario":
			mode = propagation.ModeScenario
		}
	}

	client, err := s.getMemoryClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Load graph
	graph, err := propagation.LoadGraphSnapshot(ctx, client)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load graph: %v", err)), nil
	}

	sourceNode, ok := graph.Nodes[nodeKey]
	if !ok {
		return mcp.NewToolResultError(fmt.Sprintf("Node %q not found in graph (%d nodes)", nodeKey, len(graph.Nodes))), nil
	}

	// Run circuit with heuristic reasoner
	config := propagation.DefaultConfig()
	config.Mode = mode
	config.DryRun = true
	config.DampingInterval = 0

	reasoner := &heuristicReasonerMCP{}
	circuit := propagation.NewCircuit(graph, reasoner, config)

	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  nodeKey,
		SourceNodeType: sourceNode.Type,
		ChangeType:     "content_modified",
		Description:    description,
		Strength:       signalStrength,
	})

	// Format trace
	var trace []map[string]any
	for _, e := range result.Trace {
		trace = append(trace, map[string]any{
			"node_key":        e.NodeKey,
			"node_type":       e.NodeType,
			"inertia_tier":    e.InertiaTier,
			"signal_strength": e.SignalStrength,
			"verdict":         string(e.Assessment.Verdict),
			"reasoning":       e.Assessment.Reasoning,
			"wave":            e.Wave,
		})
	}

	var proposed []map[string]any
	for _, pc := range result.ProposedChanges {
		proposed = append(proposed, map[string]any{
			"node_key":       pc.NodeKey,
			"node_type":      pc.NodeType,
			"classification": string(pc.Classification),
			"reasoning":      pc.Reasoning,
			"wave":           pc.Wave,
		})
	}

	response := map[string]any{
		"source":           nodeKey,
		"description":      description,
		"evaluations":      len(result.Trace),
		"proposed_changes": len(result.ProposedChanges),
		"skipped_nodes":    len(result.SkippedNodes),
		"waves":            result.Waves,
		"budget_exhausted": result.BudgetExhausted,
		"frozen_nodes":     result.FrozenNodes,
		"trace":            trace,
		"proposed":         proposed,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleContradictions detects structural contradictions in the graph.
func (s *Server) handleContradictions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := s.getMemoryClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	graph, err := propagation.LoadGraphSnapshot(ctx, client)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load graph: %v", err)), nil
	}

	contradictions := propagation.DetectContradictions(graph)

	// Group by severity
	bySeverity := map[string]int{}
	for _, c := range contradictions {
		bySeverity[c.Severity]++
	}

	var items []map[string]any
	for _, c := range contradictions {
		items = append(items, map[string]any{
			"type":        string(c.Type),
			"severity":    c.Severity,
			"description": c.Description,
			"node_a":      c.NodeAKey,
			"node_b":      c.NodeBKey,
		})
	}

	response := map[string]any{
		"total":          len(contradictions),
		"by_severity":    bySeverity,
		"contradictions": items,
		"graph_nodes":    len(graph.Nodes),
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// heuristicReasonerMCP is the same heuristic reasoner from cmd/impact.go
// duplicated here to avoid import cycles.
type heuristicReasonerMCP struct{}

func (r *heuristicReasonerMCP) Evaluate(req reasoning.EvaluationRequest) (*reasoning.Assessment, error) {
	target := req.Target

	if target.InertiaTier <= 2 {
		return &reasoning.Assessment{
			Verdict:        reasoning.VerdictNeedsReview,
			Confidence:     0.5,
			Reasoning:      fmt.Sprintf("Tier %d artifact requires human review for changes cascading from %s", target.InertiaTier, req.Signal.SourceNodeType),
			Classification: reasoning.ClassSemantic,
			ModelUsed:      "heuristic",
		}, nil
	}

	if target.InertiaTier <= 4 {
		if req.Signal.Strength > 0.5 {
			return &reasoning.Assessment{
				Verdict:         reasoning.VerdictModified,
				Confidence:      0.7,
				Reasoning:       fmt.Sprintf("Strategic artifact (%s) likely needs alignment with upstream change", target.Type),
				Classification:  reasoning.ClassSemantic,
				ProposedChanges: map[string]any{"_needs_review": "strategic alignment required"},
				ModelUsed:       "heuristic",
			}, nil
		}
		return &reasoning.Assessment{
			Verdict:        reasoning.VerdictUnchanged,
			Confidence:     0.6,
			Reasoning:      fmt.Sprintf("Signal too weak (%.2f) for tier %d", req.Signal.Strength, target.InertiaTier),
			Classification: reasoning.ClassMechanical,
			ModelUsed:      "heuristic",
		}, nil
	}

	if req.Signal.Strength > 0.3 {
		return &reasoning.Assessment{
			Verdict:         reasoning.VerdictModified,
			Confidence:      0.8,
			Reasoning:       fmt.Sprintf("Execution artifact (%s) affected by upstream change", target.Type),
			Classification:  reasoning.ClassMechanical,
			ProposedChanges: map[string]any{"_needs_review": "alignment check needed"},
			ModelUsed:       "heuristic",
		}, nil
	}

	return &reasoning.Assessment{
		Verdict:        reasoning.VerdictUnchanged,
		Confidence:     0.85,
		Reasoning:      fmt.Sprintf("Signal too weak (%.2f) for tier %d", req.Signal.Strength, target.InertiaTier),
		Classification: reasoning.ClassMechanical,
		ModelUsed:      "heuristic",
	}, nil
}
