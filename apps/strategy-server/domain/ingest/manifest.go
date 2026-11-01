package ingest

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
)

const (
	projectionObject       = "object"
	projectionRelationship = "relationship"
)

// ManifestStore reads the projection manifest: which Memory keys make up the
// current projection of an instance. The rows are in memory_projection
// (migration 045).
type ManifestStore struct {
	db *bun.DB
}

// NewManifestStore creates a store over the strategy database.
func NewManifestStore(db *bun.DB) *ManifestStore {
	return &ManifestStore{db: db}
}

// HasManifest reports whether the instance has been ingested under the fenced
// scheme (memory_generation >= 1). An unknown instance has no manifest.
func (m *ManifestStore) HasManifest(ctx context.Context, instanceID uuid.UUID) (bool, error) {
	var has bool
	err := m.db.NewRaw(
		`SELECT EXISTS (SELECT 1 FROM strategy_instances WHERE id = ? AND memory_generation >= 1)`,
		instanceID,
	).Scan(ctx, &has)
	if err != nil {
		return false, fmt.Errorf("manifest: has manifest for %s: %w", instanceID, err)
	}
	return has, nil
}

// Visible returns the subset of keys that are objects in the instance's manifest.
func (m *ManifestStore) Visible(ctx context.Context, instanceID uuid.UUID, keys []string) (map[string]struct{}, error) {
	return m.visible(ctx, instanceID, projectionObject, keys)
}

// VisibleRelationships returns the subset of tuples that are relationships in
// the instance's manifest.
func (m *ManifestStore) VisibleRelationships(ctx context.Context, instanceID uuid.UUID, tuples []string) (map[string]struct{}, error) {
	return m.visible(ctx, instanceID, projectionRelationship, tuples)
}

func (m *ManifestStore) visible(ctx context.Context, instanceID uuid.UUID, kind string, keys []string) (map[string]struct{}, error) {
	out := make(map[string]struct{})
	if len(keys) == 0 {
		return out, nil
	}
	var found []string
	err := m.db.NewRaw(
		`SELECT key FROM memory_projection WHERE instance_id = ? AND kind = ? AND key = ANY(?)`,
		instanceID, kind, pgdialect.Array(keys),
	).Scan(ctx, &found)
	if err != nil {
		return nil, fmt.Errorf("manifest: visible %ss for %s: %w", kind, instanceID, err)
	}
	for _, k := range found {
		out[k] = struct{}{}
	}
	return out, nil
}

// ProjectionCounts returns how many objects the instance's manifest holds and
// how many relationships of each type. Relationship tuples start with their type
// (see RelationshipKey).
func (m *ManifestStore) ProjectionCounts(ctx context.Context, instanceID uuid.UUID) (int, map[string]int, error) {
	var rows []struct {
		Kind string `bun:"kind"`
		Type string `bun:"type"`
		N    int    `bun:"n"`
	}
	err := m.db.NewRaw(
		`SELECT kind, CASE WHEN kind = ? THEN split_part(key, '|', 1) ELSE '' END AS type, count(*) AS n
		   FROM memory_projection WHERE instance_id = ? GROUP BY 1, 2`,
		projectionRelationship, instanceID,
	).Scan(ctx, &rows)
	if err != nil {
		return 0, nil, fmt.Errorf("manifest: counts for %s: %w", instanceID, err)
	}
	objects, rels := 0, make(map[string]int)
	for _, r := range rows {
		if r.Kind == projectionRelationship {
			rels[r.Type] += r.N
		} else {
			objects += r.N
		}
	}
	return objects, rels, nil
}
