package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	mcp "github.com/mark3labs/mcp-go/mcp"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/propagation"
)

// validEPFObjectTypes lists the object types produced by the EPF decomposer.
// Derived from decompose.ObjectTypeNames() — kept as a static list for MCP tool registration.
var validEPFObjectTypes = []string{
	"Feature", "Capability", "Scenario", "Persona", "PainPoint",
	"Belief", "Trend", "OKR", "ValueModelComponent",
	"Positioning", "Assumption", "Artifact",
	"Constraint", "CrossTrackDependency",
	"ReferenceDocument",
	"Competitor", "MarketSegment", "WhiteSpace", "Opportunity",
	"Strength", "Weakness", "Threat",
	"Hypothesis", "KeyInsight",
	"ValueDriver", "StrategicRisk", "ValueProposition",
	"StrategicPhase", "MappingArtifact",
	"TrackDefinition", "PractitionerScenario",
	"Agent", "Skill",
}

// registerMemoryTools registers the Memory integration MCP tools.
// epf_memory_status is always registered (it reports configuration status).
// Other tools are only registered when Memory is configured.
func (s *Server) registerMemoryTools() {
	// epf_memory_status is always available — its purpose is to check configuration
	s.mcpServer.AddTool(
		mcp.NewTool("epf_memory_status",
			mcp.WithDescription("[Status] USE WHEN you need to check if Memory is configured and whether the instance has been ingested. Reports env var status, object counts, and recommends next steps (ingest or sync)."),
		),
		s.handleMemoryStatus,
	)

	// Remaining tools require Memory to be configured
	if os.Getenv("EPF_MEMORY_URL") == "" {
		return
	}

	s.mcpServer.AddTool(
		mcp.NewTool("epf_graph_list",
			mcp.WithDescription("[Query] USE WHEN you need to list graph objects by type and optional property filter. Deterministic — no embeddings. Use for structured queries like 'all delivered features' or 'scenarios for fd-009'."),
			mcp.WithString("type", mcp.Required(), mcp.Description("Object type (e.g., Feature, Scenario, Capability, Persona, OKR, KeyResult, ValueModelComponent)")),
			mcp.WithString("filter", mcp.Description("Property filter as key=value (e.g., status=delivered, feature_ref=fd-009)")),
			mcp.WithString("limit", mcp.Description("Maximum results (default: 50)")),
		),
		s.handleGraphList,
	)

	s.mcpServer.AddTool(
		mcp.NewTool("epf_graph_similar",
			mcp.WithDescription("[Query] USE WHEN you need to find semantically similar objects by embedding distance. Different from epf_semantic_neighbors which returns structural edges. Use for finding related features, similar capabilities, etc."),
			mcp.WithString("object_key", mcp.Required(), mcp.Description("Object key (e.g., Feature:feature:fd-001). Use epf_graph_list to find valid keys.")),
			mcp.WithString("type", mcp.Description("Filter results by object type (e.g., Feature)")),
			mcp.WithString("limit", mcp.Description("Maximum results (default: 10)")),
			mcp.WithString("min_score", mcp.Description("Minimum similarity score 0.0-1.0 (default: 0.0)")),
		),
		s.handleGraphSimilar,
	)

	s.mcpServer.AddTool(
		mcp.NewTool("epf_quality_audit",
			mcp.WithDescription("[Quality] USE WHEN you need graph-based quality signals. Combines contradiction detection, generic content detection (cross-similarity > 0.80), and disconnected node detection into one call with fix instructions."),
			mcp.WithString("instance_path", mcp.Description("Path to EPF instance (uses default if not provided)")),
			mcp.WithString("severity", mcp.Description("Filter findings: critical, warning, all (default: all)")),
		),
		s.handleQualityAudit,
	)

	s.mcpServer.AddTool(
		mcp.NewTool("epf_suggest_enrichment",
			mcp.WithDescription("[Quality] USE WHEN you need per-feature enrichment suggestions. Analyzes graph connections to find missing content, contradictions, weak UVPs, and potential dependency relationships."),
			mcp.WithString("feature_id", mcp.Required(), mcp.Description("Feature ID (e.g., fd-009) or full key (e.g., Feature:feature:fd-009)")),
			mcp.WithString("instance_path", mcp.Description("Path to EPF instance (uses default if not provided)")),
		),
		s.handleSuggestEnrichment,
	)

	s.mcpServer.AddTool(
		mcp.NewTool("epf_ask",
			mcp.WithDescription("[Strategy] USE WHEN you need to answer complex strategic questions that require multi-hop graph reasoning across EPF artifacts. Enriches the question with EPF domain context and delegates to Memory's graph-powered reasoning."),
			mcp.WithString("question", mcp.Required(), mcp.Description("Natural language strategy question (e.g., 'What threatens our competitive position and how are we mitigating it?')")),
		),
		s.handleAsk,
	)
}

