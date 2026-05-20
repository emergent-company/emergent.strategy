// Package ui contains templ components for the strategy-server web UI.
package ui

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/emergent-company/go-daisy/components/layout"
)

// InstanceSummary is the minimal data needed to render instance nav items.
type InstanceSummary struct {
	ID      string
	Name    string
	OrgID   string
	OrgName string
}


// BuildSidebarGroups builds the sidebar navigation with a dashboard link
// and strategy instances grouped by organisation.
func BuildSidebarGroups(currentPath string, instances []InstanceSummary) []layout.SidebarGroup {
	groups := []layout.SidebarGroup{
		{
			Label: "Overview",
			Items: []layout.SidebarItem{
				{Label: "Dashboard", Icon: "lucide--layout-dashboard", Href: "/", Active: currentPath == "/"},
			},
		},
	}

	if len(instances) == 0 {
		return groups
	}

	// Group instances by org, preserving order of first appearance.
	type orgGroup struct {
		name  string
		items []layout.SidebarItem
	}
	seen := map[string]int{} // orgID -> index in orgGroups
	var orgGroups []orgGroup

	for _, inst := range instances {
		url := "/strategies/" + inst.ID
		item := layout.SidebarItem{
			Label:  inst.Name,
			Icon:   "lucide--layers",
			Href:   url,
			Active: hasPrefix(currentPath, url),
		}

		idx, ok := seen[inst.OrgID]
		if !ok {
			idx = len(orgGroups)
			seen[inst.OrgID] = idx
			orgGroups = append(orgGroups, orgGroup{name: inst.OrgName})
		}
		orgGroups[idx].items = append(orgGroups[idx].items, item)
	}

	// Sort org groups alphabetically by name.
	sort.Slice(orgGroups, func(i, j int) bool {
		return orgGroups[i].name < orgGroups[j].name
	})

	for _, og := range orgGroups {
		groups = append(groups, layout.SidebarGroup{
			Label: og.name,
			Items: og.items,
		})
	}

	// System group — always at the bottom.
	groups = append(groups, layout.SidebarGroup{
		Label: "System",
		Items: []layout.SidebarItem{
			{Label: "Settings", Icon: "lucide--settings", Href: "/settings", Active: hasPrefix(currentPath, "/settings")},
		},
	})

	return groups
}

// hasPrefix checks if path starts with the given prefix.
func hasPrefix(path, prefix string) bool {
	if len(path) < len(prefix) {
		return false
	}
	return path[:len(prefix)] == prefix
}

// countActive returns the number of instances with status "active".
func countActive(instances []InstanceInfo) int {
	n := 0
	for _, inst := range instances {
		if inst.Status == "active" {
			n++
		}
	}
	return n
}

// countDraft returns the number of instances with status "draft".
func countDraft(instances []InstanceInfo) int {
	n := 0
	for _, inst := range instances {
		if inst.Status == "draft" {
			n++
		}
	}
	return n
}

// aimSubLabel formats a "X/Y label" string for AIM sub-items.
func aimSubLabel(count, total int, label string) string {
	if total == 0 {
		return ""
	}
	return strconv.Itoa(count) + "/" + strconv.Itoa(total) + " " + label
}

// readyProgress calculates the READY phase progress percentage.
func readyProgress(data ReadyPhaseData) int {
	if data.TotalArtifacts == 0 {
		return 0
	}
	return (data.CompletedArtifacts * 100) / data.TotalArtifacts
}

// assumptionLabel formats the assumption count for display.
func assumptionLabel(tested, total int) string {
	return strconv.Itoa(tested) + "/" + strconv.Itoa(total)
}

// signalColor returns the icon color class based on critical signal count.
func signalColor(critical int) string {
	if critical > 0 {
		return "bg-error/10 text-error"
	}
	return "bg-success/10 text-success"
}

// aimArtifactCount returns the number of existing AIM artifacts.
func aimArtifactCount(data AimPhaseData) int {
	n := 0
	if data.HasLRA {
		n++
	}
	if data.HasAssessmentReport {
		n++
	}
	if data.HasCalibration {
		n++
	}
	if data.HasTriggerConfig {
		n++
	}
	if data.HasRealityCheck {
		n++
	}
	return n
}

// assumptionPercent calculates the percentage of tested assumptions.
func assumptionPercent(tested, total int) int {
	if total == 0 {
		return 0
	}
	return (tested * 100) / total
}

