package cmd

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/propagation"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/reasoning"
	"github.com/spf13/cobra"
)

var (
	impactNodeKey     string
	impactSignal      float64
	impactChangeType  string
	impactMode        string
	impactMemoryURL   string
	impactProjectID   string
	impactMemoryToken string
)

var impactCmd = &cobra.Command{
	Use:   "impact <description>",
	Short: "Analyze the semantic impact of a strategy change",
	Long: `Runs the propagation circuit in dry-run mode to show which nodes
in the strategy graph would be affected by a change.

The circuit loads the full graph from emergent.memory, then propagates a signal
from the source node through connected nodes, evaluating each with tiered LLM
reasoning. No changes are applied — this is a read-only analysis.

Examples:
  epf-cli impact "Core belief about semantic strategy invalidated" --node "Belief:north_star:purpose"
  epf-cli impact "Feature reprioritized" --node "Feature:feature:fd-020" --signal 0.8
  epf-cli impact "Market trend changed" --node "Trend:insight_analyses:trends.technology[0]"

Without --node, the circuit starts from the first Belief node found.

Configuration:
  --url            Memory server URL (or EPF_MEMORY_URL env var)
  --project        Memory project ID (or EPF_MEMORY_PROJECT env var)
  --token          Memory API token (or EPF_MEMORY_TOKEN env var)`,
	Args: cobra.ExactArgs(1),
	RunE: runImpact,
}

func init() {
	impactCmd.Flags().StringVar(&impactNodeKey, "node", "", "Source node key (e.g., Belief:north_star:purpose)")
	impactCmd.Flags().Float64Var(&impactSignal, "signal", 1.0, "Initial signal strength (0.0-1.0)")
	impactCmd.Flags().StringVar(&impactChangeType, "change-type", "content_modified", "Change type (content_modified, created, deleted)")
	impactCmd.Flags().StringVar(&impactMode, "mode", "interactive", "Cascade mode (interactive, automatic, scenario)")
	impactCmd.Flags().StringVar(&impactMemoryURL, "url", "", "Memory server URL (or EPF_MEMORY_URL)")
	impactCmd.Flags().StringVar(&impactProjectID, "project", "", "Memory project ID (or EPF_MEMORY_PROJECT)")
	impactCmd.Flags().StringVar(&impactMemoryToken, "token", "", "Memory API token (or EPF_MEMORY_TOKEN)")

	rootCmd.AddCommand(impactCmd)
}

func runImpact(cmd *cobra.Command, args []string) error {
	description := args[0]

	// Resolve Memory configuration
	memURL := resolveConfig(impactMemoryURL, "EPF_MEMORY_URL")
	projectID := resolveConfig(impactProjectID, "EPF_MEMORY_PROJECT")
	token := resolveConfig(impactMemoryToken, "EPF_MEMORY_TOKEN")

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

	// Load graph snapshot
	fmt.Fprintf(os.Stderr, "Loading graph from emergent.memory...")
	ctx := context.Background()
	graph, err := propagation.LoadGraphSnapshot(ctx, client)
	if err != nil {
		return fmt.Errorf("load graph: %w", err)
	}
	fmt.Fprintf(os.Stderr, " %d nodes loaded\n", len(graph.Nodes))

	// Resolve source node
	sourceKey := impactNodeKey
	if sourceKey == "" {
		// Find first Belief node as default
		for key, node := range graph.Nodes {
			if node.Type == "Belief" {
				sourceKey = key
				break
			}
		}
		if sourceKey == "" {
			return fmt.Errorf("no source node specified and no Belief nodes found in graph")
		}
		fmt.Fprintf(os.Stderr, "Using source node: %s\n", sourceKey)
	}

	sourceNode, ok := graph.Nodes[sourceKey]
	if !ok {
		return fmt.Errorf("source node %q not found in graph (%d nodes available)", sourceKey, len(graph.Nodes))
	}

	// Resolve cascade mode
	mode := propagation.ModeInteractive
	switch impactMode {
	case "automatic":
		mode = propagation.ModeAutomatic
	case "scenario":
		mode = propagation.ModeScenario
	}

	// For the demo, use a mock reasoner that does simple heuristic evaluation
	// (real LLM reasoner requires Ollama or cloud API configured)
	reasoner := &heuristicReasoner{}

	// Configure circuit
	config := propagation.DefaultConfig()
	config.Mode = mode
	config.DryRun = true
	config.DampingInterval = 0 // no damping for analysis

	// Run propagation
	fmt.Fprintf(os.Stderr, "Running impact analysis...\n\n")

	circuit := propagation.NewCircuit(graph, reasoner, config)
	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  sourceKey,
		SourceNodeType: sourceNode.Type,
		ChangeType:     impactChangeType,
		Description:    description,
		Strength:       impactSignal,
	})

	// Print results
	printImpactResult(sourceKey, description, result)
	return nil
}

