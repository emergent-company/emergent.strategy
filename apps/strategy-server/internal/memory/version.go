package memory

import (
	"context"
	"log/slog"
	"strconv"
	"strings"
)

// MinMemoryVersion is the oldest emergent.memory the ingest is designed for.
// Earlier versions work but lack the content-hash probe that makes re-ingesting
// unchanged objects free, so every ingest would version and re-embed everything.
const MinMemoryVersion = "v0.85.0"

// VersionAtLeast reports whether version have is at least min, comparing the
// numeric major.minor.patch parts and ignoring a leading "v" and any pre-release
// or build suffix. ok is false when either version cannot be parsed.
func VersionAtLeast(have, min string) (atLeast, ok bool) {
	h, okH := parseVersion(have)
	m, okM := parseVersion(min)
	if !okH || !okM {
		return false, false
	}
	for i := range h {
		if h[i] != m[i] {
			return h[i] > m[i], true
		}
	}
	return true, true
}

func parseVersion(v string) ([3]int, bool) {
	var out [3]int
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		v = v[:i]
	}
	parts := strings.Split(v, ".")
	if len(parts) != 3 {
		return out, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return out, false
		}
		out[i] = n
	}
	return out, true
}

// CheckVersion logs the Memory server's version and warns when it is older than
// MinMemoryVersion, cannot be determined, or cannot be reached. It never fails
// startup: Memory is optional and updated independently of this server.
func (c *Client) CheckVersion(ctx context.Context, log *slog.Logger) {
	detail, err := c.HealthDetailed(ctx)
	if err != nil {
		log.Warn("memory: could not read the Memory version; the minimum supported is "+MinMemoryVersion, "err", err)
		return
	}
	atLeast, ok := VersionAtLeast(detail.Version, MinMemoryVersion)
	switch {
	case !ok:
		log.Warn("memory: unknown Memory version; the minimum supported is "+MinMemoryVersion, "version", detail.Version)
	case !atLeast:
		log.Warn("memory: version is older than the minimum supported "+MinMemoryVersion+"; ingests will version and re-embed unchanged objects", "version", detail.Version)
	default:
		log.Info("memory: server version", "version", detail.Version, "minimum", MinMemoryVersion)
	}
}
