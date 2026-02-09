package strategy

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// =============================================================================
// AI WORKFLOW BENCHMARKS
// =============================================================================
// These benchmarks simulate realistic AI agent workflows using the Product
// Strategy Server. Each workflow represents a typical task an AI agent would
// perform during development.
// =============================================================================

// WorkflowMetrics tracks timing for workflow operations
type WorkflowMetrics struct {
	WorkflowName  string
	TotalTime     time.Duration
	Operations    []OperationMetric
	StoreLoadTime time.Duration
	CacheHit      bool
}

// OperationMetric tracks a single operation within a workflow
type OperationMetric struct {
	Name     string
	Duration time.Duration
	Results  int // Number of results returned
}

// newWorkflowMetrics creates a new metrics tracker
func newWorkflowMetrics(name string) *WorkflowMetrics {
	return &WorkflowMetrics{
		WorkflowName: name,
		Operations:   make([]OperationMetric, 0),
	}
}

func (m *WorkflowMetrics) addOp(name string, duration time.Duration, results int) {
	m.Operations = append(m.Operations, OperationMetric{
		Name:     name,
		Duration: duration,
		Results:  results,
	})
}

func (m *WorkflowMetrics) String() string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("\n=== %s ===\n", m.WorkflowName))
	sb.WriteString(fmt.Sprintf("Total Time: %v\n", m.TotalTime))
	sb.WriteString(fmt.Sprintf("Store Load: %v (cache: %v)\n", m.StoreLoadTime, m.CacheHit))
	sb.WriteString("Operations:\n")
	for _, op := range m.Operations {
		sb.WriteString(fmt.Sprintf("  - %-40s %10v (%d results)\n", op.Name, op.Duration, op.Results))
	}
	return sb.String()
}

// =============================================================================
// WORKFLOW 1: Feature Implementation Context
// =============================================================================
// Scenario: AI agent is about to implement a new feature and needs full context
// Steps:
// 1. Get product vision to understand the big picture
// 2. Search for related strategy content
// 3. Get personas who will use this feature
// 4. Get competitive positioning to understand differentiation
// 5. Synthesize full strategic context

func TestWorkflow_FeatureImplementationContext(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()
	metrics := newWorkflowMetrics("Feature Implementation Context")

	startTotal := time.Now()

	// Step 1: Load store (or use cache)
	startLoad := time.Now()
	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	metrics.StoreLoadTime = time.Since(startLoad)
	defer store.Close()

	// Step 2: Get product vision
	start := time.Now()
	vision, err := store.GetProductVision()
	if err != nil {
		t.Fatalf("GetProductVision() error = %v", err)
	}
	metrics.addOp("GetProductVision", time.Since(start), 1)
	t.Logf("Vision: %s", vision.Organization)

	// Step 3: Search for "knowledge graph" related content
	start = time.Now()
	results, err := store.Search("knowledge graph extraction", 10)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	metrics.addOp("Search('knowledge graph extraction')", time.Since(start), len(results))
	t.Logf("Search found %d results", len(results))

	// Step 4: Get all personas
	start = time.Now()
	personas, err := store.GetPersonas()
	if err != nil {
		t.Fatalf("GetPersonas() error = %v", err)
	}
	metrics.addOp("GetPersonas", time.Since(start), len(personas))
	t.Logf("Found %d personas", len(personas))

	// Step 5: Get competitive positioning
	start = time.Now()
	moat, positioning, err := store.GetCompetitivePosition()
	if err != nil {
		t.Fatalf("GetCompetitivePosition() error = %v", err)
	}
	competitorCount := len(moat.VsCompetitors)
	metrics.addOp("GetCompetitivePosition", time.Since(start), competitorCount)
	t.Logf("Positioning: %s, %d competitors analyzed", positioning.Statement[:50], competitorCount)

	// Step 6: Synthesize strategic context
	start = time.Now()
	stratCtx, err := store.GetStrategicContext("knowledge graph feature")
	if err != nil {
		t.Fatalf("GetStrategicContext() error = %v", err)
	}
	contextItems := len(stratCtx.RelevantPersonas) + len(stratCtx.RelevantFeatures) + len(stratCtx.RelevantOKRs)
	metrics.addOp("GetStrategicContext('knowledge graph feature')", time.Since(start), contextItems)

	metrics.TotalTime = time.Since(startTotal)
	t.Log(metrics.String())

	// Assertions
	if metrics.TotalTime > 100*time.Millisecond {
		t.Logf("WARNING: Workflow took longer than 100ms: %v", metrics.TotalTime)
	}
}

