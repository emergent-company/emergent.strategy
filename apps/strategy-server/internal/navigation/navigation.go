// Package navigation defines a framework-agnostic navigation graph for the
// strategy-server web UI. It describes screens, transitions, and menus as
// pure data — no HTTP, HTMX, or rendering dependencies.
//
// This package is the single source of truth for:
//   - Route registration (web layer iterates screens with WebRoute=true)
//   - Tab bars (derived from TabGroup assignments)
//   - Sub-navigation within tabs (derived from RenderMode=RenderTabPage)
//   - Breadcrumbs (derived from Parent chain)
//   - Sidebar items (derived from SidebarGroup labels)
package navigation

import (
	"fmt"
	"strings"
)

// ScreenID identifies a view/page in the application.
type ScreenID string

const (
	// Root screens
	GlobalDashboard ScreenID = "dashboard"

	// Instance-scoped screens (strategy instance)
	ExecutionDashboard ScreenID = "execution-dashboard"

	// READY phase screens
	ReadyOverview      ScreenID = "ready-overview"
	NorthStar          ScreenID = "north-star"
	InsightAnalyses    ScreenID = "insight-analyses"
	StrategyFoundation ScreenID = "strategy-foundations"
	InsightOpportunity ScreenID = "insight-opportunity"
	StrategyFormula    ScreenID = "strategy-formula"
	RoadmapRecipe      ScreenID = "roadmap-recipe"
	ProductPortfolio   ScreenID = "product-portfolio"

	// FIRE phase screens
	FireOverview     ScreenID = "fire-overview"
	StrategyTrack    ScreenID = "strategy-track"
	OrgOpsTrack      ScreenID = "org-ops-track"
	ProductTrack     ScreenID = "product-track"
	CommercialTrack  ScreenID = "commercial-track"
	FeatureDetail    ScreenID = "feature-detail"
	ValueModelDetail ScreenID = "value-model-detail"
	DefinitionDetail ScreenID = "definition-detail"

	// AIM phase screens
	AimOverview      ScreenID = "aim-overview"
	LRA              ScreenID = "aim-lra"
	AssessmentReport ScreenID = "aim-assessment"
	Assumptions      ScreenID = "aim-assumptions"
	Calibration      ScreenID = "aim-calibration"
	Coherence        ScreenID = "aim-coherence"
	AimVersions      ScreenID = "aim-versions"
	AimProposals     ScreenID = "aim-proposals"    // Cycle proposals inbox — human approval gate
	AimDraftReview   ScreenID = "aim-draft-review" // AI draft review — hidden from sub-nav
	AimRunPanel      ScreenID = "aim-run-panel"    // Orchestrated cycle run panel — hidden from sub-nav
)

// TabGroup identifies which instance tab a screen belongs to.
type TabGroup string

const (
	TabNone      TabGroup = ""
	TabExecution TabGroup = "execution"
	TabReady     TabGroup = "ready"
	TabFire      TabGroup = "fire"
	TabAim       TabGroup = "aim"
)

// TabMeta provides display metadata for a TabGroup.
type TabMeta struct {
	Label      string
	Icon       string
	Order      int
	LandingURL string // URL suffix appended to /strategies/:id
}

// TabDisplay returns display metadata for each tab group.
func TabDisplay(tab TabGroup) TabMeta {
	switch tab {
	case TabExecution:
		return TabMeta{"Execution", "lucide--zap", 1, ""}
	case TabReady:
		return TabMeta{"READY", "lucide--compass", 2, "/ready"}
	case TabFire:
		return TabMeta{"FIRE", "lucide--rocket", 3, "/fire"}
	case TabAim:
		return TabMeta{"AIM", "lucide--target", 4, "/aim"}
	default:
		return TabMeta{"Unknown", "", 99, ""}
	}
}

// RenderMode indicates how a screen should be rendered in the web UI.
type RenderMode string

const (
	RenderDefault    RenderMode = ""            // Root-level page render.
	RenderTabLanding RenderMode = "tab_landing" // Tab landing — shown when tab is clicked.
	RenderTabPage    RenderMode = "tab_page"    // Sub-page within a tab.
)

