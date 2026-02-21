package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/strategy"
	"github.com/mark3labs/mcp-go/mcp"
)

// registerStrategyTools registers all strategy-related MCP tools.
func (s *Server) registerStrategyTools() {
	// Tool: epf_get_product_vision
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_product_vision",
			mcp.WithDescription("Get the product's vision, mission, purpose, and values from the North Star artifact. "+
				"This is the enduring strategic context that rarely changes. "+
				"SHOULD be called before any feature work, roadmap changes, or content creation to ensure strategic alignment."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleGetProductVision,
	)

	// Tool: epf_get_personas
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_personas",
			mcp.WithDescription("Get all personas (target users) from the EPF instance. "+
				"Returns a summary of each persona with ID, name, role, and description. "+
				"SHOULD be called before writing user-facing features or personas to ensure alignment with defined target users."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleGetPersonas,
	)

	// Tool: epf_get_persona_details
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_persona_details",
			mcp.WithDescription("Get full details for a specific persona including goals, pain points, "+
				"usage context, and technical proficiency. "+
				"Use when writing persona narratives, feature scenarios, or user-facing copy that must reflect real user needs."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("persona_id",
				mcp.Required(),
				mcp.Description("Persona ID or name to look up"),
			),
		),
		s.handleGetPersonaDetails,
	)

	// Tool: epf_get_value_propositions
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_value_propositions",
			mcp.WithDescription("Get value propositions from the strategy formula. "+
				"Optionally filter by persona ID to get propositions relevant to a specific persona. "+
				"Use before feature design to understand what value the product delivers and to whom."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("persona_id",
				mcp.Description("Optional persona ID to filter value propositions"),
			),
		),
		s.handleGetValuePropositions,
	)

	// Tool: epf_get_competitive_position
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_competitive_position",
			mcp.WithDescription("Get competitive analysis and positioning from the strategy formula. "+
				"Includes competitive moat, advantages, differentiation, and competitor comparisons. "+
				"SHOULD be consulted before competitive feature decisions or positioning changes."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
		),
		s.handleGetCompetitivePosition,
	)

	// Tool: epf_get_roadmap_summary
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_roadmap_summary",
			mcp.WithDescription("Get roadmap summary with OKRs and key results. "+
				"Optionally filter by track name or cycle number. "+
				"SHOULD be queried before roadmap changes or when planning new features to understand current objectives."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("track",
				mcp.Description("Optional track name to filter (product, strategy, org_ops, commercial)"),
			),
			mcp.WithString("cycle",
				mcp.Description("Optional cycle number to filter (as string, e.g., '1')"),
			),
		),
		s.handleGetRoadmapSummary,
	)

	// Tool: epf_search_strategy
	s.mcpServer.AddTool(
		mcp.NewTool("epf_search_strategy",
			mcp.WithDescription("Search across all strategy content including vision, personas, features, OKRs, and insights. "+
				"Returns relevance-scored results with snippets. "+
				"Use for broad strategic queries when you need to find relevant context across all strategy artifacts."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("query",
				mcp.Required(),
				mcp.Description("Search query"),
			),
			mcp.WithString("limit",
				mcp.Description("Maximum number of results (default: 20)"),
			),
			mcp.WithString("types",
				mcp.Description("Comma-separated list of types to search (e.g., 'persona,feature,okr')"),
			),
		),
		s.handleSearchStrategy,
	)

	// Tool: epf_get_feature_strategy_context
	s.mcpServer.AddTool(
		mcp.NewTool("epf_get_feature_strategy_context",
			mcp.WithDescription("Get synthesized strategic context for a topic. "+
				"Traverses relationships to gather vision, personas, features, OKRs, and competitive context. "+
				"Use before implementing a feature or making strategic decisions to get full context in one call."),
			mcp.WithString("instance_path",
				mcp.Required(),
				mcp.Description("Path to the EPF instance directory"),
			),
			mcp.WithString("topic",
				mcp.Required(),
				mcp.Description("Topic to get strategic context for"),
			),
		),
		s.handleGetFeatureStrategyContext,
	)
}

