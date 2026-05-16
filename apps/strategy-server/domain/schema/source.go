package schema

import (
	"context"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// RegistrySchemaSource adapts a schema.Service into an embedded.SchemaSource.
// It queries the DB registry with the configured version and dialect, falling
// back to embedded schemas when no DB match is found.
type RegistrySchemaSource struct {
	svc     *Service
	ctx     context.Context
	version string
	dialect string
}

// NewRegistrySchemaSource creates a SchemaSource that queries the registry for
// the given instance's schema version and dialect.
func NewRegistrySchemaSource(ctx context.Context, svc *Service, version, dialect string) embedded.SchemaSource {
	return &RegistrySchemaSource{
		svc:     svc,
		ctx:     ctx,
		version: version,
		dialect: dialect,
	}
}

// GetSchemaBytes implements embedded.SchemaSource. It delegates to Service.GetSchema
// which follows the three-tier lookup order (exact → latest → embedded).
func (r *RegistrySchemaSource) GetSchemaBytes(schemaName string) ([]byte, error) {
	return r.svc.GetSchema(r.ctx, r.version, r.dialect, schemaName)
}