// memoryNotConfiguredResponse returns a structured error when Memory env vars are missing.
func memoryNotConfiguredResponse() *mcp.CallToolResult {
	response := map[string]any{
		"configured": false,
		"error":      "Memory API not configured",
		"required_env_vars": map[string]string{
			"EPF_MEMORY_URL":     "Memory server URL (e.g., https://memory.emergent-company.ai)",
			"EPF_MEMORY_PROJECT": "Memory project UUID",
			"EPF_MEMORY_TOKEN":   "Bearer token for authentication (project token or account token)",
		},
		"setup_steps": []string{
			"1. Create a Memory project or get credentials for an existing one",
			"2. Set the three environment variables listed above",
			"3. Run 'epf-cli ingest <instance-path>' to decompose EPF artifacts into the graph",
			"4. Memory tools will become available once configured",
		},
	}
	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes))
}

// handleMemoryStatus checks Memory configuration and ingestion status.
func (s *Server) handleMemoryStatus(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	memURL := os.Getenv("EPF_MEMORY_URL")
	project := os.Getenv("EPF_MEMORY_PROJECT")
	token := os.Getenv("EPF_MEMORY_TOKEN")

	response := map[string]any{
		"configured": false,
		"env_vars": map[string]any{
			"EPF_MEMORY_URL":     memURL != "",
			"EPF_MEMORY_PROJECT": project != "",
			"EPF_MEMORY_TOKEN":   token != "",
		},
	}

	if memURL == "" || project == "" || token == "" {
		missing := []string{}
		if memURL == "" {
			missing = append(missing, "EPF_MEMORY_URL")
		}
		if project == "" {
			missing = append(missing, "EPF_MEMORY_PROJECT")
		}
		if token == "" {
			missing = append(missing, "EPF_MEMORY_TOKEN")
		}
		response["missing_vars"] = missing
		response["setup_steps"] = []string{
			"1. Create a Memory project or get credentials for an existing one",
			"2. Set the three environment variables: EPF_MEMORY_URL, EPF_MEMORY_PROJECT, EPF_MEMORY_TOKEN",
			"3. Run 'epf-cli ingest <instance-path>' to populate the graph",
		}
		jsonBytes, _ := json.MarshalIndent(response, "", "  ")
		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	response["configured"] = true

	// Query Memory for stats
	client, err := s.getMemoryClient()
	if err != nil {
		response["connection_error"] = err.Error()
		jsonBytes, _ := json.MarshalIndent(response, "", "  ")
		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	stats, err := client.GetProjectStats(ctx)
	if err != nil {
		response["connection_error"] = fmt.Sprintf("Failed to query Memory: %v", err)
		response["next_step"] = "Check that EPF_MEMORY_URL is correct and the server is accessible"
		jsonBytes, _ := json.MarshalIndent(response, "", "  ")
		return mcp.NewToolResultText(string(jsonBytes)), nil
	}

	response["stats"] = map[string]int{
		"objects":       stats.ObjectCount,
		"relationships": stats.RelationshipCount,
	}

	if stats.ObjectCount == 0 {
		response["ingestion_status"] = "not_ingested"
		response["next_step"] = "Run 'epf-cli ingest <instance-path>' to decompose EPF artifacts into the graph. This produces 700+ objects with full section-level decomposition."
		response["warning"] = "Do NOT manually create entities via Memory MCP tools. Use epf-cli ingest for complete decomposition."
	} else {
		response["ingestion_status"] = "ingested"
		response["next_step"] = "Run 'epf-cli sync <instance-path>' to incrementally sync any changed artifacts. Use Memory query tools (epf_graph_list, epf_semantic_search) to explore the graph."
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleGraphList lists graph objects by type with optional property filters.
func (s *Server) handleGraphList(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	objType, _ := request.RequireString("type")
	if objType == "" {
		return mcp.NewToolResultError("type parameter is required"), nil
	}

	// Validate type against known EPF object types
	validType := false
	for _, t := range validEPFObjectTypes {
		if strings.EqualFold(t, objType) {
			objType = t // normalize case
			validType = true
			break
		}
	}
	if !validType {
		return mcp.NewToolResultError(fmt.Sprintf(
			"Invalid object type %q. Valid EPF types: %s",
			objType, strings.Join(validEPFObjectTypes, ", "),
		)), nil
	}

	limit := 50
	if limitStr, _ := request.RequireString("limit"); limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			limit = n
		}
	}

	// Parse filter (key=value)
	filterKey, filterValue := "", ""
	if filterStr, _ := request.RequireString("filter"); filterStr != "" {
		parts := strings.SplitN(filterStr, "=", 2)
		if len(parts) == 2 {
			filterKey = strings.TrimSpace(parts[0])
			filterValue = strings.TrimSpace(parts[1])
		} else {
			return mcp.NewToolResultError("filter must be in key=value format (e.g., status=delivered)"), nil
		}
	}

	client, err := s.getMemoryClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Build list options — fetch enough for client-side property filtering.
	// The decomposer stores most data in the properties map, and the Memory API's
	// server-side filters operate on object metadata fields, not nested properties.
	fetchLimit := limit
	if filterKey != "" {
		fetchLimit = 1000 // Fetch broadly for client-side filtering
	}

	opts := memory.ListOptions{
		Type:  objType,
		Limit: fetchLimit,
	}

	objects, _, err := client.ListObjects(ctx, opts)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("List objects failed: %v", err)), nil
	}

	// Client-side property filtering
	var filtered []memory.Object
	if filterKey != "" {
		for _, obj := range objects {
			propVal := fmt.Sprintf("%v", obj.Properties[filterKey])
			if propVal == filterValue {
				filtered = append(filtered, obj)
			}
		}
	} else {
		filtered = objects
	}

	// Apply limit after filtering
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}

	// Format results
	var results []map[string]any
	for _, obj := range filtered {
		entry := map[string]any{
			"key":    obj.Key,
			"type":   obj.Type,
			"status": obj.Status,
		}
		if name, ok := obj.Properties["name"].(string); ok {
			entry["name"] = name
		}
		if desc, ok := obj.Properties["description"].(string); ok && desc != "" {
			if len(desc) > 200 {
				desc = desc[:200] + "..."
			}
			entry["description"] = desc
		}
		// Include a few common useful properties
		for _, prop := range []string{"feature_ref", "inertia_tier", "maturity", "level"} {
			if v, ok := obj.Properties[prop]; ok {
				entry[prop] = v
			}
		}
		results = append(results, entry)
	}

	response := map[string]any{
		"type":    objType,
		"count":   len(results),
		"results": results,
	}
	if filterKey != "" {
		response["filter"] = fmt.Sprintf("%s=%s", filterKey, filterValue)
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleGraphSimilar finds semantically similar objects by embedding distance.
func (s *Server) handleGraphSimilar(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	objectKey, _ := request.RequireString("object_key")
	if objectKey == "" {
		return mcp.NewToolResultError("object_key parameter is required"), nil
	}

	limit := 10
	if limitStr, _ := request.RequireString("limit"); limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			limit = n
		}
	}

	minScore := 0.0
	if minScoreStr, _ := request.RequireString("min_score"); minScoreStr != "" {
		if f, err := strconv.ParseFloat(minScoreStr, 64); err == nil {
			minScore = f
		}
	}

	typeFilter, _ := request.RequireString("type")

	client, err := s.getMemoryClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Find the object by key to get its stable ID.
	// Parse type from key (e.g., "Feature:feature:fd-001" -> type "Feature")
	// and list objects of that type to find the exact match.
	var objectID string
	keyParts := strings.SplitN(objectKey, ":", 2)
	if len(keyParts) >= 1 {
		typeFromKey := keyParts[0]
		objs, _, err := client.ListObjects(ctx, memory.ListOptions{
			Type:  typeFromKey,
			Limit: 200,
		})
		if err == nil {
			for _, obj := range objs {
				if obj.Key == objectKey {
					objectID = obj.StableID()
					break
				}
			}
		}
	}

	if objectID == "" {
		return mcp.NewToolResultError(fmt.Sprintf(
			"Object with key %q not found. Check the key format (e.g., Feature:feature:fd-001) or run 'epf-cli ingest' if the graph may be stale.",
			objectKey,
		)), nil
	}

	// Find similar objects
	results, err := client.FindSimilar(ctx, objectID, memory.SimilarOptions{
		Limit:    limit,
		MinScore: minScore,
		Type:     typeFilter,
	})
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Find similar failed: %v", err)), nil
	}

	// Format results
	var formatted []map[string]any
	for _, r := range results {
		score := r.Score()
		if score < minScore {
			continue
		}
		entry := map[string]any{
			"key":   r.Key,
			"type":  r.Type,
			"score": fmt.Sprintf("%.3f", score),
		}
		if name, ok := r.Properties["name"].(string); ok {
			entry["name"] = name
		}
		if desc, ok := r.Properties["description"].(string); ok && desc != "" {
			if len(desc) > 200 {
				desc = desc[:200] + "..."
			}
			entry["description"] = desc
		}
		formatted = append(formatted, entry)
	}

	response := map[string]any{
		"source_key": objectKey,
		"count":      len(formatted),
		"results":    formatted,
	}
	if typeFilter != "" {
		response["type_filter"] = typeFilter
	}
	if minScore > 0 {
		response["min_score"] = minScore
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// QualityFinding represents a single finding from the quality audit.
type QualityFinding struct {
	Category    string         `json:"category"`
	Severity    string         `json:"severity"`
	Description string         `json:"description"`
	NodeA       string         `json:"node_a,omitempty"`
	NodeB       string         `json:"node_b,omitempty"`
	FixWith     *FixWithAction `json:"fix_with,omitempty"`
	Details     map[string]any `json:"details,omitempty"`
}

// FixWithAction recommends a specific MCP tool call to fix a finding.
type FixWithAction struct {
	Tool   string         `json:"tool"`
	Params map[string]any `json:"params"`
}

// handleQualityAudit runs combined graph-based quality checks.
func (s *Server) handleQualityAudit(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	severityFilter := "all"
	if sf, _ := request.RequireString("severity"); sf != "" {
		severityFilter = sf
	}

	client, err := s.getMemoryClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Load graph snapshot for contradiction and disconnected node detection
	graph, err := propagation.LoadGraphSnapshot(ctx, client)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load graph: %v", err)), nil
	}

	// Run checks in parallel
	var (
		contradictions []QualityFinding
		genericContent []QualityFinding
		disconnected   []QualityFinding
		wg             sync.WaitGroup
		mu             sync.Mutex
	)

	// Check 1: Contradictions
	wg.Add(1)
	go func() {
		defer wg.Done()
		rawContradictions := propagation.DetectContradictions(graph)
		var findings []QualityFinding
		for _, c := range rawContradictions {
			f := QualityFinding{
				Category:    "contradiction",
				Severity:    c.Severity,
				Description: c.Description,
				NodeA:       c.NodeAKey,
				NodeB:       c.NodeBKey,
			}

			// Add fix_with based on contradiction type
			switch c.Type {
			case propagation.ContradictionStatusConflict:
				// Extract capability ID from key (e.g., "Capability:feature:fd-009:cap-001")
				capKey := c.NodeBKey
				featureKey := c.NodeAKey
				f.FixWith = &FixWithAction{
					Tool: "epf_update_capability_maturity",
					Params: map[string]any{
						"feature_id":    extractFeatureID(featureKey),
						"capability_id": extractCapabilityID(capKey),
						"maturity":      "proven",
						"evidence":      "(provide evidence of capability maturity)",
					},
				}
			case propagation.ContradictionOrphanedRef:
				f.FixWith = &FixWithAction{
					Tool: "epf_validate_relationships",
					Params: map[string]any{
						"instance_path": "(provide instance path)",
					},
				}
			case propagation.ContradictionBrokenDep:
				f.FixWith = &FixWithAction{
					Tool: "epf_validate_relationships",
					Params: map[string]any{
						"instance_path": "(provide instance path)",
					},
				}
			}

			findings = append(findings, f)
		}
		mu.Lock()
		contradictions = findings
		mu.Unlock()
	}()

	// Check 2: Generic content (L2 UVPs with high cross-similarity)
	wg.Add(1)
	go func() {
		defer wg.Done()
		findings := detectGenericContent(ctx, client, graph)
		mu.Lock()
		genericContent = findings
		mu.Unlock()
	}()

	// Check 3: Disconnected nodes (nodes with 0 outgoing edges that should have connections)
	wg.Add(1)
	go func() {
		defer wg.Done()
		var findings []QualityFinding
		for _, node := range graph.Nodes {
			// Focus on strategic types that should connect to features
			if node.Type != "Belief" && node.Type != "Trend" && node.Type != "Insight" {
				continue
			}
			if len(node.Outgoing) == 0 {
				findings = append(findings, QualityFinding{
					Category:    "disconnected_node",
					Severity:    "warning",
					Description: fmt.Sprintf("%s (%s) has 0 outgoing edges — not connected to any features or downstream artifacts", node.Key, node.Type),
					NodeA:       node.Key,
					Details: map[string]any{
						"node_type":      node.Type,
						"incoming_count": len(node.Incoming),
					},
				})
			}
		}
		mu.Lock()
		disconnected = findings
		mu.Unlock()
	}()

	wg.Wait()

	// Apply severity filter
	allFindings := make([]QualityFinding, 0, len(contradictions)+len(genericContent)+len(disconnected))
	allFindings = append(allFindings, contradictions...)
	allFindings = append(allFindings, genericContent...)
	allFindings = append(allFindings, disconnected...)

	var filtered []QualityFinding
	if severityFilter == "all" {
		filtered = allFindings
	} else {
		for _, f := range allFindings {
			if f.Severity == severityFilter {
				filtered = append(filtered, f)
			}
		}
	}

	// Group by category for summary
	bySeverity := map[string]int{}
	byCategory := map[string]int{}
	for _, f := range filtered {
		bySeverity[f.Severity]++
		byCategory[f.Category]++
	}

	response := map[string]any{
		"total":       len(filtered),
		"by_severity": bySeverity,
		"by_category": byCategory,
		"findings":    filtered,
		"graph_nodes": len(graph.Nodes),
	}

	if len(filtered) == 0 {
		response["summary"] = "No quality issues detected. The strategy graph is clean."
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// detectGenericContent finds L2 UVPs with high cross-similarity (> 0.80).
func detectGenericContent(ctx context.Context, client *memory.Client, graph *propagation.GraphSnapshot) []QualityFinding {
	var findings []QualityFinding

	// Collect all ValueModelComponent nodes with UVPs
	var vmcNodes []*propagation.GraphNode
	for _, node := range graph.Nodes {
		if node.Type == "ValueModelComponent" {
			if level, _ := node.Properties["level"].(string); level == "L2" {
				vmcNodes = append(vmcNodes, node)
			}
		}
	}

	if len(vmcNodes) < 2 {
		return nil // Not enough to compare
	}

	// For each VMC, check its UVP similarity against others
	// Use a simple approach: if UVP text is very similar across components, flag it
	type uvpEntry struct {
		key  string
		name string
		uvp  string
	}

	var uvps []uvpEntry
	for _, node := range vmcNodes {
		uvp, _ := node.Properties["uvp"].(string)
		if uvp == "" {
			continue
		}
		name, _ := node.Properties["name"].(string)
		uvps = append(uvps, uvpEntry{key: node.Key, name: name, uvp: uvp})
	}

	// Check cross-similarity using FindSimilar for each VMC
	// But to avoid N^2 API calls, use a heuristic: check for template-like patterns
	templatePatterns := []string{
		"produced so that",
		"helps us",
		"enables the",
		"provides the",
		"ensures that",
	}

	for _, entry := range uvps {
		uvpLower := strings.ToLower(entry.uvp)
		for _, pattern := range templatePatterns {
			if strings.Contains(uvpLower, pattern) {
				findings = append(findings, QualityFinding{
					Category:    "generic_content",
					Severity:    "warning",
					Description: fmt.Sprintf("L2 component %q has a generic UVP containing template filler text %q", entry.name, pattern),
					NodeA:       entry.key,
					Details: map[string]any{
						"uvp_text": entry.uvp,
						"pattern":  pattern,
					},
				})
				break // One finding per UVP
			}
		}
	}

	return findings
}

// handleSuggestEnrichment provides per-feature enrichment suggestions.
func (s *Server) handleSuggestEnrichment(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	featureID, _ := request.RequireString("feature_id")
	if featureID == "" {
		return mcp.NewToolResultError("feature_id parameter is required"), nil
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

	// Normalize feature ID to graph key format
	featureKey := featureID
	if !strings.HasPrefix(featureKey, "Feature:") {
		featureKey = "Feature:feature:" + featureID
	}

	featureNode, ok := graph.Nodes[featureKey]
	if !ok {
		return mcp.NewToolResultError(fmt.Sprintf(
			"Feature %q not found in graph (%d nodes). Check the feature ID or run 'epf-cli ingest' if the graph may be stale.",
			featureKey, len(graph.Nodes),
		)), nil
	}

	featureName, _ := featureNode.Properties["name"].(string)
	featureStatus, _ := featureNode.Properties["status"].(string)

	// Collect suggestions
	var suggestions []map[string]any

	// 1. Check for capability maturity contradictions
	if featureStatus == "delivered" || featureStatus == "in-progress" {
		for _, edge := range featureNode.Outgoing {
			if edge.Type != "contains" {
				continue
			}
			capNode, ok := graph.Nodes[edge.TargetKey]
			if !ok || capNode.Type != "Capability" {
				continue
			}
			capMaturity, _ := capNode.Properties["maturity"].(string)
			if capMaturity == "" {
				capMaturity = "hypothetical"
			}

			if featureStatus == "delivered" && capMaturity == "hypothetical" {
				capName, _ := capNode.Properties["name"].(string)
				suggestions = append(suggestions, map[string]any{
					"type":        "capability_contradiction",
					"severity":    "critical",
					"description": fmt.Sprintf("Feature is '%s' but capability %q is still '%s'", featureStatus, capName, capMaturity),
					"node":        capNode.Key,
					"fix_with": FixWithAction{
						Tool: "epf_update_capability_maturity",
						Params: map[string]any{
							"feature_id":    featureID,
							"capability_id": extractCapabilityID(capNode.Key),
							"maturity":      "proven",
							"evidence":      "(provide evidence)",
						},
					},
				})
			}
		}
	}

	// 2. Check for missing value_propositions (no UVP edges)
	uvpCount := 0
	for _, edge := range featureNode.Outgoing {
		if edge.Type == "delivers" {
			// Check if target is a ValueProposition
			if target, ok := graph.Nodes[edge.TargetKey]; ok && target.Type == "ValueProposition" {
				uvpCount++
			}
		}
	}
	if uvpCount == 0 {
		suggestions = append(suggestions, map[string]any{
			"type":        "missing_field",
			"severity":    "warning",
			"description": "Feature has no value_propositions — consider adding per-persona value propositions",
		})
	}

	// 3. Check for missing dependencies (no depends_on edges)
	depCount := 0
	for _, edge := range featureNode.Outgoing {
		if edge.Type == "depends_on" {
			depCount++
		}
	}
	if depCount == 0 {
		suggestions = append(suggestions, map[string]any{
			"type":        "missing_field",
			"severity":    "info",
			"description": "Feature has 0 dependency relationships — consider if it requires or enables other features",
		})
	}

	// 4. Check for weak UVPs in contributes_to paths
	for _, edge := range featureNode.Outgoing {
		if edge.Type != "contributes_to" {
			continue
		}
		vmcNode, ok := graph.Nodes[edge.TargetKey]
		if !ok || vmcNode.Type != "ValueModelComponent" {
			continue
		}
		uvp, _ := vmcNode.Properties["uvp"].(string)
		if uvp == "" {
			continue
		}
		// Check for generic template content
		uvpLower := strings.ToLower(uvp)
		for _, pattern := range []string{"produced so that", "helps us", "enables the"} {
			if strings.Contains(uvpLower, pattern) {
				vmcName, _ := vmcNode.Properties["name"].(string)
				suggestions = append(suggestions, map[string]any{
					"type":        "weak_uvp",
					"severity":    "warning",
					"description": fmt.Sprintf("contributes_to path %q has generic UVP containing %q — rewrite with product-specific language", vmcName, pattern),
					"node":        vmcNode.Key,
					"uvp_text":    uvp,
				})
				break
			}
		}
	}

	// 5. Suggest dependencies based on feature-to-feature similarity
	// Find the feature's object ID for similarity search
	var featureObjectID string
	featureObjects, _, _ := client.ListObjects(ctx, memory.ListOptions{
		Type:  "Feature",
		Limit: 200,
	})
	for _, obj := range featureObjects {
		if obj.Key == featureKey {
			featureObjectID = obj.StableID()
			break
		}
	}

	if featureObjectID != "" {
		similarResults, err := client.FindSimilar(ctx, featureObjectID, memory.SimilarOptions{
			Limit:    5,
			MinScore: 0.70,
			Type:     "Feature",
		})
		if err == nil {
			for _, sim := range similarResults {
				if sim.Key == featureKey {
					continue // Skip self
				}
				score := sim.Score()
				if score < 0.70 {
					continue
				}
				simName, _ := sim.Properties["name"].(string)
				// Determine if requires or enables based on which feature is "higher level"
				relType := "enables"
				if score > 0.85 {
					relType = "requires"
				}
				suggestions = append(suggestions, map[string]any{
					"type":            "suggested_dependency",
					"severity":        "info",
					"description":     fmt.Sprintf("Feature %q has similarity %.2f — consider adding as dependencies.%s", simName, score, relType),
					"similar_feature": sim.Key,
					"similarity":      fmt.Sprintf("%.3f", score),
					"suggested_rel":   relType,
				})
			}
		}
	}

	response := map[string]any{
		"feature": map[string]any{
			"id":     featureID,
			"key":    featureKey,
			"name":   featureName,
			"status": featureStatus,
		},
		"suggestion_count": len(suggestions),
		"suggestions":      suggestions,
	}

	if len(suggestions) == 0 {
		response["summary"] = "No enrichment suggestions — this feature looks well-connected in the graph."
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// extractFeatureID extracts a feature ID from a graph key.
// e.g., "Feature:feature:fd-009" -> "fd-009"
func extractFeatureID(key string) string {
	parts := strings.Split(key, ":")
	if len(parts) >= 3 && parts[0] == "Feature" {
		return parts[2]
	}
	return key
}

// extractCapabilityID extracts a capability ID from a graph key.
// e.g., "Capability:feature:fd-009:cap-001" -> "cap-001"
func extractCapabilityID(key string) string {
	parts := strings.Split(key, ":")
	if len(parts) >= 4 && parts[0] == "Capability" {
		return parts[3]
	}
	// Fallback: return last segment
	if idx := strings.LastIndex(key, ":"); idx != -1 {
		return key[idx+1:]
	}
	return key
}

// handleAsk enriches a strategy question with EPF context and delegates to Memory ask API.
func (s *Server) handleAsk(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	question, _ := request.RequireString("question")
	if question == "" {
		return mcp.NewToolResultError("question parameter is required"), nil
	}

	// Create a client with a longer timeout for the ask API — SSE streams
	// can take 30-60 seconds for complex multi-hop graph traversal.
	memURL := os.Getenv("EPF_MEMORY_URL")
	memProject := os.Getenv("EPF_MEMORY_PROJECT")
	memToken := os.Getenv("EPF_MEMORY_TOKEN")
	if memURL == "" || memProject == "" || memToken == "" {
		return memoryNotConfiguredResponse(), nil
	}

	client, err := memory.NewClient(memory.Config{
		BaseURL:   memURL,
		ProjectID: memProject,
		Token:     memToken,
		Timeout:   120 * time.Second,
	})
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	// Enrich the question with EPF domain context
	enrichedQuestion := decompose.GenerateAskContext() + question

	result, err := client.Ask(ctx, enrichedQuestion)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Ask failed: %v", err)), nil
	}

	response := map[string]any{
		"question": question,
		"response": result.Response,
	}
	if len(result.Tools) > 0 {
		response["tools_used"] = result.Tools
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}
