package cmd

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/ingest"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/spf13/cobra"
)

var (
	ingestMemoryURL    string
	ingestProjectID    string
	ingestMemoryToken  string
	ingestDryRun       bool
	ingestWaitEmbed    bool
	ingestEmbedTimeout int
)

var ingestCmd = &cobra.Command{
	Use:   "ingest [instance-path]",
	Short: "Ingest an EPF instance into emergent.memory as a semantic graph",
	Long: `Decomposes EPF YAML artifacts into section-level graph objects and structural
edges, then upserts them into emergent.memory.

This is idempotent — re-running produces the same graph state (upsert by type+key).

The decomposer extracts:
  - Beliefs from North Star (tier 1)
  - Trends, Personas, PainPoints from Insight Analyses (tier 2)
  - Positioning from Strategy Formula (tier 3)
  - OKRs, Assumptions from Roadmap (tier 4)
  - ValueModelComponents from Value Models (tier 5)
  - Features, Scenarios from Feature Definitions (tier 6)
  - Capabilities from Feature Definitions (tier 7)

Plus structural relationships: contains, contributes_to, depends_on,
tests_assumption, targets, serves, elaborates.

Configuration:
  --url            Memory server URL (or EPF_MEMORY_URL env var)
  --project        Memory project ID (or EPF_MEMORY_PROJECT env var)
  --token          Memory API token (or EPF_MEMORY_TOKEN env var)
  --dry-run        Decompose and report counts without pushing to Memory`,
	Args: cobra.MaximumNArgs(1),
	RunE: runIngest,
}

func init() {
	ingestCmd.Flags().StringVar(&ingestMemoryURL, "url", "", "Memory server URL (or EPF_MEMORY_URL)")
	ingestCmd.Flags().StringVar(&ingestProjectID, "project", "", "Memory project ID (or EPF_MEMORY_PROJECT)")
	ingestCmd.Flags().StringVar(&ingestMemoryToken, "token", "", "Memory API token (or EPF_MEMORY_TOKEN)")
	ingestCmd.Flags().BoolVar(&ingestDryRun, "dry-run", false, "Decompose only, don't push to Memory")
	ingestCmd.Flags().BoolVar(&ingestWaitEmbed, "wait-for-embeddings", false, "Wait for embeddings to complete after ingest")
	ingestCmd.Flags().IntVar(&ingestEmbedTimeout, "embed-timeout", 300, "Timeout in seconds for --wait-for-embeddings (default: 300)")

	rootCmd.AddCommand(ingestCmd)
}

