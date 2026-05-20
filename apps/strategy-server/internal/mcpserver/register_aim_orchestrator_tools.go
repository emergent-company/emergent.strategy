package mcpserver

import (
	"context"
	"errors"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// registerAIMOrchestratorTools registers MCP tools that drive the
// server-side AIM cycle orchestrator. These tools complement the
// existing step-by-step AIM agent tools by offering a fully
// orchestrated, SSE-streamed cycle run.
//
// Tools added:
//   - aim_start_cycle  — start (or detect existing) orchestrated AIM run
//   - aim_get_run      — fetch current state of a run
func registerAIMOrchestratorTools(s *server.MCPServer, svc Services) {
	if svc.Orchestration == nil || svc.AIM == nil {
		return
	}

	// -----------------------------------------------------------------------
	// aim_start_cycle — start an orchestrated AIM cycle run
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("aim_start_cycle",
		mcp.WithDescription("USE WHEN you need to start a fully-orchestrated AIM cycle for an instance. Runs all four steps (draft assessment, draft calibration, apply calibration, snapshot) in sequence, pausing at each step for human batch review. Returns run_id for progress polling with aim_get_run. Returns ErrAlreadyActive (409) if a run is already in progress."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		run, err := svc.Orchestration.StartRun(ctx, aimdom.WorkflowName, instID.String(), map[string]any{
			"instance_id": instID.String(),
		})
		if err != nil {
			if errors.Is(err, orchestration.ErrAlreadyActive) {
				return toolErr(ctx, apperror.ErrConflict.WithDetail("an AIM cycle is already running for this instance")), nil
			}
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"run_id":       run.ID.String(),
			"workflow":     run.WorkflowName,
			"status":       string(run.Status),
			"instructions": "Poll aim_get_run with run_id to check progress. The run pauses at each step awaiting human batch review (commit_batch or discard_batch). Discarding a batch aborts the entire run.",
		})
	})

	// -----------------------------------------------------------------------
	// aim_get_run — fetch current state of an orchestrated run
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("aim_get_run",
		mcp.WithDescription("USE WHEN you need to check the current status of an orchestrated AIM cycle run — shows step progress, current batch_id waiting for review, and overall run status (pending, running, awaiting_human, completed, failed, aborted)."),
		mcp.WithString("run_id", mcp.Required(), mcp.Description("Run UUID returned by aim_start_cycle")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		runID, err := parseUUID(argString(req, "run_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		run, err := svc.Orchestration.GetRun(ctx, runID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Build step view — only expose fields relevant to the MCP caller.
		steps := make([]map[string]any, len(run.Steps))
		for i, sl := range run.Steps {
			step := map[string]any{
				"name":   sl.Name,
				"status": sl.Status,
			}
			if sl.BatchID != "" {
				step["batch_id"] = sl.BatchID
			}
			if sl.Error != "" {
				step["error"] = sl.Error
			}
			if len(sl.Meta) > 0 {
				step["meta"] = sl.Meta
			}
			steps[i] = step
		}

		result := map[string]any{
			"run_id":       run.ID.String(),
			"workflow":     run.WorkflowName,
			"status":       string(run.Status),
			"current_step": run.CurrentStep,
			"steps":        steps,
			"created_at":   run.CreatedAt,
		}

		// Surface the current batch_id prominently when awaiting human review.
		if run.Status == orchestration.StatusAwaitingHuman {
			for _, sl := range run.Steps {
				if sl.Name == run.CurrentStep && sl.BatchID != "" {
					result["awaiting_batch_id"] = sl.BatchID
					result["instructions"] = "Review the staged batch, then call commit_batch to advance or discard_batch to abort the cycle."
					break
				}
			}
		}

		return mustJSON(result)
	})
}
