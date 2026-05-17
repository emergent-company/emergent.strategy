// Package navigation defines the screen graph for the strategy-server web UI.
// It is framework-agnostic and shared between web handlers and templ templates.
package navigation

// ScreenID identifies a unique screen in the navigation graph.
type ScreenID string

const (
	// Root screens
	Dashboard ScreenID = "dashboard"
	Settings  ScreenID = "settings"

	// Strategy-scoped screens (instance = one strategy)
	StrategyDashboard ScreenID = "strategy_dashboard" // execution view (default)

	// READY phase screens
	ReadyOverview   ScreenID = "ready_overview"
	NorthStar       ScreenID = "north_star"
	Foundations     ScreenID = "foundations"
	InsightAnalyses ScreenID = "insight_analyses"
	StrategyFormula ScreenID = "strategy_formula"
	RoadmapRecipe   ScreenID = "roadmap_recipe"

	// FIRE phase screens
	FireOverview     ScreenID = "fire_overview"
	ProductTrack     ScreenID = "product_track"
	CommercialTrack  ScreenID = "commercial_track"
	StrategyTrack    ScreenID = "strategy_track"
	OrgOpsTrack      ScreenID = "org_ops_track"
	FeatureDetail    ScreenID = "feature_detail"
	DefinitionDetail ScreenID = "definition_detail"

	// AIM phase screens
	AimOverview        ScreenID = "aim_overview"
	Assumptions        ScreenID = "aim_assumptions"
	LivingReality      ScreenID = "aim_living_reality"
	AssessmentReport   ScreenID = "aim_assessment_report"
	CalibrationMonitor ScreenID = "aim_calibration"
	CoherenceStatus    ScreenID = "aim_coherence"

	// Artifact viewer
	ArtifactView ScreenID = "artifact_view"
)

// TabGroup groups screens into navigable tabs within a strategy.
type TabGroup string

const (
	TabExecution TabGroup = "execution" // default — the KR/feature/AIM view
	TabREADY     TabGroup = "READY"
	TabFIRE      TabGroup = "FIRE"
	TabAIM       TabGroup = "AIM"
)

// ScreenDef holds the metadata for a single screen.
type ScreenDef struct {
	ID         ScreenID
	Title      string
	Icon       string // Lucide icon class (e.g. "lucide--compass")
	URLPattern string // Echo URL pattern
	Parent     ScreenID
	TabGroup   TabGroup
}

// SidebarItem represents a sidebar navigation entry.
type SidebarItem struct {
	Label  string
	Icon   string
	URL    string
	Active bool
}

// SidebarGroup is a labelled group of sidebar items.
type SidebarGroup struct {
	Label string
	Items []SidebarItem
}

// TabDef represents a tab in the strategy tab bar.
type TabDef struct {
	Group    TabGroup
	Label    string
	Icon     string
	URL      string
	ScreenID ScreenID
}

// StrategyTabs returns the tabs for a strategy instance.
// The execution dashboard is the first tab (default view).
func StrategyTabs(instanceID string) []TabDef {
	prefix := "/strategies/" + instanceID
	return []TabDef{
		{Group: TabExecution, Label: "Execution", Icon: "lucide--zap", URL: prefix, ScreenID: StrategyDashboard},
		{Group: TabREADY, Label: "READY", Icon: "lucide--compass", URL: prefix + "/ready", ScreenID: ReadyOverview},
		{Group: TabFIRE, Label: "FIRE", Icon: "lucide--rocket", URL: prefix + "/fire", ScreenID: FireOverview},
		{Group: TabAIM, Label: "AIM", Icon: "lucide--target", URL: prefix + "/aim", ScreenID: AimOverview},
	}
}