func printImpactResult(sourceKey, description string, result *propagation.CascadeResult) {
	fmt.Printf("═══════════════════════════════════════════════════════════\n")
	fmt.Printf("  SEMANTIC IMPACT ANALYSIS\n")
	fmt.Printf("═══════════════════════════════════════════════════════════\n")
	fmt.Printf("Source:      %s\n", sourceKey)
	fmt.Printf("Change:      %s\n", description)
	fmt.Printf("Duration:    %s\n", result.Duration.Round(time.Millisecond))
	fmt.Printf("Waves:       %d\n", result.Waves)
	fmt.Printf("Evaluations: %d\n", len(result.Trace))
	fmt.Printf("Proposed:    %d changes\n", len(result.ProposedChanges))
	fmt.Printf("Skipped:     %d nodes\n", len(result.SkippedNodes))
	if result.BudgetExhausted {
		fmt.Printf("⚠ Budget exhausted — some nodes not evaluated\n")
	}
	if len(result.FrozenNodes) > 0 {
		fmt.Printf("⚠ Oscillation detected in %d nodes\n", len(result.FrozenNodes))
	}

	// Group evaluations by wave
	if len(result.Trace) > 0 {
		fmt.Printf("\n── Cascade Trace ────────────────────────────────────────\n")

		maxWave := 0
		for _, e := range result.Trace {
			if e.Wave > maxWave {
				maxWave = e.Wave
			}
		}

		for wave := 0; wave <= maxWave; wave++ {
			waveEvals := []propagation.NodeEvaluation{}
			for _, e := range result.Trace {
				if e.Wave == wave {
					waveEvals = append(waveEvals, e)
				}
			}
			if len(waveEvals) == 0 {
				continue
			}

			fmt.Printf("\n  Wave %d:\n", wave)
			for _, e := range waveEvals {
				verdict := string(e.Assessment.Verdict)
				symbol := "·"
				switch e.Assessment.Verdict {
				case reasoning.VerdictModified:
					symbol = "~"
				case reasoning.VerdictNeedsReview:
					symbol = "?"
				case reasoning.VerdictUnchanged:
					symbol = "="
				}

				// Shorten the key for display
				shortKey := shortenKey(e.NodeKey)
				fmt.Printf("    %s %-40s  tier %d  strength %.2f  → %s\n",
					symbol, shortKey, e.InertiaTier, e.SignalStrength, verdict)
				if e.Assessment.Reasoning != "" && e.Assessment.Reasoning != "mock reasoning" {
					fmt.Printf("      %s\n", truncateDisplay(e.Assessment.Reasoning, 80))
				}
			}
		}
	}

	// Proposed changes summary
	if len(result.ProposedChanges) > 0 {
		fmt.Printf("\n── Proposed Changes ─────────────────────────────────────\n")

		// Group by tier
		byTier := map[int][]propagation.ProposedChange{}
		for _, pc := range result.ProposedChanges {
			tier := tierFromNodeType(pc.NodeType)
			byTier[tier] = append(byTier[tier], pc)
		}

		tiers := make([]int, 0, len(byTier))
		for t := range byTier {
			tiers = append(tiers, t)
		}
		sort.Ints(tiers)

		for _, tier := range tiers {
			changes := byTier[tier]
			fmt.Printf("\n  Tier %d (%s):\n", tier, tierLabel(tier))
			for _, pc := range changes {
				fmt.Printf("    [%s] %s\n", pc.Classification, shortenKey(pc.NodeKey))
				if pc.Reasoning != "" {
					fmt.Printf("      %s\n", truncateDisplay(pc.Reasoning, 80))
				}
			}
		}
	}

	// Skip summary
	if len(result.SkippedNodes) > 0 {
		reasons := map[string]int{}
		for _, s := range result.SkippedNodes {
			reasons[s.Reason]++
		}
		fmt.Printf("\n── Skipped ──────────────────────────────────────────────\n")
		for reason, count := range reasons {
			fmt.Printf("  %-20s %d nodes\n", reason, count)
		}
	}

	fmt.Printf("\n═══════════════════════════════════════════════════════════\n")
}

