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
