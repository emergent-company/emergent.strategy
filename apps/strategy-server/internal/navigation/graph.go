package navigation

// DefaultGraph returns the complete navigation graph for the strategy-server.
// This is the single source of truth for all screens, URL patterns, tab
// assignments, breadcrumb chains, and sub-navigation.
func DefaultGraph() *Graph {
	g := &Graph{}

	g.Screens = []ScreenDef{
		// --- Root screens ---
		// Title field holds a langs key — resolved via langs.T(ctx, s.Title) at render time.
		{ID: GlobalDashboard, Title: "nav.screen.dashboard", WebRoute: true, URLPattern: "/",
			Icon: "lucide--layout-dashboard", SidebarGroup: "nav.sidebar_group.overview"},

		// --- Instance landing (Execution tab) ---
		{ID: ExecutionDashboard, Title: "nav.screen.execution", Parent: GlobalDashboard,
			WebRoute: true, URLPattern: "", Icon: "lucide--zap",
			TabGroup: TabExecution, RenderMode: RenderTabLanding, InstanceScoped: true},

		// --- Execution sub-pages ---
		{ID: ActivityOverview, Title: "nav.screen.activity", Parent: ExecutionDashboard,
			WebRoute: true, URLPattern: "/activity", Icon: "lucide--activity",
			TabGroup: TabExecution, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: SkillRuns, Title: "nav.screen.skill_runs", Parent: ExecutionDashboard,
			WebRoute: true, URLPattern: "/skill-runs", Icon: "lucide--cpu",
			TabGroup: TabExecution, RenderMode: RenderTabPage, InstanceScoped: true},
		// Detail screen — hidden from sub-nav, reachable by direct URL
		{ID: SkillRunDetail, Title: "nav.screen.skill_run", Parent: SkillRuns,
			WebRoute: true, URLPattern: "/skill-runs/:runID", Icon: "lucide--cpu",
			TabGroup: TabExecution, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},

		// --- READY tab ---
		{ID: ReadyOverview, Title: "nav.screen.ready", Parent: ExecutionDashboard,
			WebRoute: true, URLPattern: "/ready", Icon: "lucide--compass",
			TabGroup: TabReady, RenderMode: RenderTabLanding, InstanceScoped: true},
		{ID: NorthStar, Title: "nav.screen.north_star", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/north-star", Icon: "lucide--star",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: InsightAnalyses, Title: "nav.screen.insight_analyses", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/insights", Icon: "lucide--search",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: StrategyFoundation, Title: "nav.screen.strategy_foundations", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/foundations", Icon: "lucide--building",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: InsightOpportunity, Title: "nav.screen.insight_opportunity", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/opportunity", Icon: "lucide--lightbulb",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: StrategyFormula, Title: "nav.screen.strategy_formula", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/formula", Icon: "lucide--beaker",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: RoadmapRecipe, Title: "nav.screen.roadmap_recipe", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/roadmap", Icon: "lucide--map",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: ProductPortfolio, Title: "nav.screen.product_portfolio", Parent: ReadyOverview,
			WebRoute: true, URLPattern: "/ready/portfolio", Icon: "lucide--package",
			TabGroup: TabReady, RenderMode: RenderTabPage, InstanceScoped: true},

		// --- FIRE tab ---
		{ID: FireOverview, Title: "nav.screen.fire", Parent: ExecutionDashboard,
			WebRoute: true, URLPattern: "/fire", Icon: "lucide--rocket",
			TabGroup: TabFire, RenderMode: RenderTabLanding, InstanceScoped: true},
		{ID: StrategyTrack, Title: "nav.screen.fire_strategy", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/strategy", Icon: "lucide--navigation",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: OrgOpsTrack, Title: "nav.screen.org_ops", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/org-ops", Icon: "lucide--container",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: ProductTrack, Title: "nav.screen.product", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/product", Icon: "lucide--code-2",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: CommercialTrack, Title: "nav.screen.commercial", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/commercial", Icon: "lucide--briefcase",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true},
		// Detail screens — hidden from sub-nav, reachable by direct URL
		{ID: FeatureDetail, Title: "nav.screen.feature", Parent: ProductTrack,
			WebRoute: true, URLPattern: "/fire/features/:key", Icon: "lucide--code-2",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		{ID: ValueModelDetail, Title: "nav.screen.value_model", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/value-models/:key", Icon: "lucide--layers",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		{ID: DefinitionDetail, Title: "nav.screen.definition", Parent: FireOverview,
			WebRoute: true, URLPattern: "/fire/definitions/:key", Icon: "lucide--file-text",
			TabGroup: TabFire, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},

		// --- AIM tab ---
		{ID: AimOverview, Title: "nav.screen.aim", Parent: ExecutionDashboard,
			WebRoute: true, URLPattern: "/aim", Icon: "lucide--target",
			TabGroup: TabAim, RenderMode: RenderTabLanding, InstanceScoped: true},
		// Sub-nav pages — visible in the AIM tab sub-navigation bar.
		{ID: Coherence, Title: "nav.screen.coherence", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/coherence", Icon: "lucide--shield-check",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: Assumptions, Title: "nav.screen.assumptions", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/assumptions", Icon: "lucide--flask-conical",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: AimVersions, Title: "nav.screen.versions", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/versions", Icon: "lucide--history",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: AimProposals, Title: "nav.screen.proposals", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/proposals", Icon: "lucide--inbox",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: AimCycleRuns, Title: "nav.screen.cycle_runs", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/runs", Icon: "lucide--play-circle",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		{ID: AimEvidence, Title: "nav.screen.evidence", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/evidence", Icon: "lucide--database",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true},
		// Artifact detail pages — accessible by direct URL, hidden from sub-nav.
		{ID: LRA, Title: "nav.screen.lra", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/lra", Icon: "lucide--eye",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		{ID: AssessmentReport, Title: "nav.screen.assessment_report", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/assessment", Icon: "lucide--clipboard-check",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		{ID: Calibration, Title: "nav.screen.calibration", Parent: AimOverview,
			WebRoute: true, URLPattern: "/aim/calibration", Icon: "lucide--sliders-horizontal",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		// AI draft review — reachable via POST redirect from draft-* handlers; not in sub-nav.
		{ID: AimDraftReview, Title: "nav.screen.draft_review", Parent: AimOverview,
			WebRoute: false, URLPattern: "/aim/draft-review/:batchID", Icon: "lucide--sparkles",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},
		// Orchestrated cycle run panel — reachable via redirect from aim/runs; not in sub-nav.
		// WebRoute=false because the handler is registered manually (needs SSE stream endpoint).
		{ID: AimRunPanel, Title: "nav.screen.aim_run", Parent: AimCycleRuns,
			WebRoute: false, URLPattern: "/aim/runs/:runID", Icon: "lucide--play-circle",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},

		// Evidence interview — wizard page for structured evidence collection.
		{ID: AimEvidenceInterview, Title: "nav.screen.evidence_interview", Parent: AimEvidence,
			WebRoute: false, URLPattern: "/aim/evidence/interview", Icon: "lucide--clipboard-list",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},

		// Version detail — single version view with artifact snapshot.
		{ID: VersionDetail, Title: "nav.screen.version_detail", Parent: AimVersions,
			WebRoute: false, URLPattern: "/aim/versions/:versionID", Icon: "lucide--history",
			TabGroup: TabAim, RenderMode: RenderTabPage, InstanceScoped: true, SubNavHidden: true},

		// --- Global screens (not instance-scoped) ---
		{ID: Settings, Title: "nav.screen.settings", WebRoute: true, URLPattern: "/settings",
			Icon: "lucide--settings", SidebarGroup: "nav.sidebar_group.system"},
	}

	return g
}
