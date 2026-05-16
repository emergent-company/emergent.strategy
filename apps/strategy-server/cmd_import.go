package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	strategysvc "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
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
	payloads, productName, err := scanEPFInstance(imp.InstancePath)
	if err != nil {
		return fmt.Errorf("scan instance: %w", err)
	}
	slog.Info("scan complete", "artifact_count", len(payloads), "product_name", productName)

	// --- Prepare context (audit + auth) ---
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceImport)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
	// CLI import: no user actor; leave actor as nil (system operation)

	// --- Ensure workspace exists ---
	wsSvc := workspace.NewService(db)
	ws, err := ensureWorkspace(ctx, wsSvc, imp.GithubOwner)
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

	// --- Import the instance ---
	instSvc := instance.NewService(db)
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID:     ws.ID,
		Name:            instanceName,
		InitialPayloads: payloads,
	})
	if err != nil {
		return fmt.Errorf("import instance: %w", err)
	}
	slog.Info("instance imported", "name", inst.Name, "instance_id", inst.ID)

	// --- Backfill Strategic Index ---
	// ImportInstance inserts mutations as committed directly (bypassing CommitBatch),
	// so we must run the backfill explicitly to populate strategy_artifacts and
	// strategy_relationships from the imported mutations.
	slog.Info("deriving strategic index")
	stratSvc := strategysvc.NewService(db)
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
		slog.Info("ingesting artifacts into Memory graph")

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
		} else {
			ingestSvc := ingest.NewService(db, memClient)
			if err := ingestSvc.ReingestInstance(ctx, inst.ID); err != nil {
				slog.Warn("ingest: re-ingest failed", "err", err)
			} else {
				slog.Info("ingest: complete")
			}
		}
	}

	slog.Info("import complete", "instance_id", inst.ID)
	return nil
}

// ensureWorkspace returns the workspace for githubOwner, creating it if it does not exist.
func ensureWorkspace(ctx context.Context, svc *workspace.Service, githubOwner string) (*domain.Workspace, error) {
	ws, err := svc.CreateWorkspace(ctx, githubOwner, nil)
	if err == nil {
		return ws, nil
	}
	if !errors.Is(err, apperror.ErrWorkspaceConflict) {
		return nil, err
	}
	// Workspace already exists — find it by github_owner.
	return svc.GetWorkspaceByOwner(ctx, githubOwner)
}

// scanEPFInstance walks an EPF instance directory, reads all YAML files, and
// returns a map of artifact_key → parsed payload (map[string]any).
// It also extracts the product name from _meta.yaml or _epf.yaml if present.
func scanEPFInstance(instancePath string) (map[string]any, string, error) {
	abs, err := filepath.Abs(instancePath)
	if err != nil {
		return nil, "", fmt.Errorf("resolve absolute path %q: %w", instancePath, err)
	}

	payloads := make(map[string]any)
	var productName string

	err = filepath.WalkDir(abs, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(d.Name(), ".yaml") && !strings.HasSuffix(d.Name(), ".yml") {
			return nil
		}

		rel, relErr := filepath.Rel(abs, path)
		if relErr != nil {
			rel = path
		}
		rel = filepath.ToSlash(rel)

		name, raw, skip, walkErr := processYAMLFile(path, d.Name(), rel, &productName)
		if walkErr != nil {
			return walkErr
		}
		if skip {
			return nil
		}
		payloads[name] = raw
		return nil
	})
	if err != nil {
		return nil, "", err
	}

	return payloads, productName, nil
}

// processYAMLFile reads and parses a single YAML file, returning its artifact key and payload.
// Returns skip=true for metadata files or unparseable content.
func processYAMLFile(path, filename, relPath string, productName *string) (string, map[string]any, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", nil, false, fmt.Errorf("read %s: %w", path, err)
	}

	var rawAny any
	if err := yaml.Unmarshal(data, &rawAny); err != nil {
		slog.Warn("skip unparseable YAML file", "path", path, "err", err)
		return "", nil, true, nil
	}
	normalized := normalizeYAML(rawAny)
	raw, ok := normalized.(map[string]any)
	if !ok || len(raw) == 0 {
		return "", nil, true, nil
	}

	// Extract product name from metadata files; do not store them as artifacts.
	if filename == "_meta.yaml" || filename == "_epf.yaml" {
		if name, ok := extractProductName(raw); ok && *productName == "" {
			*productName = name
		}
		return "", nil, true, nil
	}

	key := artifactKey(relPath, filename)
	return key, raw, false, nil
}

// artifactKey derives a stable artifact key from the file's path and name.
// Well-known READY phase filenames are normalised; FIRE feature definitions use
// their fd-* ID; everything else uses the slash-separated relative path.
func artifactKey(relPath, name string) string {
	// Strip extension.
	base := strings.TrimSuffix(name, filepath.Ext(name))

	switch base {
	case "00_north_star", "north_star":
		return "north_star"
	case "01_insight_analyses", "insight_analyses":
		return "insight_analyses"
	case "02_strategy_foundations", "strategy_foundations":
		return "strategy_foundations"
	case "03_insight_opportunity", "insight_opportunity":
		return "insight_opportunity"
	case "04_strategy_formula", "strategy_formula":
		return "strategy_formula"
	case "05_roadmap_recipe", "roadmap_recipe":
		return "roadmap_recipe"
	case "assessment_report":
		return "assessment_report"
	case "calibration_memo":
		return "calibration_memo"
	case "mappings":
		return "mappings"
	}

	// Feature definitions: fd-NNN.yaml → fd-NNN
	if strings.HasPrefix(base, "fd-") {
		return base
	}

	// Value models: use track name from path segment
	if strings.Contains(relPath, "value_models/") {
		return "value_model_" + base
	}

	// Default: slash path without extension
	ext := filepath.Ext(relPath)
	return strings.TrimSuffix(relPath, ext)
}

// normalizeYAML recursively converts yaml.v3 map[interface{}]interface{} values
// (which occur when YAML keys are not strings) into map[string]any so they can
// be JSON-marshalled without error.
func normalizeYAML(v any) any {
	switch val := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, vv := range val {
			out[k] = normalizeYAML(vv)
		}
		return out
	case map[interface{}]interface{}:
		out := make(map[string]any, len(val))
		for k, vv := range val {
			out[fmt.Sprintf("%v", k)] = normalizeYAML(vv)
		}
		return out
	case []any:
		for i, item := range val {
			val[i] = normalizeYAML(item)
		}
		return val
	default:
		return val
	}
}

// extractProductName pulls the product name from a _meta.yaml or _epf.yaml map.
func extractProductName(raw map[string]any) (string, bool) {
	for _, key := range []string{"product_name", "product", "name"} {
		if v, ok := raw[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s, true
			}
		}
	}
	return "", false
}
