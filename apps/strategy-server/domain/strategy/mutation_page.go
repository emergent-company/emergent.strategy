package strategy

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

// MutationListOptions selects a page of the change history.
type MutationListOptions struct {
	ArtifactType    string
	IncludeStaged   bool
	Cursor          string
	SinceMutationID string
	Limit           int
	// WithPayload includes each mutation's payload while the page stays within
	// MaxChars; a payload that does not fit is left out and flagged.
	WithPayload bool
	// MaxChars is the response budget in characters; zero means the default and
	// it is capped at the hard limit.
	MaxChars int
}

// MutationRow is one change with its payload only on request. It leaves out the
// instance id and the batch metadata; get_mutation returns the whole record.
type MutationRow struct {
	ID               uuid.UUID       `json:"id"`
	BatchID          *uuid.UUID      `json:"batch_id,omitempty"`
	ArtifactType     string          `json:"artifact_type"`
	ArtifactKey      string          `json:"artifact_key"`
	Action           string          `json:"action"`
	Status           string          `json:"status"`
	Source           string          `json:"source"`
	AgentID          *string         `json:"agent_id,omitempty"`
	BatchDescription *string         `json:"batch_description,omitempty"`
	CreatedBy        *uuid.UUID      `json:"created_by,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
	SizeChars        int             `json:"size_chars"`
	Payload          json.RawMessage `json:"payload,omitempty"`
	// PayloadOmitted is true when a payload was requested but did not fit the
	// budget; read it with get_mutation.
	PayloadOmitted bool `json:"payload_omitted,omitempty"`
}

// MutationPage is one page of the change history with what was left out.
type MutationPage struct {
	Mutations  []MutationRow `json:"mutations"`
	NextCursor string        `json:"next_cursor,omitempty"`
	Truncated  bool          `json:"truncated"`
	MaxChars   int           `json:"max_chars"`
	Hints      []string      `json:"hints,omitempty"`
}

type mutationScan struct {
	bun.BaseModel    `bun:"table:strategy_mutations,alias:sm"`
	ID               uuid.UUID       `bun:"id"`
	BatchID          *uuid.UUID      `bun:"batch_id"`
	ArtifactType     string          `bun:"artifact_type"`
	ArtifactKey      string          `bun:"artifact_key"`
	Action           string          `bun:"action"`
	Status           string          `bun:"status"`
	Source           string          `bun:"source"`
	AgentID          *string         `bun:"agent_id"`
	BatchDescription *string         `bun:"batch_description"`
	CreatedBy        *uuid.UUID      `bun:"created_by"`
	CreatedAt        time.Time       `bun:"created_at"`
	SizeChars        int             `bun:"size_chars"`
	Payload          json.RawMessage `bun:"payload"`
}

// ListMutationPage returns a page of the change history, newest first. Rows
// carry index fields and the size of the payload; the payload itself only with
// WithPayload. A page is cut at the budget and then NextCursor continues from
// the last row returned.
func (s *Service) ListMutationPage(ctx context.Context, instanceID uuid.UUID, opts MutationListOptions) (*MutationPage, error) {
	limit := opts.Limit
	if limit <= 0 || limit > maxMutationList {
		limit = 50
	}
	budget, capped := strategyread.NormaliseBudget(opts.MaxChars)

	cols := "id, batch_id, artifact_type, artifact_key, action, status, source, agent_id, batch_description, created_by, created_at, length(payload::text) AS size_chars"
	if opts.WithPayload {
		cols += ", payload"
	}
	q := mutationFilter(
		s.db.NewSelect().Model((*mutationScan)(nil)).ColumnExpr(cols),
		instanceID, opts.ArtifactType, opts.IncludeStaged, opts.Cursor, opts.SinceMutationID,
	).OrderExpr("created_at DESC, id DESC").Limit(limit + 1)

	var rows []mutationScan
	if err := q.Scan(ctx, &rows); err != nil {
		return nil, fmt.Errorf("list mutations: %w", err)
	}

	page := &MutationPage{Mutations: []MutationRow{}, MaxChars: budget}
	more := len(rows) > limit
	if more {
		rows = rows[:limit]
	}

	used := 2
	omitted := 0
	for i, r := range rows {
		row := MutationRow{
			ID: r.ID, BatchID: r.BatchID, ArtifactType: r.ArtifactType, ArtifactKey: r.ArtifactKey,
			Action: r.Action, Status: r.Status, Source: r.Source, AgentID: r.AgentID,
			BatchDescription: r.BatchDescription, CreatedBy: r.CreatedBy, CreatedAt: r.CreatedAt,
			SizeChars: r.SizeChars,
		}
		n := strategyread.JSONSize(row) + 1
		if i > 0 && used+n > budget {
			more = true
			break
		}
		used += n
		if opts.WithPayload {
			if p := utf8.RuneCount(r.Payload); used+p <= budget {
				row.Payload = r.Payload
				used += p
			} else {
				row.PayloadOmitted = true
				omitted++
			}
		}
		page.Mutations = append(page.Mutations, row)
	}

	if more && len(page.Mutations) > 0 {
		page.NextCursor = page.Mutations[len(page.Mutations)-1].ID.String()
		page.Truncated = true
		page.Hints = append(page.Hints, "more mutations follow; pass next_cursor to continue")
	}
	if omitted > 0 {
		page.Truncated = true
		page.Hints = append(page.Hints, fmt.Sprintf("%d payloads did not fit the %d-character budget and were left out; read one with get_mutation", omitted, budget))
	}
	if !opts.WithPayload {
		page.Hints = append(page.Hints, "payloads are not included; size_chars is the payload size. Pass full=true to include them within the budget, or read one with get_mutation")
	}
	if capped {
		page.Hints = append(page.Hints, fmt.Sprintf("max_chars was capped at %d", strategyread.HardMaxChars))
	}
	return page, nil
}
