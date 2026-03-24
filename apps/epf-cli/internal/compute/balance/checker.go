// Package balance implements the balance-checker inline skill handler.
//
// It analyzes roadmap viability across four dimensions:
// resource utilization, portfolio balance, dependency coherence,
// and strategic alignment. Returns a structured scoring report.
package balance

import (
	"context"
	"fmt"
	"math"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/compute"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/roadmap"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/strategy"
)

// Weights for the four viability dimensions.
const (
	WeightResource  = 0.30
	WeightBalance   = 0.25
	WeightCoherence = 0.25
	WeightAlignment = 0.20
)

// Default ideal portfolio distribution ranges (percentage of total KRs).
var defaultDistribution = map[roadmap.Track][2]float64{
	roadmap.TrackProduct:    {35, 45},
	roadmap.TrackStrategy:   {20, 30},
	roadmap.TrackOrgOps:     {15, 25},
	roadmap.TrackCommercial: {15, 25},
}

// CheckerHandler implements the balance-checker inline skill.
type CheckerHandler struct{}

// NewCheckerHandler creates a new balance checker.
func NewCheckerHandler() *CheckerHandler {
	return &CheckerHandler{}
}

// Name returns the handler name.
func (h *CheckerHandler) Name() string {
	return "balance-checker"
}

// BalanceReport is the structured output of the balance checker.
type BalanceReport struct {
	OverallScore    float64          `json:"overall_score"`
	Viability       string           `json:"viability"`
	ResourceScore   DimensionScore   `json:"resource_score"`
	BalanceScore    DimensionScore   `json:"balance_score"`
	CoherenceScore  DimensionScore   `json:"coherence_score"`
	AlignmentScore  DimensionScore   `json:"alignment_score"`
	KRDistribution  map[string]int   `json:"kr_distribution"`
	TotalKRs        int              `json:"total_krs"`
	Dependencies    DependencyReport `json:"dependencies"`
	Issues          []Issue          `json:"issues"`
	Recommendations []Recommendation `json:"recommendations"`
}

// DimensionScore holds a score and its contributing details.
type DimensionScore struct {
	Score   float64  `json:"score"`
	Weight  float64  `json:"weight"`
	Details []string `json:"details"`
}

// DependencyReport summarizes dependency graph analysis.
type DependencyReport struct {
	TotalDependencies int        `json:"total_dependencies"`
	Cycles            [][]string `json:"cycles,omitempty"`
	CriticalPath      []string   `json:"critical_path,omitempty"`
	CriticalPathLen   int        `json:"critical_path_length"`
}

// Issue represents a problem found during analysis.
type Issue struct {
	Severity    string `json:"severity"` // high, medium, low
	Dimension   string `json:"dimension"`
	Description string `json:"description"`
}

// Recommendation suggests how to improve a score.
type Recommendation struct {
	Priority  string `json:"priority"` // high, medium, low
	Dimension string `json:"dimension"`
	Action    string `json:"action"`
}

