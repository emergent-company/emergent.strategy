package epfimport_test

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/epfimport"
)

const readyRoadmap = "roadmap:\n  id: ready\n  cycle: 3\n"
const cycleRoadmap = "roadmap:\n  id: cycle-1-snapshot\n  cycle: 1\n"

func roadmapID(t *testing.T, payloads map[string]any) string {
	t.Helper()
	rm, _ := payloads["roadmap_recipe"].(map[string]any)
	r, _ := rm["roadmap"].(map[string]any)
	id, _ := r["id"].(string)
	return id
}

// Two files can name one artifact: READY/05_roadmap_recipe.yaml and the per-cycle
// copy under AIM/cycles/. The importer read files in map order, so which one was
// stored changed from run to run: the same unchanged directory gave the current
// roadmap on one import and the old cycle's on the next.
func TestParseFiles_TheReadyCopyAlwaysWinsOverACycleSnapshot(t *testing.T) {
	files := map[string][]byte{
		"READY/05_roadmap_recipe.yaml":              []byte(readyRoadmap),
		"AIM/cycles/cycle-1/05_roadmap_recipe.yaml": []byte(cycleRoadmap),
		"AIM/cycles/cycle-0/05_roadmap_recipe.yaml": []byte("roadmap:\n  id: cycle-0\n"),
		"READY/00_north_star.yaml":                  []byte("north_star:\n  purpose: x\n"),
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	for i := 0; i < 300; i++ {
		payloads, _, err := epfimport.ParseFiles(files)
		if err != nil {
			t.Fatal(err)
		}
		if got := roadmapID(t, payloads); got != "ready" {
			t.Fatalf("run %d stored roadmap %q, want the READY copy", i, got)
		}
	}
}

// Whatever the order, the same names win: a tie at the same depth goes to the
// path that sorts first.
func TestParseFiles_ACollisionAtTheSameDepthIsDecidedByPath(t *testing.T) {
	files := map[string][]byte{
		"b/05_roadmap_recipe.yaml": []byte("roadmap:\n  id: b\n"),
		"a/05_roadmap_recipe.yaml": []byte("roadmap:\n  id: a\n"),
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	for i := 0; i < 300; i++ {
		payloads, _, err := epfimport.ParseFiles(files)
		if err != nil {
			t.Fatal(err)
		}
		if got := roadmapID(t, payloads); got != "a" {
			t.Fatalf("run %d stored roadmap %q, want %q", i, got, "a")
		}
	}
}

// The product name comes from a metadata file; a nested instance's own metadata
// must not decide the parent's name, and neither may map order.
func TestParseFiles_TheProductNameIsDeterministicAndTheShallowestFileWins(t *testing.T) {
	files := map[string][]byte{
		"_meta.yaml":                 []byte("product_name: Acme\n"),
		"instances/other/_meta.yaml": []byte("product_name: Rivalco\n"),
		"instances/zzz/_epf.yaml":    []byte("product_name: Third\n"),
		"READY/00_north_star.yaml":   []byte("north_star:\n  purpose: x\n"),
	}
	for i := 0; i < 300; i++ {
		_, name, err := epfimport.ParseFiles(files)
		if err != nil {
			t.Fatal(err)
		}
		if name != "Acme" {
			t.Fatalf("run %d: product name %q, want %q", i, name, "Acme")
		}
	}
}

// A collision must not be silent: the file that was not stored is named.
func TestParseFiles_ACollisionIsLoggedWithTheFileThatLost(t *testing.T) {
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })

	_, _, err := epfimport.ParseFiles(map[string][]byte{
		"READY/05_roadmap_recipe.yaml":              []byte(readyRoadmap),
		"AIM/cycles/cycle-1/05_roadmap_recipe.yaml": []byte(cycleRoadmap),
	})
	if err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, "AIM/cycles/cycle-1/05_roadmap_recipe.yaml") || !strings.Contains(out, "roadmap_recipe") {
		t.Errorf("no warning naming the skipped file and the key:\n%s", out)
	}
}

// Files that do not collide are all kept.
func TestParseFiles_FilesWithoutACollisionAreAllKept(t *testing.T) {
	payloads, _, err := epfimport.ParseFiles(map[string][]byte{
		"READY/00_north_star.yaml":               []byte("north_star:\n  purpose: x\n"),
		"READY/05_roadmap_recipe.yaml":           []byte(readyRoadmap),
		"FIRE/feature_definitions/fd-001_a.yaml": []byte("id: fd-001\nname: a\n"),
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"north_star", "roadmap_recipe", "fd-001_a"} {
		if _, ok := payloads[k]; !ok {
			t.Errorf("missing %q; have %d payloads", k, len(payloads))
		}
	}
}
