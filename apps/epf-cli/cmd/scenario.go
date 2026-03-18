package cmd

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/scenario"
	"github.com/spf13/cobra"
)

var (
	scenarioMemoryURL   string
	scenarioProjectID   string
	scenarioMemoryToken string
	scenarioHypothesis  string
	scenarioNodeKey     string
	scenarioProperty    string
	scenarioValue       string
	scenarioBranchID    string
)

var scenarioCmd = &cobra.Command{
	Use:   "scenario",
	Short: "Explore strategic what-if scenarios via graph branching",
	Long: `Create, modify, and evaluate strategic scenarios using graph branching.

Scenarios create a branch in the emergent.memory graph, apply proposed changes,
then run the propagation circuit to see the cascade implications — all without
affecting the main graph.

Subcommands:
  create    Create a new scenario branch
  modify    Apply a change to a node on the scenario branch
  evaluate  Run the propagation circuit on the scenario
  discard   Delete a scenario branch without merging

Example workflow:
  epf-cli scenario create "What if semantic strategy is wrong?" --hypothesis "Strategy is structural, not semantic"
  epf-cli scenario modify --branch <id> --node "Belief:north_star:purpose" --property statement --value "We make strategy structural"
  epf-cli scenario evaluate --branch <id>
  epf-cli scenario discard --branch <id>`,
}

var scenarioCreateCmd = &cobra.Command{
	Use:   "create <name>",
	Short: "Create a new scenario branch",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]
		client, err := scenarioClient()
		if err != nil {
			return err
		}

		mgr := scenario.NewManager(client, &heuristicReasoner{})
		s, err := mgr.Create(context.Background(), name, scenarioHypothesis)
		if err != nil {
			return err
		}

		fmt.Printf("Scenario created:\n")
		fmt.Printf("  Branch ID:  %s\n", s.ID)
		fmt.Printf("  Name:       %s\n", s.Name)
		fmt.Printf("  Hypothesis: %s\n", s.Hypothesis)
		fmt.Printf("\nNext: apply modifications with:\n")
		fmt.Printf("  epf-cli scenario modify --branch %s --node <key> --property <prop> --value <val>\n", s.ID)
		return nil
	},
}

var scenarioModifyCmd = &cobra.Command{
	Use:   "modify",
	Short: "Apply a change to a node on the scenario branch",
	RunE: func(cmd *cobra.Command, args []string) error {
		if scenarioBranchID == "" || scenarioNodeKey == "" || scenarioProperty == "" {
			return fmt.Errorf("--branch, --node, --property, and --value are required")
		}

		client, err := scenarioClient()
		if err != nil {
			return err
		}

		s := &scenario.Scenario{
			ID:     scenarioBranchID,
			Status: "open",
		}

		mgr := scenario.NewManager(client, &heuristicReasoner{})
		mod := scenario.Modification{
			NodeKey:    scenarioNodeKey,
			Changes:    map[string]any{scenarioProperty: scenarioValue},
			ChangeType: "content_modified",
		}

		if err := mgr.Modify(context.Background(), s, mod); err != nil {
			return err
		}

		fmt.Printf("Modified %s on branch %s:\n", scenarioNodeKey, scenarioBranchID)
		fmt.Printf("  %s = %s\n", scenarioProperty, scenarioValue)
		return nil
	},
}

var scenarioEvaluateCmd = &cobra.Command{
	Use:   "evaluate",
	Short: "Run the propagation circuit on the scenario branch",
	RunE: func(cmd *cobra.Command, args []string) error {
		if scenarioBranchID == "" {
			return fmt.Errorf("--branch is required")
		}

		client, err := scenarioClient()
		if err != nil {
			return err
		}

		// We need at least the modifications to evaluate — for now, require at least one
		// In production this would load scenario state from persistence.
		s := &scenario.Scenario{
			ID:     scenarioBranchID,
			Status: "open",
			Modifications: []scenario.Modification{
				{
					NodeKey:    scenarioNodeKey,
					ChangeType: "content_modified",
					Changes:    map[string]any{scenarioProperty: scenarioValue},
				},
			},
		}

		if scenarioNodeKey == "" {
			return fmt.Errorf("--node is required to specify the modified node for evaluation")
		}

		mgr := scenario.NewManager(client, &heuristicReasoner{})
		fmt.Fprintf(os.Stderr, "Evaluating scenario on branch %s...\n", scenarioBranchID)

		result, err := mgr.Evaluate(context.Background(), s)
		if err != nil {
			return err
		}

		// Reuse the impact printer
		printImpactResult(scenarioNodeKey, fmt.Sprintf("Scenario: %s", scenarioValue), result)

		// Show diff
		diff, err := mgr.Diff(context.Background(), s)
		if err == nil && len(diff) > 0 {
			fmt.Printf("\n── Scenario Diff ────────────────────────────────────────\n")
			fmt.Printf("  Direct modifications:  %d\n", countStatus(diff, "modified"))
			fmt.Printf("  Cascade modifications: %d\n", countStatus(diff, "cascade_modified"))
			for _, d := range diff {
				marker := "~"
				if d.Status == "modified" {
					marker = "*"
				}
				fmt.Printf("  %s %-50s  %s\n", marker, shortenKey(d.NodeKey), truncateDisplay(d.Reasoning, 60))
			}
		}

		return nil
	},
}

