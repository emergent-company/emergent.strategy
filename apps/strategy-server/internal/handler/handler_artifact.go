package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/a-h/templ"
	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleArtifactView renders a read-only view of any artifact by its key.
func (s *Server) handleArtifactView(c echo.Context) error {
	instanceID := c.Param("id")
	artifactKey := c.Param("key")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	instance, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return echo.NewHTTPError(404, langs.T(ctx, "error.instance_not_found"))
	}

	stats := s.loadInstanceStats(ctx, instance)
	ctx = ui.WithInstanceStats(ctx, stats)
	c.SetRequest(c.Request().WithContext(ctx))

	// Load the artifact
	var row struct {
		ArtifactKey  string          `bun:"artifact_key"`
		ArtifactType string          `bun:"artifact_type"`
		Name         string          `bun:"name"`
		Status       string          `bun:"status"`
		Track        string          `bun:"track"`
		Payload      json.RawMessage `bun:"payload"`
	}
	err = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, artifact_type, name, status, track, payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_key = ?", artifactKey).
		Scan(ctx, &row)
	if err != nil {
		s.log.Error("artifact not found", "err", err, "key", artifactKey)
		return echo.NewHTTPError(404, langs.T(ctx, "error.not_found"))
	}

	var payload map[string]any
	if err := json.Unmarshal(row.Payload, &payload); err != nil {
		s.log.Error("failed to parse artifact payload", "err", err, "key", artifactKey)
		payload = map[string]any{"error": "Failed to parse payload"}
	}

	name := row.Name
	if name == "" {
		name = row.ArtifactKey
	}

	tabs := s.strategyTabs(ctx, instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)

	tabGroup := artifactTabGroup(row.ArtifactType)
	screenID := artifactScreenID(row.ArtifactType)
	navCtx := ui.NavContext{InstanceID: instanceID, CurrentPath: currentPath, ScreenID: screenID, TabGroup: tabGroup}
	content := s.bespokeContent(ctx, instanceID, row.Track, navCtx, row.ArtifactType, row.ArtifactKey, name, row.Status, payload)

	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(name+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
		ui.InstanceTabContent(tabs, currentPath, content),
	)
	return nil
}

// handleArtifactViewByType renders the single artifact of a given type (for READY phase singletons).
func (s *Server) handleArtifactViewByType(artifactType string) echo.HandlerFunc {
	return func(c echo.Context) error {
		instanceID := c.Param("id")
		ctx := c.Request().Context()
		currentPath := c.Request().URL.Path

		instance, err := s.loadInstance(ctx, instanceID)
		if err != nil {
			return echo.NewHTTPError(404, langs.T(ctx, "error.instance_not_found"))
		}

		stats := s.loadInstanceStats(ctx, instance)
		ctx = ui.WithInstanceStats(ctx, stats)
		c.SetRequest(c.Request().WithContext(ctx))

		// Load the artifact by type (singletons)
		var row struct {
			ArtifactKey  string          `bun:"artifact_key"`
			ArtifactType string          `bun:"artifact_type"`
			Name         string          `bun:"name"`
			Status       string          `bun:"status"`
			Track        string          `bun:"track"`
			Payload      json.RawMessage `bun:"payload"`
		}
		err = s.db.NewSelect().
			TableExpr("strategy_artifacts").
			ColumnExpr("artifact_key, artifact_type, name, status, track, payload").
			Where("instance_id = ?", instanceID).
			Where("artifact_type = ?", artifactType).
			Limit(1).
			Scan(ctx, &row)
		if err != nil {
			// No artifact of this type — show placeholder (not an error, just empty state).
			return s.renderArtifactPlaceholder(c, instance, instanceID, artifactType, currentPath)
		}

		var payload map[string]any
		if err := json.Unmarshal(row.Payload, &payload); err != nil {
			payload = map[string]any{"error": "Failed to parse payload"}
		}

		name := row.Name
		if name == "" {
			name = ui.FormatKey(artifactType)
		}

		// Try bespoke view via decomposer; fall back to generic viewer.
		tabGroup := artifactTabGroup(artifactType)
		screenID := artifactScreenID(artifactType)
		navCtx := ui.NavContext{InstanceID: instanceID, CurrentPath: currentPath, ScreenID: screenID, TabGroup: tabGroup}
		// AIM cycle-step artifacts back-link to the producing run's step-progress
		// screen. Scoped to AIM artifact types so READY/FIRE artifacts are unaffected.
		if isAIMCycleArtifact(artifactType) {
			navCtx.BackRunID = s.latestAIMRunID(ctx, instanceID)
		}
		content := s.bespokeContent(ctx, instanceID, row.Track, navCtx, artifactType, row.ArtifactKey, name, row.Status, payload)

		tabs := s.strategyTabs(ctx, instanceID, currentPath)
		sidebarGroups := s.sidebarGroups(c)

		render.RenderTriple(c.Response().Writer, c.Request(),
			ui.InstancePhaseFullPage(name+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, content),
			ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
			ui.InstanceTabContent(tabs, currentPath, content),
		)
		return nil
	}
}

