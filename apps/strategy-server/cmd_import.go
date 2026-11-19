package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	strategysvc "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/epfimport"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// runImport executes the import subcommand: reads a local EPF instance directory,
// converts all YAML artifacts to JSON payloads, and seeds them into the database
// as an initial batch of committed mutations under a (created-if-needed) workspace.
func runImport(cfg *config.Config) error {
	// --- Open database ---
	db, err := database.Open(cfg)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer func() { _ = db.Close() }()

	return importInstance(context.Background(), db, cfg, os.Stdout)
}

// importInstance runs the import against db. With --dry-run it only reports what
// the import would do. A re-import replaces every artifact and deletes every
// mutation of the existing instance, so it refuses, unless --force is set, when
// that would discard edits made on the server or staged changes.
func importInstance(ctx context.Context, db *bun.DB, cfg *config.Config, out io.Writer) error {
	imp := cfg.Import

	// --- Parse the EPF instance YAML files from disk ---
	slog.Info("scanning EPF instance", "path", imp.InstancePath)
	payloads, productName, err := epfimport.ScanDirectory(imp.InstancePath)
	if err != nil {
		return fmt.Errorf("scan instance: %w", err)
	}
	slog.Info("scan complete", "artifact_count", len(payloads), "product_name", productName)

	// --- Determine instance name ---
	instanceName := imp.InstanceName
	if instanceName == "" {
		instanceName = productName
	}
	if instanceName == "" {
		instanceName = filepath.Base(filepath.Clean(imp.InstancePath))
	}

	// --- Prepare context (audit + auth) ---
	ctx = audit.ContextWithSource(ctx, audit.SourceImport)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
	// CLI import: no user actor; leave actor as nil (system operation)

	if imp.DryRun {
		return previewImport(ctx, db, *imp, instanceName, payloads, out)
	}

	// --- Resolve org ownership ---
	orgSvc := org.NewService(db)
	resolvedOrg, err := resolveImportOrg(ctx, orgSvc, *imp, payloads)
	if err != nil {
		return fmt.Errorf("resolve org: %w", err)
	}
	slog.Info("org resolved", "org_name", resolvedOrg.Name, "org_id", resolvedOrg.ID)

	// --- Ensure workspace exists ---
	wsSvc := workspace.NewService(db)
	ws, err := ensureWorkspace(ctx, wsSvc, imp.GithubOwner, resolvedOrg.ID)
	if err != nil {
		return fmt.Errorf("ensure workspace: %w", err)
	}
	slog.Info("workspace resolved", "github_owner", ws.GithubOwner, "workspace_id", ws.ID)

	// --- Import the instance (upsert: reuse existing if name+workspace match) ---
	// No notifier: the CLI only marks the instance dirty. A running server's
	// heartbeat picks it up, and --reingest ingests it directly below.
	changeMarker := changemark.New(db)
	instSvc := instance.NewService(db).WithChangeMarker(changeMarker)

	// Check for an existing active instance with the same name in this workspace.
	existingInst, err := instSvc.FindActiveByName(ctx, ws.ID, instanceName)
	if err != nil {
		return err
	}

	var inst *domain.StrategyInstance
	if existingInst != nil {
		// Re-import into the existing instance: replace its artifacts.
		slog.Info("instance already exists — re-importing artifacts",
			"name", existingInst.Name, "instance_id", existingInst.ID)
		diff, err := instSvc.PreviewReimport(ctx, existingInst.ID, payloads)
		if err != nil {
			return fmt.Errorf("compare with the instance: %w", err)
		}
		if diff.WouldLoseWork() && !imp.Force {
			return reimportRefusal(existingInst.Name, diff)
		}
		if err := instSvc.ReimportArtifacts(ctx, existingInst.ID, payloads); err != nil {
			return fmt.Errorf("replace artifacts: %w", err)
		}
		inst = existingInst
		slog.Info("artifacts replaced", "instance_id", inst.ID)
	} else {
		var err error
		inst, err = instSvc.ImportInstance(ctx, instance.ImportParams{
			WorkspaceID:     ws.ID,
			Name:            instanceName,
			InitialPayloads: payloads,
		})
		if err != nil {
			return fmt.Errorf("import instance: %w", err)
		}
		slog.Info("instance imported", "name", inst.Name, "instance_id", inst.ID)
	}

	// --- Backfill Strategic Index ---
	// ImportInstance inserts mutations as committed directly (bypassing CommitBatch),
	// so we must run the backfill explicitly to populate strategy_artifacts and
	// strategy_relationships from the imported mutations.
	slog.Info("deriving strategic index")
	stratSvc := strategysvc.NewService(db).WithChangeMarker(changeMarker)
	indexed, err := stratSvc.BackfillIndex(ctx, inst.ID)
	if err != nil {
		return fmt.Errorf("backfill index: %w", err)
	}
	slog.Info("index derived", "artifact_count", indexed)

	// --- Optionally activate ---
	if imp.Activate {
		if err := instSvc.ActivateInstance(ctx, inst.ID); err != nil {
			return fmt.Errorf("activate instance: %w", err)
		}
		slog.Info("instance activated")
	}

	// --- Optionally ingest into Memory graph ---
	if imp.Reingest && cfg.MemoryConfigured() {
		slog.Info("ingesting into Memory graph (artifact + decomposed layers)")

		memClient, err := newMemoryClient(cfg)
		if err != nil {
			slog.Warn("ingest: failed to create Memory client, skipping", "err", err)
		} else if err := newImportIngester(db, memClient).ReingestInstance(ctx, inst.ID); err != nil {
			slog.Warn("ingest: Memory graph is not up to date; the instance stays dirty and a running server retries", "err", err)
		}
	}

	slog.Info("import complete", "instance_id", inst.ID)
	return nil
}

