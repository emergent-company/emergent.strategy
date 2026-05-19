package handler

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/navigation"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// trackMeta holds static metadata for each FIRE track.
var trackMeta = []struct {
	track     string // DB/roadmap key
	dbType    string // artifact_type in DB for definitions
	vmName    string // value_model name in DB
	name      string // display name
	icon      string
	color     string // DaisyUI token
	screenID  navigation.ScreenID
	subNavURL string // URL for sub-nav active state
	defURL    func(instanceID, key string) string
}{
	{
		track: "strategy", dbType: "strategy_def", vmName: "Strategy",
		name: "Strategy", icon: "lucide--navigation", color: "secondary",
		screenID: navigation.StrategyTrack, subNavURL: "/fire/strategy",
		defURL: func(id, key string) string { return "/strategies/" + id + "/fire/definitions/" + key },
	},
	{
		track: "org_ops", dbType: "org_ops_def", vmName: "OrgOps",
		name: "Org & Ops", icon: "lucide--container", color: "accent",
		screenID: navigation.OrgOpsTrack, subNavURL: "/fire/org-ops",
		defURL: func(id, key string) string { return "/strategies/" + id + "/fire/definitions/" + key },
	},
	{
		track: "product", dbType: "feature",
		vmName: "Product", // matches on name prefix in DB
		name: "Product", icon: "lucide--code-2", color: "primary",
		screenID: navigation.ProductTrack, subNavURL: "/fire/product",
		defURL: func(id, key string) string { return "/strategies/" + id + "/fire/features/" + key },
	},
	{
		track: "commercial", dbType: "commercial_def", vmName: "Commercial",
		name: "Commercial", icon: "lucide--briefcase", color: "info",
		screenID: navigation.CommercialTrack, subNavURL: "/fire/commercial",
		defURL: func(id, key string) string { return "/strategies/" + id + "/fire/definitions/" + key },
	},
}

// handleTrackDashboard renders the expanded FIRE dashboard for a single track:
// Roadmap OKRs → Value Model → Definitions/Features.
func (s *Server) handleTrackDashboard(track string) echo.HandlerFunc {
	// Find metadata for this track
	var meta *struct {
		track     string
		dbType    string
		vmName    string
		name      string
		icon      string
		color     string
		screenID  navigation.ScreenID
		subNavURL string
		defURL    func(instanceID, key string) string
	}
	for i := range trackMeta {
		if trackMeta[i].track == track {
			m := trackMeta[i]
			meta = &m
			break
		}
	}
	if meta == nil {
		return func(c echo.Context) error { return echo.NewHTTPError(404) }
	}

	return func(c echo.Context) error {
		instanceID := c.Param("id")
		ctx := c.Request().Context()

		// Load roadmap OKRs for this track
		allOKRs := s.loadRoadmapOKRsByTrack(ctx, instanceID)
		objectives := allOKRs[meta.track]

		// Load value models for this track
		valueModels := s.loadTrackValueModels(ctx, instanceID, meta.vmName, meta.track)

		// Load definitions / features
		var rows []struct {
			ArtifactKey string          `bun:"artifact_key"`
			Name        string          `bun:"name"`
			Status      string          `bun:"status"`
			Payload     json.RawMessage `bun:"payload"`
		}
		_ = s.db.NewSelect().
			TableExpr("strategy_artifacts").
			ColumnExpr("artifact_key, name, status, payload").
			Where("instance_id = ?", instanceID).
			Where("artifact_type = ?", meta.dbType).
			OrderExpr("name ASC").
			Scan(ctx, &rows)

		isProduct := meta.track == "product"
		defs := make([]ui.FireTrackDefinition, 0, len(rows))
		for _, r := range rows {
			name := r.Name
			if name == "" {
				name = r.ArtifactKey
			}
			tier := 0
			missingVMLink := false
			var p map[string]any
			if json.Unmarshal(r.Payload, &p) == nil {
				if mat, ok := p["maturity"].(map[string]any); ok {
					if t, ok := mat["current_tier"].(float64); ok {
						tier = int(t)
					}
				}
				// Detect missing contributes_to (required by EPF schema for all definition types).
				missingVMLink = !hasContributesTo(p, isProduct)
			}
			def := ui.FireTrackDefinition{
				Key:                   r.ArtifactKey,
				Name:                  name,
				Status:                r.Status,
				MaturityTier:          tier,
				ViewURL:               meta.defURL(instanceID, r.ArtifactKey),
				MissingValueModelLink: missingVMLink,
			}
			if isProduct {
				def.MaturityStage, def.CapabilityCount, def.ImplLinks = extractFeatureDefFields(r.Payload)
			}
			defs = append(defs, def)
		}

		// For Product track, group definitions by product line.
		// For canonical tracks, group by value model layer → component.
		var productLines []ui.FireProductLineGroup
		var layerGroups []ui.FireLayerGroup
		switch meta.track {
		case "product":
			productLines = s.loadProductLineGroups(ctx, instanceID, meta.defURL)
		default:
			layerGroups = s.loadCanonicalLayerGroups(ctx, instanceID, meta.vmName, meta.dbType, meta.defURL)
		}

		data := ui.FireTrackDashboardData{
			InstanceID:   instanceID,
			ScreenID:     string(meta.screenID),
			Name:         meta.name,
			Icon:         meta.icon,
			Track:        meta.track,
			Color:        meta.color,
			SubNavURL:    "/strategies/" + instanceID + meta.subNavURL,
			Objectives:   objectives,
			ValueModels:  valueModels,
			Definitions:  defs,
			ProductLines: productLines,
			Layers:       layerGroups,
		}
		return s.renderFireTrackPage(c, meta.name+" Track", data)
	}
}

