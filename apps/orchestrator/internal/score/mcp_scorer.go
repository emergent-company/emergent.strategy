package score

import (
	"context"
	"fmt"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/openspec"
)

// ToolCaller is the minimal MCP surface the scorer needs. *mcp.Client satisfies
// it; tests provide a stub. Keeping it narrow keeps the scorer testable without
// a live strategy-server.
type ToolCaller interface {
	// Has reports whether a tool is available (after filter negotiation).
	Has(name string) bool
	// CallJSON invokes a tool and decodes its JSON text result into out.
	CallJSON(ctx context.Context, name string, args map[string]any, out any) error
}

// Tool names on strategy-server used by the scorecard. These are the integration
// seam: verified against internal/mcpserver/server.go. They are resolved at call
// time against ToolCaller.Has, so a missing tool degrades the corresponding
// dimension to Unavailable rather than erroring.
const (
	// search_strategy: semantic search over the strategy graph (category: core).
	toolSearchStrategy = "search_strategy"
	// get_neighbors: depth-1 graph expand (category: semantic).
	toolGetNeighbors = "get_neighbors"
	// detect_contradictions: contradiction/orphan detection (category: semantic).
	toolDetectContradictions = "detect_contradictions"
	// get_roadmap: raw roadmap_recipe payload (category: strategy).
	toolGetRoadmap = "get_roadmap"
	// list_features: feature artifacts with maturity in payload (category: features).
	toolListFeatures = "list_features"
)

// MCPScorer scores dimensions by querying strategy-server over MCP. Every method
// is fail-soft: any tool error or missing tool yields an Unavailable result.
//
// Every strategy-server tool requires an instance_id (the strategy instance to
// score against), so the scorer is constructed bound to one instance.
type MCPScorer struct {
	caller     ToolCaller
	ctx        context.Context
	instanceID string
	timeout    time.Duration
}

// NewMCPScorer constructs an MCPScorer bound to a strategy instance. The context
// bounds all queries for one scorecard pass.
func NewMCPScorer(ctx context.Context, caller ToolCaller, instanceID string) *MCPScorer {
	return &MCPScorer{caller: caller, ctx: ctx, instanceID: instanceID, timeout: 20 * time.Second}
}

func (m *MCPScorer) unavailable(d Dimension, reason string) DimensionResult {
	return DimensionResult{Dimension: d, Level: Unavailable, Summary: reason}
}

// args returns a base argument map seeded with the required instance_id.
func (m *MCPScorer) args(extra map[string]any) map[string]any {
	a := map[string]any{"instance_id": m.instanceID}
	for k, v := range extra {
		a[k] = v
	}
	return a
}

// minTraceScore is the similarity below which a hit is too weak to count as a
// real strategic link. Tuned from live observation (relevant hits ~0.38-0.45).
const minTraceScore = 0.30

// Traceability: does the change map to live strategy?
// Queries search_strategy with the change's SEMANTIC content (title + summary),
// not its footprint slug — slugs like "strategy-web" are not graph-searchable.
// Strong when there are confident hits; Mixed when only weak hits; Weak when none.
//
// search_strategy returns a bare JSON array of:
//
//	{ "artifact_type": "...", "artifact_key": "...", "snippet": "...", "score": 0.0 }
func (m *MCPScorer) Traceability(c openspec.Change) DimensionResult {
	if !m.caller.Has(toolSearchStrategy) {
		return m.unavailable(Traceability, "search_strategy unavailable")
	}
	query := c.SemanticQuery()
	if query == "" {
		return DimensionResult{
			Dimension: Traceability, Level: Mixed,
			Summary:  "no title/summary to trace",
			Evidence: []string{"change has no proposal text; cannot establish strategic linkage"},
		}
	}

	var hits []struct {
		ArtifactType string  `json:"artifact_type"`
		ArtifactKey  string  `json:"artifact_key"`
		Snippet      string  `json:"snippet"`
		Score        float64 `json:"score"`
	}
	ctx, cancel := context.WithTimeout(m.ctx, m.timeout)
	err := m.caller.CallJSON(ctx, toolSearchStrategy, m.args(map[string]any{
		"query": query, "limit": "5",
	}), &hits)
	cancel()
	if err != nil {
		return m.unavailable(Traceability, "search_strategy error: "+err.Error())
	}

	confident, evidence := 0, []string{}
	for _, h := range hits {
		if h.Score >= minTraceScore {
			confident++
			evidence = append(evidence, fmt.Sprintf("%.2f %s — %s", h.Score, h.ArtifactKey, truncate(h.Snippet, 60)))
		}
	}

	level := Weak
	switch {
	case confident >= 2:
		level = Strong
	case confident == 1:
		level = Mixed
	}
	summary := fmt.Sprintf("%d confident strategy hit(s) for change content", confident)
	if confident == 0 {
		summary = "no confident strategy hits — change may be unrelated to this instance's strategy"
	}
	return DimensionResult{
		Dimension: Traceability, Level: level,
		Summary:  summary,
		Evidence: evidence,
	}
}

