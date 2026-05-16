package agent

import "strings"

// RoutingResult is the response from get_agent_for_task.
type RoutingResult struct {
	// Type is "direct_tool" or "agent".
	Type string `json:"type"`
	// ToolName is set when Type is "direct_tool".
	ToolName string `json:"tool_name,omitempty"`
	// ToolParams are suggested parameter names for the direct tool.
	ToolParams map[string]string `json:"tool_params,omitempty"`
	// AgentName is set when Type is "agent".
	AgentName string `json:"agent_name,omitempty"`
	// Skills are relevant skill names for the recommended agent.
	Skills []string `json:"skills,omitempty"`
	// Confidence is a score from 0.0 to 1.0.
	Confidence float64 `json:"confidence"`
	// Reason explains why this routing was chosen.
	Reason string `json:"reason"`
	// Alternatives are other possible matches when confidence is low.
	Alternatives []RoutingResult `json:"alternatives,omitempty"`
}

// routeEntry maps keywords to a routing result.
type routeEntry struct {
	keywords []string
	result   RoutingResult
}

// routingTable is the static routing table for task descriptions.
var routingTable = []routeEntry{
	// Direct tools — simple operations.
	{
		keywords: []string{"validate", "check", "verify", "lint"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "validate_artifact",
			Reason: "Validation is a direct tool call — no agent needed.",
		},
	},
	{
		keywords: []string{"health", "status", "check instance"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "health_check",
			Reason: "Health check is a direct read tool.",
		},
	},
	{
		keywords: []string{"search", "find", "look for", "query"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "search_strategy",
			Reason: "Semantic search is a direct tool call.",
		},
	},
	{
		keywords: []string{"list workspace", "show workspace", "my workspace"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "list_workspaces",
			Reason: "Workspace listing is a direct read tool.",
		},
	},
	{
		keywords: []string{"list feature", "show feature", "features"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "list_features",
			Reason: "Feature listing is a direct read tool.",
		},
	},
	{
		keywords: []string{"roadmap", "get roadmap", "show roadmap"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "get_roadmap",
			Reason: "Roadmap retrieval is a direct read tool.",
		},
	},
	{
		keywords: []string{"vision", "north star", "mission"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "get_product_vision",
			Reason: "Vision/north star retrieval is a direct read tool.",
		},
	},
	{
		keywords: []string{"persona", "target user", "customer"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "get_personas",
			Reason: "Persona retrieval is a direct read tool.",
		},
	},
	{
		keywords: []string{"competitive", "competitor", "market position"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "get_competitive_position",
			Reason: "Competitive analysis is a direct read tool.",
		},
	},
	{
		keywords: []string{"contradiction", "conflict", "inconsisten"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "detect_contradictions",
			Reason: "Contradiction detection is a direct read tool.",
		},
	},
	{
		keywords: []string{"neighbor", "connected", "graph", "edge", "relationship"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "get_neighbors",
			Reason: "Graph neighborhood is a direct read tool.",
		},
	},
	{
		keywords: []string{"schema", "artifact type", "field"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "list_schemas",
			Reason: "Schema discovery is a direct read tool.",
		},
	},

	// Agent routing — interactive workflows.
	{
		keywords: []string{"create feature", "new feature", "add feature", "define feature"},
		result: RoutingResult{
			Type: "agent", AgentName: "pathfinder",
			Skills: []string{"feature-definition"},
			Reason: "Feature creation requires the pathfinder agent with the feature-definition skill.",
		},
	},
	{
		keywords: []string{"update feature", "modify feature", "change feature", "edit feature"},
		result: RoutingResult{
			Type: "agent", AgentName: "pathfinder",
			Skills: []string{"feature-definition"},
			Reason: "Feature updates require the pathfinder agent for strategic alignment.",
		},
	},
	{
		keywords: []string{"strategy", "strategic", "plan", "roadmap update", "okr"},
		result: RoutingResult{
			Type: "agent", AgentName: "pathfinder",
			Skills: []string{"strategy-foundations", "roadmap-recipe"},
			Reason: "Strategic planning requires the pathfinder agent.",
		},
	},
	{
		keywords: []string{"value model", "contribution", "track"},
		result: RoutingResult{
			Type: "agent", AgentName: "pathfinder",
			Skills: []string{"value-model-preview"},
			Reason: "Value model work requires the pathfinder agent with value model skills.",
		},
	},
	{
		keywords: []string{"scenario", "what if", "what-if", "explore", "branch"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "run_scenario",
			Reason: "What-if scenario exploration starts with run_scenario.",
		},
	},
	{
		keywords: []string{"import", "onboard", "bootstrap"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "import_instance",
			Reason: "Instance import is a direct tool call.",
		},
	},
	{
		keywords: []string{"org", "organisation", "organization", "team", "member"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "list_orgs",
			Reason: "Organisation management uses direct org tools.",
		},
	},
	{
		keywords: []string{"invite", "add member", "add user"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "invite_member",
			Reason: "Member invitation is a direct org tool.",
		},
	},
	{
		keywords: []string{"lra", "living reality", "assessment", "aim"},
		result: RoutingResult{
			Type: "agent", AgentName: "pathfinder",
			Skills: []string{"living-reality-assessment"},
			Reason: "LRA creation requires the pathfinder agent with AIM skills.",
		},
	},
	{
		keywords: []string{"phase artifact", "ready artifact", "fire artifact", "aim artifact", "artifact type"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "get_phase_artifacts",
			Reason: "Phase artifact discovery is a direct read tool.",
		},
	},
	{
		keywords: []string{"definition", "track definition", "commercial def", "org ops def"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "list_definitions",
			Reason: "Track definition listing is a direct read tool.",
		},
	},
	{
		keywords: []string{"fix plan", "validation plan", "fix error", "prioritize error"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "validate_with_plan",
			Reason: "Validation fix plan is a direct tool call.",
		},
	},
	{
		keywords: []string{"assumption", "untested", "assumption coverage"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "validate_assumptions",
			Reason: "Assumption validation is a direct read tool.",
		},
	},
	{
		keywords: []string{"calibration", "calibrate"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "stage_calibration",
			Reason: "Calibration memo staging is a direct write tool.",
		},
	},
	{
		keywords: []string{"add relationship", "create relationship", "link artifact"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "add_relationship",
			Reason: "Relationship creation is a direct write tool.",
		},
	},
	{
		keywords: []string{"suggest relationship", "missing relationship", "relationship gap"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "suggest_relationships",
			Reason: "Relationship suggestion is a direct read tool.",
		},
	},
	{
		keywords: []string{"discard scenario", "delete scenario", "cancel scenario"},
		result: RoutingResult{
			Type: "direct_tool", ToolName: "discard_scenario",
			Reason: "Scenario discard is a direct write tool.",
		},
	},
}

