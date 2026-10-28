package integrity

import (
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"
)

// Class says what an artifact's content is, when it is unmodified framework
// content rather than something the company wrote.
type Class string

// Integrity classes. The string values are stored in the database and appear in
// rule ids as "integrity.<class>".
const (
	// ClassCanonicalReference is an unmodified canonical definition (sd-*, pd-*, cd-*).
	ClassCanonicalReference Class = "canonical_reference"
	// ClassUnmodifiedTemplate is an unmodified READY, AIM or product template.
	ClassUnmodifiedTemplate Class = "unmodified_template"
	// ClassPackagedDefault is a value model identical to the packaged default.
	ClassPackagedDefault Class = "packaged_default"
	// ClassTemplateValues is an authored artifact that still holds placeholder values.
	ClassTemplateValues Class = "template_values"
	// ClassNearCanonical is content that matches a canonical item except for edits.
	ClassNearCanonical Class = "near_canonical"
)

// RuleID returns the finding rule id for a class.
func (c Class) RuleID() string { return "integrity." + string(c) }

// Manifest kinds, as written by the manifest generator.
const (
	kindDefinition = "definition"
	kindTemplate   = "template"
	kindValueModel = "value_model"
	kindAIM        = "aim_template"
)

type manifestEntry struct {
	Kind     string   `json:"kind"`
	Refs     []string `json:"refs"`
	Releases []string `json:"releases"`
}

type manifest struct {
	ManifestVersion int                      `json:"manifest_version"`
	Normalisation   string                   `json:"normalisation"`
	CurrentRelease  string                   `json:"current_release"`
	Releases        []string                 `json:"releases"`
	Entries         map[string]manifestEntry `json:"entries"`
}

// Result describes a match.
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
	entries  map[string]manifestEntry
	current  string
	releases int
	fallback bool
}

// NewClassifier builds a classifier from an integrity manifest. When the
// manifest is absent, unparseable, from a different normalisation or empty, it
// falls back to hashing the current embedded canonical content supplied by
// current, and FallbackUsed reports that.
func NewClassifier(manifestJSON []byte, current func() (map[string][]byte, error)) (*Classifier, error) {
	if m, ok := parseUsable(manifestJSON); ok {
		return &Classifier{entries: m.Entries, current: m.CurrentRelease, releases: len(m.Releases)}, nil
	}
	files, err := current()
	if err != nil {
		return nil, fmt.Errorf("read current canonical content for fallback: %w", err)
	}
	c := &Classifier{entries: map[string]manifestEntry{}, current: "embedded", releases: 1, fallback: true}
	for p, data := range files {
		h, err := HashYAML(data)
		if err != nil {
			continue
		}
		e := c.entries[h]
		if e.Kind == "" {
			e.Kind = kindForPath(p)
		}
		e.Refs = append(e.Refs, p)
		e.Releases = []string{"embedded"}
		c.entries[h] = e
	}
	return c, nil
}

func parseUsable(raw []byte) (*manifest, bool) {
	if len(raw) == 0 {
		return nil, false
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, false
	}
	if m.Normalisation != NormalisationVersion || len(m.Entries) == 0 {
		return nil, false
	}
	return &m, true
}

// Version identifies the content this classifier matches against. It is stored
// with each classification so that a new canonical release can be detected.
func (c *Classifier) Version() string {
	if c.fallback {
		return "fallback:embedded"
	}
	return fmt.Sprintf("manifest:%s:%d", c.current, len(c.entries))
}

// FallbackUsed reports whether matching uses the current embedded content
// because no usable manifest was available.
func (c *Classifier) FallbackUsed() bool { return c.fallback }

// Summary describes what the classifier matches against, for inclusion in
// findings so a missing manifest is visible.
func (c *Classifier) Summary() string {
	if c.fallback {
		return "matching against the current embedded canonical content only (integrity manifest not available; fallback in use, older releases are not recognised)"
	}
	return fmt.Sprintf("matching against the integrity manifest (%d releases, current %s)", c.releases, c.current)
}

// Classify returns the class of a stored artifact payload (JSON) when it is
// exactly unmodified canonical content.
func (c *Classifier) Classify(payload []byte) (Result, bool) {
	h, err := HashJSON(payload)
	if err != nil {
		return Result{}, false
	}
	e, ok := c.entries[h]
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
	return Result{
		Class:   classForKind(e.Kind),
		Ref:     ref,
		Release: release,
		Current: release == c.current,
	}, true
}

func classForKind(kind string) Class {
	switch kind {
	case kindDefinition:
		return ClassCanonicalReference
	case kindValueModel:
		return ClassPackagedDefault
	default:
		return ClassUnmodifiedTemplate
	}
}

func kindForPath(p string) string {
	p = path.Clean(strings.ReplaceAll(p, "\\", "/"))
	switch {
	case strings.Contains(p, "/_template/"):
		return kindTemplate
	case strings.Contains(p, "value_models/"):
		return kindValueModel
	case strings.HasPrefix(p, "templates/AIM/"):
		return kindAIM
	case strings.HasPrefix(p, "definitions/") || strings.Contains(p, "/definitions/"):
		return kindDefinition
	default:
		return kindTemplate
	}
}

// Columns classifies a stored payload into the values written to the
// integrity_* columns. class and ref are nil for authored content; checkedWith
// is nil only for a nil classifier, which means "never classified". It is safe
// to call on a nil Classifier.
func (c *Classifier) Columns(payload []byte) (class, ref, checkedWith *string) {
	if c == nil {
		return nil, nil, nil
	}
	v := c.Version()
	checkedWith = &v
	if res, ok := c.Classify(payload); ok {
		cl := string(res.Class)
		class = &cl
		if res.Ref != "" {
			r := res.Ref
			ref = &r
		}
	}
	return class, ref, checkedWith
}