// truncate shortens s to n runes with an ellipsis.
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// Contradiction: does the change conflict with existing strategy?
// detect_contradictions returns a bare JSON array of:
//
//	{ "description": "...", "fix_with": "..." }
//
// (currently orphan-node detection; semantic contradictions are future work).
// Strong (clear) when none; Weak when present.
func (m *MCPScorer) Contradiction(c openspec.Change) DimensionResult {
	if !m.caller.Has(toolDetectContradictions) {
		return m.unavailable(Contradiction, "detect_contradictions unavailable")
	}
	var found []struct {
		Description string `json:"description"`
	}
	ctx, cancel := context.WithTimeout(m.ctx, m.timeout)
	err := m.caller.CallJSON(ctx, toolDetectContradictions, m.args(nil), &found)
	cancel()
	if err != nil {
		return m.unavailable(Contradiction, "detect_contradictions error: "+err.Error())
	}
	if len(found) == 0 {
		return DimensionResult{Dimension: Contradiction, Level: Strong, Summary: "no contradictions detected"}
	}
	ev := make([]string, 0, len(found))
	for _, x := range found {
		ev = append(ev, x.Description)
	}
	return DimensionResult{
		Dimension: Contradiction, Level: Weak,
		Summary:  fmt.Sprintf("%d contradiction(s) in current strategy", len(found)),
		Evidence: ev,
	}
}

// Maturity: does the change target validated capability? Lists features and
// inspects each feature's payload.feature_maturity.overall_stage. Weak when
// targeted capability is hypothetical/emerging; Strong when proven/scaled.
//
// list_features returns a bare JSON array of StrategyArtifact; maturity lives at
// payload.feature_maturity.overall_stage.
func (m *MCPScorer) Maturity(c openspec.Change) DimensionResult {
	if !m.caller.Has(toolListFeatures) {
		return m.unavailable(Maturity, "list_features unavailable")
	}
	var features []struct {
		ArtifactKey string `json:"artifact_key"`
		Payload     struct {
			FeatureMaturity struct {
				OverallStage string `json:"overall_stage"`
			} `json:"feature_maturity"`
		} `json:"payload"`
	}
	ctx, cancel := context.WithTimeout(m.ctx, m.timeout)
	err := m.caller.CallJSON(ctx, toolListFeatures, m.args(nil), &features)
	cancel()
	if err != nil {
		return m.unavailable(Maturity, "list_features error: "+err.Error())
	}
	if len(features) == 0 {
		return DimensionResult{Dimension: Maturity, Level: Mixed, Summary: "no feature maturity data"}
	}

	hypothetical, proven, ev := 0, 0, []string{}
	for _, f := range features {
		switch f.Payload.FeatureMaturity.OverallStage {
		case "hypothetical", "emerging":
			hypothetical++
			ev = append(ev, fmt.Sprintf("%s: %s", f.ArtifactKey, f.Payload.FeatureMaturity.OverallStage))
		case "proven", "scaled":
			proven++
		}
	}
	level := Mixed
	switch {
	case hypothetical > 0 && proven == 0:
		level = Weak
	case hypothetical == 0 && proven > 0:
		level = Strong
	}
	return DimensionResult{
		Dimension: Maturity, Level: level,
		Summary:  fmt.Sprintf("%d unvalidated, %d proven feature(s)", hypothetical, proven),
		Evidence: ev,
	}
}