// Execute runs the balance check on the roadmap.
func (h *CheckerHandler) Execute(ctx context.Context, input *compute.ExecutionInput) (*compute.ExecutionResult, error) {
	log := compute.NewLogBuilder("balance-checker")

	// Load roadmap
	log.StartStep("load_roadmap")
	rmLoader := roadmap.NewLoader(input.InstancePath)
	rm, err := rmLoader.Load()
	if err != nil {
		log.FailStep(fmt.Sprintf("failed to load roadmap: %v", err))
		return &compute.ExecutionResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to load roadmap: %v", err),
			Log:     log.Build(),
		}, nil
	}
	allKRs := rm.GetAllKRs()
	log.CompleteStep(fmt.Sprintf("loaded %d KRs", len(allKRs)))

	// Load north star for alignment (optional)
	log.StartStep("load_strategy")
	var stratStore strategy.StrategyStore
	fss := strategy.NewFileSystemSource(input.InstancePath)
	if loadErr := fss.Load(ctx); loadErr != nil {
		log.CompleteStep("strategy store not available, alignment will use defaults")
		stratStore = nil
	} else {
		stratStore = fss
		log.CompleteStep("loaded strategy context")
	}

	// Count KRs per track
	krDist := countKRsByTrack(rm)
	totalKRs := 0
	for _, count := range krDist {
		totalKRs += count
	}

	if totalKRs == 0 {
		log.FailStep("no key results found")
		return &compute.ExecutionResult{
			Success: false,
			Error:   "Roadmap has no key results to analyze",
			Log:     log.Build(),
		}, nil
	}

	report := &BalanceReport{
		KRDistribution: make(map[string]int),
		TotalKRs:       totalKRs,
	}
	for track, count := range krDist {
		report.KRDistribution[string(track)] = count
	}

	// Dimension 1: Resource Viability
	log.StartStep("score_resource")
	report.ResourceScore = h.scoreResource(rm, krDist, totalKRs, input.Parameters)
	log.CompleteStep(fmt.Sprintf("score: %.0f", report.ResourceScore.Score))

	// Dimension 2: Portfolio Balance
	log.StartStep("score_balance")
	report.BalanceScore = h.scoreBalance(krDist, totalKRs, rm)
	log.CompleteStep(fmt.Sprintf("score: %.0f", report.BalanceScore.Score))

	// Dimension 3: Coherence (dependency analysis)
	log.StartStep("score_coherence")
	report.CoherenceScore, report.Dependencies = h.scoreCoherence(rm)
	log.CompleteStep(fmt.Sprintf("score: %.0f, %d dependencies, %d cycles",
		report.CoherenceScore.Score, report.Dependencies.TotalDependencies, len(report.Dependencies.Cycles)))

	// Dimension 4: Strategic Alignment
	log.StartStep("score_alignment")
	report.AlignmentScore = h.scoreAlignment(rm, stratStore)
	log.CompleteStep(fmt.Sprintf("score: %.0f", report.AlignmentScore.Score))

	// Calculate overall score
	report.OverallScore = math.Round(
		report.ResourceScore.Score*WeightResource +
			report.BalanceScore.Score*WeightBalance +
			report.CoherenceScore.Score*WeightCoherence +
			report.AlignmentScore.Score*WeightAlignment)

	report.Viability = viabilityLevel(report.OverallScore)

	// Collect issues and recommendations
	h.collectIssues(report)
	h.collectRecommendations(report)

	return &compute.ExecutionResult{
		Success: true,
		Output: &compute.ExecutionOutput{
			Format:  "json",
			Content: report,
		},
		Log: log.Build(),
	}, nil
}

// ---- Dimension 1: Resource Viability ----

func (h *CheckerHandler) scoreResource(rm *roadmap.Roadmap, krDist map[roadmap.Track]int, totalKRs int, params map[string]interface{}) DimensionScore {
	score := DimensionScore{Weight: WeightResource}

	// Estimate total complexity points (without user input, use KR count * 5 avg complexity)
	avgComplexity := 5.0
	totalRequired := float64(totalKRs) * avgComplexity

	// Default capacity: 1 person per track, 12 weeks, 5 points/week = 60 per track
	teamSize := 1.0
	weeks := 12.0
	pointsPerWeek := 5.0

	// Allow parameter overrides
	if params != nil {
		if v, ok := params["team_size"]; ok {
			if f, ok := toFloat(v); ok {
				teamSize = f
			}
		}
		if v, ok := params["weeks"]; ok {
			if f, ok := toFloat(v); ok {
				weeks = f
			}
		}
		if v, ok := params["points_per_week"]; ok {
			if f, ok := toFloat(v); ok {
				pointsPerWeek = f
			}
		}
	}

	activeTracks := 0
	for _, count := range krDist {
		if count > 0 {
			activeTracks++
		}
	}
	if activeTracks == 0 {
		activeTracks = 1
	}

	totalAvailable := teamSize * weeks * pointsPerWeek * float64(activeTracks)
	ratio := totalRequired / totalAvailable

	switch {
	case ratio <= 0.75:
		score.Score = 100
		score.Details = append(score.Details, fmt.Sprintf("Under-committed (%.0f%% utilization)", ratio*100))
	case ratio <= 0.90:
		score.Score = 90
		score.Details = append(score.Details, fmt.Sprintf("Well-balanced (%.0f%% utilization)", ratio*100))
	case ratio <= 1.00:
		score.Score = 75
		score.Details = append(score.Details, fmt.Sprintf("Fully committed (%.0f%% utilization, no slack)", ratio*100))
	case ratio <= 1.25:
		score.Score = 50
		score.Details = append(score.Details, fmt.Sprintf("Over-committed (%.0f%% utilization)", ratio*100))
	default:
		score.Score = 25
		score.Details = append(score.Details, fmt.Sprintf("Severely over-committed (%.0f%% utilization)", ratio*100))
	}

	score.Details = append(score.Details,
		fmt.Sprintf("Estimated %d complexity points across %d KRs (avg %.0f/KR)", int(totalRequired), totalKRs, avgComplexity))
	score.Details = append(score.Details,
		fmt.Sprintf("Available capacity: %.0f points (%.0f people x %.0f weeks x %.0f pts/week x %d tracks)",
			totalAvailable, teamSize, weeks, pointsPerWeek, activeTracks))

	return score
}