// ScreenDef describes a screen in the graph.
type ScreenDef struct {
	ID             ScreenID
	Title          string     // Display title (used in breadcrumbs, page header).
	Parent         ScreenID   // Parent screen (for breadcrumb chain). Empty = root.
	WebRoute       bool       // True = register an HTTP route for this screen.
	URLPattern     string     // URL path pattern relative to instance prefix, or absolute for root.
	Icon           string     // Iconify class, e.g. "lucide--compass".
	SidebarGroup   string     // Sidebar group label. Empty = not in sidebar.
	TabGroup       TabGroup   // Which instance tab this screen belongs to.
	RenderMode     RenderMode // How this screen renders.
	InstanceScoped bool       // True = under /strategies/:id/ prefix.
	SubNavHidden   bool       // True = exclude from tab sub-navigation bar.
}

// Graph holds the complete navigation model.
type Graph struct {
	Screens []ScreenDef
}

// --- Query methods ---

// ScreenByID returns a screen definition or nil.
func (g *Graph) ScreenByID(id ScreenID) *ScreenDef {
	for i := range g.Screens {
		if g.Screens[i].ID == id {
			return &g.Screens[i]
		}
	}
	return nil
}

// WebScreens returns all screens with WebRoute=true.
func (g *Graph) WebScreens() []ScreenDef {
	var result []ScreenDef
	for _, s := range g.Screens {
		if s.WebRoute {
			result = append(result, s)
		}
	}
	return result
}

// InstanceTabGroups returns all distinct TabGroup values used by instance-scoped
// web screens, in display order.
func (g *Graph) InstanceTabGroups() []TabGroup {
	seen := make(map[TabGroup]bool)
	var tabs []TabGroup
	for _, s := range g.Screens {
		if s.TabGroup != TabNone && s.WebRoute && s.InstanceScoped && !seen[s.TabGroup] {
			seen[s.TabGroup] = true
			tabs = append(tabs, s.TabGroup)
		}
	}
	// Sort by display order.
	for i := 0; i < len(tabs); i++ {
		for j := i + 1; j < len(tabs); j++ {
			if TabDisplay(tabs[i]).Order > TabDisplay(tabs[j]).Order {
				tabs[i], tabs[j] = tabs[j], tabs[i]
			}
		}
	}
	return tabs
}

// TabSubNavScreens returns all RenderTabPage screens in the given TabGroup,
// excluding the landing page. These are shown as a sub-navigation bar within
// the tab. Screens with SubNavHidden=true or parameterized URLs are excluded.
func (g *Graph) TabSubNavScreens(tab TabGroup) []ScreenDef {
	var result []ScreenDef
	for _, s := range g.Screens {
		if s.TabGroup != tab || !s.WebRoute || !s.InstanceScoped {
			continue
		}
		if s.RenderMode != RenderTabPage {
			continue
		}
		if s.SubNavHidden {
			continue
		}
		// Skip parameterized URLs (they need specific IDs).
		if strings.Contains(s.URLPattern, ":") {
			continue
		}
		result = append(result, s)
	}
	return result
}

// BreadcrumbEntry represents one segment of a breadcrumb trail.
type BreadcrumbEntry struct {
	Label string
	Href  string // Empty for the last (current) entry.
}

// BreadcrumbChain walks the Parent chain from a screen back to the root,
// returning breadcrumb entries from root to the given screen.
// instanceID is used to resolve instance-scoped URLs.
func (g *Graph) BreadcrumbChain(screenID ScreenID, instanceID string) []BreadcrumbEntry {
	var chain []BreadcrumbEntry
	visited := make(map[ScreenID]bool) // cycle protection

	current := screenID
	for current != "" && !visited[current] {
		visited[current] = true
		s := g.ScreenByID(current)
		if s == nil {
			break
		}

		href := ""
		if s.WebRoute {
			href = g.URLForScreen(s.ID, instanceID)
		}

		chain = append(chain, BreadcrumbEntry{
			Label: s.Title,
			Href:  href,
		})
		current = s.Parent
	}

	// Reverse to get root-first order.
	for i, j := 0, len(chain)-1; i < j; i, j = i+1, j-1 {
		chain[i], chain[j] = chain[j], chain[i]
	}

	// The last entry (current page) should have no href.
	if len(chain) > 0 {
		chain[len(chain)-1].Href = ""
	}

	return chain
}

