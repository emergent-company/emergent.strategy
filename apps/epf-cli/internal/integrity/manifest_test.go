package integrity

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
)

type fakeSource struct {
	releases []string
	files    map[string]map[string]string
}

func (f fakeSource) Releases() ([]string, error) { return f.releases, nil }

func (f fakeSource) Files(release string) (map[string][]byte, error) {
	out := map[string][]byte{}
	for p, c := range f.files[release] {
		out[p] = []byte(c)
	}
	return out, nil
}

func TestKindForPath(t *testing.T) {
	tests := map[string]string{
		"definitions/product/01-technical/pd-001.yaml":          KindDefinition,
		"templates/FIRE/definitions/strategy/context/sd-1.yaml": KindDefinition,
		"templates/FIRE/value_models/product.value_model.yaml":  KindValueModel,
		"templates/AIM/assessment_report.yaml":                  KindAIMTemplate,
		"templates/READY/00_north_star.yaml":                    KindTemplate,
		"templates/FIRE/feature_definition.yaml":                KindTemplate,
		"definitions/product/_template/pd-template.yaml":        KindTemplate,
	}
	for p, want := range tests {
		if got := KindForPath(p); got != want {
			t.Errorf("KindForPath(%q) = %q, want %q", p, got, want)
		}
	}
}

func TestBuildManifest_TracksReleasesPerHash(t *testing.T) {
	src := fakeSource{
		releases: []string{"1.0.0", "1.1.0"},
		files: map[string]map[string]string{
			"1.0.0": {
				"definitions/product/pd-001.yaml": "id: pd-001\nname: Old\n",
				"definitions/product/pd-002.yaml": "id: pd-002\n",
				"templates/READY/readme.md":       "ignored: not yaml extension\n",
			},
			"1.1.0": {
				"definitions/product/pd-001.yaml": "id: pd-001\nname: New\n",
				"definitions/product/pd-002.yaml": "# comment only changes\nid: pd-002\n",
			},
		},
	}
	m, err := BuildManifest(src)
	if err != nil {
		t.Fatalf("BuildManifest: %v", err)
	}
	if m.CurrentRelease != "1.1.0" || !reflect.DeepEqual(m.Releases, []string{"1.0.0", "1.1.0"}) {
		t.Fatalf("releases = %v current = %q", m.Releases, m.CurrentRelease)
	}
	if m.Normalisation != NormalisationVersion {
		t.Errorf("normalisation = %q", m.Normalisation)
	}
	if len(m.Entries) != 3 {
		t.Fatalf("want 3 distinct hashes (pd-001 old/new, pd-002), got %d", len(m.Entries))
	}

	h2, _ := HashYAML([]byte("id: pd-002\n"))
	e, ok := m.Entries[h2]
	if !ok {
		t.Fatal("pd-002 hash missing")
	}
	if !reflect.DeepEqual(e.Releases, []string{"1.0.0", "1.1.0"}) {
		t.Errorf("pd-002 releases = %v, want both (a comment change is not a content change)", e.Releases)
	}
	if e.Kind != KindDefinition || !reflect.DeepEqual(e.Refs, []string{"definitions/product/pd-002.yaml"}) {
		t.Errorf("pd-002 entry = %+v", e)
	}

	hOld, _ := HashYAML([]byte("id: pd-001\nname: Old\n"))
	if got := m.Entries[hOld].Releases; !reflect.DeepEqual(got, []string{"1.0.0"}) {
		t.Errorf("old pd-001 releases = %v, want only 1.0.0", got)
	}
}

