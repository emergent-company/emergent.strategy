package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	activitydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/activity"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workpackage"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerWorkPackageTools registers MCP tools for the work package — the
// bounded, four-track statement-of-work execution unit. Work packages are the
// tool-agnostic handover contract between strategy authoring and downstream
// execution (orchestrator, ecosystem partners).
//
// Create/update flow through the standard stage → commit_batch path (schema
// validation included). Status transitions are enforced by the work package
// state-machine and emit subscribable activity events.
func registerWorkPackageTools(s *server.MCPServer, svc Services) {
	// ---- reads ----

	s.AddTool(mcp.NewTool("list_work_packages",
		mcp.WithDescription("[work] USE WHEN you need the work packages for an instance, optionally filtered by track or status."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("track", mcp.Description("Filter by track: product | strategy | org_ops | commercial")),
		mcp.WithString("status", mcp.Description("Filter by status: proposed | approved | scheduled | executing | done | cancelled")),
		mcp.WithString("include_archived", mcp.Description(`Set to "true" to include archived work packages (default: false).`)),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		includeArchived := argString(req, "include_archived") == "true"
		all, err := svc.Strategy.ListArtifactsFiltered(ctx, id, domain.ArtifactTypeWorkPackage, includeArchived)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		trackFilter := argString(req, "track")
		statusFilter := argString(req, "status")
		filtered := make([]*domain.StrategyArtifact, 0, len(all))
		for _, a := range all {
			if trackFilter != "" && (a.Track == nil || *a.Track != trackFilter) {
				continue
			}
			if statusFilter != "" && a.Status != statusFilter {
				continue
			}
			filtered = append(filtered, a)
		}
		return mustJSON(filtered)
	})

	s.AddTool(mcp.NewTool("get_work_package",
		mcp.WithDescription("[work] USE WHEN you need the full payload of a single work package."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("work_package_key", mcp.Required(), mcp.Description("Work package key, e.g. wp-001")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		raw, err := svc.Strategy.GetCurrentArtifact(ctx, id, argString(req, "work_package_key"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(raw)), nil
	})

	s.AddTool(mcp.NewTool("get_work_package_footprint",
		mcp.WithDescription("[work] USE WHEN you need a work package's footprint — the collision key for parallel-safe scheduling. Footprint = union of value_model_paths + definition_ids (KRs excluded), derived server-side."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("work_package_key", mcp.Required(), mcp.Description("Work package key, e.g. wp-001")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		key := argString(req, "work_package_key")
		raw, err := svc.Strategy.GetCurrentArtifact(ctx, id, key)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"work_package_key": key,
			"footprint":        workpackage.Footprint(raw),
			"note":             "Footprint is the union of value_model_paths and definition_ids; kr_ids are excluded by design.",
		})
	})

	// ---- writes (stage → commit) ----

	s.AddTool(mcp.NewTool("create_work_package",
		mcp.WithDescription("[work] USE WHEN you need to draft a new work package (SOW contract). Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("work_package_key", mcp.Required(), mcp.Description("Work package key, e.g. wp-001")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded work_package payload (see work_package_schema.json)")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, argString(req, "work_package_key"), domain.ArtifactTypeWorkPackage, "create")
	})

	s.AddTool(mcp.NewTool("update_work_package",
		mcp.WithDescription("[work] USE WHEN you need to draft an update to an existing work package. For status changes prefer transition_work_package. Returns batch_id."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("work_package_key", mcp.Required(), mcp.Description("Work package key to update")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded updated work_package payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, argString(req, "work_package_key"), domain.ArtifactTypeWorkPackage, "update")
	})

	s.AddTool(mcp.NewTool("approve_work_package",
		mcp.WithDescription("[work] USE WHEN a proposed work package is signed off. Transitions status proposed → approved (an approved work package becomes eligible for scheduling). Returns batch_id."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("work_package_key", mcp.Required(), mcp.Description("Work package key to approve")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return transitionWorkPackage(ctx, req, svc, domain.WorkPackageStatusApproved)
	})

	s.AddTool(mcp.NewTool("transition_work_package",
		mcp.WithDescription("[work] USE WHEN you need to move a work package to a new status. Enforces the state-machine: proposed → approved → scheduled → executing → done (+ cancelled from any non-terminal). Illegal transitions are rejected. Returns batch_id."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("work_package_key", mcp.Required(), mcp.Description("Work package key to transition")),
		mcp.WithString("to_status", mcp.Required(), mcp.Description("Target status: approved | scheduled | executing | done | cancelled")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return transitionWorkPackage(ctx, req, svc, argString(req, "to_status"))
	})
}

// transitionWorkPackage reads the current work package, validates the requested
// status transition against the state-machine, stages an update with the new
// status, and emits a subscribable activity event. It does NOT commit — the
// caller presents the returned batch_id to a human for commit_batch.
func transitionWorkPackage(ctx context.Context, req mcp.CallToolRequest, svc Services, toStatus string) (*mcp.CallToolResult, error) {
	instID, err := parseUUID(argString(req, "instance_id"))
	if err != nil {
		return toolErr(ctx, err), nil
	}
	key := argString(req, "work_package_key")
	if key == "" {
		return mustJSON(map[string]any{"error": "work_package_key is required"})
	}

	raw, err := svc.Strategy.GetCurrentArtifact(ctx, instID, key)
	if err != nil {
		return toolErr(ctx, err), nil
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return toolErr(ctx, err), nil
	}

	fromStatus, _ := payload["status"].(string)
	if fromStatus == "" {
		fromStatus = domain.WorkPackageStatusProposed
	}

	if err := workpackage.ValidateTransition(fromStatus, toStatus); err != nil {
		// Structured rejection — not a raw Go error to the MCP client.
		return mustJSON(map[string]any{
			"transitioned":     false,
			"work_package_key": key,
			"from_status":      fromStatus,
			"to_status":        toStatus,
			"error":            err.Error(),
		})
	}

	payload["status"] = toStatus
	// Stamp closed_at when entering a terminal state.
	if workpackage.IsTerminal(toStatus) {
		lifecycle, _ := payload["lifecycle"].(map[string]any)
		if lifecycle == nil {
			lifecycle = map[string]any{}
		}
		lifecycle["closed_at"] = time.Now().UTC().Format(time.RFC3339)
		payload["lifecycle"] = lifecycle
	}

	newPayload, err := json.Marshal(payload)
	if err != nil {
		return toolErr(ctx, err), nil
	}

	p := strategy.StageParams{
		InstanceID:   instID,
		ArtifactType: domain.ArtifactTypeWorkPackage,
		ArtifactKey:  key,
		Action:       domain.MutationActionUpdate,
		Payload:      json.RawMessage(newPayload),
	}
	if batchStr := argString(req, "batch_id"); batchStr != "" {
		bID, err := parseUUID(batchStr)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		p.BatchID = &bID
	}

	batchID, err := svc.Strategy.Stage(ctx, p)
	if err != nil {
		return toolErr(ctx, err), nil
	}

	// Emit a subscribable activity event for the staged transition.
	if svc.Activity != nil {
		svc.Activity.Record(ctx, activitydom.RecordRequest{
			InstanceID: instID,
			EventType:  activitydom.EventWorkPackageTransitioned,
			Payload: map[string]any{
				"work_package_key": key,
				"from_status":      fromStatus,
				"to_status":        toStatus,
				"batch_id":         batchID.String(),
			},
		})
	}

	return mustJSON(map[string]any{
		"transitioned":     true,
		"work_package_key": key,
		"from_status":      fromStatus,
		"to_status":        toStatus,
		"batch_id":         batchID,
		"note":             fmt.Sprintf("Status %s → %s staged. Present this batch_id to the user; call commit_batch after confirmation.", fromStatus, toStatus),
	})
}