// --- Heuristic reasoner for demo (no LLM needed) ---

type heuristicReasoner struct{}

func (r *heuristicReasoner) Evaluate(req reasoning.EvaluationRequest) (*reasoning.Assessment, error) {
	// Simple heuristic: higher inertia → more likely unchanged
	// This is a demo-quality reasoner, not production quality
	target := req.Target

	// Tier 1-2: always needs review (too important for heuristics)
	if target.InertiaTier <= 2 {
		return &reasoning.Assessment{
			Verdict:        reasoning.VerdictNeedsReview,
			Confidence:     0.5,
			Reasoning:      fmt.Sprintf("Tier %d artifact requires human review for changes cascading from %s", target.InertiaTier, req.Signal.SourceNodeType),
			Classification: reasoning.ClassSemantic,
			ModelUsed:      "heuristic",
			TokensUsed:     reasoning.TokenUsage{InputTokens: 0, OutputTokens: 0},
		}, nil
	}

	// Tier 3-4: likely needs modification if signal is strong
	if target.InertiaTier <= 4 {
		if req.Signal.Strength > 0.5 {
			return &reasoning.Assessment{
				Verdict:    reasoning.VerdictModified,
				Confidence: 0.7,
				Reasoning: fmt.Sprintf("Strategic artifact (%s) likely needs alignment with upstream change from %s",
					target.Type, req.Signal.SourceNodeType),
				Classification:  reasoning.ClassSemantic,
				ProposedChanges: map[string]any{"_needs_review": "strategic alignment required"},
				ModelUsed:       "heuristic",
				TokensUsed:      reasoning.TokenUsage{InputTokens: 0, OutputTokens: 0},
			}, nil
		}
		return &reasoning.Assessment{
			Verdict:        reasoning.VerdictUnchanged,
			Confidence:     0.6,
			Reasoning:      fmt.Sprintf("Signal too weak (%.2f) to affect tier %d artifact", req.Signal.Strength, target.InertiaTier),
			Classification: reasoning.ClassMechanical,
			ModelUsed:      "heuristic",
		}, nil
	}

	// Tier 5-7: modification if signal is moderate
	if req.Signal.Strength > 0.3 {
		return &reasoning.Assessment{
			Verdict:    reasoning.VerdictModified,
			Confidence: 0.8,
			Reasoning: fmt.Sprintf("Execution artifact (%s) affected by upstream %s change",
				target.Type, req.Signal.SourceNodeType),
			Classification:  reasoning.ClassMechanical,
			ProposedChanges: map[string]any{"_needs_review": "alignment check needed"},
			ModelUsed:       "heuristic",
			TokensUsed:      reasoning.TokenUsage{InputTokens: 0, OutputTokens: 0},
		}, nil
	}

	return &reasoning.Assessment{
		Verdict:        reasoning.VerdictUnchanged,
		Confidence:     0.85,
		Reasoning:      fmt.Sprintf("Signal too weak (%.2f) for tier %d", req.Signal.Strength, target.InertiaTier),
		Classification: reasoning.ClassMechanical,
		ModelUsed:      "heuristic",
	}, nil
}

// --- Display helpers ---

func shortenKey(key string) string {
	// Remove the type prefix if duplicated: "Belief:north_star:purpose" → "north_star:purpose"
	parts := strings.SplitN(key, ":", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return key
}

func truncateDisplay(s string, n int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > n {
		return s[:n] + "..."
	}
	return s
}

func tierFromNodeType(nodeType string) int {
	switch nodeType {
	case "Belief":
		return 1
	case "Trend", "Persona", "PainPoint":
		return 2
	case "Positioning":
		return 3
	case "OKR", "Assumption":
		return 4
	case "ValueModelComponent":
		return 5
	case "Feature", "Scenario":
		return 6
	case "Capability":
		return 7
	default:
		return 7
	}
}

func tierLabel(tier int) string {
	switch tier {
	case 1:
		return "North Star"
	case 2:
		return "Insights"
	case 3:
		return "Strategy"
	case 4:
		return "Roadmap"
	case 5:
		return "Value Model"
	case 6:
		return "Features"
	case 7:
		return "Capabilities"
	default:
		return "Unknown"
	}
}