func runIngest(cmd *cobra.Command, args []string) error {
	instancePath := "."
	if len(args) > 0 {
		instancePath = args[0]
	}

	if _, err := os.Stat(instancePath); err != nil {
		return fmt.Errorf("instance path %q not found: %w", instancePath, err)
	}

	if ingestDryRun {
		return runIngestDryRun(instancePath)
	}

	// Resolve Memory configuration
	memURL := resolveConfig(ingestMemoryURL, "EPF_MEMORY_URL")
	projectID := resolveConfig(ingestProjectID, "EPF_MEMORY_PROJECT")
	token := resolveConfig(ingestMemoryToken, "EPF_MEMORY_TOKEN")

	if memURL == "" || projectID == "" || token == "" {
		return fmt.Errorf("Memory configuration required. Set via flags or env vars:\n  --url / EPF_MEMORY_URL\n  --project / EPF_MEMORY_PROJECT\n  --token / EPF_MEMORY_TOKEN")
	}

	client, err := memory.NewClient(memory.Config{
		BaseURL:   memURL,
		ProjectID: projectID,
		Token:     token,
		Timeout:   60 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("create memory client: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Ingesting %s into emergent.memory...\n", instancePath)

	ing := ingest.New(client)
	stats, err := ing.Ingest(context.Background(), instancePath)
	if err != nil {
		return fmt.Errorf("ingest: %w", err)
	}

	printIngestStats(stats)

	// Report current embedding progress
	pct := client.EmbeddingProgressPercent(context.Background())
	if pct >= 0 {
		fmt.Fprintf(os.Stderr, "Embedding progress: %.0f%%\n", pct)
		if pct < 80 {
			fmt.Fprintf(os.Stderr, "  Run 'epf-cli semantic-edges' after embeddings complete (~%.0f%% remaining)\n", 100-pct)
		}
	}

	// Optionally wait for embeddings to complete
	if ingestWaitEmbed && stats.ObjectsUpserted > 0 {
		fmt.Fprintf(os.Stderr, "\nWaiting for embeddings to complete (timeout: %ds)...\n", ingestEmbedTimeout)
		deadline := time.Now().Add(time.Duration(ingestEmbedTimeout) * time.Second)
		for time.Now().Before(deadline) {
			pct := client.EmbeddingProgressPercent(context.Background())
			if pct < 0 {
				fmt.Fprintf(os.Stderr, "  Embedding progress API not available — skipping wait\n")
				break
			}
			if pct >= 100 {
				fmt.Fprintf(os.Stderr, "  ✓ Embeddings complete (100%%)\n")
				break
			}
			fmt.Fprintf(os.Stderr, "  Embedding: %.0f%% complete...\r", pct)
			time.Sleep(5 * time.Second)
		}
		if time.Now().After(deadline) {
			pct := client.EmbeddingProgressPercent(context.Background())
			fmt.Fprintf(os.Stderr, "\n  ⚠ Embedding incomplete after timeout (%.0f%% done)\n", pct)
		}
	}

	return nil
}

func runIngestDryRun(instancePath string) error {
	dec := decompose.New(instancePath)
	result, err := dec.DecomposeInstance()
	if err != nil {
		return fmt.Errorf("decompose: %w", err)
	}

	objCounts := map[string]int{}
	for _, obj := range result.Objects {
		objCounts[obj.Type]++
	}
	relCounts := map[string]int{}
	for _, rel := range result.Relationships {
		relCounts[rel.Type]++
	}

	fmt.Println("=== Dry Run: Decomposition Results ===")
	fmt.Printf("Instance: %s\n", instancePath)
	fmt.Printf("Total objects:       %d\n", len(result.Objects))
	fmt.Printf("Total relationships: %d\n", len(result.Relationships))
	fmt.Printf("Warnings:            %d\n", len(result.Warnings))

	fmt.Println("\nObjects by type:")
	for objType, count := range objCounts {
		fmt.Printf("  %-25s %d\n", objType, count)
	}

	fmt.Println("\nRelationships by type:")
	for relType, count := range relCounts {
		fmt.Printf("  %-25s %d\n", relType, count)
	}

	for _, w := range result.Warnings {
		fmt.Printf("\nWARNING: %s\n", w)
	}

	return nil
}

func printIngestStats(stats *ingest.Stats) {
	fmt.Println("\n=== Ingestion Complete ===")
	fmt.Printf("Objects upserted:      %d\n", stats.ObjectsUpserted)
	fmt.Printf("Objects failed:        %d\n", stats.ObjectsFailed)
	fmt.Printf("Relationships created: %d\n", stats.RelationshipsCreated)
	fmt.Printf("Relationships failed:  %d\n", stats.RelationshipsFailed)
	fmt.Printf("Relationships skipped: %d (unresolved keys)\n", stats.RelationshipsSkipped)
	fmt.Printf("Duration:              %s\n", stats.Duration.Round(time.Millisecond))
	fmt.Printf("Warnings:              %d\n", len(stats.Warnings))

	if stats.ObjectsFailed > 0 || stats.RelationshipsFailed > 0 {
		fmt.Println("\nWarnings:")
		for i, w := range stats.Warnings {
			if i >= 10 {
				fmt.Printf("  ... and %d more\n", len(stats.Warnings)-10)
				break
			}
			fmt.Printf("  - %s\n", w)
		}
	}
}

func resolveConfig(flag, envVar string) string {
	if flag != "" {
		return flag
	}
	return os.Getenv(envVar)
}
