package mcpserver

// register_skillrun_tools.go — MCP tools for skill run observability.
//
// Tools added:
//   list_skill_runs, get_skill_run, get_llm_usage

import (
	"context"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillrun"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

func registerSkillRunTools(s *server.MCPServer, svc Services) {
	// list_skill_runs
	s.AddTool(mcp.NewTool("list_skill_runs",
		mcp.WithDescription("USE WHEN you need to see autonomous skill execution history for an instance — shows status, timing, token usage, and trigger context."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("status", mcp.Description("Filter: running, completed, failed")),
		mcp.WithString("trigger", mcp.Description("Filter: manual, ripple, aim_cycle")),
		mcp.WithString("limit", mcp.Description("Max results (1-200, default 50)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.SkillRun == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("skill run service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, id); err != nil {
			return toolErr(ctx, err), nil
		}

		limit := argInt(req, "limit", 50)
		runs, err := svc.SkillRun.ListByInstance(ctx, id, skillrun.ListParams{
			Status:  argString(req, "status"),
			Trigger: argString(req, "trigger"),
			Limit:   limit,
		})
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Build response with computed duration.
		type runEntry struct {
			RunID           string  `json:"run_id"`
			SkillName       string  `json:"skill_name"`
			Status          string  `json:"status"`
			Trigger         string  `json:"trigger"`
			StartedAt       string  `json:"started_at"`
			CompletedAt     *string `json:"completed_at,omitempty"`
			DurationSeconds float64 `json:"duration_seconds"`
			ChunksCompleted int     `json:"chunks_completed"`
			ChunkCount      int     `json:"chunk_count"`
			InputTokens     int     `json:"input_tokens"`
			OutputTokens    int     `json:"output_tokens"`
			BatchID         *string `json:"batch_id,omitempty"`
			Error           *string `json:"error,omitempty"`
		}
		entries := make([]runEntry, 0, len(runs))
		for _, r := range runs {
			e := runEntry{
				RunID:           r.ID.String(),
				SkillName:       r.SkillName,
				Status:          r.Status,
				Trigger:         r.Trigger,
				StartedAt:       r.StartedAt.UTC().Format(time.RFC3339),
				DurationSeconds: r.DurationSeconds(),
				ChunksCompleted: r.ChunksCompleted,
				ChunkCount:      r.ChunkCount,
				InputTokens:     r.TotalInputTokens,
				OutputTokens:    r.TotalOutputTokens,
				Error:           r.Error,
			}
			if r.CompletedAt != nil {
				s := r.CompletedAt.UTC().Format(time.RFC3339)
				e.CompletedAt = &s
			}
			if r.BatchID != nil {
				s := r.BatchID.String()
				e.BatchID = &s
			}
			entries = append(entries, e)
		}

		return mustJSON(map[string]any{
			"count": len(entries),
			"runs":  entries,
		})
	})

	// get_skill_run
	s.AddTool(mcp.NewTool("get_skill_run",
		mcp.WithDescription("USE WHEN you need full detail of a specific skill run — includes per-chunk timing, token counts, validation errors, and trigger context."),
		mcp.WithString("run_id", mcp.Required(), mcp.Description("Skill run UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.SkillRun == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("skill run service not available")), nil
		}
		runID, err := parseUUID(argString(req, "run_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		run, err := svc.SkillRun.GetByID(ctx, runID)
		if err != nil {
			return toolErr(ctx, apperror.ErrNotFound.WithDetail("skill run not found")), nil //nolint:nilerr // err is always sql.ErrNoRows; wrap for MCP client
		}

		// Access check via instance.
		if err := assertInstanceAccess(ctx, svc, run.InstanceID); err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(run)
	})

	// get_llm_usage
	s.AddTool(mcp.NewTool("get_llm_usage",
		mcp.WithDescription("USE WHEN you need aggregated LLM token usage by skill name for an instance — useful for cost tracking and budgeting."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("since", mcp.Description("ISO 8601 date — include only runs started after this date")),
		mcp.WithString("until", mcp.Description("ISO 8601 date — include only runs started before this date")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.SkillRun == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("skill run service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, id); err != nil {
			return toolErr(ctx, err), nil
		}

		var since, until *time.Time
		if s := argString(req, "since"); s != "" {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				since = &t
			}
		}
		if u := argString(req, "until"); u != "" {
			if t, err := time.Parse(time.RFC3339, u); err == nil {
				until = &t
			}
		}

		usage, err := svc.SkillRun.GetUsage(ctx, id, since, until)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Compute totals.
		var totalIn, totalOut, totalRuns int
		for _, u := range usage {
			totalIn += u.InputTokens
			totalOut += u.OutputTokens
			totalRuns += u.RunCount
		}

		return mustJSON(map[string]any{
			"instance_id":         id.String(),
			"total_input_tokens":  totalIn,
			"total_output_tokens": totalOut,
			"total_runs":          totalRuns,
			"by_skill":            usage,
		})
	})
}