// cycleLabel returns a formatted cycle label, or empty if no cycle.
func cycleLabel(cycle string) string {
	if cycle == "" {
		return ""
	}
	return " — " + cycle
}

// calibrationDecisionLabel returns a human-readable label for a calibration decision.
func calibrationDecisionLabel(decision string) string {
	switch decision {
	case "persevere":
		return "Persevere — stay the course"
	case "pivot":
		return "Pivot — change direction"
	case "pull_the_plug":
		return "Pull the plug — stop"
	case "pending_assessment":
		return "Pending assessment"
	default:
		return decision
	}
}

// calibrationDecisionBannerClass returns the banner container classes for a calibration decision.
func calibrationDecisionBannerClass(decision string) string {
	switch decision {
	case "persevere":
		return "bg-success/5 border-success/20 text-success-content"
	case "pivot":
		return "bg-warning/5 border-warning/20 text-warning-content"
	case "pull_the_plug":
		return "bg-error/5 border-error/20 text-error-content"
	default:
		return "bg-base-200 border-base-content/10 text-base-content"
	}
}

// calibrationDecisionIcon returns the icon for a calibration decision.
func calibrationDecisionIcon(decision string) string {
	switch decision {
	case "persevere":
		return "lucide--trending-up"
	case "pivot":
		return "lucide--rotate-ccw"
	case "pull_the_plug":
		return "lucide--x-circle"
	default:
		return "lucide--help-circle"
	}
}

// signalRowClass returns the card classes for a signal row based on severity.
func signalRowClass(severity string) string {
	switch severity {
	case "critical":
		return "bg-error/5 border-error/20"
	case "warning":
		return "bg-warning/5 border-warning/15"
	default:
		return "bg-base-200/40 border-base-content/5"
	}
}

// signalSeverityIcon returns the icon name for a signal severity.
func signalSeverityIcon(severity string) string {
	switch severity {
	case "critical":
		return "lucide--alert-circle"
	case "warning":
		return "lucide--alert-triangle"
	default:
		return "lucide--info"
	}
}

// signalSeverityColor returns the text color class for a signal severity.
func signalSeverityColor(severity string) string {
	switch severity {
	case "critical":
		return "text-error"
	case "warning":
		return "text-warning"
	default:
		return "text-info"
	}
}

// signalTypeBadgeClass returns badge classes for a signal type.
func signalTypeBadgeClass(signalType string) string {
	switch signalType {
	case "drift":
		return "badge-warning badge-outline"
	case "propagation":
		return "badge-info badge-outline"
	case "tension":
		return "badge-error badge-outline"
	case "staleness":
		return "badge-ghost"
	case "orphan":
		return "badge-ghost"
	default:
		return "badge-ghost"
	}
}

// --- Artifact viewer helpers ---

// sortedKeys returns the keys of a map sorted alphabetically,
// but with common "header" keys first.
func sortedKeys(m map[string]any) []string {
	if m == nil {
		return nil
	}
	priority := []string{"id", "name", "title", "slug", "status", "version", "organization", "purpose", "vision", "mission"}
	var first, rest []string
	seen := make(map[string]bool)
	for _, k := range priority {
		if _, ok := m[k]; ok {
			first = append(first, k)
			seen[k] = true
		}
	}
	for k := range m {
		if !seen[k] {
			rest = append(rest, k)
		}
	}
	sort.Strings(rest)
	return append(first, rest...)
}

// FormatKey converts a snake_case key to a Title Case label.
// Exported for use by handlers.
func FormatKey(key string) string {
	return formatKey(key)
}

// formatKey converts a snake_case key to a Title Case label.
func formatKey(key string) string {
	parts := strings.Split(key, "_")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, " ")
}

// formatValue converts any value to a display string.
func formatValue(v any) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
		if val == float64(int64(val)) {
			return strconv.FormatInt(int64(val), 10)
		}
		return strconv.FormatFloat(val, 'f', -1, 64)
	case bool:
		if val {
			return "Yes"
		}
		return "No"
	default:
		return fmt.Sprintf("%v", v)
	}
}

// asMap attempts to cast a value to map[string]any.
func asMap(v any) (map[string]any, bool) {
	m, ok := v.(map[string]any)
	return m, ok
}

// asSlice attempts to cast a value to []any.
func asSlice(v any) ([]any, bool) {
	s, ok := v.([]any)
	return s, ok
}

// isSimpleArray returns true if all items in the array are scalar.
func isSimpleArray(arr []any) bool {
	for _, item := range arr {
		if _, ok := item.(map[string]any); ok {
			return false
		}
		if _, ok := item.([]any); ok {
			return false
		}
	}
	return true
}

