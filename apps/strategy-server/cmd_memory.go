package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sort"
	"text/tabwriter"

	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/logger"
)

// newMemoryClient builds the Memory client the commands use from the server's
// configuration.
func newMemoryClient(cfg *config.Config) (*memory.Client, error) {
	authMode := memory.AuthModeAPIKey
	if cfg.MemoryAuthMode == "bearer" {
		authMode = memory.AuthModeBearer
	}
	return memory.New(memory.Config{
		BaseURL:   cfg.MemoryURL,
		ProjectID: cfg.MemoryProject,
		Token:     cfg.MemoryToken,
		AuthMode:  authMode,
	})
}

// runMemory executes the memory subcommand. Like the token command it runs on
// the server's host with direct database access: the sweep looks at the whole
// Memory project, across every organisation, so it is an operator action and
// not something an organisation's admin can run.
func runMemory(cfg *config.Config) error {
	log := logger.New(cfg.LogLevel)
	slog.SetDefault(log)

	if cfg.Memory.Sweep == nil && cfg.Memory.Verify == nil {
		return fmt.Errorf("specify a memory command: sweep or verify")
	}
	if !cfg.MemoryConfigured() {
		return fmt.Errorf("Memory is not configured: set EPF_MEMORY_URL, EPF_MEMORY_PROJECT and EPF_MEMORY_TOKEN") //nolint:staticcheck // names the product
	}
	client, err := newMemoryClient(cfg)
	if err != nil {
		return fmt.Errorf("create Memory client: %w", err)
	}
	db, err := database.Open(cfg)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = db.Close() }()

	svc := newMemoryService(db, client)
	if cfg.Memory.Verify != nil {
		return runVerify(svc, cfg.Memory.Verify.Repair, cfg.MemoryProject)
	}

	apply := cfg.Memory.Sweep.Apply
	rep, err := svc.SweepOrphans(context.Background(), apply)
	if rep != nil {
		printSweepReport(rep, cfg.MemoryProject)
	}
	if err != nil {
		return fmt.Errorf("sweep: %w", err)
	}
	if rep.Failed > 0 {
		return fmt.Errorf("%d deletes failed; run the sweep again to retry them", rep.Failed)
	}
	return nil
}

func printSweepReport(rep *ingest.SweepReport, project string) {
	mode := "DRY RUN (nothing deleted; pass --apply to delete)"
	if rep.Applied {
		mode = "APPLY"
	}
	fmt.Printf("Memory orphan sweep, project %s: %s\n", project, mode)
	fmt.Printf("scanned %d objects. The sweep treats every object in the project that no instance accounts for\n", rep.Scanned)
	fmt.Printf("as an orphan, so run it only against a project dedicated to strategy-server.\n\n")

	w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintln(w, "CLASS\tOBJECTS\tEXAMPLES")
	for _, class := range []string{ingest.SweepNoOwner, ingest.SweepUnknownOwner, ingest.SweepNotInManifest, ingest.SweepLegacyKey} {
		_, _ = fmt.Fprintf(w, "%s\t%d\t%v\n", class, rep.Counts[class], rep.Samples[class])
	}
	_ = w.Flush()

	if len(rep.Skipped) > 0 {
		sort.Slice(rep.Skipped, func(i, j int) bool { return rep.Skipped[i].InstanceID < rep.Skipped[j].InstanceID })
		fmt.Printf("\nSkipped instances (their objects were not classified or touched):\n")
		for _, s := range rep.Skipped {
			fmt.Printf("  %s  %s  %d objects\n", s.InstanceID, s.Reason, s.Objects)
		}
	}
	if rep.Applied {
		fmt.Printf("\ndeleted %d, already gone %d, failed %d\n", rep.Deleted, rep.AlreadyGone, rep.Failed)
	}
}

func runVerify(svc *ingest.Service, repair bool, project string) error {
	rep, err := svc.VerifyInstances(context.Background(), repair)
	if rep != nil {
		printVerifyReport(os.Stdout, rep, project)
	}
	if err != nil {
		return fmt.Errorf("verify: %w", err)
	}
	if n := rep.Unresolved(); n > 0 {
		return fmt.Errorf("%d instances still disagree with Memory", n)
	}
	return nil
}

func printVerifyReport(out io.Writer, rep *ingest.VerifyReport, project string) {
	mode := "REPORT ONLY (nothing changed; pass --repair to re-ingest the instances that lost objects)"
	if rep.Repaired {
		mode = "REPAIR"
	}
	_, _ = fmt.Fprintf(out, "Memory verify, project %s: %s\n\n", project, mode)

	w := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintln(w, "INSTANCE\tID\tSTATUS\tMANIFEST\tIN MEMORY\tMISSING\tEXTRA\tNOTE")
	for _, v := range rep.Instances {
		note := v.SkipReason
		if v.Error != "" {
			note = v.Error
		}
		_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%d\t%d\t%d\t%s\n", v.Name, v.InstanceID, v.Status, v.Manifest, v.InMemory, v.Missing, v.Extra, note)
	}
	_ = w.Flush()

	for _, v := range rep.Instances {
		if len(v.MissingSample) > 0 {
			_, _ = fmt.Fprintf(out, "\n%s: missing from Memory, for example %v\n", v.Name, v.MissingSample)
		}
		if len(v.ExtraSample) > 0 {
			_, _ = fmt.Fprintf(out, "\n%s: owned but outside its manifest, for example %v (memory sweep removes these)\n", v.Name, v.ExtraSample)
		}
	}
	if !rep.Repaired && rep.Unresolved() > 0 {
		_, _ = fmt.Fprintf(out, "\nRun again with --repair to re-ingest the instances that are missing objects.\n")
	}
}

// newMemoryService builds the ingest service the memory commands use. It is
// wired like the server's: without the exporter a re-ingest writes the artifact
// layer only and the instance's manifest shrinks to it.
func newMemoryService(db *bun.DB, client *memory.Client) *ingest.Service {
	return newImportIngester(db, client)
}