// URLForScreen resolves the full URL path for a screen.
func (g *Graph) URLForScreen(screenID ScreenID, instanceID string) string {
	s := g.ScreenByID(screenID)
	if s == nil || !s.WebRoute {
		return ""
	}
	if s.InstanceScoped && instanceID != "" {
		return "/strategies/" + instanceID + s.URLPattern
	}
	return s.URLPattern
}

// ScreenByURL finds the screen matching a URL path.
// Returns nil if no screen matches.
func (g *Graph) ScreenByURL(path string) *ScreenDef {
	// Try root screens first (exact match).
	for i := range g.Screens {
		s := &g.Screens[i]
		if !s.WebRoute || s.InstanceScoped {
			continue
		}
		if s.URLPattern == path {
			return s
		}
	}

	// Try instance-scoped screens by stripping /strategies/:id prefix.
	if strings.HasPrefix(path, "/strategies/") {
		parts := strings.SplitN(path, "/", 4) // ["", "strategies", "{id}", "rest..."]
		suffix := ""
		if len(parts) >= 4 {
			suffix = "/" + parts[3]
		}
		for i := range g.Screens {
			s := &g.Screens[i]
			if !s.WebRoute || !s.InstanceScoped {
				continue
			}
			if s.URLPattern == suffix {
				return s
			}
		}
	}

	return nil
}

// ResolveTabForPath determines which TabGroup is active for a given URL path.
// Uses longest-prefix matching against screen URLPatterns.
func (g *Graph) ResolveTabForPath(instanceID, currentPath string) TabGroup {
	prefix := "/strategies/" + instanceID
	var bestMatch TabGroup
	bestLen := 0
	for _, s := range g.Screens {
		if s.TabGroup == "" || !s.WebRoute || !s.InstanceScoped {
			continue
		}
		screenURL := prefix + s.URLPattern
		if strings.HasPrefix(currentPath, screenURL) && len(screenURL) > bestLen {
			bestMatch = s.TabGroup
			bestLen = len(screenURL)
		}
	}
	// Fallback: if path is exactly the instance root, it's Execution.
	if bestMatch == "" && (currentPath == prefix || currentPath == prefix+"/") {
		return TabExecution
	}
	return bestMatch
}

// --- Validation ---

// ValidationError describes a problem in the graph.
type ValidationError struct {
	Level   string // "error" or "warning"
	Message string
}

// Validate checks the graph for structural problems.
func (g *Graph) Validate() []ValidationError {
	var errors []ValidationError
	screenSet := make(map[ScreenID]bool)
	for _, s := range g.Screens {
		screenSet[s.ID] = true
	}

	// Check parent references.
	for _, s := range g.Screens {
		if s.Parent != "" && !screenSet[s.Parent] {
			errors = append(errors, ValidationError{"error",
				fmt.Sprintf("screen %q: parent %q not found", s.ID, s.Parent)})
		}
	}

	// Check no duplicate URL patterns.
	urlSet := make(map[string]ScreenID)
	for _, s := range g.Screens {
		if !s.WebRoute {
			continue
		}
		fullURL := s.URLPattern
		if s.InstanceScoped {
			fullURL = "/strategies/:id" + s.URLPattern
		}
		if existing, ok := urlSet[fullURL]; ok {
			errors = append(errors, ValidationError{"error",
				fmt.Sprintf("duplicate URL pattern %q: screens %q and %q", fullURL, existing, s.ID)})
		}
		urlSet[fullURL] = s.ID
	}

	// Check every instance-scoped screen has a TabGroup.
	for _, s := range g.Screens {
		if s.WebRoute && s.InstanceScoped && s.TabGroup == "" {
			errors = append(errors, ValidationError{"warning",
				fmt.Sprintf("screen %q: instance-scoped but no TabGroup", s.ID)})
		}
	}

	return errors
}