// ---- Dimension 2: Portfolio Balance ----

func (h *CheckerHandler) scoreBalance(krDist map[roadmap.Track]int, totalKRs int, rm *roadmap.Roadmap) DimensionScore {
	score := DimensionScore{Score: 100, Weight: WeightBalance}

	tracks := []roadmap.Track{roadmap.TrackProduct, roadmap.TrackStrategy, roadmap.TrackOrgOps, roadmap.TrackCommercial}

	for _, track := range tracks {
		count := krDist[track]
		pct := float64(count) / float64(totalKRs) * 100
		idealRange := defaultDistribution[track]

		label := "balanced"
		if pct < idealRange[0] {
			deviation := idealRange[0] - pct
			penalty := math.Min(deviation*2, 30)
			score.Score -= penalty
			label = "under-invested"
		} else if pct > idealRange[1] {
			deviation := pct - idealRange[1]
			penalty := math.Min(deviation*2, 30)
			score.Score -= penalty
			label = "over-invested"
		}

		score.Details = append(score.Details,
			fmt.Sprintf("%s: %d KRs (%.0f%%, ideal %.0f-%.0f%%) - %s",
				track, count, pct, idealRange[0], idealRange[1], label))
	}

	// Ghost track detection
	for _, track := range tracks {
		if krDist[track] == 0 {
			hasDependents := false
			for _, dep := range rm.CrossTrackDependencies {
				toTrack := inferTrackFromKRID(dep.ToKR)
				fromTrack := inferTrackFromKRID(dep.FromKR)
				if toTrack == track || fromTrack == track {
					hasDependents = true
					break
				}
			}
			if hasDependents {
				score.Score -= 20
				score.Details = append(score.Details,
					fmt.Sprintf("WARNING: %s track has 0 KRs but other tracks depend on it (ghost track)", track))
			}
		}
	}

	score.Score = math.Max(score.Score, 0)
	return score
}

// ---- Dimension 3: Coherence (Dependency Analysis) ----

func (h *CheckerHandler) scoreCoherence(rm *roadmap.Roadmap) (DimensionScore, DependencyReport) {
	score := DimensionScore{Score: 100, Weight: WeightCoherence}
	depReport := DependencyReport{
		TotalDependencies: len(rm.CrossTrackDependencies),
	}

	if len(rm.CrossTrackDependencies) == 0 {
		score.Details = append(score.Details, "No cross-track dependencies defined")
		return score, depReport
	}

	// Build adjacency list (only 'requires' type for cycle detection)
	graph := make(map[string][]string)
	allNodes := make(map[string]bool)
	for _, dep := range rm.CrossTrackDependencies {
		allNodes[dep.FromKR] = true
		allNodes[dep.ToKR] = true
		if dep.DependencyType == "requires" || dep.DependencyType == "" {
			graph[dep.FromKR] = append(graph[dep.FromKR], dep.ToKR)
		}
	}

	// Cycle detection via DFS
	cycles := detectCycles(graph, allNodes)
	depReport.Cycles = cycles
	if len(cycles) > 0 {
		penalty := len(cycles) * 25
		score.Score -= float64(penalty)
		for _, cycle := range cycles {
			score.Details = append(score.Details,
				fmt.Sprintf("CYCLE DETECTED: %s", strings.Join(cycle, " -> ")))
		}
	} else {
		score.Details = append(score.Details, "No circular dependencies detected")
	}

	// Critical path (longest path through dependency graph)
	criticalPath := findCriticalPath(graph, allNodes)
	depReport.CriticalPath = criticalPath
	depReport.CriticalPathLen = len(criticalPath)
	if len(criticalPath) > 0 {
		score.Details = append(score.Details,
			fmt.Sprintf("Critical path length: %d KRs (%s)", len(criticalPath), strings.Join(criticalPath, " -> ")))
	}

	// Use execution plan's critical path if available
	if rm.ExecutionPlan != nil && len(rm.ExecutionPlan.CriticalPath) > 0 {
		score.Details = append(score.Details,
			fmt.Sprintf("Execution plan defines %d critical path items", len(rm.ExecutionPlan.CriticalPath)))
	}

	score.Score = math.Max(score.Score, 0)
	return score, depReport
}

