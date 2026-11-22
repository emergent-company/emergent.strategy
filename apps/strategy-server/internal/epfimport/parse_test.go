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

// A work package file is stored under the key the work package tools take
// (wp-001), not under its path, so it can be fetched by id.
func TestArtifactKey_WorkPackageFilesTakeTheirID(t *testing.T) {
	cases := []struct{ rel, want string }{
		{"work_packages/wp-001.yaml", "wp-001"},
		{"work_packages/wp-042.yml", "wp-042"},
		{"_instances/acme/work_packages/wp-007.yaml", "wp-007"}, // instance below the repo root
		{"work_packages/notes.yaml", "work_packages/notes"},     // not a work package file
		{"FIRE/wp-001.yaml", "FIRE/wp-001"},                     // not in work_packages/
		{"FIRE/definitions/product/fd-001_x.yaml", "fd-001_x"},  // others unchanged
	}
	for _, c := range cases {
		if got := epfimport.ArtifactKey(c.rel, c.rel[strings.LastIndex(c.rel, "/")+1:]); got != c.want {
			t.Errorf("ArtifactKey(%q) = %q, want %q", c.rel, got, c.want)
		}
	}
}

// The Product Portfolio page reads the artifact keyed product_portfolio. A
// portfolio file kept under its numbered READY name, or the unnumbered name the
// canonical template has, must get that key; under its path it is stored as a
// generic artifact and the page says it has not been created.
func TestArtifactKey_ProductPortfolioFilenamesBecomeTheKeyThePageReads(t *testing.T) {
	for _, rel := range []string{
		"READY/07_product_portfolio.yaml",
		"READY/product_portfolio.yaml",
		"product_portfolio.yaml",
		"_instances/acme/READY/07_product_portfolio.yaml", // instance below the repo root
		"READY/07_product_portfolio.yml",
	} {
		if got := epfimport.ArtifactKey(rel, rel[strings.LastIndex(rel, "/")+1:]); got != "product_portfolio" {
			t.Errorf("ArtifactKey(%q) = %q, want product_portfolio", rel, got)
		}
	}
	if got := epfimport.ArtifactKey("READY/07_other_portfolio.yaml", "07_other_portfolio.yaml"); got != "READY/07_other_portfolio" {
		t.Errorf("a differently named file keeps its path key, got %q", got)
	}
}

// A file that loses a collision is reported with the file that was kept, so an
// import can say what it did not store: a second roadmap in a per-cycle folder
// was dropped without a word, and the instance had no view of it.
func TestParseFilesDetailed_ReportsTheFileThatLostAndTheOneKept(t *testing.T) {
	files := map[string][]byte{
		"READY/05_roadmap_recipe.yaml":         []byte(readyRoadmap),
		"READY/cycle-3/05_roadmap_recipe.yaml": []byte("roadmap:\n  id: cycle-3\n"),
		"READY/00_north_star.yaml":             []byte("north_star:\n  purpose: x\n"),
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	out, err := epfimport.ParseFilesDetailed(files)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Duplicates) != 1 {
		t.Fatalf("want 1 duplicate, got %+v", out.Duplicates)
	}
	d := out.Duplicates[0]
	if d.Key != "roadmap_recipe" || d.Kept != "READY/05_roadmap_recipe.yaml" || d.Skipped != "READY/cycle-3/05_roadmap_recipe.yaml" {
		t.Fatalf("unexpected duplicate: %+v", d)
	}
	if d.Archived {
		t.Fatal("a READY subfolder is not the archive")
	}
	if got := roadmapID(t, out.Payloads); got != "ready" {
		t.Fatalf("kept %q, want the READY copy", got)
	}
	w := d.Warning()
	for _, want := range []string{"READY/cycle-3/05_roadmap_recipe.yaml", "READY/05_roadmap_recipe.yaml", "cycles/cycle-N", "future_okrs_"} {
		if !strings.Contains(w, want) {
			t.Errorf("warning %q should mention %q", w, want)
		}
	}
}

// The framework archives a completed cycle under cycles/cycle-N/ at the instance
// root, so a snapshot of the assessment or the roadmap there is expected beside
// the current one. It is not a mistake worth a warning on every import.
func TestParseFilesDetailed_AnArchivedCycleCopyIsNotAWarning(t *testing.T) {
	files := map[string][]byte{
		"AIM/assessment_report.yaml":                []byte("roadmap_id: current\n"),
		"cycles/cycle-1/assessment_report.yaml":     []byte("roadmap_id: old\n"),
		"AIM/cycles/cycle-2/assessment_report.yaml": []byte("roadmap_id: older\n"),
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	out, err := epfimport.ParseFilesDetailed(files)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Duplicates) != 2 {
		t.Fatalf("both snapshots lost, got %+v", out.Duplicates)
	}
	for _, d := range out.Duplicates {
		if !d.Archived {
			t.Errorf("%s is under cycles/ and should be marked archived", d.Skipped)
		}
	}
	if w := out.Warnings(); len(w) != 0 {
		t.Fatalf("archived snapshots should not warn, got %v", w)
	}
}

// Every fixed name has the same hazard, not only the roadmap: any of them can
// repeat in a backup folder or a per-cycle folder.
func TestParseFilesDetailed_EveryFixedNameIsChecked(t *testing.T) {
	names := []string{"00_north_star", "01_insight_analyses", "02_strategy_foundations", "03_insight_opportunity",
		"04_strategy_formula", "05_roadmap_recipe", "07_product_portfolio", "assessment_report", "calibration_memo", "mappings"}
	slog.SetDefault(slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	for _, n := range names {
		files := map[string][]byte{
			"READY/" + n + ".yaml":        []byte("a: 1\n"),
			"READY/backup/" + n + ".yaml": []byte("a: 2\n"),
		}
		out, err := epfimport.ParseFilesDetailed(files)
		if err != nil {
			t.Fatal(err)
		}
		if len(out.Warnings()) != 1 {
			t.Errorf("%s: want 1 warning, got %v", n, out.Warnings())
		}
	}
}