// previewImport reports what the import would do and writes nothing: it does
// not create the org, the workspace or the instance either.
func previewImport(ctx context.Context, db *bun.DB, imp config.ImportCmd, instanceName string, payloads map[string]any, out io.Writer) error {
	ws, err := workspace.NewService(db).GetWorkspaceByOwner(ctx, imp.GithubOwner)
	if err != nil && !errors.Is(err, apperror.ErrWorkspaceNotFound) {
		return fmt.Errorf("look up workspace: %w", err)
	}

	var existing *domain.StrategyInstance
	if err == nil {
		existing, err = instance.NewService(db).FindActiveByName(ctx, ws.ID, instanceName)
		if err != nil {
			return err
		}
	}

	_, _ = fmt.Fprintln(out, "Dry run: nothing was written.")
	if existing == nil {
		_, _ = fmt.Fprintf(out, "%q is a new instance in workspace %q with %d artifacts.\n", instanceName, imp.GithubOwner, len(payloads))
		return nil
	}

	diff, err := instance.NewService(db).PreviewReimport(ctx, existing.ID, payloads)
	if err != nil {
		return fmt.Errorf("compare with the instance: %w", err)
	}
	writeImportDiff(out, existing, diff)
	return nil
}

const maxListed = 50

func writeImportDiff(out io.Writer, inst *domain.StrategyInstance, d *instance.ImportDiff) {
	_, _ = fmt.Fprintf(out, "Instance %q (%s) exists. A re-import replaces all of its artifacts:\n", inst.Name, inst.ID)
	_, _ = fmt.Fprintf(out, "  %d added, %d changed, %d removed, %d unchanged\n", len(d.Added), len(d.Changed), len(d.Removed), d.Unchanged)
	for _, section := range []struct {
		title string
		keys  []string
	}{{"Added", d.Added}, {"Changed", d.Changed}, {"Removed", d.Removed}} {
		if len(section.keys) == 0 {
			continue
		}
		_, _ = fmt.Fprintf(out, "%s:\n", section.title)
		for i, k := range section.keys {
			if i == maxListed {
				_, _ = fmt.Fprintf(out, "  and %d more\n", len(section.keys)-maxListed)
				break
			}
			_, _ = fmt.Fprintf(out, "  %s\n", k)
		}
	}
	if d.WouldLoseWork() {
		_, _ = fmt.Fprintln(out, "A re-import would discard work that did not come from an import (it needs --force):")
		if len(d.Lost) > 0 {
			_, _ = fmt.Fprintf(out, "  %d artifacts edited or created on the server: %s\n", len(d.Lost), strings.Join(firstN(d.Lost, 10), ", "))
		}
		if d.StagedMutations > 0 {
			_, _ = fmt.Fprintf(out, "  %d staged mutations\n", d.StagedMutations)
		}
	}
}

