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
	Action             string   `json:"action"` // "none", "synced", "skipped"
	MissingObjectTypes []string `json:"missing_object_types,omitempty"`
	ObjectTypesPresent int      `json:"object_types_present"`
	ObjectTypesNeeded  int      `json:"object_types_needed"`
	Message            string   `json:"message"`
}

// Reconcile ensures the Memory project has all object types that the
// decomposer needs. It compares the Go-defined types against the project's
// compiled type registry and installs any missing types.
//
// epf-cli owns the schema. Memory is the semantic store. If types are
// missing, epf-cli pushes them via the schema API (the only mechanism
// Memory exposes for registering types). This is an implementation detail
// -- we don't track schema versions or names.
//
// Relationship types are not checked because the Memory API does not
// enforce them (compiled-types only returns object types).
//
// Reconciliation is additive-only and idempotent.
func Reconcile(ctx context.Context, client *memory.Client) (*ReconcileResult, error) {
	expectedTypes := decompose.ObjectTypes()

	result := &ReconcileResult{
		ObjectTypesNeeded: len(expectedTypes),
	}

	// Get compiled types to see what object types exist
	compiled, err := client.GetCompiledTypes(ctx)
	if err != nil {
		log.Printf("[reconcile] Could not get compiled types: %v (will attempt install)", err)
		// Can't check — fall through to install all types
	}

	if compiled != nil {
		result.ObjectTypesPresent = len(compiled.ObjectTypes)

		existing := map[string]bool{}
		for _, t := range compiled.ObjectTypes {
			existing[t.Name] = true
		}

		for _, t := range expectedTypes {
			if !existing[t.Name] {
				result.MissingObjectTypes = append(result.MissingObjectTypes, t.Name)
			}
		}

		if len(result.MissingObjectTypes) == 0 {
			result.Action = "none"
			result.Message = fmt.Sprintf("All %d object types present", len(expectedTypes))
			log.Printf("[reconcile] %s", result.Message)
			return result, nil
		}

		log.Printf("[reconcile] Missing %d object types: %v", len(result.MissingObjectTypes), result.MissingObjectTypes)
	}

	// Push type definitions via the schema API with merge.
	// This is idempotent — existing types are unchanged, missing ones are added.
	pack := decompose.GenerateTemplatePack()
	packJSON, err := json.MarshalIndent(pack, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("reconcile: marshal types: %w", err)
	}

	if err := client.InstallSchemaFromJSON(ctx, packJSON, true); err != nil {
		return nil, fmt.Errorf("reconcile: push types: %w", err)
	}

	result.Action = "synced"
	result.Message = fmt.Sprintf("Pushed %d missing object types to Memory", len(result.MissingObjectTypes))
	log.Printf("[reconcile] %s", result.Message)
	return result, nil
}