// handleGetProductVision handles the epf_get_product_vision tool
func (s *Server) handleGetProductVision(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy store: %s", err.Error())), nil
	}

	ns, err := store.GetProductVision()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get product vision: %s", err.Error())), nil
	}

	// Build response
	response := map[string]interface{}{
		"organization": ns.Organization,
		"purpose": map[string]interface{}{
			"statement":        ns.Purpose.Statement,
			"problem_we_solve": ns.Purpose.ProblemWeSolve,
			"who_we_serve":     ns.Purpose.WhoWeServe,
			"impact_we_seek":   ns.Purpose.ImpactWeSeek,
		},
		"vision": map[string]interface{}{
			"statement":          ns.Vision.Statement,
			"timeframe":          ns.Vision.Timeframe,
			"success_looks_like": ns.Vision.SuccessLooksLike,
		},
		"mission": map[string]interface{}{
			"statement":    ns.Mission.Statement,
			"what_we_do":   ns.Mission.WhatWeDo,
			"who_we_serve": ns.Mission.WhoWeServe,
		},
		"values": formatValues(ns.Values),
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

func formatValues(values []strategy.Value) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(values))
	for _, v := range values {
		result = append(result, map[string]interface{}{
			"name":       v.Name,
			"definition": v.Definition,
		})
	}
	return result
}

// handleGetPersonas handles the epf_get_personas tool
func (s *Server) handleGetPersonas(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy store: %s", err.Error())), nil
	}

	personas, err := store.GetPersonas()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get personas: %s", err.Error())), nil
	}

	response := map[string]interface{}{
		"count":    len(personas),
		"personas": personas,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleGetPersonaDetails handles the epf_get_persona_details tool
func (s *Server) handleGetPersonaDetails(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	personaID, err := request.RequireString("persona_id")
	if err != nil {
		return mcp.NewToolResultError("persona_id parameter is required"), nil
	}

	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy store: %s", err.Error())), nil
	}

	persona, painPoints, err := store.GetPersonaDetails(personaID)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get persona details: %s", err.Error())), nil
	}

	response := map[string]interface{}{
		"id":                    persona.ID,
		"name":                  persona.Name,
		"role":                  persona.Role,
		"description":           persona.Description,
		"goals":                 persona.Goals,
		"usage_context":         persona.UsageContext,
		"technical_proficiency": persona.TechnicalProficiency,
		"pain_points":           formatPainPoints(painPoints),
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

func formatPainPoints(painPoints []strategy.PainPoint) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(painPoints))
	for _, pp := range painPoints {
		result = append(result, map[string]interface{}{
			"description": pp.Description,
			"category":    pp.Category,
		})
	}
	return result
}

// handleGetValuePropositions handles the epf_get_value_propositions tool
func (s *Server) handleGetValuePropositions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	personaID, _ := request.RequireString("persona_id")

	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy store: %s", err.Error())), nil
	}

	props, err := store.GetValuePropositions(personaID)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get value propositions: %s", err.Error())), nil
	}

	response := map[string]interface{}{
		"count":              len(props),
		"value_propositions": props,
	}

	if len(props) == 0 {
		response["searched"] = map[string]interface{}{
			"file":   "READY/04_strategy_formula.yaml",
			"fields": []string{"positioning.unique_value_prop", "positioning.statement"},
		}
		response["note"] = "No value propositions found. Ensure positioning.unique_value_prop and/or positioning.statement are populated in the strategy formula."
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

// handleGetCompetitivePosition handles the epf_get_competitive_position tool
func (s *Server) handleGetCompetitivePosition(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy store: %s", err.Error())), nil
	}

	moat, positioning, err := store.GetCompetitivePosition()
	if err != nil {
		// Provide a more specific error when strategy formula exists but competitive section is absent
		return mcp.NewToolResultError(fmt.Sprintf(
			"Failed to get competitive position: %s. "+
				"This data comes from the competitive_moat and positioning sections in READY/04_strategy_formula.yaml.",
			err.Error())), nil
	}

	// Detect empty sections and warn
	var missingSections []string
	if moat.Differentiation == "" && len(moat.Advantages) == 0 && len(moat.VsCompetitors) == 0 {
		missingSections = append(missingSections, "competitive_moat")
	}
	if positioning.UniqueValueProp == "" && positioning.Statement == "" && positioning.TargetCustomer == "" {
		missingSections = append(missingSections, "positioning")
	}

	response := map[string]interface{}{
		"positioning": map[string]interface{}{
			"unique_value_prop":  positioning.UniqueValueProp,
			"target_customer":    positioning.TargetCustomer,
			"category_position":  positioning.CategoryPosition,
			"statement":          positioning.Statement,
			"tagline_candidates": positioning.TaglineCandidates,
		},
		"competitive_moat": map[string]interface{}{
			"differentiation": moat.Differentiation,
			"advantages":      formatAdvantages(moat.Advantages),
			"vs_competitors":  formatCompetitors(moat.VsCompetitors),
		},
	}

	if len(missingSections) > 0 {
		response["warnings"] = map[string]interface{}{
			"empty_sections": missingSections,
			"file":           "READY/04_strategy_formula.yaml",
			"note":           fmt.Sprintf("The following sections are empty: %s. Populate them in the strategy formula.", strings.Join(missingSections, ", ")),
		}
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

func formatAdvantages(advantages []strategy.Advantage) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(advantages))
	for _, a := range advantages {
		result = append(result, map[string]interface{}{
			"name":          a.Name,
			"description":   a.Description,
			"defensibility": a.Defensibility,
			"evidence":      a.Evidence,
		})
	}
	return result
}