// RouteTask routes a natural-language task description to the appropriate
// tool or agent. Uses keyword matching and category scoring.
func RouteTask(taskDescription string) RoutingResult {
	lower := strings.ToLower(taskDescription)

	var bestMatch *routeEntry
	bestScore := 0

	for i := range routingTable {
		entry := &routingTable[i]
		score := 0
		for _, kw := range entry.keywords {
			if strings.Contains(lower, kw) {
				score += len(kw) // longer keyword matches score higher
			}
		}
		if score > bestScore {
			bestScore = score
			bestMatch = entry
		}
	}

	if bestMatch == nil {
		// No match — return a low-confidence suggestion.
		return RoutingResult{
			Type:       "direct_tool",
			ToolName:   "search_strategy",
			Confidence: 0.2,
			Reason:     "No specific tool match found. Try searching the strategy graph first.",
		}
	}

	result := bestMatch.result
	// Calculate confidence based on how many keywords matched vs total.
	matchedKWs := 0
	for _, kw := range bestMatch.keywords {
		if strings.Contains(lower, kw) {
			matchedKWs++
		}
	}
	result.Confidence = float64(matchedKWs) / float64(len(bestMatch.keywords))
	if result.Confidence > 1.0 {
		result.Confidence = 1.0
	}
	if result.Confidence < 0.3 {
		result.Confidence = 0.3 // minimum for a keyword match
	}

	// Add alternatives if confidence is low.
	if result.Confidence < 0.7 {
		for i := range routingTable {
			entry := &routingTable[i]
			if entry == bestMatch {
				continue
			}
			for _, kw := range entry.keywords {
				if strings.Contains(lower, kw) {
					alt := entry.result
					alt.Confidence = 0.2
					result.Alternatives = append(result.Alternatives, alt)
					break
				}
			}
		}
	}

	return result
}