func TestBuildManifest_SkipsUnparseableFilesAndReportsThem(t *testing.T) {
	src := fakeSource{
		releases: []string{"1.0.0"},
		files: map[string]map[string]string{
			"1.0.0": {
				"templates/READY/ok.yaml":  "id: ok\n",
				"templates/READY/bad.yaml": "a: [unclosed\n",
			},
		},
	}
	m, err := BuildManifest(src)
	if err != nil {
		t.Fatalf("BuildManifest: %v", err)
	}
	if len(m.Entries) != 1 {
		t.Errorf("entries = %d, want 1", len(m.Entries))
	}
	if len(m.Skipped) != 1 || m.Skipped[0].Path != "templates/READY/bad.yaml" {
		t.Errorf("skipped = %+v, want the unparseable file listed", m.Skipped)
	}
}

func TestBuildManifest_DeterministicJSON(t *testing.T) {
	src := fakeSource{
		releases: []string{"1.0.0"},
		files: map[string]map[string]string{
			"1.0.0": {"definitions/a.yaml": "id: a\n", "definitions/b.yaml": "id: b\n"},
		},
	}
	var outs [][]byte
	for i := 0; i < 3; i++ {
		m, err := BuildManifest(src)
		if err != nil {
			t.Fatal(err)
		}
		b, err := m.MarshalJSON()
		if err != nil {
			t.Fatal(err)
		}
		outs = append(outs, b)
	}
	if string(outs[0]) != string(outs[1]) || string(outs[1]) != string(outs[2]) {
		t.Error("manifest JSON differs between runs")
	}
}

func TestParseManifest_RoundTripAndLookup(t *testing.T) {
	src := fakeSource{
		releases: []string{"1.0.0"},
		files:    map[string]map[string]string{"1.0.0": {"definitions/a.yaml": "id: a\n"}},
	}
	m, _ := BuildManifest(src)
	raw, _ := m.MarshalJSON()

	got, err := ParseManifest(raw)
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}
	h, _ := HashYAML([]byte("id: a\n"))
	e, ok := got.Lookup(h)
	if !ok || e.Kind != KindDefinition {
		t.Errorf("Lookup = %+v, %v", e, ok)
	}
	if _, ok := got.Lookup("deadbeef"); ok {
		t.Error("unknown hash must not match")
	}
}

func TestParseManifest_RejectsUnknownNormalisation(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{"manifest_version": 1, "normalisation": "something-else", "entries": map[string]any{}})
	if _, err := ParseManifest(raw); err == nil {
		t.Error("a manifest produced by a different normalisation must be rejected")
	}
}

func gitIn(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir, "-c", "user.email=t@t", "-c", "user.name=t"}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func TestGitSource_WalksReleaseCommits(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	dir := t.TempDir()
	gitIn(t, dir, "init", "-q")
	write := func(rel, content string) {
		p := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("definitions/a.yaml", "id: a\nv: 1\n")
	gitIn(t, dir, "add", "-A")
	gitIn(t, dir, "commit", "-q", "-m", "Release: Bump version to 1.0.0")
	write("definitions/a.yaml", "id: a\nv: 2\n")
	write("notes.txt", "x")
	gitIn(t, dir, "add", "-A")
	gitIn(t, dir, "commit", "-q", "-m", "unrelated work")
	write("definitions/a.yaml", "id: a\nv: 3\n")
	gitIn(t, dir, "add", "-A")
	gitIn(t, dir, "commit", "-q", "-m", "Release: Bump version to 1.1.0")

	src, err := NewGitSource(dir)
	if err != nil {
		t.Fatalf("NewGitSource: %v", err)
	}
	rel, err := src.Releases()
	if err != nil {
		t.Fatalf("Releases: %v", err)
	}
	if !reflect.DeepEqual(rel, []string{"1.0.0", "1.1.0"}) {
		t.Fatalf("releases = %v, want oldest first, release commits only", rel)
	}
	files, err := src.Files("1.0.0")
	if err != nil {
		t.Fatalf("Files: %v", err)
	}
	if string(files["definitions/a.yaml"]) != "id: a\nv: 1\n" {
		t.Errorf("1.0.0 content = %q", files["definitions/a.yaml"])
	}
	if _, ok := files["notes.txt"]; ok {
		t.Error("only templates/ and definitions/ are read")
	}
}