// =============================================================================
// WORKFLOW 2: PR Review with Strategy Alignment
// =============================================================================
// Scenario: AI agent reviewing a PR needs to check if changes align with strategy
// Steps:
// 1. Search for the feature/topic being changed
// 2. Get relevant personas to check user impact
// 3. Check roadmap to see if this is a priority
// 4. Get competitive context to ensure differentiation is maintained

func TestWorkflow_PRReviewStrategyAlignment(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()
	metrics := newWorkflowMetrics("PR Review Strategy Alignment")

	startTotal := time.Now()

	// Load store
	startLoad := time.Now()
	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	metrics.StoreLoadTime = time.Since(startLoad)
	defer store.Close()

	// Simulate PR about "MCP integration improvements"
	prTopic := "MCP integration"

	// Step 1: Search for related strategy content
	start := time.Now()
	results, err := store.Search(prTopic, 15)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	metrics.addOp(fmt.Sprintf("Search('%s')", prTopic), time.Since(start), len(results))

	// Step 2: Get roadmap to check priority
	start = time.Now()
	roadmap, err := store.GetRoadmapSummary("", 0)
	if err != nil {
		t.Fatalf("GetRoadmapSummary() error = %v", err)
	}
	okrCount := 0
	for _, track := range roadmap.Tracks {
		okrCount += len(track.OKRs)
	}
	metrics.addOp("GetRoadmapSummary", time.Since(start), okrCount)

	// Step 3: Get personas affected
	start = time.Now()
	personas, err := store.GetPersonas()
	if err != nil {
		t.Fatalf("GetPersonas() error = %v", err)
	}
	metrics.addOp("GetPersonas", time.Since(start), len(personas))

	// Step 4: Get strategic context for the PR topic
	start = time.Now()
	stratCtx, err := store.GetStrategicContext(prTopic)
	if err != nil {
		t.Fatalf("GetStrategicContext() error = %v", err)
	}
	contextItems := len(stratCtx.RelevantOKRs)
	metrics.addOp(fmt.Sprintf("GetStrategicContext('%s')", prTopic), time.Since(start), contextItems)

	metrics.TotalTime = time.Since(startTotal)
	t.Log(metrics.String())

	// Log findings for showcase
	t.Logf("\n--- PR Review Findings ---")
	t.Logf("Topic: %s", prTopic)
	t.Logf("Related Strategy Items: %d", len(results))
	t.Logf("Related OKRs: %d", len(stratCtx.RelevantOKRs))
	t.Logf("Affected Personas: %d", len(stratCtx.RelevantPersonas))
}

// =============================================================================
// WORKFLOW 3: New Developer Onboarding
// =============================================================================
// Scenario: AI agent helping a new developer understand the product
// Steps:
// 1. Get product vision (who we are, why we exist)
// 2. Get all personas (who we build for)
// 3. Get competitive position (how we're different)
// 4. Get roadmap (what we're building now)
// 5. Search for key concepts

