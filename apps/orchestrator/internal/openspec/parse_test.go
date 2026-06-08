package openspec

import (
	"os"
	"path/filepath"
	"testing"
)

// writeChange creates a change directory tree under root for testing.
func writeChange(t *testing.T, root, id, proposal, tasks string, footprints ...string) {
	t.Helper()
	dir := filepath.Join(root, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if proposal != "" {
		if err := os.WriteFile(filepath.Join(dir, "proposal.md"), []byte(proposal), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if tasks != "" {
		if err := os.WriteFile(filepath.Join(dir, "tasks.md"), []byte(tasks), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, fp := range footprints {
		specDir := filepath.Join(dir, "specs", fp)
		if err := os.MkdirAll(specDir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(specDir, "spec.md"), []byte("## ADDED Requirements\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func findChange(changes []Change, id string) (Change, bool) {
	for _, c := range changes {
		if c.ID == id {
			return c, true
		}
	}
	return Change{}, false
}

func TestLoadChangesExtractsFootprintsAndTasks(t *testing.T) {
	root := t.TempDir()
	writeChange(t, root, "add-foo",
		"# Change: Add Foo\n## Why\nbecause\n",
		"# Tasks\n- [x] 1.1 done\n- [ ] 1.2 todo\n- [ ] 1.3 todo\n",
		"spec-a", "spec-b")

	changes, err := LoadChanges(root)
	if err != nil {
		t.Fatal(err)
	}
	c, ok := findChange(changes, "add-foo")
	if !ok {
		t.Fatal("add-foo not found")
	}
	if c.Title != "Add Foo" {
		t.Errorf("title = %q, want %q", c.Title, "Add Foo")
	}
	if len(c.Footprints) != 2 || c.Footprints[0] != "spec-a" || c.Footprints[1] != "spec-b" {
		t.Errorf("footprints = %v, want [spec-a spec-b]", c.Footprints)
	}
	if c.TaskCount != 3 || c.TasksDone != 1 {
		t.Errorf("tasks = %d/%d, want 1/3", c.TasksDone, c.TaskCount)
	}
	if c.Done() {
		t.Error("change should not be Done with 1/3 tasks")
	}
}

func TestLoadChangesExtractsSummaryFromWhy(t *testing.T) {
	root := t.TempDir()
	writeChange(t, root, "with-why",
		"# Change: Cool Feature\n\n## Why\n\nUsers need a faster way to do the thing.\nIt saves time.\n\n## What Changes\n\n- stuff\n",
		"- [ ] 1.1 x\n", "spec-a")

	changes, err := LoadChanges(root)
	if err != nil {
		t.Fatal(err)
	}
	c, _ := findChange(changes, "with-why")
	if c.Summary != "Users need a faster way to do the thing. It saves time." {
		t.Errorf("summary = %q", c.Summary)
	}
	q := c.SemanticQuery()
	if q == "" || q == "spec-a" {
		t.Errorf("semantic query should combine title+summary, got %q", q)
	}
}

func TestLoadChangesSkipsArchiveAndDotfiles(t *testing.T) {
	root := t.TempDir()
	writeChange(t, root, "real", "# Change: Real\n", "- [ ] 1.1 x\n", "spec-a")
	writeChange(t, root, "archive", "# Change: Archived\n", "- [ ] 1.1 x\n", "spec-z")
	if err := os.MkdirAll(filepath.Join(root, ".hidden"), 0o755); err != nil {
		t.Fatal(err)
	}

	changes, err := LoadChanges(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) != 1 || changes[0].ID != "real" {
		t.Fatalf("expected only 'real', got %v", changes)
	}
}

func TestLoadChangesHandlesZeroFootprints(t *testing.T) {
	root := t.TempDir()
	writeChange(t, root, "no-specs", "# Change: No Specs\n", "- [ ] 1.1 x\n")

	changes, err := LoadChanges(root)
	if err != nil {
		t.Fatal(err)
	}
	c, ok := findChange(changes, "no-specs")
	if !ok {
		t.Fatal("no-specs not found")
	}
	if len(c.Footprints) != 0 {
		t.Errorf("expected zero footprints, got %v", c.Footprints)
	}
}

func TestDoneRequiresAtLeastOneTask(t *testing.T) {
	c := Change{TaskCount: 0, TasksDone: 0}
	if c.Done() {
		t.Error("a change with no tasks must not be Done")
	}
	c = Change{TaskCount: 2, TasksDone: 2}
	if !c.Done() {
		t.Error("a change with all tasks complete must be Done")
	}
}

func TestDetectCrossRefs(t *testing.T) {
	root := t.TempDir()
	writeChange(t, root, "alpha",
		"# Change: Alpha\n",
		"# Tasks\n- [ ] 1.1 reconcile with beta, don't duplicate\n- [ ] 1.2 normal\n",
		"spec-a")
	writeChange(t, root, "beta",
		"# Change: Beta\n",
		"# Tasks\n- [ ] 1.1 standalone work\n",
		"spec-b")

	changes, err := LoadChanges(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := DetectCrossRefs(changes); err != nil {
		t.Fatal(err)
	}

	alpha, _ := findChange(changes, "alpha")
	if len(alpha.CrossRefs) != 1 || alpha.CrossRefs[0] != "beta" {
		t.Errorf("alpha cross-refs = %v, want [beta]", alpha.CrossRefs)
	}
	beta, _ := findChange(changes, "beta")
	if len(beta.CrossRefs) != 0 {
		t.Errorf("beta cross-refs = %v, want none", beta.CrossRefs)
	}
}

func TestClassifyTaskLine(t *testing.T) {
	cases := []struct {
		line           string
		open, complete bool
	}{
		{"- [ ] todo", true, false},
		{"- [x] done", false, true},
		{"- [X] done caps", false, true},
		{"* [ ] star bullet", true, false},
		{"+ [x] plus bullet", false, true},
		{"## Heading", false, false},
		{"plain text", false, false},
		{"- not a checkbox", false, false},
	}
	for _, tc := range cases {
		open, complete := classifyTaskLine(tc.line)
		if open != tc.open || complete != tc.complete {
			t.Errorf("classifyTaskLine(%q) = (%v,%v), want (%v,%v)", tc.line, open, complete, tc.open, tc.complete)
		}
	}
}
