package handler

import (
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// recordField is one labelled value of a record card.
type recordField struct{ key, label string }

// recordSpec describes a section whose entries share one card: a headline field,
// labelled values and labelled lists. The same spec drives reading and the list
// of shown paths, so a field added to a spec is both rendered and accounted for.
type recordSpec struct {
	kind   string
	path   []string
	head   string
	facts  []recordField
	lists  []recordField
	single bool // the path holds one object, not a list of entries
}

// readRecords reads every spec from the payload. An entry with nothing readable
// is skipped, and a section with no entries is left out.
func readRecords(payload map[string]any, specs []recordSpec) []ui.RecordSection {
	var out []ui.RecordSection
	for _, spec := range specs {
		var entries []map[string]any
		if spec.single {
			if m, ok := tolDig(payload, spec.path...).(map[string]any); ok {
				entries = []map[string]any{m}
			}
		} else {
			entries = tolItems(tolDig(payload, spec.path...), spec.head)
		}
		var records []ui.Record
		for _, m := range entries {
			rec := ui.Record{Head: tolStr(m, spec.head)}
			for _, f := range spec.facts {
				if v := tolStr(m, f.key); v != "" {
					rec.Facts = append(rec.Facts, ui.RecordFact{Label: f.label, Value: v})
				}
			}
			for _, f := range spec.lists {
				if items := tolStrs(m, f.key); len(items) > 0 {
					rec.Lists = append(rec.Lists, ui.RecordList{Label: f.label, Items: items})
				}
			}
			if rec.Head != "" || len(rec.Facts) > 0 || len(rec.Lists) > 0 {
				records = append(records, rec)
			}
		}
		if len(records) > 0 {
			out = append(out, ui.RecordSection{Kind: spec.kind, Records: records})
		}
	}
	return out
}

// entryPaths names a list of entries for unshownContent: the entries themselves
// (an entry that is a plain string) and each field of an entry.
func entryPaths(base string, fields ...string) []string {
	out := []string{base + ".*"}
	for _, f := range fields {
		out = append(out, base+".*."+f)
	}
	return out
}

// recordPaths lists the payload paths that the specs read.
func recordPaths(specs []recordSpec) []string {
	var paths []string
	for _, spec := range specs {
		base := strings.Join(spec.path, ".")
		var fields []string
		if spec.head != "" {
			fields = append(fields, spec.head)
		}
		for _, f := range spec.facts {
			fields = append(fields, f.key)
		}
		for _, f := range spec.lists {
			fields = append(fields, f.key)
		}
		if spec.single {
			for _, f := range fields {
				paths = append(paths, base+"."+f)
			}
			continue
		}
		paths = append(paths, entryPaths(base, fields...)...)
	}
	return paths
}
