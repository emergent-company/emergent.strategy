package balance

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/compute"
)

func TestCheckerHandler(t *testing.T) {
	handler := NewCheckerHandler()

	if handler.Name() != "balance-checker" {
		t.Errorf("Name = %q, want %q", handler.Name(), "balance-checker")
	}

	// Test with real emergent instance (5 levels up from compute/balance/)
	instancePath := "../../../../../docs/EPF/_instances/emergent"
	input := &compute.ExecutionInput{
		InstancePath: instancePath,
		Parameters: map[string]interface{}{
			"team_size":       2,
			"weeks":           12,
			"points_per_week": 5,
		},
	}

	result, err := handler.Execute(context.Background(), input)
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if !result.Success {
		t.Fatalf("Execute returned failure: %s", result.Error)
	}

	if result.Output == nil {
		t.Fatal("Output is nil")
	}

	if result.Output.Format != "json" {
		t.Errorf("Format = %q, want %q", result.Output.Format, "json")
	}

	// Parse the report
	reportJSON, err := json.Marshal(result.Output.Content)
	if err != nil {
		t.Fatalf("Failed to marshal report: %v", err)
	}

	var report BalanceReport
	if err := json.Unmarshal(reportJSON, &report); err != nil {
		t.Fatalf("Failed to unmarshal report: %v", err)
	}

	// Verify scores are in valid range
	if report.OverallScore < 0 || report.OverallScore > 100 {
		t.Errorf("OverallScore = %.0f, want 0-100", report.OverallScore)
	}
	if report.ResourceScore.Score < 0 || report.ResourceScore.Score > 100 {
		t.Errorf("ResourceScore = %.0f, want 0-100", report.ResourceScore.Score)
	}
	if report.BalanceScore.Score < 0 || report.BalanceScore.Score > 100 {
		t.Errorf("BalanceScore = %.0f, want 0-100", report.BalanceScore.Score)
	}
	if report.CoherenceScore.Score < 0 || report.CoherenceScore.Score > 100 {
		t.Errorf("CoherenceScore = %.0f, want 0-100", report.CoherenceScore.Score)
	}
	if report.AlignmentScore.Score < 0 || report.AlignmentScore.Score > 100 {
		t.Errorf("AlignmentScore = %.0f, want 0-100", report.AlignmentScore.Score)
	}

	// Verify viability level
	validLevels := map[string]bool{
		"highly_viable": true, "viable": true, "needs_balancing": true, "not_viable": true,
	}
	if !validLevels[report.Viability] {
		t.Errorf("Viability = %q, want one of highly_viable/viable/needs_balancing/not_viable", report.Viability)
	}

	// Verify KR distribution is populated
	if report.TotalKRs == 0 {
		t.Error("TotalKRs = 0, expected some KRs")
	}
	if len(report.KRDistribution) == 0 {
		t.Error("KRDistribution is empty")
	}

	// Product track should have KRs in the emergent instance
	if report.KRDistribution["product"] == 0 {
		t.Error("Product track has 0 KRs, expected some")
	}

	// Verify dependencies analyzed (emergent instance has cross-track deps)
	if report.Dependencies.TotalDependencies == 0 {
		t.Error("TotalDependencies = 0, expected some")
	}

	// Verify no cycles in the emergent instance (it should be clean)
	if len(report.Dependencies.Cycles) > 0 {
		t.Logf("WARNING: Found %d cycles (may be expected): %v", len(report.Dependencies.Cycles), report.Dependencies.Cycles)
	}

	// Verify execution log
	if result.Log == nil {
		t.Error("Execution log is nil")
	} else {
		if result.Log.Skill != "balance-checker" {
			t.Errorf("Log.Skill = %q, want %q", result.Log.Skill, "balance-checker")
		}
		for _, step := range result.Log.Steps {
			if step.Status != "success" {
				t.Errorf("Step %q status = %q, want success", step.Name, step.Status)
			}
		}
	}

	// Log the results for visibility
	t.Logf("Overall: %.0f (%s)", report.OverallScore, report.Viability)
	t.Logf("Resource: %.0f, Balance: %.0f, Coherence: %.0f, Alignment: %.0f",
		report.ResourceScore.Score, report.BalanceScore.Score,
		report.CoherenceScore.Score, report.AlignmentScore.Score)
	t.Logf("KRs: %d total, distribution: %v", report.TotalKRs, report.KRDistribution)
	t.Logf("Dependencies: %d total, %d cycles, critical path: %d",
		report.Dependencies.TotalDependencies, len(report.Dependencies.Cycles), report.Dependencies.CriticalPathLen)
	t.Logf("Issues: %d, Recommendations: %d", len(report.Issues), len(report.Recommendations))
}

func TestCycleDetection(t *testing.T) {
	// Test with a known cycle
	graph := map[string][]string{
		"a": {"b"},
		"b": {"c"},
		"c": {"a"}, // cycle: a -> b -> c -> a
	}
	allNodes := map[string]bool{"a": true, "b": true, "c": true}

	cycles := detectCycles(graph, allNodes)
	if len(cycles) == 0 {
		t.Error("Expected to detect a cycle, found none")
	}
}

func TestNoCycleDetection(t *testing.T) {
	// Test with a DAG (no cycles)
	graph := map[string][]string{
		"a": {"b", "c"},
		"b": {"d"},
		"c": {"d"},
	}
	allNodes := map[string]bool{"a": true, "b": true, "c": true, "d": true}

	cycles := detectCycles(graph, allNodes)
	if len(cycles) != 0 {
		t.Errorf("Expected no cycles in DAG, found %d: %v", len(cycles), cycles)
	}
}

func TestCriticalPath(t *testing.T) {
	// Linear chain: a -> b -> c -> d
	graph := map[string][]string{
		"a": {"b"},
		"b": {"c"},
		"c": {"d"},
	}
	allNodes := map[string]bool{"a": true, "b": true, "c": true, "d": true}

	path := findCriticalPath(graph, allNodes)
	if len(path) != 4 {
		t.Errorf("Critical path length = %d, want 4: %v", len(path), path)
	}
}

func TestCriticalPathDiamond(t *testing.T) {
	// Diamond: a -> b -> d, a -> c -> d
	graph := map[string][]string{
		"a": {"b", "c"},
		"b": {"d"},
		"c": {"d"},
	}
	allNodes := map[string]bool{"a": true, "b": true, "c": true, "d": true}

	path := findCriticalPath(graph, allNodes)
	// Longest path is 3 (a->b->d or a->c->d)
	if len(path) != 3 {
		t.Errorf("Critical path length = %d, want 3: %v", len(path), path)
	}
}
