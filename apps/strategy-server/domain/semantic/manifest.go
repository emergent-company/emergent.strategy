package semantic

import (
	"context"

	"github.com/google/uuid"
)

// ManifestSource tells the read path which Memory keys make up the current
// projection of an instance. Memory is a derived copy of Postgres; whatever it
// holds outside the manifest is leftover and must read as absent. Implemented
// by domain/ingest, so this package does not depend on the database.
type ManifestSource interface {
	// HasManifest reports whether the instance has been ingested under the
	// fenced scheme. An ingested instance with no artifacts has a valid, empty
	// manifest.
	HasManifest(ctx context.Context, instanceID uuid.UUID) (bool, error)

	// Visible returns the subset of keys that are objects in the instance's
	// manifest.
	Visible(ctx context.Context, instanceID uuid.UUID, keys []string) (map[string]struct{}, error)

	// VisibleRelationships returns the subset of tuples that are relationships in
	// the instance's manifest. A tuple is built with ingest.RelationshipKey.
	VisibleRelationships(ctx context.Context, instanceID uuid.UUID, tuples []string) (map[string]struct{}, error)
}

// WithManifestSource sets the manifest the scoped read path consults.
func (s *Service) WithManifestSource(m ManifestSource) *Service {
	s.manifest = m
	return s
}
