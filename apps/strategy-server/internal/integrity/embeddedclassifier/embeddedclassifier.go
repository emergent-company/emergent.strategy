// Package embeddedclassifier provides the process-wide integrity classifier
// built from the manifest embedded in the binary.
package embeddedclassifier

import (
	"log/slog"
	"sync"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
)

var (
	once       sync.Once
	classifier *integrity.Classifier
)

// Default returns the classifier built from the embedded integrity manifest, or
// nil when it cannot be built. A nil classifier is safe to use: Columns reports
// "never classified".
func Default() *integrity.Classifier {
	once.Do(func() {
		c, err := integrity.NewClassifier(embedded.IntegrityManifest, CurrentCanonical)
		if err != nil {
			slog.Error("integrity classifier unavailable; artifacts will not be classified", "err", err)
			return
		}
		if c.FallbackUsed() {
			slog.Warn("integrity manifest unusable; matching current embedded content only")
		}
		classifier = c
	})
	return classifier
}

// CurrentCanonical returns the embedded templates and definitions keyed by
// their canonical path. It is the classifier's fallback when no manifest is
// available.
func CurrentCanonical() (map[string][]byte, error) {
	paths, err := embedded.ListTemplates()
	if err != nil {
		return nil, err
	}
	out := make(map[string][]byte, len(paths))
	for _, p := range paths {
		data, err := embedded.GetTemplate(p)
		if err != nil {
			return nil, err
		}
		out["templates/"+p] = data
	}
	return out, nil
}
