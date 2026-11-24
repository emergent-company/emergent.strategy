package handler

import (
	"context"
	"fmt"
	"strings"
	"testing"

	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// Every list that reads across organisations shows the caller their own and
// nothing of anyone else's: the dashboard, the sidebar and the settings page.
func TestListsHoldOnlyTheCallersOrganisations(t *testing.T) {
	tn := newTenancy(t)

	// Each loader renders to text; the markers are names only one tenant has.
	loaders := []struct {
		name string
		a, b string // a marker of A's data and of B's data
		load func(ctx context.Context) (any, error)
	}{
		{"dashboard instances", "Instance Of Org A", "Instance Of Org B", func(ctx context.Context) (any, error) { return tn.s.loadAllInstances(ctx) }},
		{"dashboard workspaces", "owner-a", "owner-b", func(ctx context.Context) (any, error) { return tn.s.loadWorkspaces(ctx) }},
		{"sidebar", "Instance Of Org A", "Instance Of Org B", func(ctx context.Context) (any, error) { return tn.s.loadInstanceSummaries(ctx) }},
		{"settings: memory status", "Instance Of Org A", "Instance Of Org B", func(ctx context.Context) (any, error) { return tn.s.loadInstanceMemoryStatuses(ctx), nil }},
		{"settings: sync rows", "Instance Of Org A", "Instance Of Org B", func(ctx context.Context) (any, error) { return tn.s.loadSyncInstanceRows(ctx) }},
	}
	for _, l := range loaders {
		t.Run(l.name, func(t *testing.T) {
			show := func(ctx context.Context) string {
				got, err := l.load(ctx)
				if err != nil {
					t.Fatal(err)
				}
				return fmt.Sprintf("%+v", got)
			}
			has := strings.Contains

			if got := show(asUser(tn.alice)); !has(got, l.a) || has(got, l.b) {
				t.Errorf("admin of A sees %q", got)
			}
			if got := show(asUser(tn.vic)); !has(got, l.a) || has(got, l.b) {
				t.Errorf("viewer of A sees %q", got)
			}
			if got := show(asUser(tn.bob)); has(got, l.a) || !has(got, l.b) {
				t.Errorf("admin of B sees %q", got)
			}
			if got := show(asUser(tn.eve)); has(got, l.a) || has(got, l.b) {
				t.Errorf("a user in no organisation sees %q", got)
			}
			if got := show(importCtx()); has(got, l.a) || has(got, l.b) {
				t.Errorf("a request with no principal sees %q", got)
			}
		})
	}
}

// A member of two organisations sees both, and a user who joins later sees the new
// one without a restart: the filter is the caller's memberships at the time.
func TestListsFollowTheCallersMemberships(t *testing.T) {
	tn := newTenancy(t)
	got, _ := tn.s.loadAllInstances(asUser(tn.eve))
	if len(got) != 0 {
		t.Fatalf("eve sees %d instances before joining anything", len(got))
	}
	if _, err := tn.orgSvc.EnsureMember(importCtx(), tn.orgB.ID, tn.eve.ID, domain.OrgRoleViewer); err != nil {
		t.Fatal(err)
	}
	if _, err := tn.orgSvc.EnsureMember(importCtx(), tn.orgA.ID, tn.eve.ID, domain.OrgRoleViewer); err != nil {
		t.Fatal(err)
	}
	after := fmt.Sprintf("%+v", mustInstances(t, tn, asUser(tn.eve)))
	if !strings.Contains(after, "Instance Of Org A") || !strings.Contains(after, "Instance Of Org B") {
		t.Errorf("a member of both organisations sees %q", after)
	}
}

func mustInstances(t *testing.T, tn *tenancy, ctx context.Context) any {
	t.Helper()
	got, err := tn.s.loadAllInstances(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// Dev mode (auth off) runs as the dev user, who is an admin of every organisation
// the dev server created: it still sees everything it made.
func TestDevModeStillSeesItsOwnOrganisations(t *testing.T) {
	tn := newTenancy(t)
	ctx := importCtx()
	if _, err := tn.db.NewInsert().Model(&domain.User{ID: web.DevUser.ID, Sub: web.DevUser.Sub, Email: web.DevUser.Email}).
		On("CONFLICT (id) DO NOTHING").Exec(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := orgdom.NewService(tn.db).EnsureMember(ctx, tn.orgA.ID, web.DevUser.ID, domain.OrgRoleAdmin); err != nil {
		t.Fatal(err)
	}
	devCtx := web.ContextWithPrincipal(ctx, web.DevPrincipal)
	got := fmt.Sprintf("%+v", mustInstances(t, tn, devCtx))
	if !strings.Contains(got, "Instance Of Org A") || strings.Contains(got, "Instance Of Org B") {
		t.Errorf("the dev user, an admin of A only, sees %q", got)
	}
}
