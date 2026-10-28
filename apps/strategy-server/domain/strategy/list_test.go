package strategy_test

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func seedMixed(t *testing.T) (*strategy.Service, uuid.UUID) {
	t.Helper()
	svc, _, inst := seedRead(t)
	commitAuto(t, svc, inst, "definition", "sd-001", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/"))
	commitAuto(t, svc, inst, "north_star", "north_star", domain.MutationActionCreate, embeddedPayload(t, "READY/00_north_star"))
	return svc, inst
}

func keysOf(rows []strategy.ArtifactRow) []string {
	var out []string
	for _, r := range rows {
		out = append(out, r.ArtifactKey)
	}
	return out
}

func TestListArtifactPage_ExcludesFrameworkContentAndCountsIt(t *testing.T) {
	svc, inst := seedMixed(t)
	page, err := svc.ListArtifactPage(context.Background(), inst, strategy.ListOptions{})
	if err != nil {
		t.Fatalf("ListArtifactPage: %v", err)
	}
	keys := strings.Join(keysOf(page.Artifacts), ",")
	for _, want := range []string{"strategy_formula", "roadmap_recipe", "insight_analyses"} {
		if !strings.Contains(keys, want) {
			t.Errorf("authored %s missing from %s", want, keys)
		}
	}
	if strings.Contains(keys, "sd-001") || strings.Contains(keys, "north_star") {
		t.Errorf("framework content listed as strategy: %s", keys)
	}
	if page.FrameworkExcluded != 2 {
		t.Errorf("framework_excluded = %d, want 2", page.FrameworkExcluded)
	}
	if page.Total != 3 || page.Returned != 3 || page.Truncated {
		t.Errorf("total=%d returned=%d truncated=%v", page.Total, page.Returned, page.Truncated)
	}
	for _, r := range page.Artifacts {
		if r.SizeChars <= 0 {
			t.Errorf("%s has no size", r.ArtifactKey)
		}
		if len(r.Payload) != 0 {
			t.Errorf("%s: the default page must not carry payloads", r.ArtifactKey)
		}
	}
}

func TestListArtifactPage_IncludeFrameworkListsEverythingWithItsClass(t *testing.T) {
	svc, inst := seedMixed(t)
	page, err := svc.ListArtifactPage(context.Background(), inst, strategy.ListOptions{IncludeFramework: true})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 5 || page.FrameworkExcluded != 0 {
		t.Errorf("total=%d framework_excluded=%d, want 5 and 0", page.Total, page.FrameworkExcluded)
	}
	classes := map[string]string{}
	for _, r := range page.Artifacts {
		if r.IntegrityClass != nil {
			classes[r.ArtifactKey] = *r.IntegrityClass
		}
	}
	if classes["sd-001"] != "canonical_reference" || classes["north_star"] != "unmodified_template" {
		t.Errorf("classes = %v", classes)
	}
}

func TestListArtifactPage_PaginatesWithoutGapsOrRepeats(t *testing.T) {
	svc, inst := seedMixed(t)
	ctx := context.Background()
	var seen []string
	cursor := ""
	for i := 0; i < 10; i++ {
		page, err := svc.ListArtifactPage(ctx, inst, strategy.ListOptions{IncludeFramework: true, Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		seen = append(seen, keysOf(page.Artifacts)...)
		if page.NextCursor == "" {
			break
		}
		if !page.Truncated {
			t.Error("a page with a next cursor must be flagged truncated")
		}
		cursor = page.NextCursor
	}
	if len(seen) != 5 {
		t.Fatalf("saw %d artifacts %v, want 5", len(seen), seen)
	}
	dup := map[string]bool{}
	for _, k := range seen {
		if dup[k] {
			t.Errorf("%s returned twice", k)
		}
		dup[k] = true
	}
}

func TestListArtifactPage_FilterByType(t *testing.T) {
	svc, inst := seedMixed(t)
	page, err := svc.ListArtifactPage(context.Background(), inst, strategy.ListOptions{ArtifactType: "roadmap_recipe"})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || page.Artifacts[0].ArtifactKey != "roadmap_recipe" {
		t.Errorf("page = %+v", page)
	}
}

func TestListArtifactPage_PayloadsAreBoundedAndNeverCutSilently(t *testing.T) {
	svc, inst := seedMixed(t)
	ctx := context.Background()

	small, err := svc.ListArtifactPage(ctx, inst, strategy.ListOptions{WithPayload: true})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range small.Artifacts {
		if len(r.Payload) == 0 || r.PayloadOmitted {
			t.Errorf("%s: payload missing on a page that fits the cap", r.ArtifactKey)
		}
	}

	tight, err := svc.ListArtifactPage(ctx, inst, strategy.ListOptions{WithPayload: true, MaxPayloadChars: 400})
	if err != nil {
		t.Fatal(err)
	}
	total := 0
	for _, r := range tight.Artifacts {
		total += len(r.Payload)
		if len(r.Payload) == 0 && !r.PayloadOmitted {
			t.Errorf("%s: no payload and not marked omitted", r.ArtifactKey)
		}
		if r.PayloadOmitted && r.SizeChars == 0 {
			t.Errorf("%s: an omitted payload must still report its size", r.ArtifactKey)
		}
	}
	if total > 400 {
		t.Errorf("payloads total %d characters, over the cap of 400", total)
	}
	if !tight.Truncated {
		t.Error("omitting payloads must set truncated")
	}
}