// Scope: adjacency signal. Anchors on the strategy artifacts the change's
// content matches (via search_strategy — those return REAL artifact keys), then
// expands neighbors from each anchor. Reports neighbors as evidence and returns
// Signal (not a graded score) — the 10-star interpretation is the human's.
//
// This depends on search_strategy to find anchor keys because footprint slugs
// (e.g. "strategy-web") are not valid graph node keys.
//
// get_neighbors returns a bare JSON array of:
//
//	{ "node_key": "...", "node_type": "...", "edge_type": "...", "edge_direction": "..." }
func (m *MCPScorer) Scope(c openspec.Change) DimensionResult {
	if !m.caller.Has(toolGetNeighbors) || !m.caller.Has(toolSearchStrategy) {
		return m.unavailable(Scope, "get_neighbors/search_strategy unavailable")
	}
	anchors := m.anchorKeys(c)
	if len(anchors) == 0 {
		return DimensionResult{Dimension: Scope, Level: Mixed, Summary: "no strategy anchors for change; no adjacency signal"}
	}

	ev := []string{}
	for _, anchor := range anchors {
		var neighbors []struct {
			NodeKey  string `json:"node_key"`
			EdgeType string `json:"edge_type"`
		}
		ctx, cancel := context.WithTimeout(m.ctx, m.timeout)
		err := m.caller.CallJSON(ctx, toolGetNeighbors, m.args(map[string]any{
			"node_key": anchor,
		}), &neighbors)
		cancel()
		if err != nil {
			return m.unavailable(Scope, "get_neighbors error: "+err.Error())
		}
		for _, n := range neighbors {
			ev = append(ev, fmt.Sprintf("%s —%s→ %s", anchor, n.EdgeType, n.NodeKey))
		}
	}
	if len(ev) == 0 {
		return DimensionResult{Dimension: Scope, Level: Mixed, Summary: "anchored but no neighbors; isolated in graph"}
	}
	return DimensionResult{
		Dimension: Scope, Level: Signal,
		Summary:  fmt.Sprintf("%d adjacent capabilit(ies) via %d anchor(s) — review for scope", len(ev), len(anchors)),
		Evidence: ev,
	}
}

// anchorKeys returns the real strategy artifact keys whose content matches the
// change (the confident search_strategy hits). These are valid graph node keys
// for neighbor expansion.
func (m *MCPScorer) anchorKeys(c openspec.Change) []string {
	query := c.SemanticQuery()
	if query == "" {
		return nil
	}
	var hits []struct {
		ArtifactKey string  `json:"artifact_key"`
		Score       float64 `json:"score"`
	}
	ctx, cancel := context.WithTimeout(m.ctx, m.timeout)
	err := m.caller.CallJSON(ctx, toolSearchStrategy, m.args(map[string]any{
		"query": query, "limit": "3",
	}), &hits)
	cancel()
	if err != nil {
		return nil
	}
	var keys []string
	for _, h := range hits {
		if h.Score >= minTraceScore {
			keys = append(keys, h.ArtifactKey)
		}
	}
	return keys
}

// Sequencing: does the change fit the roadmap? get_roadmap returns the raw
// roadmap_recipe payload; we check whether it has any tracks with OKRs (i.e. the
// roadmap provides a delivery context). Strong when the roadmap is populated;
// Mixed when empty/absent.
func (m *MCPScorer) Sequencing(c openspec.Change) DimensionResult {
	if !m.caller.Has(toolGetRoadmap) {
		return m.unavailable(Sequencing, "get_roadmap unavailable")
	}
	// roadmap_recipe payload: { "roadmap": { "tracks": { "<track>": { "okrs": [...] } } } }
	var recipe struct {
		Roadmap struct {
			Tracks map[string]struct {
				OKRs []json_RawOKR `json:"okrs"`
			} `json:"tracks"`
		} `json:"roadmap"`
	}
	ctx, cancel := context.WithTimeout(m.ctx, m.timeout)
	err := m.caller.CallJSON(ctx, toolGetRoadmap, m.args(nil), &recipe)
	cancel()
	if err != nil {
		return m.unavailable(Sequencing, "get_roadmap error: "+err.Error())
	}
	okrCount := 0
	for _, t := range recipe.Roadmap.Tracks {
		okrCount += len(t.OKRs)
	}
	if okrCount == 0 {
		return DimensionResult{Dimension: Sequencing, Level: Mixed, Summary: "no OKRs in roadmap to sequence against"}
	}
	return DimensionResult{
		Dimension: Sequencing, Level: Strong,
		Summary: fmt.Sprintf("%d OKR(s) across roadmap tracks provide delivery context", okrCount),
	}
}

// json_RawOKR is an opaque OKR entry; we only count them, not parse them.
type json_RawOKR map[string]any