// bespokeContent tries to produce a type-specific templ component via DecomposePayload.
// Each bespoke view owns its own sub-nav and PageHeader (set via NavContext).
// If the artifact type has no bespoke view or decomposition fails, it falls back to
// the generic ArtifactViewContent renderer (which does not own its sub-nav).
func (s *Server) bespokeContent(ctx context.Context, instanceID, track string, navCtx ui.NavContext, artifactType, artifactKey, name, status string, payload map[string]any) templ.Component {
	switch artifactType {
	case "north_star":
		if c := s.northStarContent(navCtx, artifactKey, name, status, payload); c != nil {
			return c
		}
	case "strategy_formula":
		if c := s.strategyFormulaContent(navCtx, artifactKey, name, status, payload); c != nil {
			return c
		}
	case "insight_analyses":
		if c := s.insightAnalysesContent(navCtx, artifactKey, name, status, payload); c != nil {
			return c
		}
	case "strategy_foundations":
		return s.strategyFoundationsContent(navCtx, artifactKey, name, status, payload)
	case "insight_opportunity":
		return s.insightOpportunityContent(navCtx, artifactKey, name, status, payload)
	case "roadmap_recipe":
		return s.roadmapRecipeContent(navCtx, artifactKey, name, status, payload)
	case "feature_definition", "feature":
		return s.featureViewContent(navCtx, artifactKey, name, status, payload)
	case "value_model":
		return s.valueModelContent(ctx, instanceID, track, navCtx, artifactKey, name, status, payload)
	case "living_reality_assessment":
		return s.lraContent(navCtx, artifactKey, name, status, payload)
	case "assessment_report":
		return s.assessmentContent(ctx, instanceID, navCtx, artifactKey, name, status, payload)
	case "calibration_memo":
		return s.calibrationContent(navCtx, artifactKey, name, status, payload)
	}

	// Fallback: generic recursive renderer (no sub-nav — caller wraps if needed)
	return ui.ArtifactViewContent(ui.ArtifactViewData{
		InstanceID:   navCtx.InstanceID,
		ArtifactKey:  artifactKey,
		ArtifactType: artifactType,
		Name:         name,
		Status:       status,
		Payload:      payload,
	})
}

// northStarContent decomposes a north_star payload and enriches it with
// additional payload fields to produce a bespoke NorthStarContent component.
// Returns nil if decomposition fails (caller falls back to generic view).
func (s *Server) northStarContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data, err := buildNorthStarData(navCtx, artifactKey, name, status, payload)
	if err != nil {
		s.log.Warn("north_star decomposition failed, using generic view", "err", err)
		return nil
	}
	return ui.NorthStarContent(data)
}