// detectCycles finds all cycles in a directed graph using DFS.
func detectCycles(graph map[string][]string, allNodes map[string]bool) [][]string {
	var cycles [][]string
	visited := make(map[string]bool)
	inStack := make(map[string]bool)
	path := []string{}

	var dfs func(node string)
	dfs = func(node string) {
		visited[node] = true
		inStack[node] = true
		path = append(path, node)

		for _, neighbor := range graph[node] {
			if !visited[neighbor] {
				dfs(neighbor)
			} else if inStack[neighbor] {
				// Found a cycle -- extract it
				cycleStart := -1
				for i, n := range path {
					if n == neighbor {
						cycleStart = i
						break
					}
				}
				if cycleStart >= 0 {
					cycle := make([]string, len(path[cycleStart:]))
					copy(cycle, path[cycleStart:])
					cycle = append(cycle, neighbor) // close the cycle
					cycles = append(cycles, cycle)
				}
			}
		}

		path = path[:len(path)-1]
		inStack[node] = false
	}

	for node := range allNodes {
		if !visited[node] {
			dfs(node)
		}
	}

	return cycles
}

// findCriticalPath finds the longest path in a DAG using topological sort.
func findCriticalPath(graph map[string][]string, allNodes map[string]bool) []string {
	// Compute in-degrees
	inDegree := make(map[string]int)
	for node := range allNodes {
		inDegree[node] = 0
	}
	for _, neighbors := range graph {
		for _, n := range neighbors {
			inDegree[n]++
		}
	}

	// Topological sort (Kahn's algorithm)
	var queue []string
	for node, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, node)
		}
	}

	dist := make(map[string]int)
	prev := make(map[string]string)
	for node := range allNodes {
		dist[node] = 0
	}

	var topoOrder []string
	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		topoOrder = append(topoOrder, node)

		for _, neighbor := range graph[node] {
			if dist[node]+1 > dist[neighbor] {
				dist[neighbor] = dist[node] + 1
				prev[neighbor] = node
			}
			inDegree[neighbor]--
			if inDegree[neighbor] == 0 {
				queue = append(queue, neighbor)
			}
		}
	}

	// Find node with longest distance
	maxDist := 0
	endNode := ""
	for node, d := range dist {
		if d > maxDist {
			maxDist = d
			endNode = node
		}
	}

	if endNode == "" {
		return nil
	}

	// Reconstruct path
	var path []string
	for node := endNode; node != ""; node = prev[node] {
		path = append([]string{node}, path...)
	}

	return path
}

// ---- Dimension 4: Strategic Alignment ----

