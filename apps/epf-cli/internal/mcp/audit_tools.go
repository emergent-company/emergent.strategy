package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
)

// registerAuditTools registers the session audit and workflow verification tools.
func (s *Server) registerAuditTools() {
	// Tool: epf_session_audit
	s.mcpServer.AddTool(
		mcp.NewTool("epf_session_audit",
			mcp.WithDescription(
				"Returns the session audit log showing which MCP tools were actually called. "+
					"Default response is a compact summary (total calls, unique tool names, evicted count) "+
					"to minimize context window token usage. Use verbose=true for individual entries with pagination.",
			),
			mcp.WithString("tool_name",
				mcp.Description("Optional: filter to a specific tool name"),
			),
			mcp.WithString("verbose",
				mcp.Description("Return individual entries instead of summary only (true/false, default: false)"),
			),
			mcp.WithString("limit",
				mcp.Description("Maximum entries per page when verbose=true (default: 50)"),
			),
			mcp.WithString("offset",
				mcp.Description("Offset for pagination when verbose=true (default: 0)"),
			),
		),
		s.handleSessionAudit,
	)

	// Tool: epf_verify_workflow
	s.mcpServer.AddTool(
		mcp.NewTool("epf_verify_workflow",
			mcp.WithDescription(
				"Verify that expected tool calls were actually made during this session. "+
					"Pass a list of expected tool names and get back which were called vs. missing. "+
					"Use this to verify multi-step workflows were completed, not fabricated.",
			),
			mcp.WithString("expected_tools",
				mcp.Required(),
				mcp.Description("Comma-separated list of expected tool names (e.g., 'epf_health_check,epf_validate_file,epf_get_wizard_for_task')"),
			),
		),
		s.handleVerifyWorkflow,
	)
}

// handleSessionAudit returns the session audit log.
func (s *Server) handleSessionAudit(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	toolNameFilter := request.GetString("tool_name", "")
	verbose := strings.EqualFold(request.GetString("verbose", "false"), "true")

	if !verbose {
		// Summary-only response (default) — minimal context window impact
		summary := s.auditLog.GetSummary(toolNameFilter)
		data, err := json.MarshalIndent(summary, "", "  ")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize audit summary: %s", err)), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	}

	// Verbose: paginated entries
	limit := 50
	offset := 0
	if l := request.GetString("limit", ""); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	if o := request.GetString("offset", ""); o != "" {
		fmt.Sscanf(o, "%d", &offset)
	}

	page := s.auditLog.GetPage(toolNameFilter, offset, limit)
	data, err := json.MarshalIndent(page, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize audit page: %s", err)), nil
	}
	return mcp.NewToolResultText(string(data)), nil
}

// handleVerifyWorkflow checks expected tools against the audit log.
func (s *Server) handleVerifyWorkflow(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	expectedStr, err := request.RequireString("expected_tools")
	if err != nil {
		return mcp.NewToolResultError("expected_tools parameter is required"), nil
	}

	// Parse comma-separated tool names
	parts := strings.Split(expectedStr, ",")
	expectedTools := make([]string, 0, len(parts))
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t != "" {
			expectedTools = append(expectedTools, t)
		}
	}

	if len(expectedTools) == 0 {
		return mcp.NewToolResultError("expected_tools must contain at least one tool name"), nil
	}

	verification := s.auditLog.VerifyWorkflow(expectedTools)
	data, err2 := json.MarshalIndent(verification, "", "  ")
	if err2 != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to serialize verification: %s", err2)), nil
	}

	// Prepend human-readable summary
	var prefix string
	if verification.Complete {
		prefix = fmt.Sprintf("Workflow complete: all %d expected tools were called.\n\n", verification.TotalExpected)
	} else {
		prefix = fmt.Sprintf("Workflow INCOMPLETE: %d of %d expected tools were not called: %s\n\n",
			verification.MissingCount, verification.TotalExpected, strings.Join(verification.Missing, ", "))
	}

	return mcp.NewToolResultText(prefix + string(data)), nil
}