// buildNorthStarData reads a north_star payload into what the page shows. The
// schema and the template wrap the content in a north_star root key; a payload
// already unwrapped is accepted too. The root is removed once, here, so the
// decomposer and the direct field reads below see the same content.
func buildNorthStarData(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) (ui.NorthStarData, error) {
	inner := payload
	if root, ok := payload["north_star"].(map[string]any); ok {
		inner = root
	} else {
		payload = map[string]any{"north_star": inner}
	}

	result, err := decompose.DecomposePayload("north_star", payload)
	if err != nil {
		return ui.NorthStarData{}, err
	}
	payload = inner

	data := ui.NorthStarData{
		NavContext:   navCtx,
		ArtifactKey:  artifactKey,
		ArtifactType: "north_star",
		Name:         name,
		Status:       status,
		Beliefs:      make(map[string][]ui.BeliefData),
	}

	// ── Top-level fields ──
	data.Organization = payloadStr(payload, "organization")
	data.LastReviewed = payloadStr(payload, "last_reviewed")
	data.NextReview = payloadStr(payload, "next_review")

	// ── Purpose (rich fields from payload) ──
	if purpose, ok := payload["purpose"].(map[string]any); ok {
		data.ProblemWeSolve = payloadStr(purpose, "problem_we_solve")
		data.WhoWeServe = payloadStr(purpose, "who_we_serve")
		data.ImpactWeSeek = payloadStr(purpose, "impact_we_seek")
	}

	// ── Vision (rich fields from payload) ──
	if vision, ok := payload["vision"].(map[string]any); ok {
		data.VisionTimeframe = payloadStr(vision, "timeframe")
		data.SuccessLooksLike = payloadStrSlice(vision, "success_looks_like")
		data.NotTheVision = payloadStrSlice(vision, "not_the_vision")
	}

	// ── Mission (rich fields from payload) ──
	if mission, ok := payload["mission"].(map[string]any); ok {
		data.WhoWeServeSpecific = payloadStr(mission, "who_we_serve_specifically")
		data.WhatWeDo = payloadStrSlice(mission, "what_we_do")
		if how, ok := mission["how_we_deliver"].(map[string]any); ok {
			data.HowWeDeliver = payloadStr(how, "approach")
			data.KeyCapabilities = payloadStrSlice(how, "key_capabilities")
		}
		if boundaries, ok := mission["boundaries"].(map[string]any); ok {
			data.WeDontDo = payloadStrSlice(boundaries, "we_dont_do")
			data.BoundariesWhy = payloadStr(boundaries, "why_not")
		}
	}

	// ── Values (rich: behaviors expected/rejected from payload) ──
	if values, ok := payload["values"].([]any); ok {
		for _, v := range values {
			vm, ok := v.(map[string]any)
			if !ok {
				continue
			}
			data.Values = append(data.Values, ui.NorthStarValue{
				Value:             payloadStr(vm, "value"),
				Definition:        payloadStr(vm, "definition"),
				ExampleDecision:   payloadStr(vm, "example_decision"),
				BehaviorsExpected: payloadStrSlice(vm, "behaviors_we_expect"),
				BehaviorsRejected: payloadStrSlice(vm, "behaviors_we_reject"),
			})
		}
	}

	// ── Value conflicts ──
	if conflicts, ok := payload["value_conflicts"].([]any); ok {
		for _, c := range conflicts {
			cm, ok := c.(map[string]any)
			if !ok {
				continue
			}
			data.ValueConflicts = append(data.ValueConflicts, ui.ValueConflict{
				Tension:             payloadStr(cm, "tension"),
				ResolutionPrinciple: payloadStr(cm, "resolution_principle"),
			})
		}
	}

	// ── Evolution history ──
	if history, ok := payload["evolution_history"].([]any); ok {
		for _, e := range history {
			em, ok := e.(map[string]any)
			if !ok {
				continue
			}
			data.Evolution = append(data.Evolution, ui.EvolutionEntry{
				Date:        payloadStr(em, "date"),
				WhatChanged: payloadStr(em, "what_changed"),
				Why:         payloadStr(em, "why"),
				Impact:      payloadStr(em, "impact"),
			})
		}
	}

	data.AlignmentChecks = northStarAlignmentChecks(payload)
	data.ReviewScheduled, data.ReviewEvents = northStarReviewTriggers(payload)
	data.Maturity = northStarMaturity(payload)

	// ── Belief challenges ──
	if beliefs, ok := payload["core_beliefs"].(map[string]any); ok {
		if challenges, ok := beliefs["belief_challenges"].([]any); ok {
			for _, ch := range challenges {
				cm, ok := ch.(map[string]any)
				if !ok {
					continue
				}
				data.BeliefChallenges = append(data.BeliefChallenges, ui.BeliefChallenge{
					Belief:          payloadStr(cm, "belief"),
					CounterEvidence: payloadStr(cm, "counter_evidence"),
					Monitoring:      payloadStr(cm, "monitoring"),
				})
			}
		}
	}

	// ── Map decomposed Belief objects (purpose/vision/mission/core beliefs) ──
	for _, obj := range result.Objects {
		if obj.Type != "Belief" {
			continue
		}
		b := ui.BeliefData{
			Name:        propStr(obj.Properties, "name"),
			Statement:   propStr(obj.Properties, "statement"),
			Implication: propStr(obj.Properties, "implication"),
			Evidence:    propStr(obj.Properties, "evidence"),
			Category:    propStr(obj.Properties, "category"),
		}

		switch {
		case obj.Key == "Belief:north_star:purpose":
			data.Purpose = b
		case obj.Key == "Belief:north_star:vision":
			data.Vision = b
		case obj.Key == "Belief:north_star:mission":
			data.Mission = b
		case isValueBelief(obj.Key):
			// Values are already populated from the richer payload above; skip.
			continue
		default:
			cat := b.Category
			if cat == "" {
				cat = "uncategorized"
			}
			data.Beliefs[cat] = append(data.Beliefs[cat], b)
		}
	}

	data.Gaps = checkNorthStarGaps(payload)
	return data, nil
}