// loadTrackValueModels loads value model summaries (name + layers) for a track.
// vmName is the DB `name` column value (e.g. "Strategy", "OrgOps", "Product", "Commercial").
// For Product, multiple rows may exist (one per product line).
func (s *Server) loadTrackValueModels(ctx context.Context, instanceID, vmName, track string) []ui.FireTrackValueModel {
	var rows []struct {
		ArtifactKey string `bun:"artifact_key"`
		Name        string `bun:"name"`
		Payload     string `bun:"payload"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, name, payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "value_model").
		Where("name = ?", vmName).
		OrderExpr("artifact_key ASC").
		Scan(ctx, &rows)

	result := make([]ui.FireTrackValueModel, 0, len(rows))
	for _, r := range rows {
		// Derive display name — for Product, extract product line name from payload
		displayName := r.Name
		var m map[string]any
		if json.Unmarshal([]byte(r.Payload), &m) == nil {
			if track == "product" {
				if pln, ok := m["product_line_name"].(string); ok && pln != "" {
					displayName = pln
				} else {
					// Fall back to slug from artifact key
					parts := strings.Split(r.ArtifactKey, ".")
					if len(parts) >= 2 {
						displayName = slugToTitle(parts[len(parts)-2])
					}
				}
			}
		}
		// Extract layer names
		var layers []string
		if m != nil {
			if ls, ok := m["layers"].([]any); ok {
				seenLayer := make(map[string]bool)
				for _, lAny := range ls {
					if lm, ok := lAny.(map[string]any); ok {
						if name, ok := lm["name"].(string); ok && name != "" && !seenLayer[name] {
							seenLayer[name] = true
							layers = append(layers, toTitleCase(name))
						}
					}
				}
			}
		}
		result = append(result, ui.FireTrackValueModel{
			Key:     r.ArtifactKey,
			Name:    displayName,
			Layers:  layers,
			ViewURL: "/strategies/" + instanceID + "/fire/value-models/" + r.ArtifactKey,
		})
	}
	return result
}

// renderFireTrackPage handles 3-tier rendering for track dashboard pages.
func (s *Server) renderFireTrackPage(c echo.Context, title string, data ui.FireTrackDashboardData) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	instance, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return echo.NewHTTPError(404, "Instance not found")
	}

	tabs := s.strategyTabs(instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)
	content := ui.FireTrackDashboardContent(data)

	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(title+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
		ui.InstanceTabContent(tabs, currentPath, content),
	)
	return nil
}



// renderListPage handles 3-tier rendering for list pages.
func (s *Server) renderListPage(c echo.Context, title string, data ui.ArtifactListData) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	instance, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return echo.NewHTTPError(404, "Instance not found")
	}

	tabs := s.strategyTabs(instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)
	content := ui.ArtifactListContent(data)

	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(title+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
		ui.InstanceTabContent(tabs, currentPath, content),
	)
	return nil
}
