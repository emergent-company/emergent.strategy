package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

var askCmd = &cobra.Command{
	Use:   "ask <question...>",
	Short: "Ask a strategic question about your EPF instance",
	Long: `Ask a natural language question about your EPF strategy graph.

The question is used to search the Memory knowledge graph via hybrid
search (text + vector), then the top results and their graph
relationships are returned as structured context for analysis.

Examples:
  epf-cli ask What are our biggest strategic risks and how are they mitigated?
  epf-cli ask Which features address our market white spaces?
  epf-cli ask What is our competitive positioning vs Notion and Cascade?
  epf-cli ask Which assumptions have been validated by proven capabilities?

Requires EPF_MEMORY_URL, EPF_MEMORY_PROJECT, and EPF_MEMORY_TOKEN environment variables.`,
	Args: cobra.MinimumNArgs(1),
	RunE: runAsk,
}

var (
	askShowTools bool
	askShowTime  bool
	askJSON      bool
)

func init() {
	rootCmd.AddCommand(askCmd)
	askCmd.Flags().BoolVar(&askShowTools, "show-tools", false, "Show which graph query tools were used")
	askCmd.Flags().BoolVar(&askShowTime, "show-time", false, "Show elapsed time")
	askCmd.Flags().BoolVar(&askJSON, "json", false, "Output as JSON")
}

func runAsk(cmd *cobra.Command, args []string) error {
	memURL := os.Getenv("EPF_MEMORY_URL")
	memProject := os.Getenv("EPF_MEMORY_PROJECT")
	memToken := os.Getenv("EPF_MEMORY_TOKEN")

	if memURL == "" || memProject == "" || memToken == "" {
		return fmt.Errorf("EPF_MEMORY_URL, EPF_MEMORY_PROJECT, and EPF_MEMORY_TOKEN must be set.\n\nThe ask command queries your EPF strategy graph in Memory.\nSet these environment variables to connect to your Memory project.")
	}

	client, err := memory.NewClient(memory.Config{
		BaseURL:   memURL,
		ProjectID: memProject,
		Token:     memToken,
		Timeout:   60 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("create Memory client: %w", err)
	}

	question := strings.Join(args, " ")

	ctx := context.Background()
	start := time.Now()

	result, err := client.Ask(ctx, question)
	if err != nil {
		return fmt.Errorf("ask failed: %w", err)
	}

	elapsed := time.Since(start)

	if askJSON {
		jsonResult := map[string]any{
			"question":   question,
			"response":   result.Response,
			"tools":      result.Tools,
			"elapsed_ms": elapsed.Milliseconds(),
		}
		jsonBytes, _ := json.MarshalIndent(jsonResult, "", "  ")
		fmt.Println(string(jsonBytes))
		return nil
	}

	// Print the response
	fmt.Println(result.Response)

	if askShowTools && len(result.Tools) > 0 {
		fmt.Printf("\nTools used: %s\n", strings.Join(result.Tools, ", "))
	}

	if askShowTime {
		fmt.Printf("\nElapsed: %s\n", elapsed.Round(time.Millisecond))
	}

	return nil
}