// northStarAlignmentChecks reads alignment_checks: statements that purpose,
// vision, mission, values and beliefs tell one story.
func northStarAlignmentChecks(payload map[string]any) []ui.NorthStarStatement {
	checks, ok := payload["alignment_checks"].(map[string]any)
	if !ok {
		return nil
	}
	var out []ui.NorthStarStatement
	for _, c := range []struct{ key, label string }{
		{"purpose_vision_alignment", "Purpose and vision"},
		{"mission_purpose_alignment", "Mission and purpose"},
		{"values_mission_alignment", "Values and mission"},
		{"beliefs_inform_strategy", "Beliefs and strategy"},
	} {
		if text := strings.TrimSpace(payloadStr(checks, c.key)); text != "" {
			out = append(out, ui.NorthStarStatement{Label: c.label, Text: text})
		}
	}
	return out
}

// northStarReviewTriggers reads next_review_triggers: the schedule and the
// events that call for an earlier review.
func northStarReviewTriggers(payload map[string]any) (scheduled string, events []string) {
	triggers, ok := payload["next_review_triggers"].(map[string]any)
	if !ok {
		return "", nil
	}
	return payloadStr(triggers, "scheduled"), payloadStrSlice(triggers, "event_based")
}

// northStarMaturity reads strategic_maturity_context: where each product line
// stands, and the patterns seen across them.
func northStarMaturity(payload map[string]any) ui.NorthStarMaturity {
	var m ui.NorthStarMaturity
	sm, ok := payload["strategic_maturity_context"].(map[string]any)
	if !ok {
		return m
	}
	m.LastReview = payloadStr(sm, "last_maturity_review")
	lines, _ := sm["portfolio_summary"].([]any)
	for _, l := range lines {
		lm, ok := l.(map[string]any)
		if !ok {
			continue
		}
		pl := ui.MaturityProductLine{
			ProductLine: payloadStr(lm, "product_line"),
			Position:    payloadStr(lm, "overall_position"),
			Milestone:   payloadStr(lm, "current_milestone"),
			Notes:       payloadStr(lm, "milestone_notes"),
			FocusAdvice: payloadStr(lm, "focus_recommendation"),
		}
		if tm, ok := lm["track_maturity"].(map[string]any); ok {
			for _, track := range []string{"product", "strategy", "org_ops", "commercial"} {
				if stage := payloadStr(tm, track); stage != "" {
					pl.TrackMaturity = append(pl.TrackMaturity, ui.NorthStarStatement{Label: track, Text: stage})
				}
			}
		}
		m.ProductLines = append(m.ProductLines, pl)
	}
	themes, _ := sm["maturity_themes"].([]any)
	for _, th := range themes {
		if tm, ok := th.(map[string]any); ok {
			m.Themes = append(m.Themes, ui.MaturityTheme{Theme: payloadStr(tm, "theme"), Implication: payloadStr(tm, "implication")})
		}
	}
	return m
}