func TestWorkflow_NewDeveloperOnboarding(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()
	metrics := newWorkflowMetrics("New Developer Onboarding")

	startTotal := time.Now()

	startLoad := time.Now()
	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	metrics.StoreLoadTime = time.Since(startLoad)
	defer store.Close()

	// Step 1: Get product vision
	start := time.Now()
	vision, _ := store.GetProductVision()
	metrics.addOp("GetProductVision", time.Since(start), 1)

	// Step 2: Get all personas with details
	start = time.Now()
	personas, _ := store.GetPersonas()
	metrics.addOp("GetPersonas", time.Since(start), len(personas))

	// Step 3: Get persona details for each (simulate deep dive)
	for _, p := range personas {
		start = time.Now()
		_, painPoints, err := store.GetPersonaDetails(p.ID)
		if err == nil {
			metrics.addOp(fmt.Sprintf("GetPersonaDetails('%s')", p.ID), time.Since(start), len(painPoints))
		}
	}

	// Step 4: Get competitive position
	start = time.Now()
	moat, _, _ := store.GetCompetitivePosition()
	metrics.addOp("GetCompetitivePosition", time.Since(start), len(moat.VsCompetitors))

	// Step 5: Get roadmap
	start = time.Now()
	roadmap, _ := store.GetRoadmapSummary("", 0)
	krCount := 0
	for _, track := range roadmap.Tracks {
		for _, okr := range track.OKRs {
			krCount += len(okr.KeyResults)
		}
	}
	metrics.addOp("GetRoadmapSummary", time.Since(start), krCount)

	// Step 6: Search key concepts
	concepts := []string{"knowledge graph", "AI agent", "MCP", "extraction"}
	for _, concept := range concepts {
		start = time.Now()
		results, _ := store.Search(concept, 5)
		metrics.addOp(fmt.Sprintf("Search('%s')", concept), time.Since(start), len(results))
	}

	metrics.TotalTime = time.Since(startTotal)
	t.Log(metrics.String())

	// Showcase summary
	t.Logf("\n--- Onboarding Summary ---")
	t.Logf("Organization: %s", vision.Organization)
	t.Logf("Vision: %s", truncate(vision.Vision.Statement, 80))
	t.Logf("Personas: %d", len(personas))
	t.Logf("Key Results in Roadmap: %d", krCount)
}

// =============================================================================
// WORKFLOW 4: Sprint Planning with Strategy Context
// =============================================================================
// Scenario: AI agent helping plan a sprint by checking strategy alignment
// Steps:
// 1. Get roadmap filtered by product track
// 2. For each OKR, search for related content
// 3. Get strategic context for top priorities

func TestWorkflow_SprintPlanning(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()
	metrics := newWorkflowMetrics("Sprint Planning with Strategy")

	startTotal := time.Now()

	startLoad := time.Now()
	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	metrics.StoreLoadTime = time.Since(startLoad)
	defer store.Close()

	// Step 1: Get product track roadmap
	start := time.Now()
	roadmap, _ := store.GetRoadmapSummary("product", 0)
	okrCount := 0
	if track, ok := roadmap.Tracks["product"]; ok {
		okrCount = len(track.OKRs)
	}
	metrics.addOp("GetRoadmapSummary(product)", time.Since(start), okrCount)

	// Step 2: Get strategic context for each OKR objective
	if track, ok := roadmap.Tracks["product"]; ok {
		for _, okr := range track.OKRs[:minInt(3, len(track.OKRs))] { // Top 3 OKRs
			start = time.Now()
			stratCtx, _ := store.GetStrategicContext(okr.Objective)
			items := len(stratCtx.RelevantFeatures) + len(stratCtx.RelevantPersonas)
			metrics.addOp(fmt.Sprintf("GetStrategicContext(OKR: %s)", truncate(okr.Objective, 30)), time.Since(start), items)
		}
	}

	// Step 3: Search for pending work
	start = time.Now()
	results, _ := store.Search("in progress planned", 10)
	metrics.addOp("Search('in progress planned')", time.Since(start), len(results))

	metrics.TotalTime = time.Since(startTotal)
	t.Log(metrics.String())
}

// =============================================================================
// WORKFLOW 5: Competitive Analysis Deep Dive
// =============================================================================
// Scenario: AI agent analyzing how a feature compares to competitors