func (h *CheckerHandler) scoreAlignment(rm *roadmap.Roadmap, store strategy.StrategyStore) DimensionScore {
	score := DimensionScore{Score: 75, Weight: WeightAlignment} // Default when no strategy data

	if store == nil {
		score.Details = append(score.Details, "No strategy context available, using default alignment score")
		return score
	}

	// Extract strategic themes from north star
	northStar, err := store.GetProductVision()
	if err != nil || northStar == nil {
		score.Details = append(score.Details, "No north star found, using default alignment score")
		return score
	}

	themes := extractThemes(northStar)
	if len(themes) == 0 {
		score.Details = append(score.Details, "No strategic themes extracted, using default alignment score")
		return score
	}

	score.Score = 0
	trackScores := make(map[roadmap.Track]float64)
	trackCount := 0

	tracks := []struct {
		track  roadmap.Track
		config *roadmap.TrackConfig
	}{
		{roadmap.TrackProduct, rm.Tracks.Product},
		{roadmap.TrackStrategy, rm.Tracks.Strategy},
		{roadmap.TrackOrgOps, rm.Tracks.OrgOps},
		{roadmap.TrackCommercial, rm.Tracks.Commercial},
	}

	for _, t := range tracks {
		if t.config == nil || len(t.config.OKRs) == 0 {
			continue
		}

		trackAlignment := 0.0
		okrCount := 0
		for _, okr := range t.config.OKRs {
			okrKeywords := extractKeywords(okr.Objective)
			for _, kr := range okr.KeyResults {
				okrKeywords = append(okrKeywords, extractKeywords(kr.Description)...)
			}

			overlap := countOverlap(okrKeywords, themes)
			alignment := float64(overlap) / float64(len(themes)) * 100
			trackAlignment += math.Min(alignment, 100)
			okrCount++
		}

		if okrCount > 0 {
			trackScores[t.track] = trackAlignment / float64(okrCount)
			trackCount++
			score.Details = append(score.Details,
				fmt.Sprintf("%s alignment: %.0f%%", t.track, trackScores[t.track]))
		}
	}

	if trackCount > 0 {
		total := 0.0
		for _, s := range trackScores {
			total += s
		}
		score.Score = math.Round(total / float64(trackCount))
	}

	score.Score = math.Max(math.Min(score.Score, 100), 0)
	return score
}

// ---- Issues and Recommendations ----

func (h *CheckerHandler) collectIssues(report *BalanceReport) {
	if report.ResourceScore.Score < 50 {
		report.Issues = append(report.Issues, Issue{
			Severity: "high", Dimension: "resource",
			Description: "Resource capacity is severely constrained",
		})
	} else if report.ResourceScore.Score < 75 {
		report.Issues = append(report.Issues, Issue{
			Severity: "medium", Dimension: "resource",
			Description: "Resource capacity is tight with no slack",
		})
	}

	if report.BalanceScore.Score < 60 {
		report.Issues = append(report.Issues, Issue{
			Severity: "high", Dimension: "balance",
			Description: "Portfolio distribution is significantly unbalanced",
		})
	}

	if len(report.Dependencies.Cycles) > 0 {
		report.Issues = append(report.Issues, Issue{
			Severity: "high", Dimension: "coherence",
			Description: fmt.Sprintf("%d circular dependency cycle(s) detected", len(report.Dependencies.Cycles)),
		})
	}

	if report.AlignmentScore.Score < 50 {
		report.Issues = append(report.Issues, Issue{
			Severity: "medium", Dimension: "alignment",
			Description: "Low strategic alignment between roadmap OKRs and product vision",
		})
	}
}

func (h *CheckerHandler) collectRecommendations(report *BalanceReport) {
	if report.ResourceScore.Score < 75 {
		report.Recommendations = append(report.Recommendations, Recommendation{
			Priority: "high", Dimension: "resource",
			Action: "Reduce scope by deferring lower-priority KRs or extend the cycle timeframe",
		})
	}

	if report.BalanceScore.Score < 75 {
		report.Recommendations = append(report.Recommendations, Recommendation{
			Priority: "medium", Dimension: "balance",
			Action: "Rebalance KR distribution across tracks toward ideal ranges (Product 35-45%, Strategy 20-30%, OrgOps 15-25%, Commercial 15-25%)",
		})
	}

	if len(report.Dependencies.Cycles) > 0 {
		report.Recommendations = append(report.Recommendations, Recommendation{
			Priority: "high", Dimension: "coherence",
			Action: "Break circular dependencies by changing dependency types from 'requires' to 'informs' where possible",
		})
	}

	if report.AlignmentScore.Score < 60 {
		report.Recommendations = append(report.Recommendations, Recommendation{
			Priority: "medium", Dimension: "alignment",
			Action: "Review OKR objectives to ensure they connect to the product vision and north star themes",
		})
	}
}

// ---- Helper functions ----

