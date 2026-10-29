package strategy

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

const (
	defaultPageLimit = 50
	maxPageLimit     = 200
)

// frameworkClasses are the integrity classes answer-facing lists exclude.
var frameworkClasses = []string{
	string(integrity.ClassCanonicalReference),
	string(integrity.ClassUnmodifiedTemplate),
	string(integrity.ClassPackagedDefault),
}

// ListOptions selects a page of artifacts.
type ListOptions struct {
	ArtifactType string
	// IncludeFramework includes unmodified canonical content, which is excluded
	// by default because it is not the company's strategy.
	IncludeFramework bool
	// WithPayload includes payloads, bounded by MaxPayloadChars.
	WithPayload     bool
	MaxPayloadChars int
	Limit           int
	Cursor          string
}

// ArtifactRow is an artifact's index fields, with its payload only on request.
type ArtifactRow struct {
	ArtifactType   string          `json:"artifact_type"`
	ArtifactKey    string          `json:"artifact_key"`
	Name           *string         `json:"name,omitempty"`
	Track          *string         `json:"track,omitempty"`
	Status         string          `json:"status"`
	SizeChars      int             `json:"size_chars"`
	IntegrityClass *string         `json:"integrity_class,omitempty"`
	IntegrityRef   *string         `json:"integrity_ref,omitempty"`
	Payload        json.RawMessage `json:"payload,omitempty"`
	// PayloadOmitted is true when a payload was requested but did not fit the
	// cap; read it with get_section.
	PayloadOmitted bool `json:"payload_omitted,omitempty"`
}

// ArtifactPage is one page of artifacts with what was left out.
type ArtifactPage struct {
	Artifacts []ArtifactRow `json:"artifacts"`
	// Total counts the artifacts matching the filter, across all pages.
	Total    int `json:"total"`
	Returned int `json:"returned"`
	// FrameworkExcluded counts unmodified framework content left out.
	FrameworkExcluded int      `json:"framework_excluded,omitempty"`
	Truncated         bool     `json:"truncated"`
	NextCursor        string   `json:"next_cursor,omitempty"`
	Hints             []string `json:"hints,omitempty"`
}

type artifactScan struct {
	bun.BaseModel  `bun:"table:strategy_artifacts,alias:sa"`
	ArtifactType   string          `bun:"artifact_type"`
	ArtifactKey    string          `bun:"artifact_key"`
	Name           *string         `bun:"name"`
	Track          *string         `bun:"track"`
	Status         string          `bun:"status"`
	IntegrityClass *string         `bun:"integrity_class"`
	IntegrityRef   *string         `bun:"integrity_ref"`
	SizeChars      int             `bun:"size_chars"`
	Payload        json.RawMessage `bun:"payload"`
}

// ListArtifactPage returns a page of the instance's artifacts. By default it
// carries index fields only and leaves out framework content, reporting how much
// it left out.
func (s *Service) ListArtifactPage(ctx context.Context, instanceID uuid.UUID, opts ListOptions) (*ArtifactPage, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = defaultPageLimit
	}
	if limit > maxPageLimit {
		limit = maxPageLimit
	}
	payloadCap := opts.MaxPayloadChars
	if payloadCap <= 0 || payloadCap > strategyread.HardMaxChars {
		payloadCap = strategyread.HardMaxChars
	}

	base := func(q *bun.SelectQuery) *bun.SelectQuery {
		q = q.Where("instance_id = ? AND status != ?", instanceID, domain.ArtifactStatusArchived)
		if opts.ArtifactType != "" {
			q = q.Where("artifact_type = ?", opts.ArtifactType)
		}
		return q
	}
	notFramework := func(q *bun.SelectQuery) *bun.SelectQuery {
		return q.Where("integrity_class IS NULL OR integrity_class NOT IN (?)", bun.List(frameworkClasses))
	}

	page := &ArtifactPage{Artifacts: []ArtifactRow{}}

	totalQ := base(s.db.NewSelect().Model((*domain.StrategyArtifact)(nil)))
	if !opts.IncludeFramework {
		totalQ = notFramework(totalQ)
	}
	total, err := totalQ.Count(ctx)
	if err != nil {
		return nil, fmt.Errorf("count artifacts: %w", err)
	}
	page.Total = total

	if !opts.IncludeFramework {
		excluded, err := base(s.db.NewSelect().Model((*domain.StrategyArtifact)(nil))).
			Where("integrity_class IN (?)", bun.List(frameworkClasses)).Count(ctx)
		if err != nil {
			return nil, fmt.Errorf("count framework artifacts: %w", err)
		}
		page.FrameworkExcluded = excluded
	}

	cols := "artifact_type, artifact_key, name, track, status, integrity_class, integrity_ref, length(payload::text) AS size_chars"
	if opts.WithPayload {
		cols += ", payload"
	}
	q := base(s.db.NewSelect().Model((*artifactScan)(nil)).ColumnExpr(cols)).
		OrderExpr("artifact_type, artifact_key").
		Limit(limit + 1)
	if !opts.IncludeFramework {
		q = notFramework(q)
	}
	if opts.Cursor != "" {
		typ, key, err := decodeCursor(opts.Cursor)
		if err != nil {
			return nil, err
		}
		q = q.Where("(artifact_type, artifact_key) > (?, ?)", typ, key)
	}
	var rows []artifactScan
	if err := q.Scan(ctx, &rows); err != nil {
		return nil, fmt.Errorf("list artifacts: %w", err)
	}

	more := len(rows) > limit
	if more {
		rows = rows[:limit]
	}
	used := 0
	omitted := 0
	for _, r := range rows {
		row := ArtifactRow{
			ArtifactType: r.ArtifactType, ArtifactKey: r.ArtifactKey, Name: r.Name, Track: r.Track,
			Status: r.Status, SizeChars: r.SizeChars, IntegrityClass: r.IntegrityClass, IntegrityRef: r.IntegrityRef,
		}
		if opts.WithPayload {
			n := utf8.RuneCount(r.Payload)
			if used+n <= payloadCap {
				row.Payload = r.Payload
				used += n
			} else {
				row.PayloadOmitted = true
				omitted++
			}
		}
		page.Artifacts = append(page.Artifacts, row)
	}
	page.Returned = len(page.Artifacts)

	if more {
		last := rows[len(rows)-1]
		page.NextCursor = encodeCursor(last.ArtifactType, last.ArtifactKey)
		page.Truncated = true
		page.Hints = append(page.Hints, "more artifacts follow; pass next_cursor to continue")
	}
	if omitted > 0 {
		page.Truncated = true
		page.Hints = append(page.Hints, fmt.Sprintf("%d payloads did not fit the %d-character cap and were omitted; read them with get_section", omitted, payloadCap))
	}
	return page, nil
}

func encodeCursor(artifactType, key string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(artifactType + "\x1f" + key))
}

func decodeCursor(c string) (artifactType, key string, err error) {
	raw, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return "", "", apperror.ErrBadRequest.WithDetail("invalid cursor")
	}
	typ, key, ok := strings.Cut(string(raw), "\x1f")
	if !ok {
		return "", "", apperror.ErrBadRequest.WithDetail("invalid cursor")
	}
	return typ, key, nil
}
