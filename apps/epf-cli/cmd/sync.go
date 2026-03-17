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
	syncMemoryURL   string
	syncProjectID   string
	syncMemoryToken string
)

var syncCmd = &cobra.Command{
	Use:   "sync [instance-path]",
	Short: "Incrementally sync an EPF instance to emergent.memory",
	Long: `Performs an incremental sync — only pushes objects that have changed
since the last sync. Uses content hashing to detect changes.

Unlike 'epf-cli ingest' which always upserts all objects, 'sync' compares
the current decomposition against what's already in Memory and only pushes
differences. This is faster and avoids unnecessary embedding re-computation.

Configuration:
  --url            Memory server URL (or EPF_MEMORY_URL env var)
  --project        Memory project ID (or EPF_MEMORY_PROJECT env var)
  --token          Memory API token (or EPF_MEMORY_TOKEN env var)`,
	Args: cobra.MaximumNArgs(1),
	RunE: runSync,
}

func init() {
	syncCmd.Flags().StringVar(&syncMemoryURL, "url", "", "Memory server URL (or EPF_MEMORY_URL)")
	syncCmd.Flags().StringVar(&syncProjectID, "project", "", "Memory project ID (or EPF_MEMORY_PROJECT)")
	syncCmd.Flags().StringVar(&syncMemoryToken, "token", "", "Memory API token (or EPF_MEMORY_TOKEN)")

	rootCmd.AddCommand(syncCmd)
}

func runSync(cmd *cobra.Command, args []string) error {
	instancePath := "."
	if len(args) > 0 {
		instancePath = args[0]
	}

	if _, err := os.Stat(instancePath); err != nil {
		return fmt.Errorf("instance path %q not found: %w", instancePath, err)
	}

	memURL := resolveConfig(syncMemoryURL, "EPF_MEMORY_URL")
	projectID := resolveConfig(syncProjectID, "EPF_MEMORY_PROJECT")
	token := resolveConfig(syncMemoryToken, "EPF_MEMORY_TOKEN")

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

	fmt.Fprintf(os.Stderr, "Syncing %s to emergent.memory...\n", instancePath)

	ing := ingest.New(client)
	stats, err := ing.Sync(context.Background(), instancePath)
	if err != nil {
		return fmt.Errorf("sync: %w", err)
	}

	fmt.Println("\n=== Incremental Sync Complete ===")
	fmt.Printf("Objects created:       %d\n", stats.ObjectsCreated)
	fmt.Printf("Objects updated:       %d\n", stats.ObjectsUpdated)
	fmt.Printf("Objects unchanged:     %d\n", stats.ObjectsUnchanged)
	fmt.Printf("Objects orphaned:      %d (in Memory, not in instance)\n", stats.ObjectsDeleted)
	fmt.Printf("Relationships created: %d\n", stats.RelationshipsCreated)
	fmt.Printf("Relationships failed:  %d\n", stats.RelationshipsFailed)
	fmt.Printf("Relationships skipped: %d\n", stats.RelationshipsSkipped)
	fmt.Printf("Duration:              %s\n", stats.Duration.Round(time.Millisecond))

	if len(stats.Warnings) > 0 {
		fmt.Printf("Warnings:              %d\n", len(stats.Warnings))
		for i, w := range stats.Warnings {
			if i >= 5 {
				fmt.Printf("  ... and %d more\n", len(stats.Warnings)-5)
				break
			}
			fmt.Printf("  - %s\n", w)
		}
	}

	return nil
}
