package integrity

import (
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"
)

// ManifestVersion is the version of the manifest file format.
const ManifestVersion = 1

// Kinds of canonical content recorded in the manifest.
const (
	KindDefinition  = "definition"
	KindTemplate    = "template"
	KindValueModel  = "value_model"
	KindAIMTemplate = "aim_template"
)

// Entry describes one distinct canonical document, identified by its
// normalised hash.
type Entry struct {
	Kind     string   `json:"kind"`
	Refs     []string `json:"refs"`
	Releases []string `json:"releases"`
}

// SkippedFile records a canonical file that could not be hashed.
type SkippedFile struct {
	Path    string `json:"path"`
	Release string `json:"release"`
	Reason  string `json:"reason"`
}

// Manifest maps the normalised hash of every canonical template, definition,
// value model and AIM template, for every release, to what it is and when it
// shipped.
type Manifest struct {
	ManifestVersion int              `json:"manifest_version"`
	Normalisation   string           `json:"normalisation"`
	CurrentRelease  string           `json:"current_release"`
	Releases        []string         `json:"releases"`
	Entries         map[string]Entry `json:"entries"`
	Skipped         []SkippedFile    `json:"skipped,omitempty"`
}

// Source supplies canonical files per release, oldest release first.
type Source interface {
	Releases() ([]string, error)
	// Files returns the canonical YAML-bearing files of a release, keyed by
	// slash-separated path relative to the canonical repository root.
	Files(release string) (map[string][]byte, error)
}

// KindForPath classifies a canonical file by its path.
func KindForPath(p string) string {
	p = path.Clean(strings.ReplaceAll(p, "\\", "/"))
	switch {
	case strings.Contains(p, "/_template/"):
		return KindTemplate
	case strings.Contains(p, "value_models/"):
		return KindValueModel
	case strings.HasPrefix(p, "templates/AIM/"):
		return KindAIMTemplate
	case strings.HasPrefix(p, "definitions/") || strings.Contains(p, "/definitions/"):
		return KindDefinition
	default:
		return KindTemplate
	}
}

func isYAML(p string) bool {
	ext := strings.ToLower(path.Ext(p))
	return ext == ".yaml" || ext == ".yml"
}

// BuildManifest hashes every YAML file of every release in the source.
func BuildManifest(src Source) (*Manifest, error) {
	releases, err := src.Releases()
	if err != nil {
		return nil, fmt.Errorf("list releases: %w", err)
	}
	m := &Manifest{
		ManifestVersion: ManifestVersion,
		Normalisation:   NormalisationVersion,
		Releases:        releases,
		Entries:         map[string]Entry{},
	}
	if len(releases) > 0 {
		m.CurrentRelease = releases[len(releases)-1]
	}

	skipped := map[string]bool{}
	for _, rel := range releases {
		files, err := src.Files(rel)
		if err != nil {
			return nil, fmt.Errorf("read release %s: %w", rel, err)
		}
		paths := make([]string, 0, len(files))
		for p := range files {
			if isYAML(p) {
				paths = append(paths, p)
			}
		}
		sort.Strings(paths)
		for _, p := range paths {
			h, err := HashYAML(files[p])
			if err != nil {
				if !skipped[p] {
					skipped[p] = true
					m.Skipped = append(m.Skipped, SkippedFile{Path: p, Release: rel, Reason: err.Error()})
				}
				continue
			}
			e, ok := m.Entries[h]
			if !ok {
				e.Kind = KindForPath(p)
			}
			e.Refs = appendUnique(e.Refs, p)
			e.Releases = appendUnique(e.Releases, rel)
			m.Entries[h] = e
		}
	}
	for h, e := range m.Entries {
		sort.Strings(e.Refs)
		m.Entries[h] = e
	}
	return m, nil
}

func appendUnique(list []string, s string) []string {
	for _, v := range list {
		if v == s {
			return list
		}
	}
	return append(list, s)
}

// MarshalJSON renders the manifest deterministically (map keys are sorted by
// encoding/json) with indentation, so regenerated files diff cleanly.
func (m *Manifest) MarshalJSON() ([]byte, error) {
	type plain Manifest
	b, err := json.MarshalIndent((*plain)(m), "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode manifest: %w", err)
	}
	return append(b, '\n'), nil
}

// ParseManifest reads a manifest and refuses one produced by a different
// normalisation, because its hashes would never match.
func ParseManifest(data []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	if m.Normalisation != NormalisationVersion {
		return nil, fmt.Errorf("manifest normalisation %q is not supported (want %q)", m.Normalisation, NormalisationVersion)
	}
	if m.Entries == nil {
		m.Entries = map[string]Entry{}
	}
	return &m, nil
}

// Lookup returns the manifest entry for a normalised hash.
func (m *Manifest) Lookup(hash string) (Entry, bool) {
	e, ok := m.Entries[hash]
	return e, ok
}
