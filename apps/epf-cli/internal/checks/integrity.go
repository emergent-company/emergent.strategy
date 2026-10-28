package checks

import (
	"io/fs"
	"sort"
	"strings"
	"sync"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/integrity"
)

// IntegrityFile is a file in the instance that is unmodified framework content
// and holds no decision of the company's own.
type IntegrityFile struct {
	File  string `json:"file"`
	Class string `json:"class"`
	Rule  string `json:"rule"`
	Ref   string `json:"ref,omitempty"`
}

// ContentIntegrity reports how much of an instance is unmodified framework
// content: canonical definitions, templates and packaged value models that were
// copied in by init or sync and never edited. It is advisory: it changes
// neither the readiness score nor the exit code unless strict mode asks for it.
type ContentIntegrity struct {
	// Source says what the files were matched against, including when only the
	// current embedded content was available.
	Source string `json:"source"`
	// Counts is the number of files per integrity class.
	Counts map[string]int `json:"counts"`
	// CanonicalDefinitions counts unmodified canonical definitions. They are
	// expected to be present, so they are counted and not listed.
	CanonicalDefinitions int `json:"canonical_definitions"`
	// Files lists unmodified templates and packaged value models, which are the
	// ones that should be authored or removed.
	Files []IntegrityFile `json:"files,omitempty"`
}

// StrictFailures returns the files that strict mode treats as errors: unmodified
// templates, which hold sample content in place of the company's own.
func (ci *ContentIntegrity) StrictFailures() []IntegrityFile {
	if ci == nil {
		return nil
	}
	var out []IntegrityFile
	for _, f := range ci.Files {
		if f.Class == string(integrity.ClassUnmodifiedTemplate) {
			out = append(out, f)
		}
	}
	return out
}

var (
	classifierOnce sync.Once
	classifier     *integrity.Classifier
)

// embeddedClassifier returns the classifier built from the embedded integrity
// manifest, or nil when it cannot be built.
func embeddedClassifier() *integrity.Classifier {
	classifierOnce.Do(func() {
		c, err := integrity.NewClassifier(embedded.IntegrityManifest, currentEmbeddedCanonical)
		if err == nil {
			classifier = c
		}
	})
	return classifier
}

// currentEmbeddedCanonical returns the embedded templates and definitions keyed
// by canonical path, used when no manifest is available.
func currentEmbeddedCanonical() (map[string][]byte, error) {
	out := map[string][]byte{}
	err := fs.WalkDir(embedded.Templates, "templates", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || (!strings.HasSuffix(p, ".yaml") && !strings.HasSuffix(p, ".yml")) {
			return nil
		}
		data, err := embedded.Templates.ReadFile(p)
		if err != nil {
			return err
		}
		out[p] = data
		return nil
	})
	return out, err
}

// integrityRecorder accumulates the classification of the files of one walk.
type integrityRecorder struct {
	cl     *integrity.Classifier
	result *ContentIntegrity
}

func newIntegrityRecorder() *integrityRecorder {
	cl := embeddedClassifier()
	r := &integrityRecorder{cl: cl, result: &ContentIntegrity{Counts: map[string]int{}}}
	if cl != nil {
		r.result.Source = cl.Summary()
	} else {
		r.result.Source = "integrity classification unavailable"
	}
	return r
}

// record classifies one YAML file. relPath is the path relative to the instance.
func (r *integrityRecorder) record(relPath string, data []byte) {
	if r.cl == nil {
		return
	}
	res, ok := r.cl.ClassifyYAML(data)
	if !ok {
		return
	}
	class := string(res.Class)
	r.result.Counts[class]++
	if res.Class == integrity.ClassCanonicalReference {
		r.result.CanonicalDefinitions++
		return
	}
	r.result.Files = append(r.result.Files, IntegrityFile{File: relPath, Class: class, Rule: res.Class.RuleID(), Ref: res.Ref})
}

// finish returns the result with files in a stable order.
func (r *integrityRecorder) finish() *ContentIntegrity {
	sort.Slice(r.result.Files, func(i, j int) bool { return r.result.Files[i].File < r.result.Files[j].File })
	return r.result
}
