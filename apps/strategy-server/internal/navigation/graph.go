package navigation

// DefaultGraph returns the complete navigation graph for the strategy-server.
// This is the single source of truth for all screens, URL patterns, tab
// assignments, breadcrumb chains, and sub-navigation.
func DefaultGraph() *Graph {
	g := &Graph{}

	g.Screens = []ScreenDef{
		// --- Root screens ---
		{ID: GlobalDashboard, Title: "Dashboard", WebRoute: true, URLPattern: "/",
			Icon: "lucide--layout-dashboard", SidebarGroup: "Overview"},

		// --- Instance landing (Execution tab) ---
		{ID: ExecutionDashboard, Title: "Execution", Parent: GlobalDashboard,
			WebRoute: true, URLPattern: "", Icon: "lucide--zap",
			TabGroup: TabExecution, RenderMode: RenderTabLanding, InstanceScoped: true},

		// --- READY tab ---
		{ID: ReadyOverview, Title: "READY", Parent: ExecutionDashboard,
			WebRoute: true, URLPattern: "/ready", Icon: "lucide--compass",
			TabGroup: TabReady, RenderMode: RenderTabLanding, InstanceScoped: true},
		{ID: NorthStar, Title: "North Star", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/north-star", Icon: "lucide--star",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: InsightAnalyses, Title: "Insight Analyses", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/insights", Icon: "lucide--search",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: StrategyFoundation, Title: "Strategy Foundations", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/foundations", Icon: "lucide--building",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: InsightOpportunity, Title: "Validated Opportunity", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/opportunity", Icon: "lucide--lightbulb",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: StrategyFormula, Title: "Strategy Formula", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/formula", Icon: "lucide--beaker",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: RoadmapRecipe, Title: "Roadmap Recipe", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/roadmap", Icon: "lucide--map",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: ProductPortfolio, Title: "Product Portfolio", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/portfolio", Icon: "lucide--package",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},

		// --- FIRE tab ---
		{ID: FireOverview, Title: "FIRE", Parent: ExecutionDashboard,
			WebRoute: true, URLPattern: "/fire", Icon: "lucide--rocket",
			TabGroup: TabFire, RenderMode: RenderTabLanding, InstanceScoped: true},
		{ID: StrategyTrack, Title: "Strategy", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/strategy", Icon: "lucide--navigation",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: OrgOpsTrack, Title: "Org & Ops", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/org-ops", Icon: "lucide--container",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: ProductTrack, Title: "Product", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/product", Icon: "lucide--code-2",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: CommercialTrack, Title: "Commercial", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/commercial", Icon: "lucide--briefcase",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true},
		// Detail screens — hidden from sub-nav, reachable by direct URL
		{ID: FeatureDetail, Title: "Feature", Parent: ProductTrack,
			WebRoute: true, URLPattern: "/fire/features/:key", Icon: "lucide--code-2",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		{ID: ValueModelDetail, Title: "Value Model", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/value-models/:key", Icon: "lucide--layers",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		{ID: DefinitionDetail, Title: "Definition", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/definitions/:key", Icon: "lucide--file-text",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},

		// --- AIM tab ---
		{ID: AimOverview, Title: "AIM", Parent: ExecutionDashboard,
			WebRoute: true, URLPattern: "/aim", Icon: "lucide--target",
			TabGroup: TabAim, RenderMode: RenderTabLanding, InstanceScoped: true},
		{ID: LRA, Title: "Living Reality Assessment", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/lra", Icon: "lucide--eye",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: AssessmentReport, Title: "Assessment Report", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/assessment", Icon: "lucide--clipboard-check",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: Assumptions, Title: "Assumptions", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/assumptions", Icon: "lucide--flask-conical",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: Calibration, Title: "Calibration", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/calibration", Icon: "lucide--sliders-horizontal",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: Coherence, Title: "Coherence", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/coherence", Icon: "lucide--shield-check",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: AimVersions, Title: "Versions", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/versions", Icon: "lucide--history",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		// AI draft review — reachable via POST redirect from draft-* handlers; not in sub-nav.
		{ID: AimDraftReview, Title: "Draft Review", Parent: AimOverview,
			WebRoute: false, URLPattern: "/aim/draft-review/:batchID", Icon: "lucide--sparkles",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		// Orchestrated cycle run panel — reachable via POST redirect from aim/runs; not in sub-nav.
		{ID: AimRunPanel, Title: "Run", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/runs/:runID", Icon: "lucide--play-circle",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
	}

	return g
}
