package cmd

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/ingest"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/spf13/cobra"
)

var (
	semEdgesMinScore   float64
	semEdgesMaxPerNode int
	semEdgesDryRun     bool
	semEdgesMemoryURL  string
	semEdgesProjectID  string
	semEdgesToken      string
)

var semanticEdgesCmd = &cobra.Command{
	Use:   "semantic-edges",
	Short: "Compute semantic relationships between strategy graph nodes",
	Long: `Discovers semantic relationships by searching for objects with similar
meaning and creating edges between them. This connects nodes that are
related by meaning even when no structural YAML reference exists.

For example, a Belief about "semantic strategy" will be connected to
Features that implement semantic capabilities, OKRs targeting semantic
goals, and Positioning claims about semantic differentiation.

Uses the search-with-neighbors API as a workaround until the
similarity API is fixed (emergent.memory #97).

Configuration:
  --url            Memory server URL (or EPF_MEMORY_URL env var)
  --project        Memory project ID (or EPF_MEMORY_PROJECT env var)
  --token          Memory API token (or EPF_MEMORY_TOKEN env var)
  --min-score      Minimum similarity score (default: 0.4)
  --max-per-node   Maximum edges per source node (default: 5)
  --dry-run        Report what edges would be created`,
	RunE: runSemanticEdges,
}

func init() {
	semanticEdgesCmd.Flags().Float64Var(&semEdgesMinScore, "min-score", 0.4, "Minimum similarity score (0.0-1.0)")
	semanticEdgesCmd.Flags().IntVar(&semEdgesMaxPerNode, "max-per-node", 5, "Maximum edges per source node")
	semanticEdgesCmd.Flags().BoolVar(&semEdgesDryRun, "dry-run", false, "Report without creating edges")
	semanticEdgesCmd.Flags().StringVar(&semEdgesMemoryURL, "url", "", "Memory server URL (or EPF_MEMORY_URL)")
	semanticEdgesCmd.Flags().StringVar(&semEdgesProjectID, "project", "", "Memory project ID (or EPF_MEMORY_PROJECT)")
	semanticEdgesCmd.Flags().StringVar(&semEdgesToken, "token", "", "Memory API token (or EPF_MEMORY_TOKEN)")

	rootCmd.AddCommand(semanticEdgesCmd)
}

func runSemanticEdges(cmd *cobra.Command, args []string) error {
	memURL := resolveConfig(semEdgesMemoryURL, "EPF_MEMORY_URL")
	projectID := resolveConfig(semEdgesProjectID, "EPF_MEMORY_PROJECT")
	token := resolveConfig(semEdgesToken, "EPF_MEMORY_TOKEN")

	if memURL == "" || projectID == "" || token == "" {
		return fmt.Errorf("Memory configuration required. Set via flags or env vars:\n  --url / EPF_MEMORY_URL\n  --project / EPF_MEMORY_PROJECT\n  --token / EPF_MEMORY_TOKEN")
	}

	client, err := memory.NewClient(memory.Config{
		BaseURL: memURL, ProjectID: projectID, Token: token,
		Timeout: 60 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("create memory client: %w", err)
	}

	config := ingest.DefaultSemanticEdgeConfig()
	config.MinScore = semEdgesMinScore
	config.MaxEdgesPerNode = semEdgesMaxPerNode
	config.DryRun = semEdgesDryRun

	mode := "creating"
	if config.DryRun {
		mode = "discovering (dry-run)"
	}
	fmt.Fprintf(os.Stderr, "Computing semantic edges (%s)...\n", mode)

	ing := ingest.New(client)
	stats, err := ing.ComputeSemanticEdges(context.Background(), config)
	if err != nil {
		return fmt.Errorf("compute semantic edges: %w", err)
	}

	fmt.Printf("\n=== Semantic Edge Computation ===\n")
	fmt.Printf("Nodes searched:  %d\n", stats.NodesSearched)
	fmt.Printf("Edges %s: %d\n", mode, stats.EdgesCreated)
	fmt.Printf("Edges skipped:   %d (below threshold or duplicate)\n", stats.EdgesSkipped)
	fmt.Printf("Search errors:   %d\n", stats.SearchErrors)
	fmt.Printf("Duration:        %s\n", stats.Duration.Round(time.Millisecond))

	return nil
}
