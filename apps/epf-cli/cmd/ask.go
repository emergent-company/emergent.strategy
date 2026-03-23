package cmd

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

var askCmd = &cobra.Command{
	Use:   "ask <question...>",
	Short: "Ask a strategic question about your EPF instance",
	Long: `Ask a natural language question about your EPF strategy graph.

The question is enriched with EPF domain context (type vocabulary,
relationship semantics, query patterns) and sent to the Memory ask API
for graph-powered reasoning.

Examples:
  epf-cli ask What are our biggest strategic risks and how are they mitigated?
  epf-cli ask Which features address our market white spaces?
  epf-cli ask What is our competitive positioning vs Notion and Cascade?
  epf-cli ask Trace how the LLM commoditization trend affects our product strategy
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
	askCmd.Flags().BoolVar(&askShowTools, "show-tools", false, "Show which Memory tools were used")
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
		Timeout:   120 * time.Second, // Ask can take a while with complex graph traversal
	})
	if err != nil {
		return fmt.Errorf("create Memory client: %w", err)
	}

	// Build the enriched question: EPF context + user question
	question := strings.Join(args, " ")
	enrichedQuestion := decompose.GenerateAskContext() + question

	ctx := context.Background()
	start := time.Now()

	result, err := client.Ask(ctx, enrichedQuestion)
	if err != nil {
		return fmt.Errorf("ask failed: %w", err)
	}

	elapsed := time.Since(start)

	if askJSON {
		fmt.Printf(`{"question":%q,"response":%q,"tools":%q,"elapsed_ms":%d}`,
			question, result.Response, result.Tools, elapsed.Milliseconds())
		fmt.Println()
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
