// Mode detection for the EPF server.
//
// The server operates in one of three modes, auto-detected from environment
// variables at startup:
//
//   - ModeLocal: No GitHub config. Filesystem source, stdio transport.
//   - ModeSingleTenant: GitHub App configured (EPF_GITHUB_OWNER + EPF_GITHUB_REPO).
//     One container serves one EPF instance. No user identity.
//   - ModeMultiTenant: OAuth configured (EPF_OAUTH_CLIENT_ID). Users authenticate
//     with GitHub, discover workspaces, and route to any authorized repo.
package auth

import "os"

// ServerMode represents the server's operating mode.
type ServerMode int

const (
	// ModeLocal — no GitHub config. Filesystem source, stdio transport.
	ModeLocal ServerMode = iota

	// ModeSingleTenant — GitHub App configured, one container per instance.
	// No user identity or OAuth. Access controlled by Cloud Run IAM.
	ModeSingleTenant

	// ModeMultiTenant — OAuth configured. Users authenticate with GitHub,
	// discover workspaces, and route MCP calls to authorized repos.
	ModeMultiTenant
)

// String returns a human-readable mode name.
func (m ServerMode) String() string {
	switch m {
	case ModeLocal:
		return "local"
	case ModeSingleTenant:
		return "single-tenant"
	case ModeMultiTenant:
		return "multi-tenant"
	default:
		return "unknown"
	}
}

// DetectMode determines the server mode from environment variables.
//
// Detection rules:
//   - EPF_OAUTH_CLIENT_ID set → ModeMultiTenant
//   - EPF_GITHUB_OWNER + EPF_GITHUB_REPO set → ModeSingleTenant
//   - Neither → ModeLocal
func DetectMode() ServerMode {
	if os.Getenv(EnvOAuthClientID) != "" {
		return ModeMultiTenant
	}
	if os.Getenv("EPF_GITHUB_OWNER") != "" && os.Getenv("EPF_GITHUB_REPO") != "" {
		return ModeSingleTenant
	}
	return ModeLocal
}
