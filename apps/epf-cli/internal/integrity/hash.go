// Package integrity recognises unmodified canonical EPF content inside an
// instance. It defines the normalised content hash, the per-release manifest of
// canonical hashes, and the classification vocabulary shared with
// strategy-server.
package integrity

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"gopkg.in/yaml.v3"
)

// NormalisationVersion identifies the hashing procedure. It is written into the
// manifest so a consumer can refuse a manifest it cannot compare against.
const NormalisationVersion = "yaml-json-sortedkeys-sha256-v1"

// HashYAML returns the normalised content hash of a YAML document: parse, convert
// to JSON, sort keys, SHA-256. Comments, whitespace, quoting and key order do not
// affect the result.
func HashYAML(data []byte) (string, error) {
	var doc any
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return "", fmt.Errorf("parse yaml: %w", err)
	}
	if doc == nil {
		return "", errors.New("empty document")
	}
	raw, err := json.Marshal(normaliseYAML(doc))
	if err != nil {
		return "", fmt.Errorf("encode json: %w", err)
	}
	return HashJSON(raw)
}

// HashJSON returns the normalised content hash of a JSON document, such as a
// payload read back from a jsonb column. It round-trips through a generic value
// so that number formatting and key order match what HashYAML produces.
func HashJSON(data []byte) (string, error) {
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return "", fmt.Errorf("parse json: %w", err)
	}
	canonical, err := json.Marshal(v)
	if err != nil {
		return "", fmt.Errorf("encode canonical json: %w", err)
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

// normaliseYAML converts yaml.v3 maps with non-string keys into string-keyed
// maps so they can be marshalled to JSON.
func normaliseYAML(v any) any {
	switch val := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, vv := range val {
			out[k] = normaliseYAML(vv)
		}
		return out
	case map[any]any:
		out := make(map[string]any, len(val))
		for k, vv := range val {
			out[fmt.Sprintf("%v", k)] = normaliseYAML(vv)
		}
		return out
	case []any:
		out := make([]any, len(val))
		for i, item := range val {
			out[i] = normaliseYAML(item)
		}
		return out
	default:
		return val
	}
}
