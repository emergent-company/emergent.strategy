package schema_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

func TestImportFromEmbedded(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	// Import embedded schemas for the current version.
	version := svc.EmbeddedVersion()
	if version == "" {
		t.Fatal("embedded VERSION is empty")
	}

	n, err := svc.ImportFromEmbedded(ctx, version)
	if err != nil {
		t.Fatalf("ImportFromEmbedded: %v", err)
	}
	if n == 0 {
		t.Fatal("expected at least one schema imported")
	}
	t.Logf("imported %d schemas for version %s", n, version)

	// Second import should be idempotent (ON CONFLICT DO NOTHING).
	n2, err := svc.ImportFromEmbedded(ctx, version)
	if err != nil {
		t.Fatalf("second ImportFromEmbedded: %v", err)
	}
	if n2 != 0 {
		t.Errorf("expected 0 schemas on re-import, got %d", n2)
	}
}

func TestVersionExists(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()
	version := svc.EmbeddedVersion()

	// Before import.
	exists, err := svc.VersionExists(ctx, version)
	if err != nil {
		t.Fatalf("VersionExists: %v", err)
	}
	if exists {
		t.Error("version should not exist before import")
	}

	// After import.
	if _, err := svc.ImportFromEmbedded(ctx, version); err != nil {
		t.Fatalf("ImportFromEmbedded: %v", err)
	}

	exists, err = svc.VersionExists(ctx, version)
	if err != nil {
		t.Fatalf("VersionExists: %v", err)
	}
	if !exists {
		t.Error("version should exist after import")
	}
}

func TestLatestVersion(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	// Empty registry.
	_, ok, err := svc.LatestVersion(ctx)
	if err != nil {
		t.Fatalf("LatestVersion: %v", err)
	}
	if ok {
		t.Error("expected no latest version in empty registry")
	}

	// After import.
	version := svc.EmbeddedVersion()
	if _, err := svc.ImportFromEmbedded(ctx, version); err != nil {
		t.Fatalf("ImportFromEmbedded: %v", err)
	}

	latest, ok, err := svc.LatestVersion(ctx)
	if err != nil {
		t.Fatalf("LatestVersion: %v", err)
	}
	if !ok {
		t.Fatal("expected latest version after import")
	}
	if latest != version {
		t.Errorf("latest=%q, want %q", latest, version)
	}
}

func TestListVersions(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	version := svc.EmbeddedVersion()
	if _, err := svc.ImportFromEmbedded(ctx, version); err != nil {
		t.Fatalf("ImportFromEmbedded: %v", err)
	}

	versions, err := svc.ListVersions(ctx)
	if err != nil {
		t.Fatalf("ListVersions: %v", err)
	}
	if len(versions) != 1 {
		t.Fatalf("expected 1 version, got %d", len(versions))
	}
	if versions[0] != version {
		t.Errorf("versions[0]=%q, want %q", versions[0], version)
	}
}

func TestListSchemas(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	version := svc.EmbeddedVersion()
	if _, err := svc.ImportFromEmbedded(ctx, version); err != nil {
		t.Fatalf("ImportFromEmbedded: %v", err)
	}

	schemas, err := svc.ListSchemas(ctx, version, "standard")
	if err != nil {
		t.Fatalf("ListSchemas: %v", err)
	}
	if len(schemas) == 0 {
		t.Fatal("expected at least one schema listed")
	}
	t.Logf("listed %d schemas for version %s", len(schemas), version)
}

func TestGetSchema_DBLookup(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	version := svc.EmbeddedVersion()
	if _, err := svc.ImportFromEmbedded(ctx, version); err != nil {
		t.Fatalf("ImportFromEmbedded: %v", err)
	}

	// Should resolve from DB (tier 1: exact match).
	content, err := svc.GetSchema(ctx, version, "standard", "feature_definition_schema.json")
	if err != nil {
		t.Fatalf("GetSchema (DB exact): %v", err)
	}
	if len(content) == 0 {
		t.Fatal("expected non-empty schema content")
	}

	// Compare with embedded version — should be semantically identical.
	// Note: JSONB round-trip normalizes whitespace, so compare parsed JSON.
	embeddedContent, err := embedded.GetSchema("feature_definition_schema.json")
	if err != nil {
		t.Fatalf("GetSchema (embedded): %v", err)
	}
	var dbParsed, embParsed any
	if err := json.Unmarshal(content, &dbParsed); err != nil {
		t.Fatalf("unmarshal DB content: %v", err)
	}
	if err := json.Unmarshal(embeddedContent, &embParsed); err != nil {
		t.Fatalf("unmarshal embedded content: %v", err)
	}
	dbNorm, _ := json.Marshal(dbParsed)
	embNorm, _ := json.Marshal(embParsed)
	if string(dbNorm) != string(embNorm) {
		t.Error("DB schema content semantically differs from embedded content")
	}
}

func TestGetSchema_EmbeddedFallback(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	// Empty registry — should fall through to embedded.
	content, err := svc.GetSchema(ctx, "nonexistent", "standard", "feature_definition_schema.json")
	if err != nil {
		t.Fatalf("GetSchema (embedded fallback): %v", err)
	}
	if len(content) == 0 {
		t.Fatal("expected non-empty schema content from embedded fallback")
	}
}

func TestGetSchema_LatestFallback(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	version := svc.EmbeddedVersion()
	if _, err := svc.ImportFromEmbedded(ctx, version); err != nil {
		t.Fatalf("ImportFromEmbedded: %v", err)
	}

	// Ask for a different version — should fall to tier 2 (latest standard in DB).
	content, err := svc.GetSchema(ctx, "99.99.99", "standard", "feature_definition_schema.json")
	if err != nil {
		t.Fatalf("GetSchema (latest fallback): %v", err)
	}
	if len(content) == 0 {
		t.Fatal("expected non-empty schema content from latest fallback")
	}
}

func TestEnsureImported(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	// First call should import.
	if err := svc.EnsureImported(ctx); err != nil {
		t.Fatalf("EnsureImported (first): %v", err)
	}

	// Second call should be a no-op.
	if err := svc.EnsureImported(ctx); err != nil {
		t.Fatalf("EnsureImported (second): %v", err)
	}

	// Verify schemas are in the registry.
	version := svc.EmbeddedVersion()
	exists, err := svc.VersionExists(ctx, version)
	if err != nil {
		t.Fatalf("VersionExists: %v", err)
	}
	if !exists {
		t.Error("expected schemas to be in registry after EnsureImported")
	}
}

func TestRegistrySchemaSource(t *testing.T) {
	db := database.TestDB(t)
	svc := schema.NewService(db)
	ctx := context.Background()

	version := svc.EmbeddedVersion()
	if _, err := svc.ImportFromEmbedded(ctx, version); err != nil {
		t.Fatalf("ImportFromEmbedded: %v", err)
	}

	// Create a RegistrySchemaSource and use it with the validator.
	source := schema.NewRegistrySchemaSource(ctx, svc, version, "standard")

	// Validate a feature payload using the registry source.
	payload := []byte(`{
		"id": "fd-test",
		"name": "Test Feature",
		"status": "proposed",
		"strategic_context": {"tracks": ["product"]},
		"definition": {"problem_statement": "test problem"}
	}`)
	result := embedded.ValidateArtifactWithSource("feature", payload, source)
	// The validation result depends on schema strictness, but it should not error on loading.
	if result.SchemaFile == "" {
		t.Error("expected schema_file to be populated")
	}
	t.Logf("validation result: valid=%v errors=%v", result.Valid, result.Errors)
}