// lenStr returns the length of a slice as a string.
func lenStr(arr []any) string {
	return strconv.Itoa(len(arr))
}

// sectionTitleClass returns the CSS class for a section title based on depth.
func sectionTitleClass(depth int) string {
	if depth == 0 {
		return "text-base font-semibold text-base-content"
	}
	return "text-sm font-semibold text-base-content"
}

// mapTitle extracts a display title from a map, trying common key names.
func mapTitle(m map[string]any) string {
	for _, key := range []string{"name", "title", "value", "belief", "risk", "constraint", "decision", "step", "milestone", "objective", "label", "driver", "engine", "capability", "principle", "vector", "synergy", "component", "tier"} {
		if v, ok := m[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	if v, ok := m["id"]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// isTitleKey returns true if the key is typically used as a title.
func isTitleKey(k string) bool {
	switch k {
	case "name", "title":
		return true
	}
	return false
}

// --- North Star helpers ---

// lenInt returns the integer as a string.
func lenInt(n int) string {
	return strconv.Itoa(n)
}

// beliefCategoryOrder returns the canonical display order for belief categories.
func beliefCategoryOrder() []string {
	return []string{
		"about_our_market",
		"about_our_users",
		"about_our_approach",
		"about_value_creation",
		"about_competition",
	}
}

// formatBeliefCategory converts a belief category slug to a human label.
func formatBeliefCategory(cat string) string {
	switch cat {
	case "about_our_market":
		return "About Our Market"
	case "about_our_users":
		return "About Our Users"
	case "about_our_approach":
		return "About Our Approach"
	case "about_value_creation":
		return "About Value Creation"
	case "about_competition":
		return "About Competition"
	default:
		return formatKey(cat)
	}
}

// beliefCategoryIcon returns an iconify class for a belief category.
func beliefCategoryIcon(cat string) string {
	switch cat {
	case "about_our_market":
		return "lucide--globe"
	case "about_our_users":
		return "lucide--users"
	case "about_our_approach":
		return "lucide--compass"
	case "about_value_creation":
		return "lucide--sparkles"
	case "about_competition":
		return "lucide--swords"
	default:
		return "lucide--circle"
	}
}

// visionSubtitle returns the subtitle for the vision section.
func visionSubtitle(timeframe string) string {
	if timeframe != "" {
		return "Where we're heading (" + timeframe + ")"
	}
	return "Where we're heading"
}

// borderColor returns a DaisyUI border class for a named color.
func borderColor(color string) string {
	return "border-" + color + "/20"
}

// bgColor returns a DaisyUI background class for a named color.
func bgColor(color string) string {
	return "bg-" + color + "/10"
}

// textColor returns a DaisyUI text class for a named color.
func textColor(color string) string {
	return "text-" + color
}

// textColorSafe returns a text class safe for small text on a white/light background.
// Warning (amber) has insufficient contrast at its medium lightness, so it falls
// back to base-content. All other track colours are dark enough for AA compliance.
func textColorSafe(color string) string {
	if color == "warning" {
		return "text-base-content"
	}
	return "text-" + color
}

// --- Strategy Formula / Insight helpers ---

// sortedMapKeys returns the keys of a map[string]string in sorted order.
func sortedMapKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// confidenceBadgeClass returns the badge class for a confidence level.
func confidenceBadgeClass(level string) string {
	switch level {
	case "high":
		return "badge-success"
	case "medium":
		return "badge-warning"
	case "low":
		return "badge-error"
	default:
		return "badge-ghost"
	}
}

// likelihoodDot returns the dot color class for a likelihood/impact level.
func likelihoodDot(level string) string {
	switch level {
	case "high":
		return "bg-error"
	case "medium":
		return "bg-warning"
	case "low":
		return "bg-success"
	default:
		return "bg-base-content/30"
	}
}

// likelihoodBadge returns the badge class for likelihood/impact/threat.
func likelihoodBadge(level string) string {
	switch level {
	case "high":
		return "badge-error"
	case "medium":
		return "badge-warning"
	case "low":
		return "badge-success"
	default:
		return "badge-ghost"
	}
}

// priorityBadge returns the badge class for a priority level.
func priorityBadge(level string) string {
	switch level {
	case "high":
		return "badge-primary"
	case "medium":
		return "badge-info"
	case "low":
		return "badge-ghost"
	default:
		return "badge-ghost"
	}
}

// severityDot returns the dot color class for a problem severity.
func severityDot(severity string) string {
	switch severity {
	case "critical":
		return "bg-error"
	case "high":
		return "bg-warning"
	case "medium":
		return "bg-info"
	default:
		return "bg-base-content/30"
	}
}

// trendCategoryOrder returns the display order for trend categories.
func trendCategoryOrder() []string {
	return []string{"technology", "market", "user_behavior", "competitive", "regulatory"}
}

// formatTrendCategory converts a trend category to a display label.
func formatTrendCategory(cat string) string {
	switch cat {
	case "technology":
		return "Technology"
	case "market":
		return "Market"
	case "user_behavior":
		return "User Behavior"
	case "competitive":
		return "Competitive"
	case "regulatory":
		return "Regulatory"
	default:
		return formatKey(cat)
	}
}

// trendCategoryIcon returns an icon for a trend category.
func trendCategoryIcon(cat string) string {
	switch cat {
	case "technology":
		return "lucide--cpu"
	case "market":
		return "lucide--trending-up"
	case "user_behavior":
		return "lucide--mouse-pointer"
	case "competitive":
		return "lucide--swords"
	case "regulatory":
		return "lucide--scale"
	default:
		return "lucide--circle"
	}
}

// trendSubtitle returns a subtitle for the trends section.
func trendSubtitle(trends map[string][]InsightTrend) string {
	total := 0
	for _, ts := range trends {
		total += len(ts)
	}
	return strconv.Itoa(total) + " trends across " + strconv.Itoa(len(trends)) + " categories"
}

// marketSubtitle returns a subtitle for the market section.
func marketSubtitle(m InsightMarket) string {
	if m.MarketStage != "" {
		return strings.ToUpper(m.MarketStage[:1]) + m.MarketStage[1:] + " market"
	}
	return ""
}

// --- Value Model helpers ---

// vmSubDot returns the dot color class for an active/inactive sub-component.
func vmSubDot(active bool) string {
	if active {
		return "bg-success"
	}
	return "bg-base-content/30"
}

// vmMaturityBadge returns the badge class for a maturity stage.
func vmMaturityBadge(stage string) string {
	switch stage {
	case "scaled":
		return "badge-primary"
	case "proven":
		return "badge-success"
	case "emerging":
		return "badge-warning"
	case "hypothetical":
		return "badge-ghost"
	default:
		return "badge-ghost"
	}
}

// countMissingVMLinks counts how many definitions in a slice are missing their
// value model link (contributes_to). Used to show a gap badge in section headers.
func countMissingVMLinks(defs []FireTrackDefinition) int {
	n := 0
	for _, d := range defs {
		if d.MissingValueModelLink {
			n++
		}
	}
	return n
}

// vmDefTierLabel returns the "T1" / "T2" / "T3" prefix for a canonical definition chip.
func vmDefTierLabel(tier int) string {
	switch tier {
	case 1:
		return "T1"
	case 2:
		return "T2"
	case 3:
		return "T3"
	default:
		return ""
	}
}

// vmDefStatusDot returns the dot color class for a feature/definition status chip.
func vmDefStatusDot(status string) string {
	switch status {
	case "in_progress":
		return "bg-primary"
	case "delivered":
		return "bg-success"
	case "draft":
		return "bg-warning"
	default:
		return "bg-base-content/30"
	}
}

// --- LRA helpers ---

// lifecycleStageBadge returns the badge class for a lifecycle stage.
func lifecycleStageBadge(stage string) string {
	switch stage {
	case "evolved":
		return "badge-success"
	case "maturing":
		return "badge-info"
	case "bootstrap":
		return "badge-warning"
	default:
		return "badge-ghost"
	}
}

// adoptionLevelLabel returns a human label for an adoption level integer.
func adoptionLevelLabel(level int) string {
	switch {
	case level >= 4:
		return "Advanced"
	case level >= 3:
		return "Established"
	case level >= 2:
		return "Growing"
	case level >= 1:
		return "Beginning"
	default:
		return "Not started"
	}
}

// trackColorName returns a DaisyUI color for a track name.
func trackColorName(track string) string {
	switch strings.ToLower(track) {
	case "product":
		return "primary"
	case "strategy":
		return "secondary"
	case "org_ops":
		return "accent"
	case "commercial":
		return "warning"
	default:
		return "info"
	}
}

// flexibilityBadge returns the badge class for a constraint flexibility level.
func flexibilityBadge(flexibility string) string {
	switch strings.ToLower(flexibility) {
	case "none", "fixed":
		return "badge-error"
	case "low":
		return "badge-warning"
	case "medium":
		return "badge-info"
	case "high":
		return "badge-success"
	default:
		return "badge-ghost"
	}
}

// trackMaturityBadge returns the badge class for a track maturity level.
func trackMaturityBadge(maturity string) string {
	switch strings.ToLower(maturity) {
	case "advanced", "scaled":
		return "badge-success"
	case "established", "proven":
		return "badge-info"
	case "developing", "emerging":
		return "badge-warning"
	case "initial", "hypothetical":
		return "badge-ghost"
	default:
		return "badge-ghost"
	}
}

// sortedIntMapKeys returns the keys of a map[string]int in sorted order.
func sortedIntMapKeys(m map[string]int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// --- Assessment helpers ---

// krStatusBadge returns the badge class for a KR outcome status.
func krStatusBadge(status string) string {
	switch strings.ToLower(status) {
	case "exceeded":
		return "badge-success"
	case "met":
		return "badge-success"
	case "partially_met", "partial":
		return "badge-warning"
	case "missed":
		return "badge-error"
	default:
		return "badge-ghost"
	}
}

// assumptionStatusBadge returns the badge class for an assumption validation status.
func assumptionStatusBadge(status string) string {
	switch strings.ToLower(status) {
	case "validated":
		return "badge-success"
	case "invalidated":
		return "badge-error"
	case "inconclusive":
		return "badge-warning"
	case "pending":
		return "badge-ghost"
	default:
		return "badge-ghost"
	}
}

// confidenceChangeIcon returns the icon class for a confidence change direction.
func confidenceChangeIcon(change string) string {
	switch strings.ToLower(change) {
	case "increased":
		return "lucide--arrow-up"
	case "decreased":
		return "lucide--arrow-down"
	default:
		return "lucide--minus"
	}
}

// lraFocusSubtitle returns the subtitle for the current focus section.
func lraFocusSubtitle(cycleRef string) string {
	if cycleRef != "" {
		return "Cycle " + cycleRef
	}
	return "What we're focused on now"
}

// confidenceChangeColor returns the text color class for a confidence change direction.
func confidenceChangeColor(change string) string {
	switch strings.ToLower(change) {
	case "increased":
		return "text-success"
	case "decreased":
		return "text-error"
	default:
		return "text-base-content/40"
	}
}

// --- Roadmap Recipe helpers ---

// trackIcon returns the iconify class for a roadmap track.
func trackIcon(name string) string {
	switch strings.ToLower(name) {
	case "product":
		return "lucide--code-2"
	case "strategy":
		return "lucide--navigation"
	case "commercial":
		return "lucide--briefcase"
	case "org_ops":
		return "lucide--container"
	default:
		return "lucide--layers"
	}
}

// trackColor returns the DaisyUI color name for a roadmap track.
func trackColor(name string) string {
	switch strings.ToLower(name) {
	case "product":
		return "primary"
	case "strategy":
		return "secondary"
	case "commercial":
		return "warning"
	case "org_ops":
		return "accent"
	default:
		return "info"
	}
}

// formatTrackName converts a track slug to a display label.
func formatTrackName(name string) string {
	switch strings.ToLower(name) {
	case "product":
		return "Product"
	case "strategy":
		return "Strategy"
	case "commercial":
		return "Commercial"
	case "org_ops":
		return "Org Ops"
	default:
		return formatKey(name)
	}
}

// trackGradientBg returns the gradient background class for a track.
func trackGradientBg(name string) string {
	return "from-" + trackColor(name) + "/5"
}

// trackBorderColor returns the border color class for a track.
func trackBorderColor(name string) string {
	return "border-" + trackColor(name) + "/10"
}

// trackBadgeColor returns the badge outline class for a track.
func trackBadgeColor(name string) string {
	return "badge-" + trackColor(name)
}

// criticalityDot returns the dot color class for a criticality level.
func criticalityDot(level string) string {
	switch strings.ToLower(level) {
	case "high", "critical":
		return "bg-error"
	case "medium":
		return "bg-warning"
	case "low":
		return "bg-success"
	default:
		return "bg-base-content/30"
	}
}

// roadmapHasAssumptions returns true if any track has assumptions.
func roadmapHasAssumptions(tracks []RoadmapTrack) bool {
	for _, t := range tracks {
		if len(t.Assumptions) > 0 {
			return true
		}
	}
	return false
}
