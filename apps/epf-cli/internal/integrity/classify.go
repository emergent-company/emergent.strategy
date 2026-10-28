package integrity

import (
	"fmt"
	"sort"
)

// Class says what a document is, when it is unmodified framework content rather
// than something the company wrote. The values and rule ids are shared with
// strategy-server, which stores them; do not rename them.
type Class string

// Integrity classes.
const (
	// ClassCanonicalReference is an unmodified canonical definition (sd-*, pd-*, cd-*).
	ClassCanonicalReference Class = "canonical_reference"
	// ClassUnmodifiedTemplate is an unmodified READY, AIM or product template.
	ClassUnmodifiedTemplate Class = "unmodified_template"
	// ClassPackagedDefault is a value model identical to the packaged default.
	ClassPackagedDefault Class = "packaged_default"
	// ClassTemplateValues is an authored document that still holds placeholder values.
	ClassTemplateValues Class = "template_values"
	// ClassNearCanonical is content that matches a canonical item except for edits.
	ClassNearCanonical Class = "near_canonical"
)

// RuleID returns the finding rule id for a class.
func (c Class) RuleID() string { return "integrity." + string(c) }

// Result describes a match against canonical content.
type Result struct {
	Class Class
	// Ref names the canonical file and the latest release that shipped this
	// exact content, for example "definitions/product/pd-031.yaml@2.31.0".
	Ref string
	// Release is the latest release that shipped this exact content.
	Release string
	// Current is true when that release is the current one.
	Current bool
}

// Classifier recognises unmodified canonical content by normalised hash.
type Classifier struct {
	entries  map[string]Entry
	current  string
	releases int
	fallback bool
}

// NewClassifier builds a classifier from an integrity manifest. When the
// manifest is absent, unparseable, from a different normalisation or empty, it
// falls back to hashing the current embedded canonical content supplied by
// current, and FallbackUsed reports that.
func NewClassifier(manifestJSON []byte, current func() (map[string][]byte, error)) (*Classifier, error) {
	if len(manifestJSON) > 0 {
		if m, err := ParseManifest(manifestJSON); err == nil && len(m.Entries) > 0 {
			return &Classifier{entries: m.Entries, current: m.CurrentRelease, releases: len(m.Releases)}, nil
		}
	}
	files, err := current()
	if err != nil {
		return nil, fmt.Errorf("read current canonical content for fallback: %w", err)
	}
	c := &Classifier{entries: map[string]Entry{}, current: "embedded", releases: 1, fallback: true}
	for p, data := range files {
		h, err := HashYAML(data)
		if err != nil {
			continue
		}
		e := c.entries[h]
		if e.Kind == "" {
			e.Kind = KindForPath(p)
		}
		e.Refs = append(e.Refs, p)
		e.Releases = []string{"embedded"}
		c.entries[h] = e
	}
	return c, nil
}

// FallbackUsed reports whether matching uses the current embedded content
// because no usable manifest was available.
func (c *Classifier) FallbackUsed() bool { return c.fallback }

// Version identifies the content this classifier matches against.
func (c *Classifier) Version() string {
	if c.fallback {
		return "fallback:embedded"
	}
	return fmt.Sprintf("manifest:%s:%d", c.current, len(c.entries))
}

// Summary describes what the classifier matches against, so a missing manifest
// is visible in output instead of silent.
func (c *Classifier) Summary() string {
	if c.fallback {
		return "matching against the current embedded canonical content only (integrity manifest not available; fallback in use, older releases are not recognised)"
	}
	return fmt.Sprintf("matching against the integrity manifest (%d releases, current %s)", c.releases, c.current)
}

// ClassifyYAML returns the class of a YAML document when it is exactly
// unmodified canonical content.
func (c *Classifier) ClassifyYAML(data []byte) (Result, bool) {
	h, err := HashYAML(data)
	if err != nil {
		return Result{}, false
	}
	return c.lookup(h)
}

// ClassifyJSON returns the class of a stored JSON payload.
func (c *Classifier) ClassifyJSON(data []byte) (Result, bool) {
	h, err := HashJSON(data)
	if err != nil {
		return Result{}, false
	}
	return c.lookup(h)
}

func (c *Classifier) lookup(hash string) (Result, bool) {
	e, ok := c.entries[hash]
	if !ok {
		return Result{}, false
	}
	release := ""
	if len(e.Releases) > 0 {
		release = e.Releases[len(e.Releases)-1]
	}
	refs := append([]string(nil), e.Refs...)
	sort.Strings(refs)
	ref := ""
	if len(refs) > 0 {
		ref = refs[0] + "@" + release
	}
	return Result{Class: classForKind(e.Kind), Ref: ref, Release: release, Current: release == c.current}, true
}

func classForKind(kind string) Class {
	switch kind {
	case KindDefinition:
		return ClassCanonicalReference
	case KindValueModel:
		return ClassPackagedDefault
	default:
		return ClassUnmodifiedTemplate
	}
}
