package strategy_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// Rows committed in one batch share a created_at, so paging by timestamp alone
// loses or repeats rows at a page boundary.
func TestListMutations_PagingReturnsEveryRowExactlyOnce(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	ctx := context.Background()

	orgID := seedTestOrg(t, db)
	wsID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.Workspace{ID: wsID, GithubOwner: "page-" + wsID.String()[:8], OrgID: orgID}).Exec(ctx); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	instID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.StrategyInstance{ID: instID, WorkspaceID: wsID, Name: "paging", Status: domain.InstanceStatusActive}).Exec(ctx); err != nil {
		t.Fatalf("seed instance: %v", err)
	}

	base := time.Now().UTC().Truncate(time.Second).Add(-time.Hour)
	groups := []int{3, 2, 2}
	want := map[uuid.UUID]bool{}
	for g, n := range groups {
		ts := base.Add(time.Duration(g) * time.Minute)
		for i := 0; i < n; i++ {
			m := &domain.StrategyMutation{
				ID: uuid.New(), InstanceID: instID, ArtifactType: "feature",
				ArtifactKey: "fd-" + uuid.NewString()[:6], Action: domain.MutationActionCreate,
				Payload: json.RawMessage(`{"n":1}`), Status: domain.MutationStatusCommitted,
				Source: "system", CreatedAt: ts,
			}
			if _, err := db.NewInsert().Model(m).Exec(ctx); err != nil {
				t.Fatalf("seed mutation: %v", err)
			}
			want[m.ID] = true
		}
	}

	seen := map[uuid.UUID]int{}
	cursor := ""
	for page := 0; page < 20; page++ {
		rows, next, err := svc.ListMutations(ctx, instID, "", false, 2, cursor, "")
		if err != nil {
			t.Fatalf("ListMutations: %v", err)
		}
		for _, r := range rows {
			seen[r.ID]++
		}
		if next == "" {
			break
		}
		cursor = next
	}
	for id := range want {
		if seen[id] != 1 {
			t.Errorf("mutation %s was returned %d times across the pages, want exactly once", id, seen[id])
		}
	}
	if len(seen) != len(want) {
		t.Errorf("paging returned %d distinct mutations, want %d", len(seen), len(want))
	}
}
