package mcpserver

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func registerRippleTools(s *server.MCPServer, svc Services) {
	if svc.Ripple == nil {
		return
	}

	// -----------------------------------------------------------------------
	// propose_change — preview the blast radius of a proposed artifact change
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("propose_change",
		mcp.WithDescription("USE WHEN you want to preview the blast radius of a proposed change before committing."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("Artifact key being changed")),
		mcp.WithString("artifact_type", mcp.Description("Artifact type (auto-detected if omitted)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		artifactKey := argString(req, "artifact_key")
		artifactType := argString(req, "artifact_type")
		if artifactKey == "" {
			return toolErr(ctx, fmt.Errorf("artifact_key is required")), nil
		}

		report, err := ripple.AnalyzeStructuralRipple(ctx, svc.Strategy.DB(), instID, artifactKey, artifactType)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		result := map[string]any{
			"changed_key":       report.ChangedKey,
			"changed_type":      report.ChangedType,
			"affected_artifacts": report.AffectedArtifacts,
			"critical_count":    report.CriticalCount,
			"warning_count":     report.WarningCount,
			"info_count":        report.InfoCount,
		}
		if len(report.AffectedArtifacts) == 0 {
			result["note"] = "No downstream artifacts are affected by this change."
		} else {
			result["note"] = fmt.Sprintf("%d artifacts may need review after this change.", len(report.AffectedArtifacts))
		}
		return mustJSON(result)
	})

	// -----------------------------------------------------------------------
	// coherence_check — full graph coherence analysis
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("coherence_check",
		mcp.WithDescription("USE WHEN you need a full-graph coherence analysis — orphaned paths, untested assumptions, stale artifacts."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		report, err := ripple.AnalyzeCoherence(ctx, svc.Strategy.DB(), instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Also get active signal counts.
		counts, _ := svc.Ripple.CountByStatus(ctx, instID)
		topSignals, _ := svc.Ripple.TopCritical(ctx, instID, 5)

		result := map[string]any{
			"orphaned_paths":       report.OrphanedPaths,
			"untested_assumptions": report.UntestedAssumptions,
			"warning_count":        report.WarningCount,
			"active_signals":       counts,
			"top_signals":          topSignals,
		}
		if report.WarningCount == 0 && len(topSignals) == 0 {
			result["note"] = "Strategy graph is coherent. No orphaned paths, untested assumptions, or active signals."
		} else {
			result["note"] = fmt.Sprintf("Found %d coherence issues and %d active signals. Use list_signals for details.",
				report.WarningCount, counts[domain.SignalSeverityCritical]+counts[domain.SignalSeverityWarning]+counts[domain.SignalSeverityInfo])
		}
		return mustJSON(result)
	})

	// -----------------------------------------------------------------------
	// list_signals — list active ripple signals for an instance
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("list_signals",
		mcp.WithDescription("USE WHEN you need to see active ripple signals — misalignments between connected artifacts."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("signal_type", mcp.Description("Filter: drift, propagation, tension, staleness, clustering, orphan")),
		mcp.WithString("severity", mcp.Description("Filter: critical, warning, info")),
		mcp.WithString("status", mcp.Description("Filter: active (default), acknowledged, resolved, dismissed, all")),
		mcp.WithString("target_key", mcp.Description("Filter by target artifact key")),
		mcp.WithString("limit", mcp.Description("Max results (1-200, default 50)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		limit := 50
		if l := argString(req, "limit"); l != "" {
			fmt.Sscanf(l, "%d", &limit)
		}

		params := ripple.ListParams{
			InstanceID: instID,
			SignalType: argString(req, "signal_type"),
			Severity:   argString(req, "severity"),
			Status:     argString(req, "status"),
			TargetKey:  argString(req, "target_key"),
			Limit:      limit,
		}

		sigs, err := svc.Ripple.ListSignals(ctx, params)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		result := map[string]any{
			"signals": sigs,
			"count":   len(sigs),
		}
		if len(sigs) == 0 {
			result["note"] = "No signals match the given filters. The strategy graph appears coherent."
		}
		return mustJSON(result)
	})

	// -----------------------------------------------------------------------
	// acknowledge_signal — mark a signal as seen
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("acknowledge_signal",
		mcp.WithDescription("USE WHEN you want to mark a signal as seen without resolving it."),
		mcp.WithString("signal_id", mcp.Required(), mcp.Description("Signal UUID to acknowledge")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		sigID, err := parseUUID(argString(req, "signal_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		sig, err := svc.Ripple.AcknowledgeSignal(ctx, sigID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(sig)
	})

	// -----------------------------------------------------------------------
	// resolve_signal — mark a signal as addressed
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("resolve_signal",
		mcp.WithDescription("USE WHEN a signal has been addressed and you want to mark it resolved."),
		mcp.WithString("signal_id", mcp.Required(), mcp.Description("Signal UUID to resolve")),
		mcp.WithString("batch_id", mcp.Description("Optional batch UUID that addressed the signal")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		sigID, err := parseUUID(argString(req, "signal_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		var batchID *uuid.UUID
		if b := argString(req, "batch_id"); b != "" {
			id, err := parseUUID(b)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			batchID = &id
		}
		sig, err := svc.Ripple.ResolveSignal(ctx, sigID, batchID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(sig)
	})

	// -----------------------------------------------------------------------
	// dismiss_signal — mark a signal as intentional
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("dismiss_signal",
		mcp.WithDescription("USE WHEN a detected misalignment is intentional and should not be flagged again."),
		mcp.WithString("signal_id", mcp.Required(), mcp.Description("Signal UUID to dismiss")),
		mcp.WithString("reason", mcp.Required(), mcp.Description("Why this signal is intentional")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		sigID, err := parseUUID(argString(req, "signal_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		reason := argString(req, "reason")
		if reason == "" {
			return toolErr(ctx, fmt.Errorf("reason is required when dismissing a signal")), nil
		}
		sig, err := svc.Ripple.DismissSignal(ctx, sigID, reason)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(sig)
	})

	// -----------------------------------------------------------------------
	// generate_ripple_batch — assemble context for AI-assisted ripple resolution
	// -----------------------------------------------------------------------
	s.AddTool(mcp.NewTool("generate_ripple_batch",
		mcp.WithDescription("USE WHEN you need context to generate draft updates for active ripple signals."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("scope", mcp.Description("Signal scope: critical (default), all")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		// Get active signals — critical+warning by default, all if requested.
		scope := argString(req, "scope")
		var sigs []*domain.RippleSignal
		if scope == "all" {
			sigs, err = svc.Ripple.ListSignals(ctx, ripple.ListParams{
				InstanceID: instID,
				Status:     domain.SignalStatusActive,
				Limit:      100,
			})
		} else {
			// Get critical first, then warning.
			critical, _ := svc.Ripple.ListSignals(ctx, ripple.ListParams{
				InstanceID: instID,
				Severity:   domain.SignalSeverityCritical,
				Limit:      50,
			})
			warning, _ := svc.Ripple.ListSignals(ctx, ripple.ListParams{
				InstanceID: instID,
				Severity:   domain.SignalSeverityWarning,
				Limit:      50,
			})
			sigs = append(critical, warning...)
		}
		if err != nil {
			return toolErr(ctx, err), nil
		}

		if len(sigs) == 0 {
			return mustJSON(map[string]any{
				"signals": []any{},
				"note":    "No active signals to address. The strategy graph is coherent.",
			})
		}

		// For each signal, load the target artifact's current payload.
		type signalContext struct {
			Signal       *domain.RippleSignal `json:"signal"`
			TargetPayload any                 `json:"target_payload,omitempty"`
			TargetType   string               `json:"target_type,omitempty"`
		}
		var contexts []signalContext

		for _, sig := range sigs {
			sc := signalContext{Signal: sig}
			// Try to load the target artifact payload.
			art, artErr := svc.Strategy.GetCurrentArtifactFull(ctx, instID, sig.TargetKey)
			if artErr == nil && art != nil {
				sc.TargetPayload = art.Payload
				sc.TargetType = art.ArtifactType
			}
			contexts = append(contexts, sc)
		}

		result := map[string]any{
			"signal_contexts": contexts,
			"count":           len(contexts),
			"note":            "Use these contexts to generate draft updates. Stage changes via update tools, then commit as a ripple batch using describe_batch with root_cause_key.",
		}
		return mustJSON(result)
	})
}

// postCommitRippleAnalysis runs structural ripple analysis after a batch commit
// and creates/resolves signals. Called from the commit_batch handler.
func postCommitRippleAnalysis(ctx context.Context, svc Services, instanceID, batchID uuid.UUID) map[string]any {
	if svc.Ripple == nil {
		return nil
	}

	// Load the committed mutations to find which artifacts changed.
	mutations, _, _ := svc.Strategy.ListMutations(ctx, instanceID, "", false, 200, "", "")

	var changedKeys []string
	for _, m := range mutations {
		if m.BatchID != nil && *m.BatchID == batchID && m.Status == domain.MutationStatusCommitted {
			changedKeys = append(changedKeys, m.ArtifactKey)
		}
	}

	if len(changedKeys) == 0 {
		return nil
	}

	// Auto-resolve signals whose targets were updated.
	totalResolved := 0
	for _, key := range changedKeys {
		n, err := svc.Ripple.ResolveByTarget(ctx, instanceID, key, &batchID)
		if err != nil {
			slog.WarnContext(ctx, "ripple: failed to auto-resolve signals", "target", key, "error", err)
			continue
		}
		totalResolved += n
	}

	// Run structural ripple analysis for each changed artifact.
	var allNewSignals []*domain.RippleSignal
	for _, key := range changedKeys {
		report, err := ripple.AnalyzeStructuralRipple(ctx, svc.Strategy.DB(), instanceID, key, "")
		if err != nil {
			slog.WarnContext(ctx, "ripple: structural analysis failed", "key", key, "error", err)
			continue
		}
		newSignals := ripple.GenerateSignalsFromRipple(instanceID, report)
		allNewSignals = append(allNewSignals, newSignals...)
	}

	// Deduplicate signals by (source_key, target_key, signal_type).
	seen := make(map[string]bool)
	var deduped []*domain.RippleSignal
	for _, sig := range allNewSignals {
		key := sig.SourceKey + "|" + sig.TargetKey + "|" + sig.SignalType
		if seen[key] {
			continue
		}
		seen[key] = true
		deduped = append(deduped, sig)
	}

	// Persist new signals.
	if len(deduped) > 0 {
		if err := svc.Ripple.CreateSignals(ctx, deduped); err != nil {
			slog.WarnContext(ctx, "ripple: failed to create signals", "count", len(deduped), "error", err)
		}
	}

	// Get updated counts.
	counts, _ := svc.Ripple.CountByStatus(ctx, instanceID)
	activeTotal := counts[domain.SignalSeverityCritical] + counts[domain.SignalSeverityWarning] + counts[domain.SignalSeverityInfo]

	return map[string]any{
		"new_signals":      len(deduped),
		"resolved_signals": totalResolved,
		"active_total":     activeTotal,
	}
}