// reimportRefusal is the error returned when a re-import would discard work
// that did not come from an import.
func reimportRefusal(name string, d *instance.ImportDiff) error {
	var what []string
	if len(d.Lost) > 0 {
		what = append(what, fmt.Sprintf("%d artifacts edited or created on the server (%s)", len(d.Lost), strings.Join(firstN(d.Lost, 5), ", ")))
	}
	if d.StagedMutations > 0 {
		what = append(what, fmt.Sprintf("%d staged mutations", d.StagedMutations))
	}
	return fmt.Errorf("refusing to re-import %q: it would discard %s. Run with --dry-run to see the full difference, or with --force to discard them",
		name, strings.Join(what, " and "))
}

func firstN(items []string, n int) []string {
	if len(items) <= n {
		return items
	}
	return append(append([]string{}, items[:n]...), fmt.Sprintf("and %d more", len(items)-n))
}

// ensureWorkspace returns the workspace for githubOwner, creating it if it does not exist.
func ensureWorkspace(ctx context.Context, svc *workspace.Service, githubOwner string, orgID uuid.UUID) (*domain.Workspace, error) {
	ws, err := svc.CreateWorkspace(ctx, githubOwner, nil, orgID)
	if err == nil {
		return ws, nil
	}
	if !errors.Is(err, apperror.ErrWorkspaceConflict) {
		return nil, err
	}
	// Workspace already exists — find it by github_owner.
	return svc.GetWorkspaceByOwner(ctx, githubOwner)
}

// resolveImportOrg determines which org to link the import to.
// Resolution chain: --org flag > north_star.organization > workspace github_owner.
func resolveImportOrg(ctx context.Context, orgSvc *org.Service, imp config.ImportCmd, payloads map[string]any) (*domain.Org, error) {
	// System actor for CLI import — use a nil-safe UUID.
	callerID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	// 1. Explicit --org flag (name or UUID).
	if imp.Org != "" {
		// Try parsing as UUID first.
		if id, err := uuid.Parse(imp.Org); err == nil {
			return orgSvc.GetByID(ctx, id)
		}
		// Otherwise treat as org name.
		p := org.CreateParams{
			Name:      imp.Org,
			OrgNumber: imp.OrgNumber,
			Country:   imp.Country,
		}
		return orgSvc.GetOrCreateWithParams(ctx, p, callerID)
	}

	// 2. Extract from north_star.organization in payloads.
	if orgName := extractNorthStarOrg(payloads); orgName != "" {
		slog.Info("extracted org name from north_star", "org_name", orgName)
		p := org.CreateParams{
			Name:      orgName,
			OrgNumber: imp.OrgNumber,
			Country:   imp.Country,
		}
		return orgSvc.GetOrCreateWithParams(ctx, p, callerID)
	}

	// 3. Fallback to github_owner.
	return orgSvc.GetOrCreate(ctx, imp.GithubOwner, callerID)
}

// newImportIngester builds the ingest service the import command uses. It is
// wired like the server's, so an import writes the same stamped objects of both
// layers and records the same manifest.
func newImportIngester(db *bun.DB, client *memory.Client) *ingest.Service {
	svc := ingest.NewService(db, client)
	svc.SetExporter(&strategyExporterAdapter{svc: strategysvc.NewService(db)})
	return svc
}

// extractNorthStarOrg extracts the organization name from a north_star artifact payload.
func extractNorthStarOrg(payloads map[string]any) string {
	nsRaw, ok := payloads["north_star"]
	if !ok {
		return ""
	}
	nsMap, ok := nsRaw.(map[string]any)
	if !ok {
		return ""
	}
	// Try nested: north_star.organization
	if inner, ok := nsMap["north_star"].(map[string]any); ok {
		if name, ok := inner["organization"].(string); ok && name != "" {
			return name
		}
	}
	// Try flat: organization
	if name, ok := nsMap["organization"].(string); ok && name != "" {
		return name
	}
	return ""
}