func formatCompetitors(competitors []strategy.CompetitorComparison) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(competitors))
	for _, c := range competitors {
		result = append(result, map[string]interface{}{
			"competitor":     c.Competitor,
			"their_strength": c.TheirStrength,
			"our_angle":      c.OurAngle,
			"wedge":          c.Wedge,
		})
	}
	return result
}

// handleGetRoadmapSummary handles the epf_get_roadmap_summary tool
func (s *Server) handleGetRoadmapSummary(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	track, _ := request.RequireString("track")
	cycleStr, _ := request.RequireString("cycle")

	cycle := 0
	if cycleStr != "" {
		fmt.Sscanf(cycleStr, "%d", &cycle)
	}

	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy store: %s", err.Error())), nil
	}

	roadmap, err := store.GetRoadmapSummary(track, cycle)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get roadmap summary: %s", err.Error())), nil
	}

	response := map[string]interface{}{
		"id":        roadmap.ID,
		"cycle":     roadmap.Cycle,
		"timeframe": roadmap.Timeframe,
		"tracks":    formatTracks(roadmap.Tracks),
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

func formatTracks(tracks map[string]*strategy.Track) map[string]interface{} {
	result := make(map[string]interface{})
	for name, track := range tracks {
		result[name] = map[string]interface{}{
			"objective": track.TrackObjective,
			"okrs":      formatOKRs(track.OKRs),
		}
	}
	return result
}

func formatOKRs(okrs []strategy.OKR) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(okrs))
	for _, okr := range okrs {
		result = append(result, map[string]interface{}{
			"id":          okr.ID,
			"objective":   okr.Objective,
			"key_results": formatKeyResults(okr.KeyResults),
		})
	}
	return result
}

func formatKeyResults(krs []strategy.KeyResult) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(krs))
	for _, kr := range krs {
		result = append(result, map[string]interface{}{
			"id":          kr.ID,
			"description": kr.Description,
			"target":      kr.Target,
			"status":      kr.Status,
		})
	}
	return result
}

// handleSearchStrategy handles the epf_search_strategy tool
func (s *Server) handleSearchStrategy(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	query, err := request.RequireString("query")
	if err != nil {
		return mcp.NewToolResultError("query parameter is required"), nil
	}

	limitStr, _ := request.RequireString("limit")
	limit := 20
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}

	typesStr, _ := request.RequireString("types")
	var types []string
	if typesStr != "" {
		types = strings.Split(typesStr, ",")
		for i := range types {
			types[i] = strings.TrimSpace(types[i])
		}
	}

	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy store: %s", err.Error())), nil
	}

	// Use the Searcher for better search results
	model := store.GetModel()
	searcher := strategy.NewSearcher(model)
	results := searcher.Search(query, strategy.SearchOptions{
		Limit: limit,
		Types: types,
	})

	response := map[string]interface{}{
		"query":   query,
		"count":   len(results),
		"results": formatSearchResults(results),
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}

func formatSearchResults(results []strategy.SearchResult) []map[string]interface{} {
	formatted := make([]map[string]interface{}, 0, len(results))
	for _, r := range results {
		formatted = append(formatted, map[string]interface{}{
			"type":    r.Type,
			"id":      r.ID,
			"title":   r.Title,
			"snippet": r.Snippet,
			"score":   r.Score,
			"source":  r.Source,
			"context": r.Context,
		})
	}
	return formatted
}

// handleGetFeatureStrategyContext handles the epf_get_feature_strategy_context tool
func (s *Server) handleGetFeatureStrategyContext(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath := s.resolveInstancePath(request)
	if instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	topic, err := request.RequireString("topic")
	if err != nil {
		return mcp.NewToolResultError("topic parameter is required"), nil
	}

	store, err := getOrCreateStrategyStore(instancePath)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to load strategy store: %s", err.Error())), nil
	}

	ctx2, err := store.GetStrategicContext(topic)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get strategic context: %s", err.Error())), nil
	}

	response := map[string]interface{}{
		"topic":               ctx2.Topic,
		"vision":              ctx2.Vision,
		"relevant_personas":   ctx2.RelevantPersonas,
		"relevant_features":   ctx2.RelevantFeatures,
		"relevant_okrs":       ctx2.RelevantOKRs,
		"competitive_context": ctx2.CompetitiveContext,
		"key_insights":        ctx2.KeyInsights,
	}

	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	return mcp.NewToolResultText(string(jsonBytes)), nil
}
