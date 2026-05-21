package mcpserver

// Activity stream MCP tools — Stage 6 of the continuous strategy loop.
//
// Tools:
//   - list_activities: return recent activity events for a strategy instance
//
// The SSE fanout for browser UIs is served as an HTTP endpoint by the web handler:
//   GET /strategies/:instance_id/activity/stream
// Clients connect with EventSource; the server pushes JSON-encoded Activity objects.

import (
	"context"
	"encoding/json"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerActivityTools(s *server.MCPServer, svc Services) {
	if svc.Activity == nil {
		return
	}

	// -----------------------------------------------------------------------
	// list_activities
	// -----------------------------------------------------------------------

	s.AddTool(
		mcp.NewTool("list_activities",
			mcp.WithDescription("USE WHEN you need the recent activity stream for a strategy instance — "+
				"shows proposal lifecycle events, cycle starts, evidence ingestion, assessments committed, "+
				"and heartbeat triggers. Returns newest events first."),
			mcp.WithString("instance_id",
				mcp.Required(),
				mcp.Description("Strategy instance UUID")),
			mcp.WithNumber("limit",
				mcp.Description("Maximum number of events to return (1–200, default 50)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			instanceID, err := parseUUID(argString(req, "instance_id"))
			if err != nil {
				return toolErr(ctx, err), nil //nolint:nilerr // MCP pattern: wrap business error in result body
			}
			limit := int(argFloat(req, "limit"))

			events, err := svc.Activity.List(ctx, instanceID, limit)
			if err != nil {
				return toolErr(ctx, err), nil //nolint:nilerr // MCP pattern
			}

			raw, _ := json.Marshal(events)
			return mcp.NewToolResultText(string(raw)), nil
		},
	)
}
