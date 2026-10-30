package semantic

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

// allVisible is a manifest in which every key of every instance is visible, for
// tests of the filtering that does not depend on the manifest (framework hits,
// layers, pagination, shape of results). The manifest itself is tested against a
// real database in isolation_test.go.
type allVisible struct{ notReady bool }

func (m allVisible) HasManifest(context.Context, uuid.UUID) (bool, error) { return !m.notReady, nil }
func (allVisible) Visible(_ context.Context, _ uuid.UUID, keys []string) (map[string]struct{}, error) {
	out := make(map[string]struct{}, len(keys))
	for _, k := range keys {
		out[k] = struct{}{}
	}
	return out, nil
}
func (allVisible) VisibleRelationships(_ context.Context, _ uuid.UUID, tuples []string) (map[string]struct{}, error) {
	return allVisible{}.Visible(context.Background(), uuid.Nil, tuples)
}
func (allVisible) ProjectionCounts(context.Context, uuid.UUID) (int, map[string]int, error) {
	return 0, map[string]int{}, nil
}

const stubInstance = "11111111-2222-3333-4444-555555555555"

// stubService is a service over a canned Memory whose manifest shows everything.
func stubService(t *testing.T, h http.Handler) *Service {
	t.Helper()
	return newTestService(t, h).WithManifestSource(allVisible{})
}

var ownerLabels = []string{"instance:" + stubInstance, "layer:artifact"}

// stamped is an artifact-layer object as the ingest writes it.
func stamped(id, typ, key string) map[string]any {
	return map[string]any{
		"id": id, "type": typ, "key": key, "labels": ownerLabels,
		"properties": map[string]any{"instance_id": stubInstance},
	}
}
