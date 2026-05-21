package mcpserver

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	evidencedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
)

// splitCSV splits a comma-separated string into trimmed, non-empty tokens.
func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// registerEvidenceTools registers the 5 structured evidence MCP tools.
// These are only registered when an Evidence service is wired into Services.
func registerEvidenceTools(s *server.MCPServer, svc Services) {
	if svc.Evidence == nil {
		return
	}

	// -----------------------------------------------------------------------
	// ingest_evidence — submit a structured evidence item
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("ingest_evidence",
		mcp.WithDescription("USE WHEN you need to submit a new structured evidence item (metric, user feedback, sales call, competitive insight, etc.) for strategy assessment. Stores as evidence artifact with tags for filtering."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("source_name", mcp.Required(), mcp.Description("Name of the evidence source, e.g. 'Q1 NPS Survey', 'Sales call with Acme'")),
		mcp.WithString("source_type", mcp.Required(), mcp.Description("Freeform source type, e.g. 'user_interview', 'analytics_export', 'sales_call', 'competitive_report'")),
		mcp.WithString("content", mcp.Required(), mcp.Description("Evidence content as a JSON object or plain text string")),
		mcp.WithString("collected_at", mcp.Description("ISO 8601 datetime when evidence was collected (default: now)")),
		mcp.WithString("summary", mcp.Description("One-sentence summary of the evidence")),
		mcp.WithString("tags", mcp.Description("Comma-separated tags for filtering. Suggested: competitive, partner, technical, market, narrative, metric, user-feedback, sales, support, engineering, internal")),
		mcp.WithString("linked_artifacts", mcp.Description("Comma-separated artifact keys this evidence supports, e.g. 'fd-001,okr-product-1'")),
		mcp.WithString("source_url", mcp.Description("Optional URL to the source document or recording")),
		mcp.WithString("source_confidence", mcp.Description("Confidence level: high, medium, low")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		// Parse collected_at.
		collectedAt := time.Now().UTC()
		if caStr := argString(req, "collected_at"); caStr != "" {
			if t, err := time.Parse(time.RFC3339, caStr); err == nil {
				collectedAt = t
			}
		}

		// Parse content — accept JSON object or plain string.
		contentRaw := argString(req, "content")
		var content any = contentRaw
		// Try to parse as JSON for structured content.
		if len(contentRaw) > 0 && contentRaw[0] == '{' {
			var obj map[string]any
			if json.Unmarshal([]byte(contentRaw), &obj) == nil {
				content = obj
			}
		}

		ingestReq := evidencedom.IngestRequest{
			InstanceID:  instID,
			CollectedAt: collectedAt,
			Content:     content,
			Summary:     argString(req, "summary"),
			Source: evidencedom.Source{
				Name:       argString(req, "source_name"),
				Type:       argString(req, "source_type"),
				URL:        argString(req, "source_url"),
				Confidence: argString(req, "source_confidence"),
			},
		}

		// Tags — comma-separated.
		if tagsStr := argString(req, "tags"); tagsStr != "" {
			ingestReq.Tags = splitCSV(tagsStr)
		}

		// Linked artifacts — comma-separated.
		if linksStr := argString(req, "linked_artifacts"); linksStr != "" {
			ingestReq.LinkedArtifacts = splitCSV(linksStr)
		}

		key, err := svc.Evidence.Ingest(ctx, ingestReq)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"artifact_key":      key,
			"processing_status": "unprocessed",
			"message":           "Evidence item stored successfully",
		})
	})

	// -----------------------------------------------------------------------
	// list_evidence — list evidence items with optional filters
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("list_evidence",
		mcp.WithDescription("USE WHEN you need to list evidence items for an instance. Filter by tags, source, processing status, or linked artifact."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("tags", mcp.Description("Comma-separated tags to filter by (OR logic)")),
		mcp.WithString("source_name", mcp.Description("Filter by source name (exact match)")),
		mcp.WithString("processing_status", mcp.Description("Filter by processing status: unprocessed, processed, archived")),
		mcp.WithString("linked_artifact", mcp.Description("Filter to items linked to this artifact key")),
		mcp.WithString("since", mcp.Description("ISO 8601 datetime — include only items collected after this date")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		filters := evidencedom.ListFilters{
			SourceName:       argString(req, "source_name"),
			ProcessingStatus: argString(req, "processing_status"),
			LinkedArtifact:   argString(req, "linked_artifact"),
		}
		if tagsStr := argString(req, "tags"); tagsStr != "" {
			filters.Tags = splitCSV(tagsStr)
		}
		if sinceStr := argString(req, "since"); sinceStr != "" {
			if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
				filters.Since = t
			}
		}

		items, err := svc.Evidence.List(ctx, instID, filters)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"items":          items,
			"count":          len(items),
			"suggested_tags": evidencedom.SuggestedTags,
		})
	})

	// -----------------------------------------------------------------------
	// get_evidence — get a single evidence item by key
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("get_evidence",
		mcp.WithDescription("USE WHEN you need to read a single evidence item by its artifact key."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("Evidence artifact key, e.g. ev-<uuid>")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		item, err := svc.Evidence.Get(ctx, instID, argString(req, "artifact_key"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(item)
	})

	// -----------------------------------------------------------------------
	// link_evidence — link an evidence item to another artifact
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("link_evidence",
		mcp.WithDescription("USE WHEN you need to create a relationship between an evidence item and another artifact (feature, OKR, assumption). Creates a strategy_relationship edge."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("evidence_key", mcp.Required(), mcp.Description("Evidence artifact key, e.g. ev-<uuid>")),
		mcp.WithString("target_key", mcp.Required(), mcp.Description("Target artifact key, e.g. fd-001 or okr-product-1")),
		mcp.WithString("relationship", mcp.Description("Relationship type (default: supports). Common: supports, invalidates, validates, contradicts")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		rel := argString(req, "relationship")
		if rel == "" {
			rel = "supports"
		}

		if err := svc.Evidence.Link(ctx, instID,
			argString(req, "evidence_key"),
			argString(req, "target_key"),
			rel,
		); err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"message":      "Relationship created",
			"evidence_key": argString(req, "evidence_key"),
			"target_key":   argString(req, "target_key"),
			"relationship": rel,
		})
	})

	// -----------------------------------------------------------------------
	// update_evidence — update writable fields on an evidence item
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("update_evidence",
		mcp.WithDescription("USE WHEN you need to update an existing evidence item — e.g. add tags, update summary, or link to additional artifacts."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("Evidence artifact key, e.g. ev-<uuid>")),
		mcp.WithString("summary", mcp.Description("Updated one-sentence summary")),
		mcp.WithString("tags", mcp.Description("Updated comma-separated tags (replaces existing)")),
		mcp.WithString("linked_artifacts", mcp.Description("Updated comma-separated linked artifact keys (replaces existing)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		updateReq := evidencedom.UpdateRequest{}
		if s := argString(req, "summary"); s != "" {
			updateReq.Summary = &s
		}
		if tagsStr := argString(req, "tags"); tagsStr != "" {
			updateReq.Tags = splitCSV(tagsStr)
		}
		if linksStr := argString(req, "linked_artifacts"); linksStr != "" {
			updateReq.LinkedArtifacts = splitCSV(linksStr)
		}

		if err := svc.Evidence.Update(ctx, instID, argString(req, "artifact_key"), updateReq); err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"message":      "Evidence item updated",
			"artifact_key": argString(req, "artifact_key"),
		})
	})
}