// propStr safely extracts a string property from a map.
func propStr(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// hasContributesTo reports whether a definition/feature payload has a non-empty
// contributes_to field. For features the field is nested under strategic_context;
// for canonical defs it is top-level.
func hasContributesTo(p map[string]any, isFeature bool) bool {
	var ct []any
	if isFeature {
		if sc, ok := p["strategic_context"].(map[string]any); ok {
			ct, _ = sc["contributes_to"].([]any)
		}
	} else {
		ct, _ = p["contributes_to"].([]any)
	}
	return len(ct) > 0
}

// payloadStr is an alias for propStr — extracts a string from a JSONB map.
func payloadStr(m map[string]any, key string) string {
	return propStr(m, key)
}

// payloadIntAsStr extracts a JSON number field and formats it as a string.
// JSON integers unmarshal as float64; payloadStr would return "" for them.
func payloadIntAsStr(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch val := v.(type) {
	case float64:
		return fmt.Sprintf("%d", int(val))
	case string:
		return val
	}
	return ""
}

// payloadStrSlice extracts a []string from a JSONB []any field.
func payloadStrSlice(m map[string]any, key string) []string {
	arr, ok := m[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// payloadInt extracts an int from a JSONB map (JSON numbers decode as float64).
func payloadInt(m map[string]any, key string) int {
	if f, ok := m[key].(float64); ok {
		return int(f)
	}
	return 0
}

// payloadBool extracts a bool from a JSONB map.
func payloadBool(m map[string]any, key string) bool {
	if b, ok := m[key].(bool); ok {
		return b
	}
	return false
}

// payloadIntMap extracts a map[string]int from a JSONB map of string->number.
func payloadIntMap(m map[string]any, key string) map[string]int {
	sub, ok := m[key].(map[string]any)
	if !ok {
		return nil
	}
	out := make(map[string]int, len(sub))
	for k, v := range sub {
		if f, ok := v.(float64); ok {
			out[k] = int(f)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// slugToTitle converts a kebab-case slug to a title-cased string.
// e.g. "epf-runtime" -> "Epf Runtime", "emergent-memory" -> "Emergent Memory"
func slugToTitle(slug string) string {
	words := strings.Split(strings.ReplaceAll(slug, "_", "-"), "-")
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// isValueBelief returns true if the object key matches the value belief pattern.
func isValueBelief(key string) bool {
	// Value beliefs have keys like "Belief:north_star:values[0]", "Belief:north_star:values[1]"
	return len(key) > 25 && key[:25] == "Belief:north_star:values["
}

// renderArtifactPlaceholder renders an empty-state placeholder when an artifact doesn't exist.
func (s *Server) renderArtifactPlaceholder(c echo.Context, instance *domain.StrategyInstance, instanceID, artifactType, currentPath string) error {
	tabs := s.strategyTabs(c.Request().Context(), instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)
	tabGroup := artifactTabGroup(artifactType)
	screenID := artifactScreenID(artifactType)
	navCtx := ui.NavContext{InstanceID: instanceID, CurrentPath: currentPath, ScreenID: screenID, TabGroup: tabGroup}
	if isAIMCycleArtifact(artifactType) {
		navCtx.BackRunID = s.latestAIMRunID(c.Request().Context(), instanceID)
	}
	content := ui.ArtifactPlaceholder(navCtx,
		ui.FormatKey(artifactType),
		"This artifact has not been created yet. Use the MCP tools to author it.",
		"lucide--file-text",
	)
	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(ui.FormatKey(artifactType)+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
		ui.InstanceTabContent(tabs, currentPath, content),
	)
	return nil
}
