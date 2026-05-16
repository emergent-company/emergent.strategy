// Package schema provides the runtime schema registry — a DB-backed store of
// EPF JSON schemas with embedded filesystem fallback.
//
// Lookup order:
//  1. DB exact version + dialect + schema_name
//  2. DB latest version + "standard" dialect + schema_name
//  3. Embedded filesystem (go:embed)
package schema

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// Service manages the schema registry.
type Service struct {
	db *bun.DB
}

// NewService creates a new schema registry Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// GetSchema returns the raw JSON Schema bytes for the given parameters.
// It follows the three-tier lookup order defined in the package doc.
func (s *Service) GetSchema(ctx context.Context, version, dialect, schemaName string) ([]byte, error) {
	// Tier 1: exact match in DB.
	if version != "" {
		content, err := s.getFromDB(ctx, version, dialect, schemaName)
		if err == nil {
			return content, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("schema registry lookup: %w", err)
		}
	}

	// Tier 2: latest version + standard dialect in DB.
	content, err := s.getLatestFromDB(ctx, schemaName)
	if err == nil {
		return content, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("schema registry latest lookup: %w", err)
	}

	// Tier 3: embedded fallback.
	return embedded.GetSchema(schemaName)
}

// GetSchemaEmbeddedOnly returns the schema from the embedded filesystem only.
// Useful when the caller explicitly wants the compiled-in version.
func (s *Service) GetSchemaEmbeddedOnly(schemaName string) ([]byte, error) {
	return embedded.GetSchema(schemaName)
}

// ImportFromEmbedded bulk-inserts all embedded schemas into the registry for
// the given version with dialect "standard". Existing entries for the same
// (version, dialect, schema_name) are skipped via ON CONFLICT DO NOTHING.
func (s *Service) ImportFromEmbedded(ctx context.Context, version string) (int, error) {
	schemas, err := embedded.ListSchemas()
	if err != nil {
		return 0, fmt.Errorf("list embedded schemas: %w", err)
	}

	var entries []domain.SchemaRegistryEntry
	for _, name := range schemas {
		content, err := embedded.GetSchema(name)
		if err != nil {
			slog.Warn("skipping embedded schema", "name", name, "error", err)
			continue
		}
		entries = append(entries, domain.SchemaRegistryEntry{
			ID:         uuid.New(),
			Version:    version,
			Dialect:    "standard",
			SchemaName: name,
			Content:    json.RawMessage(content),
		})
	}

	if len(entries) == 0 {
		return 0, nil
	}

	res, err := s.db.NewInsert().
		Model(&entries).
		On("CONFLICT (version, dialect, schema_name) DO NOTHING").
		Exec(ctx)
	if err != nil {
		return 0, fmt.Errorf("import embedded schemas: %w", err)
	}

	n, _ := res.RowsAffected()
	return int(n), nil
}

// VersionExists checks whether schemas for the given version exist in the registry.
func (s *Service) VersionExists(ctx context.Context, version string) (bool, error) {
	count, err := s.db.NewSelect().
		Model((*domain.SchemaRegistryEntry)(nil)).
		Where("version = ?", version).
		Limit(1).
		Count(ctx)
	if err != nil {
		return false, fmt.Errorf("check version exists: %w", err)
	}
	return count > 0, nil
}

// LatestVersion returns the highest registered version string in the registry,
// or ("", false) if the registry is empty.
func (s *Service) LatestVersion(ctx context.Context) (string, bool, error) {
	var version string
	err := s.db.NewSelect().
		Model((*domain.SchemaRegistryEntry)(nil)).
		ColumnExpr("version").
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx, &version)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("latest version: %w", err)
	}
	return version, true, nil
}

// ListVersions returns all distinct version strings in the registry.
func (s *Service) ListVersions(ctx context.Context) ([]string, error) {
	var versions []string
	err := s.db.NewSelect().
		Model((*domain.SchemaRegistryEntry)(nil)).
		ColumnExpr("DISTINCT version").
		OrderExpr("version ASC").
		Scan(ctx, &versions)
	if err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}
	return versions, nil
}

// ListSchemas returns all schema names registered for a given version and dialect.
func (s *Service) ListSchemas(ctx context.Context, version, dialect string) ([]string, error) {
	var names []string
	err := s.db.NewSelect().
		Model((*domain.SchemaRegistryEntry)(nil)).
		ColumnExpr("schema_name").
		Where("version = ? AND dialect = ?", version, dialect).
		OrderExpr("schema_name ASC").
		Scan(ctx, &names)
	if err != nil {
		return nil, fmt.Errorf("list schemas: %w", err)
	}
	return names, nil
}

// EmbeddedVersion returns the version string from the embedded VERSION file
// with whitespace trimmed.
func (s *Service) EmbeddedVersion() string {
	return strings.TrimSpace(embedded.Version)
}

// EnsureImported checks whether the current embedded version is registered in
// the DB and imports it if not. Called on server startup.
func (s *Service) EnsureImported(ctx context.Context) error {
	version := s.EmbeddedVersion()
	if version == "" {
		slog.Warn("embedded VERSION is empty; skipping schema auto-import")
		return nil
	}

	exists, err := s.VersionExists(ctx, version)
	if err != nil {
		return err
	}
	if exists {
		slog.Info("schema registry already has embedded version", "version", version)
		return nil
	}

	n, err := s.ImportFromEmbedded(ctx, version)
	if err != nil {
		return fmt.Errorf("auto-import embedded schemas: %w", err)
	}
	slog.Info("auto-imported embedded schemas into registry", "version", version, "count", n)
	return nil
}

// ---------------------------------------------------------------------------
// Internal DB queries
// ---------------------------------------------------------------------------

func (s *Service) getFromDB(ctx context.Context, version, dialect, schemaName string) ([]byte, error) {
	var entry domain.SchemaRegistryEntry
	err := s.db.NewSelect().
		Model(&entry).
		Where("version = ? AND dialect = ? AND schema_name = ?", version, dialect, schemaName).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return entry.Content, nil
}

func (s *Service) getLatestFromDB(ctx context.Context, schemaName string) ([]byte, error) {
	var entry domain.SchemaRegistryEntry
	err := s.db.NewSelect().
		Model(&entry).
		Where("dialect = ? AND schema_name = ?", "standard", schemaName).
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return entry.Content, nil
}
