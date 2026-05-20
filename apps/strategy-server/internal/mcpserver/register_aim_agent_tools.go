package mcpserver

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerAIMAgentTools registers the 4 AI-assisted AIM agent loop tools.
// These are only registered when an AIM service is wired into Services.
func registerAIMAgentTools(s *server.MCPServer, svc Services) {
	if svc.AIM == nil {
		return
	}

	// -----------------------------------------------------------------------
	// draft_aim_assessment — read roadmap + assumptions, stage assessment batch
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("draft_aim_assessment",
		mcp.WithDescription("USE WHEN you need to draft a pre-populated assessment report from live roadmap OKRs and assumption relationships. Stages a batch for human review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		batchID, summary, err := svc.AIM.DraftAssessment(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"batch_id":      batchID.String(),
			"draft_summary": summary,
		})
	})

	// -----------------------------------------------------------------------
	// draft_aim_calibration — read committed assessment, stage calibration batch
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("draft_aim_calibration",
		mcp.WithDescription("USE WHEN you need to draft a calibration memo with a suggested decision (persevere/pivot/pull_the_plug) based on a committed assessment report. Stages a batch for human review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		batchID, summary, err := svc.AIM.DraftCalibration(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"batch_id":           batchID.String(),
			"suggested_decision": summary.SuggestedDecision,
			"reasoning_summary":  summary.ReasoningSummary,
			"draft_summary":      summary,
		})
	})

	// -----------------------------------------------------------------------
	// apply_aim_calibration — read committed calibration memo, stage READY patches
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("apply_aim_calibration",
		mcp.WithDescription("USE WHEN you need to apply a committed calibration decision to READY artifacts. Stages targeted patches (strategy formula, north star, roadmap) for human review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		batchID, result, err := svc.AIM.ApplyCalibration(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"batch_id":           batchID.String(),
			"affected_artifacts": result.AffectedArtifacts,
			"decision":           result.Decision,
		})
	})

	// -----------------------------------------------------------------------
	// list_aim_cycles — list completed AIM cycles from version history
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("list_aim_cycles",
		mcp.WithDescription("USE WHEN you need to see the history of completed AIM cycles for an instance. Returns cycles ordered by published_at descending, with cycle number, decision, version ID, and timestamp."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		cycles, err := svc.AIM.ListCycles(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"cycles": cycles,
			"count":  len(cycles),
		})
	})
}
