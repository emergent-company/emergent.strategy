// Package ingest pushes decomposed EPF artifacts into emergent.memory.
//
// The pipeline: decompose (YAML → objects + relationship specs) → ingest (objects → Memory API).
//
// Ingestion is idempotent — it uses upsert-by-key, so re-running produces
// the same graph state. Relationships are resolved by matching object keys
// to the IDs returned from upsert.
package ingest

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// Stats tracks ingestion metrics.
type Stats struct {
	ObjectsUpserted      int
	ObjectsFailed        int
	RelationshipsCreated int
	RelationshipsFailed  int
	RelationshipsSkipped int // from/to key not resolved
	Duration             time.Duration
	Warnings             []string
}

// Ingester pushes decomposition results into emergent.memory.
type Ingester struct {
	client *memory.Client
}

// New creates an Ingester with the given Memory API client.
func New(client *memory.Client) *Ingester {
	return &Ingester{client: client}
}

// Ingest decomposes an EPF instance and pushes everything to Memory.
// This is the main entry point — it runs the full pipeline.
func (ing *Ingester) Ingest(ctx context.Context, instancePath string) (*Stats, error) {
	stats := &Stats{}
	start := time.Now()

	// Step 1: Decompose
	dec := decompose.New(instancePath)
	result, err := dec.DecomposeInstance()
	if err != nil {
		return nil, fmt.Errorf("decompose: %w", err)
	}

	stats.Warnings = append(stats.Warnings, result.Warnings...)
	log.Printf("[ingest] Decomposed: %d objects, %d relationships", len(result.Objects), len(result.Relationships))

	// Step 2: Upsert objects
	keyToID := ing.upsertObjects(ctx, result.Objects, stats)
	log.Printf("[ingest] Upserted: %d succeeded, %d failed", stats.ObjectsUpserted, stats.ObjectsFailed)

	// Step 3: Create relationships
	ing.createRelationships(ctx, result.Relationships, keyToID, stats)
	log.Printf("[ingest] Relationships: %d created, %d failed, %d skipped (unresolved keys)",
		stats.RelationshipsCreated, stats.RelationshipsFailed, stats.RelationshipsSkipped)

	stats.Duration = time.Since(start)
	return stats, nil
}

// IngestResult pushes a pre-computed decomposition result to Memory.
// Use this when you already have the decomposition (e.g., from tests).
func (ing *Ingester) IngestResult(ctx context.Context, result *decompose.Result) (*Stats, error) {
	stats := &Stats{}
	start := time.Now()

	stats.Warnings = append(stats.Warnings, result.Warnings...)

	keyToID := ing.upsertObjects(ctx, result.Objects, stats)
	ing.createRelationships(ctx, result.Relationships, keyToID, stats)

	stats.Duration = time.Since(start)
	return stats, nil
}

// --- Internal ---

// upsertObjects pushes all objects to Memory and returns a key→ID map.
func (ing *Ingester) upsertObjects(ctx context.Context, objects []memory.UpsertObjectRequest, stats *Stats) map[string]string {
	keyToID := make(map[string]string, len(objects))

	for _, obj := range objects {
		resp, err := ing.client.UpsertObject(ctx, obj)
		if err != nil {
			stats.ObjectsFailed++
			stats.Warnings = append(stats.Warnings, fmt.Sprintf("upsert failed for %s/%s: %v", obj.Type, obj.Key, err))
			continue
		}
		keyToID[obj.Key] = resp.StableID()
		stats.ObjectsUpserted++
	}

	return keyToID
}

// createRelationships resolves relationship specs to IDs and creates them.
func (ing *Ingester) createRelationships(ctx context.Context, rels []decompose.RelationshipSpec, keyToID map[string]string, stats *Stats) {
	for _, rel := range rels {
		fromID, fromOK := keyToID[rel.FromKey]
		toID, toOK := keyToID[rel.ToKey]

		if !fromOK || !toOK {
			stats.RelationshipsSkipped++
			continue
		}

		_, err := ing.client.CreateRelationship(ctx, memory.CreateRelationshipRequest{
			Type:       rel.Type,
			FromID:     fromID,
			ToID:       toID,
			Properties: rel.Properties,
		})
		if err != nil {
			stats.RelationshipsFailed++
			stats.Warnings = append(stats.Warnings,
				fmt.Sprintf("relationship failed %s: %s → %s: %v", rel.Type, rel.FromKey, rel.ToKey, err))
			continue
		}
		stats.RelationshipsCreated++
	}
}