var scenarioDiscardCmd = &cobra.Command{
	Use:   "discard",
	Short: "Delete a scenario branch without merging",
	RunE: func(cmd *cobra.Command, args []string) error {
		if scenarioBranchID == "" {
			return fmt.Errorf("--branch is required")
		}

		client, err := scenarioClient()
		if err != nil {
			return err
		}

		mgr := scenario.NewManager(client, &heuristicReasoner{})
		s := &scenario.Scenario{ID: scenarioBranchID, Status: "evaluated"}
		if err := mgr.Discard(context.Background(), s); err != nil {
			return err
		}

		fmt.Printf("Scenario branch %s discarded.\n", scenarioBranchID)
		return nil
	},
}

func init() {
	// Shared flags
	for _, cmd := range []*cobra.Command{scenarioCreateCmd, scenarioModifyCmd, scenarioEvaluateCmd, scenarioDiscardCmd} {
		cmd.Flags().StringVar(&scenarioMemoryURL, "url", "", "Memory server URL (or EPF_MEMORY_URL)")
		cmd.Flags().StringVar(&scenarioProjectID, "project", "", "Memory project ID (or EPF_MEMORY_PROJECT)")
		cmd.Flags().StringVar(&scenarioMemoryToken, "token", "", "Memory API token (or EPF_MEMORY_TOKEN)")
	}

	// Create flags
	scenarioCreateCmd.Flags().StringVar(&scenarioHypothesis, "hypothesis", "", "Strategic hypothesis being tested")

	// Modify/Evaluate flags
	for _, cmd := range []*cobra.Command{scenarioModifyCmd, scenarioEvaluateCmd, scenarioDiscardCmd} {
		cmd.Flags().StringVar(&scenarioBranchID, "branch", "", "Scenario branch ID")
	}
	scenarioModifyCmd.Flags().StringVar(&scenarioNodeKey, "node", "", "Node key to modify")
	scenarioModifyCmd.Flags().StringVar(&scenarioProperty, "property", "", "Property to change")
	scenarioModifyCmd.Flags().StringVar(&scenarioValue, "value", "", "New property value")

	scenarioEvaluateCmd.Flags().StringVar(&scenarioNodeKey, "node", "", "Modified node key")
	scenarioEvaluateCmd.Flags().StringVar(&scenarioProperty, "property", "", "Modified property")
	scenarioEvaluateCmd.Flags().StringVar(&scenarioValue, "value", "", "Modified value")

	scenarioCmd.AddCommand(scenarioCreateCmd)
	scenarioCmd.AddCommand(scenarioModifyCmd)
	scenarioCmd.AddCommand(scenarioEvaluateCmd)
	scenarioCmd.AddCommand(scenarioDiscardCmd)
	rootCmd.AddCommand(scenarioCmd)
}

func scenarioClient() (*memory.Client, error) {
	memURL := resolveConfig(scenarioMemoryURL, "EPF_MEMORY_URL")
	projectID := resolveConfig(scenarioProjectID, "EPF_MEMORY_PROJECT")
	token := resolveConfig(scenarioMemoryToken, "EPF_MEMORY_TOKEN")

	if memURL == "" || projectID == "" || token == "" {
		return nil, fmt.Errorf("Memory configuration required. Set via flags or env vars:\n  --url / EPF_MEMORY_URL\n  --project / EPF_MEMORY_PROJECT\n  --token / EPF_MEMORY_TOKEN")
	}

	return memory.NewClient(memory.Config{
		BaseURL:   memURL,
		ProjectID: projectID,
		Token:     token,
		Timeout:   60 * time.Second,
	})
}

func countStatus(diff []scenario.DiffEntry, status string) int {
	n := 0
	for _, d := range diff {
		if d.Status == status {
			n++
		}
	}
	return n
}

// scenarioNodeKey is used by evaluate — check if it contains a colon to distinguish from flag collision
func isNodeKey(s string) bool {
	return strings.Contains(s, ":")
}
