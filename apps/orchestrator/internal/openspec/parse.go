// Package openspec reads OpenSpec change proposals directly from the filesystem.
//
// It is deliberately read-only and dependency-free. The orchestrator is an
// independent system from strategy-server; it consumes the OpenSpec change
// artifacts (the explicit handoff) without importing any strategy logic.
//
// Track 1: this reads openspec/changes/ files directly (no migration needed).
// Track 2: the same Change/Footprint types can later be hydrated from
// strategy-server's Postgres-backed spec_proposal artifacts instead, leaving
// the scheduler and scorecard layers unchanged.
package openspec

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Change is a single OpenSpec change proposal.
type Change struct {
	// ID is the change directory name (e.g. "add-evidence-lobby-extraction").
	ID string
	// Footprints are the spec/capability names the change touches, derived
	// from the subdirectories under <change>/specs/. May be empty.
	Footprints []string
	// TaskCount is the total number of task checkboxes in tasks.md.
	TaskCount int
	// TasksDone is the number of completed ([x]) task checkboxes.
	TasksDone int
	// CrossRefs are other change IDs explicitly mentioned in tasks.md.
	// These usually indicate a human reconciliation requirement
	// (e.g. "subsume, don't duplicate add-continuous-strategy-loop").
	CrossRefs []string
	// Title is the first H1 of proposal.md, with the "Change: " prefix stripped.
	Title string
	// Summary is the prose under the proposal's "## Why" section (first
	// paragraph), used as semantic-search content for strategic scoring. The
	// footprint slugs are for collision detection, not graph queries.
	Summary string
	// Dir is the absolute path to the change directory.
	Dir string
}

// SemanticQuery returns human-meaningful text describing the change, for use as
// a strategy-graph search query. It combines the title and the summary because
// footprint slugs (e.g. "strategy-web") are not graph-searchable content.
func (c Change) SemanticQuery() string {
	q := c.Title
	if c.Summary != "" {
		q += ". " + c.Summary
	}
	return q
}

// Done reports whether every task in the change is complete (and there is at
// least one task). A change with no tasks is not considered done.
func (c Change) Done() bool {
	return c.TaskCount > 0 && c.TasksDone == c.TaskCount
}

// LoadChanges discovers and parses every active change under changesDir.
// The "archive" directory and dotfiles are skipped. Results are sorted by ID
// for deterministic output.
func LoadChanges(changesDir string) ([]Change, error) {
	entries, err := os.ReadDir(changesDir)
	if err != nil {
		return nil, fmt.Errorf("read changes dir %q: %w", changesDir, err)
	}

	var changes []Change
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if name == "archive" || strings.HasPrefix(name, ".") {
			continue
		}
		dir := filepath.Join(changesDir, name)
		ch, err := loadChange(name, dir)
		if err != nil {
			return nil, fmt.Errorf("load change %q: %w", name, err)
		}
		changes = append(changes, ch)
	}

	sort.Slice(changes, func(i, j int) bool { return changes[i].ID < changes[j].ID })
	return changes, nil
}

// changeIDFromName reports whether name looks like a change ID we can match in
// free text. We only match IDs we actually know about (see DetectCrossRefs),
// so this is a loose shape check used during discovery.
func loadChange(id, dir string) (Change, error) {
	ch := Change{ID: id, Dir: dir}

	footprints, err := loadFootprints(dir)
	if err != nil {
		return Change{}, err
	}
	ch.Footprints = footprints

	title, summary, err := loadProposalText(filepath.Join(dir, "proposal.md"))
	if err != nil {
		return Change{}, err
	}
	ch.Title = title
	ch.Summary = summary

	total, done, err := loadTaskCounts(filepath.Join(dir, "tasks.md"))
	if err != nil {
		return Change{}, err
	}
	ch.TaskCount = total
	ch.TasksDone = done

	return ch, nil
}

// loadFootprints returns the spec subdirectory names under <dir>/specs/.
// A missing specs/ directory yields zero footprints (valid; e.g.
// complete-i18n-templ-prose has none).
func loadFootprints(dir string) ([]string, error) {
	specsDir := filepath.Join(dir, "specs")
	entries, err := os.ReadDir(specsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read specs dir %q: %w", specsDir, err)
	}

	var footprints []string
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		footprints = append(footprints, e.Name())
	}
	sort.Strings(footprints)
	return footprints, nil
}

