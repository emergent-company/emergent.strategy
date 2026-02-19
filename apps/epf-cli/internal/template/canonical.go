package template

import (
	"path/filepath"
	"strings"
)

// CanonicalTracks is the set of tracks whose artifacts are framework-provided (canonical).
// Product track artifacts are user-authored (example).
var CanonicalTracks = map[Track]bool{
	TrackStrategy:   true,
	TrackOrgOps:     true,
	TrackCommercial: true,
}

// CanonicalDefinitionPrefixes maps definition ID prefixes to their canonical status.
// sd-* = strategy (canonical), pd-* = org_ops (canonical), cd-* = commercial (canonical).
// fd-* = product (example/user-authored).
var CanonicalDefinitionPrefixes = map[string]bool{
	"sd": true, // strategy definitions
	"pd": true, // org_ops (process) definitions
	"cd": true, // commercial definitions
}

// CanonicalValueModelTracks lists the value model track directory names
// that correspond to canonical tracks.
var CanonicalValueModelTracks = map[string]bool{
	"strategy":   true,
	"org_ops":    true,
	"commercial": true,
}

// IsCanonicalTrack returns true if the given track is canonical (framework-provided).
// Canonical tracks are: strategy, org_ops, commercial.
// The product track is user-authored and NOT canonical.
func IsCanonicalTrack(track Track) bool {
	return CanonicalTracks[track]
}

// IsCanonicalTrackString returns true if the track name string represents a canonical track.
// Accepts both normalized forms ("org_ops") and common variants ("orgops", "OrgOps").
func IsCanonicalTrackString(trackName string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(trackName, "-", "_"))
	switch normalized {
	case "strategy", "org_ops", "orgops", "commercial":
		return true
	default:
		return false
	}
}

// IsCanonicalDefinitionID returns true if the definition ID belongs to a canonical track.
// Canonical definition IDs have prefixes: sd-, pd-, cd-.
// Product definition IDs have prefix: fd-.
func IsCanonicalDefinitionID(id string) bool {
	parts := strings.SplitN(id, "-", 2)
	if len(parts) < 2 {
		return false
	}
	return CanonicalDefinitionPrefixes[parts[0]]
}

// IsCanonicalArtifact returns true if the file at the given path is a canonical artifact.
// Detection is based on:
//   - Definition file prefix (sd-*, pd-*, cd-* in filename)
//   - Parent directory indicating a canonical track (definitions/strategy/, etc.)
//   - Value model track (value_models/strategy_value_model.yaml, etc.)
func IsCanonicalArtifact(filePath string) bool {
	// Normalize path separators (handle both / and \ regardless of OS)
	normalized := strings.ReplaceAll(filePath, "\\", "/")
	base := normalized[strings.LastIndex(normalized, "/")+1:]

	// Check 1: Definition file prefix
	if IsCanonicalDefinitionID(base) {
		return true
	}
	// Also check without extension
	nameWithoutExt := strings.TrimSuffix(base, filepath.Ext(base))
	if IsCanonicalDefinitionID(nameWithoutExt) {
		return true
	}

	// Check 2: Value model files for canonical tracks
	lowerBase := strings.ToLower(base)
	for trackName := range CanonicalValueModelTracks {
		if strings.Contains(lowerBase, trackName+"_value_model") ||
			strings.Contains(lowerBase, trackName+"_vm") {
			return true
		}
	}

	// Check 3: Parent directory is a canonical track definition directory
	parts := strings.Split(normalized, "/")
	for i, part := range parts {
		if part == "definitions" && i+1 < len(parts) {
			trackDir := strings.ToLower(parts[i+1])
			if CanonicalValueModelTracks[trackDir] {
				return true
			}
		}
	}

	return false
}

// IsProductTrack returns true if the given track is the product track (user-authored).
func IsProductTrack(track Track) bool {
	return track == TrackProduct
}

// IsProductTrackString returns true if the track name string represents the product track.
func IsProductTrackString(trackName string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(trackName, "-", "_"))
	return normalized == "product"
}

// TrackCategory represents whether a track is canonical or user-authored.
type TrackCategory string

const (
	TrackCategoryCanonical TrackCategory = "canonical"
	TrackCategoryProduct   TrackCategory = "product"
)

// GetTrackCategory returns whether a track is canonical or product (user-authored).
func GetTrackCategory(track Track) TrackCategory {
	if IsCanonicalTrack(track) {
		return TrackCategoryCanonical
	}
	return TrackCategoryProduct
}

// GetTrackCategoryString returns the category for a track name string.
func GetTrackCategoryString(trackName string) TrackCategory {
	if IsCanonicalTrackString(trackName) {
		return TrackCategoryCanonical
	}
	return TrackCategoryProduct
}

// ClassifyValueModelPath determines if a value model path like "Product.Core.Search"
// or "Strategy.Growth.MarketExpansion" belongs to a canonical or product track.
// The first segment of the path is the track indicator.
func ClassifyValueModelPath(vmPath string) TrackCategory {
	parts := strings.SplitN(vmPath, ".", 2)
	if len(parts) == 0 {
		return TrackCategoryProduct // default to product if unknown
	}
	first := strings.ToLower(parts[0])
	switch first {
	case "strategy", "orgops", "org_ops", "commercial":
		return TrackCategoryCanonical
	default:
		return TrackCategoryProduct
	}
}
