package ingest

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// SyncStats tracks incremental sync metrics.
type SyncStats struct {
	ObjectsCreated       int
	ObjectsUpdated       int
	ObjectsUnchanged     int
	ObjectsDeleted       int
	RelationshipsCreated int
	RelationshipsFailed  int
	RelationshipsSkipped int
	Duration             time.Duration
	Warnings             []string
}

// Sync performs an incremental sync — only pushes objects that have changed
// since the last sync. Uses content hashing to detect changes.
func (ing *Ingester) Sync(ctx context.Context, instancePath string) (*SyncStats, error) {
	stats := &SyncStats{}
	start := time.Now()

	// Step 0: Reconcile schema
	reconcileResult, err := Reconcile(ctx, ing.client)
	if err != nil {
		log.Printf("[sync] WARNING: Schema reconciliation failed: %v (continuing anyway)", err)
		stats.Warnings = append(stats.Warnings, fmt.Sprintf("schema reconciliation failed: %v", err))
	} else if reconcileResult.Action != "none" && reconcileResult.Action != "skipped" {
		log.Printf("[sync] %s", reconcileResult.Message)
	}

	// Step 1: Decompose current state
	dec := decompose.New(instancePath)
	result, err := dec.DecomposeInstance()
	if err != nil {
		return nil, fmt.Errorf("decompose: %w", err)
	}
	stats.Warnings = append(stats.Warnings, result.Warnings...)
	log.Printf("[sync] Decomposed: %d objects, %d relationships", len(result.Objects), len(result.Relationships))

	// Step 2: Load existing objects from Memory (by key)
	existing, err := ing.loadExistingObjects(ctx)
	if err != nil {
		return nil, fmt.Errorf("load existing: %w", err)
	}
	log.Printf("[sync] Loaded %d existing objects from Memory", len(existing))

	// Step 3: Compare and upsert only changed objects
	keyToID := ing.syncObjects(ctx, result.Objects, existing, stats)
	log.Printf("[sync] Objects: %d created, %d updated, %d unchanged",
		stats.ObjectsCreated, stats.ObjectsUpdated, stats.ObjectsUnchanged)

	// Step 4: Detect deleted objects (in Memory but not in decomposition)
	newKeys := make(map[string]bool, len(result.Objects))
	for _, obj := range result.Objects {
		newKeys[obj.Key] = true
	}
	for key := range existing {
		if !newKeys[key] {
			stats.ObjectsDeleted++
			// Note: we don't actually delete here — soft-delete requires
			// the object ID and would need a separate confirmation flow.
			// For now, we just count them.
		}
	}
	if stats.ObjectsDeleted > 0 {
		log.Printf("[sync] %d objects in Memory no longer in instance (not deleted — needs manual review)", stats.ObjectsDeleted)
	}

	// Step 5: Only recreate relationships for objects that were created or updated.
	// Unchanged objects already have their relationships in Memory.
	changedKeys := make(map[string]bool, stats.ObjectsCreated+stats.ObjectsUpdated)
	for _, obj := range result.Objects {
		hash := hashProperties(obj.Properties)
		if ex, exists := existing[obj.Key]; exists && ex.PropertiesHash == hash {
			continue // unchanged — relationships already exist
		}
		changedKeys[obj.Key] = true
	}

	if len(changedKeys) > 0 {
		relCount := 0
		for _, rel := range result.Relationships {
			// Only create relationships where at least one endpoint changed
			if !changedKeys[rel.FromKey] && !changedKeys[rel.ToKey] {
				continue
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
			stats.RelationshipsCreated++
			relCount++
		}
		log.Printf("[sync] Relationships: %d created for %d changed objects", relCount, len(changedKeys))
	} else {
		log.Printf("[sync] No objects changed — skipping relationship sync")
	}

	stats.Duration = time.Since(start)
	return stats, nil
}

// existingObject holds the key, ID, and content hash of an object in Memory.
type existingObject struct {
	ID             string
	Key            string
	PropertiesHash string
}

// loadExistingObjects fetches all objects from Memory and returns a key→existingObject map.
func (ing *Ingester) loadExistingObjects(ctx context.Context) (map[string]existingObject, error) {
	existing := make(map[string]existingObject)

	cursor := ""
	for page := 0; page < 50; page++ {
		objects, nextCursor, err := ing.client.ListObjects(ctx, memory.ListOptions{
			Limit:  200,
			Cursor: cursor,
		})
		if err != nil {
			return nil, err
		}

		for _, obj := range objects {
			existing[obj.Key] = existingObject{
				ID:             obj.ID,
				Key:            obj.Key,
				PropertiesHash: hashProperties(obj.Properties),
			}
		}

		if nextCursor == "" || len(objects) == 0 {
			break
		}
		cursor = nextCursor
	}

	return existing, nil
}

// syncObjects compares new objects against existing and only upserts what changed.
func (ing *Ingester) syncObjects(ctx context.Context, objects []memory.UpsertObjectRequest, existing map[string]existingObject, stats *SyncStats) map[string]string {
	keyToID := make(map[string]string, len(objects))

	// Pre-populate keyToID with existing IDs
	for key, ex := range existing {
		keyToID[key] = ex.ID
	}

	for _, obj := range objects {
		newHash := hashProperties(obj.Properties)

		if ex, exists := existing[obj.Key]; exists {
			if ex.PropertiesHash == newHash {
				// Object unchanged — skip upsert
				stats.ObjectsUnchanged++
				continue
			}
			// Object changed — upsert
			resp, err := ing.client.UpsertObject(ctx, obj)
			if err != nil {
				stats.Warnings = append(stats.Warnings, fmt.Sprintf("sync update failed %s: %v", obj.Key, err))
				continue
			}
			keyToID[obj.Key] = resp.ID
			stats.ObjectsUpdated++
		} else {
			// New object — upsert (creates)
			resp, err := ing.client.UpsertObject(ctx, obj)
			if err != nil {
				stats.Warnings = append(stats.Warnings, fmt.Sprintf("sync create failed %s: %v", obj.Key, err))
				continue
			}
			keyToID[obj.Key] = resp.ID
			stats.ObjectsCreated++
		}
	}

	return keyToID
}

// hashProperties produces a stable hash of an object's properties for change detection.
func hashProperties(props map[string]any) string {
	// Sort keys for deterministic hashing
	keys := make([]string, 0, len(props))
	for k := range props {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	h := sha256.New()
	for _, k := range keys {
		h.Write([]byte(k))
		h.Write([]byte("="))
		v, _ := json.Marshal(props[k])
		h.Write(v)
		h.Write([]byte(";"))
	}

	return fmt.Sprintf("%x", h.Sum(nil))[:16] // 16 hex chars is enough for change detection
}
