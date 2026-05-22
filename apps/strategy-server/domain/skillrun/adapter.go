package skillrun

import (
	"context"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillexec"
)

// compile-time check: Service satisfies the RunLedger interface defined in skillexec.
// The adapter methods convert between skillexec and skillrun types.
var _ skillexec.RunLedger = (*Adapter)(nil)

// Adapter wraps *Service to implement skillexec.RunLedger, converting between
// the skillexec interface types and the skillrun domain types.
type Adapter struct {
	svc *Service
}

// NewAdapter creates an Adapter that satisfies skillexec.RunLedger.
func NewAdapter(svc *Service) *Adapter {
	return &Adapter{svc: svc}
}

// Create delegates to Service.Create, converting params.
func (a *Adapter) Create(ctx context.Context, p skillexec.RunLedgerCreateParams) (uuid.UUID, error) {
	return a.svc.Create(ctx, CreateParams{
		InstanceID:     p.InstanceID,
		SkillName:      p.SkillName,
		ChunkCount:     p.ChunkCount,
		Model:          p.Model,
		Trigger:        p.Trigger,
		TriggerContext: p.TriggerContext,
	})
}

// UpdateChunk delegates to Service.UpdateChunk, converting the entry.
func (a *Adapter) UpdateChunk(ctx context.Context, runID uuid.UUID, entry skillexec.RunLedgerChunkEntry) error {
	return a.svc.UpdateChunk(ctx, runID, ChunkEntry{
		Chunk:            entry.Chunk,
		OutputKey:        entry.OutputKey,
		ArtifactType:     entry.ArtifactType,
		Status:           entry.Status,
		StartedAt:        entry.StartedAt,
		CompletedAt:      entry.CompletedAt,
		Attempts:         entry.Attempts,
		InputTokens:      entry.InputTokens,
		OutputTokens:     entry.OutputTokens,
		Errors:           entry.Errors,
		ContextTruncated: entry.ContextTruncated,
		DroppedFeatures:  entry.DroppedFeatures,
	})
}

// Complete delegates to Service.Complete.
func (a *Adapter) Complete(ctx context.Context, runID uuid.UUID, batchID uuid.UUID) error {
	return a.svc.Complete(ctx, runID, batchID)
}

// Fail delegates to Service.Fail.
func (a *Adapter) Fail(ctx context.Context, runID uuid.UUID, errMsg string) error {
	return a.svc.Fail(ctx, runID, errMsg)
}
