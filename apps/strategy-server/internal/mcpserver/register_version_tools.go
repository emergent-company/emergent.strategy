package mcpserver

import (
	"context"
	"encoding/json"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerVersionTools(s *server.MCPServer, svc Services) {
	if svc.Version == nil {
		return
	}

	// publish_version — snapshot and publish current state.
	s.AddTool(mcp.NewTool("publish_version",
		mcp.WithDescription("USE WHEN you need to create a named snapshot of the current strategy state. Captures all artifacts and relationships into an atomic version that can be compared, restored, or synced to GitHub."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("label", mcp.Description("Short label for this version, e.g. 'Q2 Strategy'")),
		mcp.WithString("description", mcp.Description("Longer description of what changed or why this version was published")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		ver, err := svc.Version.Publish(ctx, instID, argString(req, "label"), argString(req, "description"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		// Return summary without the full snapshot blob.
		return mustJSON(map[string]any{
			"id":           ver.ID,
			"instance_id":  ver.InstanceID,
			"version":      ver.Version,
			"label":        ver.Label,
			"status":       ver.Status,
			"published_at": ver.PublishedAt.UTC().Format("2006-01-02T15:04:05Z"),
		})
	})

	// list_versions — show version history for an instance.
	s.AddTool(mcp.NewTool("list_versions",
		mcp.WithDescription("USE WHEN you need the version history for a strategy instance. Returns all published, superseded, and restored versions with their metadata."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		versions, err := svc.Version.List(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"instance_id": instID,
			"versions":    versions,
			"count":       len(versions),
		})
	})

	// get_version — read a specific version's full snapshot.
	s.AddTool(mcp.NewTool("get_version",
		mcp.WithDescription("USE WHEN you need the full artifact snapshot from a specific strategy version. Returns all artifacts and relationships at that point in time."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("version_id", mcp.Required(), mcp.Description("Version UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		verID, err := parseUUID(argString(req, "version_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		ver, err := svc.Version.Get(ctx, instID, verID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Parse snapshot to include metadata in a cleaner response.
		var snap json.RawMessage
		if len(ver.Snapshot) > 0 {
			snap = ver.Snapshot
		}

		result := map[string]any{
			"id":           ver.ID,
			"instance_id":  ver.InstanceID,
			"version":      ver.Version,
			"label":        ver.Label,
			"description":  ver.Description,
			"status":       ver.Status,
			"source":       ver.Source,
			"published_at": ver.PublishedAt.UTC().Format("2006-01-02T15:04:05Z"),
			"snapshot":     snap,
		}
		if ver.EquilibriumScore != nil {
			result["equilibrium_score"] = *ver.EquilibriumScore
		}
		if len(ver.ConvergenceMeta) > 0 {
			result["convergence_meta"] = json.RawMessage(ver.ConvergenceMeta)
		}
		return mustJSON(result)
	})

	// diff_versions — compare two versions.
	s.AddTool(mcp.NewTool("diff_versions",
		mcp.WithDescription("USE WHEN you need to compare two strategy versions. Returns which artifacts were added, removed, or changed between the two versions."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("from_version_id", mcp.Required(), mcp.Description("Source version UUID (the older version)")),
		mcp.WithString("to_version_id", mcp.Required(), mcp.Description("Target version UUID (the newer version)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		fromID, err := parseUUID(argString(req, "from_version_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		toID, err := parseUUID(argString(req, "to_version_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		diff, err := svc.Version.Diff(ctx, instID, fromID, toID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Enrich with convergence context from the target version if available.
		result := map[string]any{
			"from_version": diff.FromVersion,
			"to_version":   diff.ToVersion,
			"added":        diff.Added,
			"removed":      diff.Removed,
			"changed":      diff.Changed,
			"summary":      diff.Summary,
		}
		toVer, toErr := svc.Version.Get(ctx, instID, toID)
		if toErr == nil && toVer.Source == "convergence" {
			result["target_source"] = toVer.Source
			if toVer.EquilibriumScore != nil {
				result["target_equilibrium_score"] = *toVer.EquilibriumScore
			}
			if len(toVer.ConvergenceMeta) > 0 {
				result["target_convergence_meta"] = json.RawMessage(toVer.ConvergenceMeta)
			}
		}
		return mustJSON(result)
	})

	// restore_version — create mutations to revert to a previous state.
	s.AddTool(mcp.NewTool("restore_version",
		mcp.WithDescription("USE WHEN you need to revert the strategy to a previous version's state. Creates a new version with the restored artifacts and relationships."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("version_id", mcp.Required(), mcp.Description("Version UUID to restore to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		verID, err := parseUUID(argString(req, "version_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		ver, err := svc.Version.Restore(ctx, instID, verID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"id":            ver.ID,
			"instance_id":   ver.InstanceID,
			"version":       ver.Version,
			"label":         ver.Label,
			"status":        ver.Status,
			"restored_from": verID,
			"published_at":  ver.PublishedAt.UTC().Format("2006-01-02T15:04:05Z"),
		})
	})
}
