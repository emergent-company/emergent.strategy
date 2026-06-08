// Command planner reads OpenSpec change proposals and emits a parallel-safe
// wave plan plus, when a strategy-server MCP endpoint is configured, a strategic
// scorecard and attention ranking.
//
// The deterministic wave plan requires no connection to strategy-server. The
// strategic scorecard layer activates only when --mcp-endpoint is set, and
// degrades gracefully: if strategy-server is unreachable, the wave plan is still
// emitted and the scorecard is reported as unavailable. The endpoint is
// configurable so the same binary runs locally (Track 1) or against a cloud
// deployment (Track 2).
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/mcp"
	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/openspec"
	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/plan"
	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/score"
)

type options struct {
	changesDir       string
	includeCompleted bool
	mcpEndpoint      string
	mcpToken         string
	instanceID       string
	posture          string
	asJSON           bool
}

func main() {
	var opts options
	flag.StringVar(&opts.changesDir, "changes", "openspec/changes", "path to the OpenSpec changes directory")
	flag.BoolVar(&opts.includeCompleted, "include-completed", false, "include changes whose tasks are all complete")
	flag.StringVar(&opts.mcpEndpoint, "mcp-endpoint", envOr("ORCHESTRATOR_MCP_ENDPOINT", ""), "strategy-server MCP endpoint; enables the strategic scorecard")
	flag.StringVar(&opts.mcpToken, "mcp-token", envOr("ORCHESTRATOR_MCP_TOKEN", ""), "bearer token for the MCP endpoint")
	flag.StringVar(&opts.instanceID, "instance-id", envOr("ORCHESTRATOR_INSTANCE_ID", ""), "strategy-server instance UUID to score against (required with --mcp-endpoint)")
	flag.StringVar(&opts.posture, "posture", "balanced", "scoring posture: balanced | venture-early | scaling")
	flag.BoolVar(&opts.asJSON, "json", false, "emit the full report as JSON")
	flag.Parse()

	if err := run(opts); err != nil {
		fmt.Fprintf(os.Stderr, "planner: %v\n", err)
		os.Exit(1)
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// report is the full machine-readable output (Layer 9): the deterministic plan
// plus, when available, the ranked strategic scorecards.
type report struct {
	ChangesDir string              `json:"changes_dir"`
	WaveCount  int                 `json:"wave_count"`
	Waves      [][]string          `json:"waves"`
	Collisions map[string][]string `json:"collisions"`
	NeedsRecon []string            `json:"needs_reconciliation"`
	Skipped    map[string]string   `json:"skipped"`
	Scorecard  *scorecardBlock     `json:"scorecard,omitempty"`
}

type scorecardBlock struct {
	Posture     string         `json:"posture"`
	Available   bool           `json:"available"`
	Unavailable string         `json:"unavailable_reason,omitempty"`
	Ranked      []score.Ranked `json:"ranked,omitempty"`
}

func run(opts options) error {
	changes, err := openspec.LoadChanges(opts.changesDir)
	if err != nil {
		return err
	}
	if _, err := openspec.DetectCrossRefs(changes); err != nil {
		return err
	}

	p := plan.Compute(changes, plan.Options{IncludeCompleted: opts.includeCompleted})

	byID := make(map[string]openspec.Change, len(changes))
	for _, c := range changes {
		byID[c.ID] = c
	}

	rep := report{
		ChangesDir: opts.changesDir,
		WaveCount:  len(p.Waves),
		Waves:      p.Waves,
		Collisions: p.Collisions,
		NeedsRecon: p.NeedsReconciliation,
		Skipped:    p.Skipped,
	}

	// Strategic scorecard (Layer 6-8): only the scheduled (non-skipped) changes.
	if opts.mcpEndpoint != "" {
		rep.Scorecard = buildScorecard(opts, scheduledChanges(p, byID))
	}

	if opts.asJSON {
		return emitJSON(rep)
	}
	renderText(rep, byID)
	return nil
}

// scheduledChanges returns the changes that appear in some wave (i.e. not skipped).
func scheduledChanges(p plan.Plan, byID map[string]openspec.Change) []openspec.Change {
	var out []openspec.Change
	for _, wave := range p.Waves {
		for _, id := range wave {
			out = append(out, byID[id])
		}
	}
	return out
}

// buildScorecard connects to strategy-server and scores the changes, degrading
// to an "unavailable" block on any connection error.
func buildScorecard(opts options, changes []openspec.Change) *scorecardBlock {
	posture, ok := score.Postures[opts.posture]
	if !ok {
		return &scorecardBlock{Posture: opts.posture, Unavailable: "unknown posture: " + opts.posture}
	}
	if opts.instanceID == "" {
		return &scorecardBlock{Posture: posture.Name, Unavailable: "--instance-id is required to score (every strategy-server tool needs an instance)"}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client := mcp.New(mcp.Config{Endpoint: opts.mcpEndpoint, BearerToken: opts.mcpToken})
	disc, err := client.Connect(ctx)
	if err != nil {
		return &scorecardBlock{Posture: posture.Name, Unavailable: "strategy-server unreachable: " + err.Error()}
	}

	caller := score.NewLiveCaller(client, disc)
	scorer := score.NewMCPScorer(ctx, caller, opts.instanceID)
	ranked := score.ScoreChanges(ctx, changes, scorer, posture)

	return &scorecardBlock{Posture: posture.Name, Available: true, Ranked: ranked}
}

func emitJSON(rep report) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(rep); err != nil {
		return fmt.Errorf("encode json: %w", err)
	}
	return nil
}

func renderText(rep report, byID map[string]openspec.Change) {
	fmt.Printf("Wave plan — %s\n", rep.ChangesDir)
	fmt.Printf("%d changes · %d waves\n", len(byID), rep.WaveCount)
	fmt.Println(strings.Repeat("=", 72))

	for w, wave := range rep.Waves {
		fmt.Printf("\nWave %d  (%d in parallel)\n", w+1, len(wave))
		fmt.Println(strings.Repeat("-", 72))
		for _, id := range wave {
			c := byID[id]
			fmt.Printf("  %-38s %s\n", id, taskBadge(c))
			if len(c.Footprints) > 0 {
				fmt.Printf("  %-38s footprints: %s\n", "", strings.Join(c.Footprints, ", "))
			} else {
				fmt.Printf("  %-38s footprints: (none)\n", "")
			}
			if len(c.CrossRefs) > 0 {
				fmt.Printf("  %-38s ⚑ reconcile with: %s\n", "", strings.Join(c.CrossRefs, ", "))
			}
		}
	}

	if len(rep.NeedsRecon) > 0 {
		fmt.Printf("\n%s\n", strings.Repeat("=", 72))
		fmt.Println("⚑ HUMAN RECONCILIATION REQUIRED BEFORE DISPATCH")
		fmt.Println(strings.Repeat("-", 72))
		for _, id := range rep.NeedsRecon {
			fmt.Printf("  %-38s → %s\n", id, strings.Join(byID[id].CrossRefs, ", "))
		}
	}

	if len(rep.Collisions) > 0 {
		fmt.Printf("\n%s\n", strings.Repeat("=", 72))
		fmt.Println("Collision hot-spots (shared footprints force serialization)")
		fmt.Println(strings.Repeat("-", 72))
		type row struct {
			fp  string
			ids []string
		}
		rows := make([]row, 0, len(rep.Collisions))
		for fp, ids := range rep.Collisions {
			rows = append(rows, row{fp, ids})
		}
		sort.Slice(rows, func(i, j int) bool {
			if len(rows[i].ids) != len(rows[j].ids) {
				return len(rows[i].ids) > len(rows[j].ids)
			}
			return rows[i].fp < rows[j].fp
		})
		for _, r := range rows {
			fmt.Printf("  %-26s %2d changes: %s\n", r.fp, len(r.ids), strings.Join(r.ids, ", "))
		}
	}

	if len(rep.Skipped) > 0 {
		fmt.Printf("\n%s\n", strings.Repeat("=", 72))
		fmt.Println("Skipped")
		fmt.Println(strings.Repeat("-", 72))
		ids := make([]string, 0, len(rep.Skipped))
		for id := range rep.Skipped {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			fmt.Printf("  %-38s (%s)\n", id, rep.Skipped[id])
		}
	}

	renderScorecard(rep.Scorecard)
}

func renderScorecard(sc *scorecardBlock) {
	if sc == nil {
		return
	}
	fmt.Printf("\n%s\n", strings.Repeat("=", 72))
	fmt.Printf("Strategic scorecard — attention ranking (posture: %s)\n", sc.Posture)
	fmt.Println(strings.Repeat("-", 72))
	if !sc.Available {
		fmt.Printf("  unavailable: %s\n", sc.Unavailable)
		fmt.Println("  (deterministic wave plan above is unaffected)")
		return
	}
	if len(sc.Ranked) == 0 {
		fmt.Println("  (no scheduled changes to score)")
		return
	}
	fmt.Println("  Changes are ordered by how much they need human review (most first).")
	fmt.Println("  This is triage, NOT a build/skip verdict.")
	fmt.Println()
	for i, r := range sc.Ranked {
		fmt.Printf("  %2d. %-34s attention %.1f  [%d/%d measured]\n",
			i+1, r.Card.ChangeID, r.Attention, r.Card.MeasuredCount(), len(r.Card.Dimensions))
		for _, d := range r.Card.Dimensions {
			fmt.Printf("        %-14s %-12s %s\n", d.Dimension, d.LevelName, d.Summary)
		}
		for _, t := range r.Card.Tensions {
			between := make([]string, len(t.Between))
			for k, b := range t.Between {
				between[k] = string(b)
			}
			fmt.Printf("        ⚑ tension (%s): %s\n", strings.Join(between, "×"), t.Note)
		}
		fmt.Println()
	}
}

func taskBadge(c openspec.Change) string {
	if c.TaskCount == 0 {
		return "[no tasks]"
	}
	if c.Done() {
		return "[✓ complete]"
	}
	return fmt.Sprintf("[%d/%d tasks]", c.TasksDone, c.TaskCount)
}
