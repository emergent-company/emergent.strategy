package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"

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
	imp := cfg.Import

	// --- Open database ---
	db, err := database.Open(cfg)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer func() { _ = db.Close() }()

	// --- Parse the EPF instance YAML files from disk ---
	slog.Info("scanning EPF instance", "path", imp.InstancePath)
	payloads, productName, err := epfimport.ScanDirectory(imp.InstancePath)
	if err != nil {
		return fmt.Errorf("scan instance: %w", err)
	}
	slog.Info("scan complete", "artifact_count", len(payloads), "product_name", productName)

	// --- Prepare context (audit + auth) ---
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceImport)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
	// CLI import: no user actor; leave actor as nil (system operation)

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

	// --- Determine instance name ---
	instanceName := imp.InstanceName
	if instanceName == "" {
		instanceName = productName
	}
	if instanceName == "" {
		instanceName = filepath.Base(filepath.Clean(imp.InstancePath))
	}

	// --- Import the instance (upsert: reuse existing if name+workspace match) ---
	// No notifier: the CLI only marks the instance dirty. A running server's
	// heartbeat picks it up, and --reingest ingests it directly below.
	changeMarker := changemark.New(db)
	instSvc := instance.NewService(db).WithChangeMarker(changeMarker)

	// Check for an existing active instance with the same name in this workspace.
	var existingInst domain.StrategyInstance
	existingErr := db.NewSelect().
		Model(&existingInst).
		Where("workspace_id = ?", ws.ID).
		Where("name = ?", instanceName).
		Where("deleted_at IS NULL").
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx)

	var inst *domain.StrategyInstance
	if existingErr == nil {
		// Re-import into the existing instance: replace its artifacts.
		slog.Info("instance already exists — re-importing artifacts",
			"name", existingInst.Name, "instance_id", existingInst.ID)
		if err := instSvc.ReimportArtifacts(ctx, existingInst.ID, payloads); err != nil {
			return fmt.Errorf("replace artifacts: %w", err)
		}
		inst = &existingInst
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

		authMode := memory.AuthModeAPIKey
		if cfg.MemoryAuthMode == "bearer" {
			authMode = memory.AuthModeBearer
		}
		memClient, err := memory.New(memory.Config{
			BaseURL:   cfg.MemoryURL,
			ProjectID: cfg.MemoryProject,
			Token:     cfg.MemoryToken,
			AuthMode:  authMode,
		})
		if err != nil {
			slog.Warn("ingest: failed to create Memory client, skipping", "err", err)
		} else if err := newImportIngester(db, memClient).ReingestInstance(ctx, inst.ID); err != nil {
			slog.Warn("ingest: Memory graph is not up to date; the instance stays dirty and a running server retries", "err", err)
		}
	}

	slog.Info("import complete", "instance_id", inst.ID)
	return nil
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
