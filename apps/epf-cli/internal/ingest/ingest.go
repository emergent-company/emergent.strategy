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

	// Step 0: Reconcile schema — ensure Memory has all types the decomposer needs
	reconcileResult, err := Reconcile(ctx, ing.client)
	if err != nil {
		log.Printf("[ingest] WARNING: Schema reconciliation failed: %v (continuing anyway)", err)
		stats.Warnings = append(stats.Warnings, fmt.Sprintf("schema reconciliation failed: %v", err))
	} else if reconcileResult.Action != "none" && reconcileResult.Action != "skipped" {
		log.Printf("[ingest] %s", reconcileResult.Message)
	}

	// Step 1: Decompose
	dec := decompose.New(instancePath)
	result, err := dec.DecomposeInstance()
	if err != nil {
		return nil, fmt.Errorf("decompose: %w", err)
	}

	stats.Warnings = append(stats.Warnings, result.Warnings...)
	log.Printf("[ingest] Decomposed: %d objects, %d relationships", len(result.Objects), len(result.Relationships))
	if len(result.EvidenceDocuments) > 0 {
		log.Printf("[ingest] Found %d evidence documents in AIM/evidence/", len(result.EvidenceDocuments))
	}

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

	// Use batch subgraph API for full ingest — much faster than individual upserts.
	// Falls back to individual upserts if batch fails.
	err := ing.batchIngest(ctx, result.Objects, result.Relationships, stats)
	if err != nil {
		log.Printf("[ingest] Batch ingest failed: %v — falling back to individual upserts", err)
		stats.Warnings = append(stats.Warnings, fmt.Sprintf("batch ingest failed, using fallback: %v", err))
		// Reset counts from failed batch attempt
		stats.ObjectsUpserted = 0
		stats.ObjectsFailed = 0
		stats.RelationshipsCreated = 0
		stats.RelationshipsFailed = 0
		stats.RelationshipsSkipped = 0

		keyToID := ing.upsertObjects(ctx, result.Objects, stats)
		ing.createRelationships(ctx, result.Relationships, keyToID, stats)
	}

	stats.Duration = time.Since(start)
	return stats, nil
}

// --- Internal ---

const batchChunkSize = 400 // Keep under 500 limit with margin

// batchIngest uses the subgraph API to create objects and relationships in chunks.
// Uses _ref placeholders for relationship wiring within each chunk.
func (ing *Ingester) batchIngest(ctx context.Context, objects []memory.UpsertObjectRequest, rels []decompose.RelationshipSpec, stats *Stats) error {
	if len(objects) == 0 {
		return nil
	}

	// Build ref map: object key → _ref placeholder
	keyToRef := make(map[string]string, len(objects))
	for i, obj := range objects {
		ref := fmt.Sprintf("obj-%d", i)
		keyToRef[obj.Key] = ref
	}

	// Chunk objects
	for chunkStart := 0; chunkStart < len(objects); chunkStart += batchChunkSize {
		chunkEnd := chunkStart + batchChunkSize
		if chunkEnd > len(objects) {
			chunkEnd = len(objects)
		}
		objChunk := objects[chunkStart:chunkEnd]

		// Build refs for this chunk
		chunkRefs := make(map[string]string, len(objChunk))
		var subObjects []memory.SubgraphObject
		for i, obj := range objChunk {
			ref := fmt.Sprintf("obj-%d", chunkStart+i)
			chunkRefs[obj.Key] = ref
			name, _ := obj.Properties["name"].(string)
			subObjects = append(subObjects, memory.SubgraphObject{
				Ref:        ref,
				Type:       obj.Type,
				Key:        obj.Key,
				Name:       name,
				Properties: obj.Properties,
			})
		}

		// Find relationships where both endpoints are in this chunk
		var subRels []memory.SubgraphRelationship
		for _, rel := range rels {
			srcRef, srcOK := chunkRefs[rel.FromKey]
			dstRef, dstOK := chunkRefs[rel.ToKey]
			if srcOK && dstOK {
				subRels = append(subRels, memory.SubgraphRelationship{
					Type:       rel.Type,
					SrcRef:     srcRef,
					DstRef:     dstRef,
					Properties: rel.Properties,
				})
			}
		}

		req := memory.SubgraphRequest{
			Objects:       subObjects,
			Relationships: subRels,
		}

		result, err := ing.client.CreateSubgraph(ctx, req)
		if err != nil {
			return fmt.Errorf("batch chunk %d-%d failed: %w", chunkStart, chunkEnd, err)
		}

		stats.ObjectsUpserted += len(result.Objects)
		stats.RelationshipsCreated += len(result.Relationships)

		log.Printf("[ingest] Batch chunk %d-%d: %d objects, %d relationships",
			chunkStart, chunkEnd, len(result.Objects), len(result.Relationships))
	}

	// Handle cross-chunk relationships (endpoints in different chunks)
	// These need object IDs, so we resolve them from the key map
	// For now, upsert remaining relationships individually using key-based lookup
	keyToID := make(map[string]string)
	// Build key→ID map from all created objects
	allObjects, _, err := ing.client.ListObjects(ctx, memory.ListOptions{Limit: len(objects) + 100})
	if err != nil {
		log.Printf("[ingest] WARNING: Could not list objects for cross-chunk relationships: %v", err)
	} else {
		for _, obj := range allObjects {
			keyToID[obj.Key] = obj.StableID()
		}
	}

	// Create cross-chunk relationships
	crossChunkRels := 0
	for _, rel := range rels {
		// Skip relationships already created in chunks
		fromChunk := -1
		toChunk := -1
		for i := range objects {
			if objects[i].Key == rel.FromKey {
				fromChunk = i / batchChunkSize
			}
			if objects[i].Key == rel.ToKey {
				toChunk = i / batchChunkSize
			}
		}
		if fromChunk == toChunk && fromChunk >= 0 {
			continue // Already created in-chunk
		}

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
			continue
		}
		crossChunkRels++
		stats.RelationshipsCreated++
	}

	if crossChunkRels > 0 {
		log.Printf("[ingest] Created %d cross-chunk relationships individually", crossChunkRels)
	}

	return nil
}

// upsertObjects pushes all objects to Memory individually and returns a key→ID map.
// Used as fallback when batch ingest fails, and for incremental sync.
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

// createRelationships resolves relationship specs to IDs and creates them individually.
// Used as fallback when batch ingest fails, and for incremental sync.
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
