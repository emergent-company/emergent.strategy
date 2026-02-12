// Package migration - Semantic version comparison utilities for EPF artifact versioning.
package migration

import (
	"fmt"
	"strconv"
	"strings"
)

// Version represents a parsed semantic version (major.minor.patch).
type Version struct {
	Major int
	Minor int
	Patch int
	Raw   string
}

// ParseVersion parses a semver string like "2.12.0" into its numeric components.
// Returns an error if the string is not a valid semver format.
func ParseVersion(s string) (Version, error) {
	if s == "" || s == "unknown" {
		return Version{Raw: s}, fmt.Errorf("invalid version string: %q", s)
	}

	// Strip leading "v" if present
	s = strings.TrimPrefix(s, "v")

	parts := strings.Split(s, ".")
	if len(parts) < 2 || len(parts) > 3 {
		return Version{Raw: s}, fmt.Errorf("invalid version format: %q (expected major.minor or major.minor.patch)", s)
	}

	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return Version{Raw: s}, fmt.Errorf("invalid major version in %q: %w", s, err)
	}

	minor, err := strconv.Atoi(parts[1])
	if err != nil {
		return Version{Raw: s}, fmt.Errorf("invalid minor version in %q: %w", s, err)
	}

	patch := 0
	if len(parts) == 3 {
		patch, err = strconv.Atoi(parts[2])
		if err != nil {
			return Version{Raw: s}, fmt.Errorf("invalid patch version in %q: %w", s, err)
		}
	}

	return Version{
		Major: major,
		Minor: minor,
		Patch: patch,
		Raw:   s,
	}, nil
}

// CompareVersions compares two semver strings numerically.
// Returns:
//
//	-1 if a < b
//	 0 if a == b
//	+1 if a > b
//
// Returns an error if either version string is unparseable.
func CompareVersions(a, b string) (int, error) {
	va, err := ParseVersion(a)
	if err != nil {
		return 0, fmt.Errorf("cannot parse version A: %w", err)
	}
	vb, err := ParseVersion(b)
	if err != nil {
		return 0, fmt.Errorf("cannot parse version B: %w", err)
	}

	if va.Major != vb.Major {
		if va.Major < vb.Major {
			return -1, nil
		}
		return 1, nil
	}
	if va.Minor != vb.Minor {
		if va.Minor < vb.Minor {
			return -1, nil
		}
		return 1, nil
	}
	if va.Patch != vb.Patch {
		if va.Patch < vb.Patch {
			return -1, nil
		}
		return 1, nil
	}

	return 0, nil
}

// IsUpgrade returns true if migrating from 'from' to 'to' is an upgrade
// (i.e., 'to' is strictly newer than 'from').
// Returns false if versions are equal, if 'to' is older, or if either is unparseable.
func IsUpgrade(from, to string) bool {
	cmp, err := CompareVersions(from, to)
	if err != nil {
		return false
	}
	return cmp < 0 // from < to means it's an upgrade
}

// IsDowngrade returns true if migrating from 'from' to 'to' would be a downgrade
// (i.e., 'to' is strictly older than 'from').
func IsDowngrade(from, to string) bool {
	cmp, err := CompareVersions(from, to)
	if err != nil {
		return false
	}
	return cmp > 0 // from > to means it's a downgrade
}
