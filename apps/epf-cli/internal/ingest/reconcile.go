package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// ReconcileResult reports what the reconciliation did.
type ReconcileResult struct {
	InstalledSchemaName    string   `json:"installed_schema_name,omitempty"`
	InstalledSchemaVersion string   `json:"installed_schema_version,omitempty"`
	Action                 string   `json:"action"` // "none", "installed", "upgraded", "skipped"
	TypesExpected          int      `json:"types_expected"`
	TypesPresent           int      `json:"types_present"`
	TypesCreated           []string `json:"types_created,omitempty"`
	Message                string   `json:"message"`
}

// Reconcile ensures the Memory project has all types the decomposer needs.
// It checks what's installed, compares against the Go-defined types, and
// installs or upgrades the schema if needed.
//
// Reconciliation is additive-only — it never removes types.
// If the Memory API doesn't support schema management, it warns and continues.
func Reconcile(ctx context.Context, client *memory.Client) (*ReconcileResult, error) {
	result := &ReconcileResult{
		TypesExpected: len(decompose.ObjectTypes()),
	}

	// Check what schemas are installed
	installed, err := client.ListInstalledSchemas(ctx)
	if err != nil {
		// Schema API may not be available — degrade gracefully
		log.Printf("[reconcile] Schema management API unavailable: %v (continuing without reconciliation)", err)
		result.Action = "skipped"
		result.Message = fmt.Sprintf("Schema management API unavailable: %v", err)
		return result, nil
	}

	// Find the epf-engine schema among installed schemas
	var epfSchema *memory.InstalledSchema
	for i, s := range installed {
		if s.Name == "epf-engine" {
			epfSchema = &installed[i]
			break
		}
	}

	if epfSchema != nil {
		result.InstalledSchemaName = epfSchema.Name
		result.InstalledSchemaVersion = epfSchema.Version
	}

	// Check compiled types to see what's actually available
	compiled, err := client.GetCompiledTypes(ctx)
	if err != nil {
		log.Printf("[reconcile] Could not get compiled types: %v (will attempt install)", err)
	} else {
		result.TypesPresent = len(compiled.ObjectTypes)
	}

	// Determine if we need to install/upgrade
	expectedTypes := decompose.ObjectTypes()

	if compiled != nil {
		// Build a set of existing type names
		existing := map[string]bool{}
		for _, t := range compiled.ObjectTypes {
			existing[t.Name] = true
		}

		// Check if all expected types exist
		var missing []string
		for _, t := range expectedTypes {
			if !existing[t.Name] {
				missing = append(missing, t.Name)
			}
		}

		if len(missing) == 0 {
			// All types present — no action needed
			result.Action = "none"
			result.Message = fmt.Sprintf("All %d object types present in Memory project", len(expectedTypes))
			log.Printf("[reconcile] All %d types present — no schema changes needed", len(expectedTypes))
			return result, nil
		}

		result.TypesCreated = missing
		log.Printf("[reconcile] Missing %d types: %v — will install schema", len(missing), missing)
	}

	// Generate and install the template pack from Go definitions using --merge
	// Merge is additive-only — creates missing types, leaves existing ones unchanged.
	// No need to uninstall the old schema first.
	pack := decompose.GenerateTemplatePack()
	packJSON, err := json.MarshalIndent(pack, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("reconcile: marshal template pack: %w", err)
	}

	log.Printf("[reconcile] Installing epf-engine schema with --merge (%d object types, %d relationship types)",
		len(expectedTypes), len(decompose.RelationshipTypes()))

	if err := client.InstallSchemaFromJSON(ctx, packJSON, true); err != nil {
		return nil, fmt.Errorf("reconcile: install schema: %w", err)
	}

	if epfSchema != nil {
		result.Action = "upgraded"
		result.Message = fmt.Sprintf("Schema upgraded: epf-engine v%s → v2.1.0 (%d object types, %d relationship types)",
			epfSchema.Version, len(expectedTypes), len(decompose.RelationshipTypes()))
	} else {
		result.Action = "installed"
		result.Message = fmt.Sprintf("Schema installed: epf-engine v2.1.0 (%d object types, %d relationship types)",
			len(expectedTypes), len(decompose.RelationshipTypes()))
	}

	log.Printf("[reconcile] %s", result.Message)
	return result, nil
}
