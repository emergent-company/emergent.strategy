package mcpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// orchestrationCycleStarter adapts orchestration.Engine to heartbeat.CycleStarter.
type orchestrationCycleStarter struct {
	engine *orchestration.Engine
}

func (a *orchestrationCycleStarter) StartRun(ctx context.Context, workflowName, concurrencyKey string, input map[string]any) (heartbeat.CycleRun, error) {
	run, err := a.engine.StartRun(ctx, workflowName, concurrencyKey, input)
	if err != nil {
		if errors.Is(err, orchestration.ErrAlreadyActive) {
			return heartbeat.CycleRun{}, heartbeat.ErrCycleAlreadyActive
		}
		return heartbeat.CycleRun{}, err
	}
	return heartbeat.CycleRun{ID: run.ID}, nil
}

func registerHeartbeatTools(s *server.MCPServer, svc Services) {
	if svc.Heartbeat == nil {
		return
	}

	// -----------------------------------------------------------------------
	// list_heartbeat_signals — return unacknowledged heartbeat signals
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("list_heartbeat_signals",
		mcp.WithDescription("USE WHEN you need to see active heartbeat signals — automatic trigger evaluations that fired for an instance, indicating an AIM cycle may be due."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithBoolean("include_acknowledged", mcp.Description("Set to true to include already-acknowledged signals (default: false)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		includeAcked := argBool(req, "include_acknowledged")

		var sigs any
		if includeAcked {
			sigs, err = svc.Heartbeat.ListAllSignals(ctx, instID)
		} else {
			sigs, err = svc.Heartbeat.ListSignals(ctx, instID)
		}
		if err != nil {
			return toolErr(ctx, fmt.Errorf("list heartbeat signals: %w", err)), nil
		}

		b, _ := json.Marshal(sigs)
		return mcp.NewToolResultText(string(b)), nil
	})

	// -----------------------------------------------------------------------
	// acknowledge_heartbeat — mark a signal as seen
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("acknowledge_heartbeat",
		mcp.WithDescription("USE WHEN you need to mark a heartbeat signal as seen. Acknowledged signals are excluded from future list_heartbeat_signals results."),
		mcp.WithString("signal_id", mcp.Required(), mcp.Description("Heartbeat signal UUID to acknowledge")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		signalID, err := parseUUID(argString(req, "signal_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		if err := svc.Heartbeat.Acknowledge(ctx, signalID); err != nil {
			return toolErr(ctx, fmt.Errorf("acknowledge heartbeat signal: %w", err)), nil
		}

		b, _ := json.Marshal(map[string]any{
			"signal_id": signalID.String(),
			"status":    "acknowledged",
		})
		return mcp.NewToolResultText(string(b)), nil
	})

	// -----------------------------------------------------------------------
	// list_cycle_proposals — list pending (or all) cycle proposals
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("list_cycle_proposals",
		mcp.WithDescription("USE WHEN you need to see pending AIM cycle proposals for an instance. Proposals are created automatically by the heartbeat when a trigger fires and no cycle is active."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("status", mcp.Description("Filter by status: pending (default), approved, deferred, expired, or all")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		status := argString(req, "status")
		switch status {
		case "all":
			status = ""
		case "":
			status = "pending"
		}

		proposals, err := svc.Heartbeat.ListProposals(ctx, instID, status)
		if err != nil {
			return toolErr(ctx, fmt.Errorf("list cycle proposals: %w", err)), nil
		}

		b, _ := json.Marshal(map[string]any{
			"proposals": proposals,
			"count":     len(proposals),
		})
		return mcp.NewToolResultText(string(b)), nil
	})

	// -----------------------------------------------------------------------
	// approve_cycle_proposal — approve and auto-start an AIM cycle
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("approve_cycle_proposal",
		mcp.WithDescription("USE WHEN you need to approve a pending AIM cycle proposal — approves the proposal and immediately starts an orchestrated AIM cycle run."),
		mcp.WithString("proposal_id", mcp.Required(), mcp.Description("Cycle proposal UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		proposalID, err := parseUUID(argString(req, "proposal_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Look up the proposal to get the instance for access check.
		proposal, err := svc.Heartbeat.GetProposal(ctx, proposalID)
		if err != nil {
			return toolErr(ctx, apperror.ErrNotFound.WithDetail("cycle proposal not found")), nil //nolint:nilerr
		}
		if err := assertInstanceAccess(ctx, svc, proposal.InstanceID); err != nil {
			return toolErr(ctx, err), nil
		}

		if svc.Orchestration == nil {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("orchestration engine not available")), nil
		}
		starter := &orchestrationCycleStarter{engine: svc.Orchestration}
		approved, err := svc.Heartbeat.ApproveProposal(ctx, proposalID, starter, aimdom.WorkflowName)
		if err != nil {
			if errors.Is(err, heartbeat.ErrCycleAlreadyActive) {
				return toolErr(ctx, apperror.ErrConflict.WithDetail("an AIM cycle is already running for this instance")), nil
			}
			if errors.Is(err, heartbeat.ErrProposalNotPending) {
				return toolErr(ctx, apperror.ErrBadRequest.WithDetail("proposal is not in pending state")), nil
			}
			return toolErr(ctx, fmt.Errorf("approve proposal: %w", err)), nil
		}

		var runIDStr string
		if approved.ApprovedRunID != nil {
			runIDStr = approved.ApprovedRunID.String()
		}
		b, _ := json.Marshal(map[string]any{
			"proposal_id": approved.ID,
			"status":      approved.Status,
			"run_id":      runIDStr,
			"note":        "AIM cycle started. Poll aim_get_run with run_id to track progress.",
		})
		return mcp.NewToolResultText(string(b)), nil
	})

	// -----------------------------------------------------------------------
	// defer_cycle_proposal — snooze a proposal for N days
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("defer_cycle_proposal",
		mcp.WithDescription("USE WHEN you need to snooze a pending AIM cycle proposal. The heartbeat will not create a new proposal until the snooze period expires."),
		mcp.WithString("proposal_id", mcp.Required(), mcp.Description("Cycle proposal UUID")),
		mcp.WithNumber("snooze_days", mcp.Description("Number of days to snooze (default: 7)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		proposalID, err := parseUUID(argString(req, "proposal_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Look up proposal for access check.
		proposal, err := svc.Heartbeat.GetProposal(ctx, proposalID)
		if err != nil {
			return toolErr(ctx, apperror.ErrNotFound.WithDetail("cycle proposal not found")), nil //nolint:nilerr
		}
		if err := assertInstanceAccess(ctx, svc, proposal.InstanceID); err != nil {
			return toolErr(ctx, err), nil
		}

		snoozeDays := argFloat(req, "snooze_days")
		duration := heartbeat.DefaultSnoozeDuration
		if snoozeDays > 0 {
			duration = time.Duration(snoozeDays * float64(24*time.Hour))
		}

		deferred, err := svc.Heartbeat.DeferProposal(ctx, proposalID, duration)
		if err != nil {
			if errors.Is(err, heartbeat.ErrProposalNotPending) {
				return toolErr(ctx, apperror.ErrBadRequest.WithDetail("proposal is not in pending state")), nil
			}
			return toolErr(ctx, fmt.Errorf("defer proposal: %w", err)), nil
		}

		b, _ := json.Marshal(map[string]any{
			"proposal_id":  deferred.ID,
			"status":       deferred.Status,
			"snooze_until": deferred.SnoozedUntil,
		})
		return mcp.NewToolResultText(string(b)), nil
	})
}

// argFloat extracts a float64 argument from an MCP request (zero if absent).
func argFloat(req mcp.CallToolRequest, name string) float64 {
	args, _ := req.Params.Arguments.(map[string]any)
	v, _ := args[name].(float64)
	return v
}