func countKRsByTrack(rm *roadmap.Roadmap) map[roadmap.Track]int {
	dist := make(map[roadmap.Track]int)
	if rm.Tracks.Product != nil {
		for _, okr := range rm.Tracks.Product.OKRs {
			dist[roadmap.TrackProduct] += len(okr.KeyResults)
		}
	}
	if rm.Tracks.Strategy != nil {
		for _, okr := range rm.Tracks.Strategy.OKRs {
			dist[roadmap.TrackStrategy] += len(okr.KeyResults)
		}
	}
	if rm.Tracks.OrgOps != nil {
		for _, okr := range rm.Tracks.OrgOps.OKRs {
			dist[roadmap.TrackOrgOps] += len(okr.KeyResults)
		}
	}
	if rm.Tracks.Commercial != nil {
		for _, okr := range rm.Tracks.Commercial.OKRs {
			dist[roadmap.TrackCommercial] += len(okr.KeyResults)
		}
	}
	return dist
}

func inferTrackFromKRID(krID string) roadmap.Track {
	if strings.HasPrefix(krID, "kr-p-") {
		return roadmap.TrackProduct
	}
	if strings.HasPrefix(krID, "kr-s-") {
		return roadmap.TrackStrategy
	}
	if strings.HasPrefix(krID, "kr-o-") {
		return roadmap.TrackOrgOps
	}
	if strings.HasPrefix(krID, "kr-c-") {
		return roadmap.TrackCommercial
	}
	return ""
}

func viabilityLevel(score float64) string {
	switch {
	case score >= 85:
		return "highly_viable"
	case score >= 75:
		return "viable"
	case score >= 60:
		return "needs_balancing"
	default:
		return "not_viable"
	}
}

func extractThemes(ns *strategy.NorthStar) []string {
	var themes []string
	if ns.Purpose.Statement != "" {
		themes = append(themes, extractKeywords(ns.Purpose.Statement)...)
	}
	if ns.Purpose.ProblemWeSolve != "" {
		themes = append(themes, extractKeywords(ns.Purpose.ProblemWeSolve)...)
	}
	if ns.Vision.Statement != "" {
		themes = append(themes, extractKeywords(ns.Vision.Statement)...)
	}
	if ns.Mission.Statement != "" {
		themes = append(themes, extractKeywords(ns.Mission.Statement)...)
	}
	// Deduplicate
	seen := make(map[string]bool)
	var unique []string
	for _, t := range themes {
		if !seen[t] {
			seen[t] = true
			unique = append(unique, t)
		}
	}
	return unique
}

func extractKeywords(text string) []string {
	// Simple keyword extraction: split on whitespace, lowercase, filter short words and stopwords
	stopwords := map[string]bool{
		"the": true, "a": true, "an": true, "and": true, "or": true, "but": true,
		"in": true, "on": true, "at": true, "to": true, "for": true, "of": true,
		"with": true, "by": true, "from": true, "is": true, "are": true, "was": true,
		"were": true, "be": true, "been": true, "being": true, "have": true, "has": true,
		"had": true, "do": true, "does": true, "did": true, "will": true, "would": true,
		"could": true, "should": true, "may": true, "might": true, "shall": true,
		"can": true, "this": true, "that": true, "these": true, "those": true,
		"it": true, "its": true, "we": true, "our": true, "their": true, "they": true,
		"not": true, "all": true, "each": true, "every": true, "both": true,
		"into": true, "through": true, "about": true, "between": true, "than": true,
		"more": true, "most": true, "other": true, "some": true, "such": true,
		"as": true, "so": true, "if": true, "when": true, "where": true, "how": true,
		"what": true, "which": true, "who": true, "whom": true, "why": true,
	}

	words := strings.Fields(strings.ToLower(text))
	var keywords []string
	for _, w := range words {
		// Strip punctuation
		w = strings.Trim(w, ".,;:!?\"'()[]{}-/\\")
		if len(w) < 3 || stopwords[w] {
			continue
		}
		keywords = append(keywords, w)
	}
	return keywords
}

func countOverlap(keywords, themes []string) int {
	themeSet := make(map[string]bool)
	for _, t := range themes {
		themeSet[t] = true
	}
	count := 0
	for _, kw := range keywords {
		if themeSet[kw] {
			count++
		}
	}
	return count
}

func toFloat(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case string:
		var f float64
		_, err := fmt.Sscanf(n, "%f", &f)
		return f, err == nil
	default:
		return 0, false
	}
}

func init() {
	compute.DefaultRegistry.Register(NewCheckerHandler())
}