// loadProposalText reads the first H1 title (with "Change: " stripped) and the
// first prose paragraph under the "## Why" section from proposal.md. A missing
// file yields empty strings rather than an error, so the planner stays robust
// against incomplete proposals.
func loadProposalText(proposalPath string) (title, summary string, err error) {
	f, err := os.Open(proposalPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", "", nil
		}
		return "", "", fmt.Errorf("open %q: %w", proposalPath, err)
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	inWhy := false
	var summaryLines []string
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())

		if title == "" && strings.HasPrefix(line, "# ") {
			t := strings.TrimSpace(strings.TrimPrefix(line, "# "))
			title = strings.TrimSpace(strings.TrimPrefix(t, "Change:"))
			continue
		}

		// Enter the Why section; collect its first paragraph.
		if strings.EqualFold(line, "## Why") {
			inWhy = true
			continue
		}
		if inWhy {
			if strings.HasPrefix(line, "##") {
				break // next section; summary done
			}
			if line == "" {
				if len(summaryLines) > 0 {
					break // end of first paragraph
				}
				continue // skip leading blank lines
			}
			summaryLines = append(summaryLines, line)
		}
	}
	if err := sc.Err(); err != nil {
		return "", "", fmt.Errorf("scan %q: %w", proposalPath, err)
	}
	return title, strings.Join(summaryLines, " "), nil
}

// loadTaskCounts counts markdown task checkboxes in tasks.md.
// "- [ ]" is an open task; "- [x]" or "- [X]" is a completed task.
func loadTaskCounts(tasksPath string) (total, done int, err error) {
	f, err := os.Open(tasksPath)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, 0, nil
		}
		return 0, 0, fmt.Errorf("open %q: %w", tasksPath, err)
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		open, complete := classifyTaskLine(line)
		if open || complete {
			total++
		}
		if complete {
			done++
		}
	}
	if err := sc.Err(); err != nil {
		return 0, 0, fmt.Errorf("scan %q: %w", tasksPath, err)
	}
	return total, done, nil
}

// classifyTaskLine reports whether a trimmed line is an open or completed task
// checkbox. It tolerates leading list markers ("- ", "* ", "+ ").
func classifyTaskLine(line string) (open, complete bool) {
	for _, marker := range []string{"- ", "* ", "+ "} {
		if strings.HasPrefix(line, marker) {
			rest := line[len(marker):]
			switch {
			case strings.HasPrefix(rest, "[ ]"):
				return true, false
			case strings.HasPrefix(rest, "[x]"), strings.HasPrefix(rest, "[X]"):
				return false, true
			}
		}
	}
	return false, false
}

// DetectCrossRefs scans each change's tasks.md for explicit mentions of OTHER
// known change IDs, and populates Change.CrossRefs. These mentions are strong
// signals of a required human reconciliation decision before the change can be
// dispatched (the "subsume, don't duplicate" case).
//
// It mutates and returns the input slice for convenience.
func DetectCrossRefs(changes []Change) ([]Change, error) {
	known := make(map[string]struct{}, len(changes))
	for _, c := range changes {
		known[c.ID] = struct{}{}
	}

	for i := range changes {
		refs, err := scanCrossRefs(filepath.Join(changes[i].Dir, "tasks.md"), changes[i].ID, known)
		if err != nil {
			return nil, fmt.Errorf("detect cross-refs for %q: %w", changes[i].ID, err)
		}
		changes[i].CrossRefs = refs
	}
	return changes, nil
}

// scanCrossRefs returns the sorted, de-duplicated set of known change IDs
// (other than self) mentioned anywhere in the file at path.
func scanCrossRefs(path, self string, known map[string]struct{}) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read %q: %w", path, err)
	}
	text := string(data)

	found := make(map[string]struct{})
	for id := range known {
		if id == self {
			continue
		}
		if strings.Contains(text, id) {
			found[id] = struct{}{}
		}
	}

	refs := make([]string, 0, len(found))
	for id := range found {
		refs = append(refs, id)
	}
	sort.Strings(refs)
	return refs, nil
}