func TestWorkflow_CompetitiveAnalysis(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()
	metrics := newWorkflowMetrics("Competitive Analysis Deep Dive")

	startTotal := time.Now()

	startLoad := time.Now()
	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	metrics.StoreLoadTime = time.Since(startLoad)
	defer store.Close()

	// Step 1: Get competitive positioning
	start := time.Now()
	moat, positioning, _ := store.GetCompetitivePosition()
	metrics.addOp("GetCompetitivePosition", time.Since(start), len(moat.VsCompetitors))

	// Step 2: Search for each competitor
	for _, comp := range moat.VsCompetitors[:minInt(3, len(moat.VsCompetitors))] {
		start = time.Now()
		results, _ := store.Search(comp.Competitor, 5)
		metrics.addOp(fmt.Sprintf("Search('%s')", comp.Competitor), time.Since(start), len(results))
	}

	// Step 3: Get value propositions
	start = time.Now()
	props, _ := store.GetValuePropositions("")
	metrics.addOp("GetValuePropositions", time.Since(start), len(props))

	// Step 4: Search for differentiation keywords
	start = time.Now()
	results, _ := store.Search(moat.Differentiation, 10)
	metrics.addOp("Search(differentiation)", time.Since(start), len(results))

	metrics.TotalTime = time.Since(startTotal)
	t.Log(metrics.String())

	// Showcase
	t.Logf("\n--- Competitive Position ---")
	t.Logf("Unique Value: %s", truncate(positioning.UniqueValueProp, 80))
	t.Logf("Differentiation: %s", truncate(moat.Differentiation, 80))
	t.Logf("Competitors Analyzed: %d", len(moat.VsCompetitors))
}

// =============================================================================
// WORKFLOW 6: Rapid Context Retrieval (Cache Performance)
// =============================================================================
// Scenario: Multiple quick lookups simulating interactive AI session

func TestWorkflow_RapidContextRetrieval(t *testing.T) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()
	metrics := newWorkflowMetrics("Rapid Context Retrieval (20 operations)")

	startTotal := time.Now()

	// Load once
	startLoad := time.Now()
	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	metrics.StoreLoadTime = time.Since(startLoad)
	defer store.Close()

	// Simulate rapid-fire queries (interactive session)
	queries := []string{
		"authentication", "API", "dashboard", "export",
		"knowledge", "graph", "extraction", "AI",
		"integration", "MCP", "agent", "tool",
		"search", "query", "index", "document",
		"user", "persona", "workflow", "automation",
	}

	for _, q := range queries {
		start := time.Now()
		results, _ := store.Search(q, 5)
		metrics.addOp(fmt.Sprintf("Search('%s')", q), time.Since(start), len(results))
	}

	metrics.TotalTime = time.Since(startTotal)
	t.Log(metrics.String())

	// Calculate average search time
	var totalSearchTime time.Duration
	for _, op := range metrics.Operations {
		totalSearchTime += op.Duration
	}
	avgSearchTime := totalSearchTime / time.Duration(len(queries))
	t.Logf("\n--- Performance Summary ---")
	t.Logf("Total Queries: %d", len(queries))
	t.Logf("Average Search Time: %v", avgSearchTime)
	t.Logf("Queries/Second: %.1f", float64(len(queries))/metrics.TotalTime.Seconds())
}

// =============================================================================
// BENCHMARKS: Individual Operations
// =============================================================================

func BenchmarkWorkflow_FullFeatureContext(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// Full feature context workflow
		store.GetProductVision()
		store.Search("knowledge graph", 10)
		store.GetPersonas()
		store.GetCompetitivePosition()
		store.GetStrategicContext("knowledge graph feature")
	}
}

func BenchmarkWorkflow_PRReview(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// PR review workflow
		store.Search("MCP integration", 15)
		store.GetRoadmapSummary("", 0)
		store.GetPersonas()
		store.GetStrategicContext("MCP integration")
	}
}

func BenchmarkWorkflow_QuickLookup(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	queries := []string{"API", "dashboard", "knowledge", "agent", "search"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, q := range queries {
			store.Search(q, 5)
		}
	}
}

func BenchmarkConcurrent_MultipleSearches(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		queries := []string{"API", "knowledge", "agent", "MCP", "graph"}
		i := 0
		for pb.Next() {
			store.Search(queries[i%len(queries)], 10)
			i++
		}
	})
}

// =============================================================================
// HELPERS
// =============================================================================

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// Note: minInt is already defined in search.go, so we use it directly
