package valuemodel

import "strings"

// DefinitionTypes maps a normalised track to the artifact type that carries the
// definitions which may contribute to that track's value model.
var DefinitionTypes = map[string]string{
	"product":    "feature",
	"strategy":   "strategy_def",
	"org_ops":    "org_ops_def",
	"orgops":     "org_ops_def",
	"commercial": "commercial_def",
}

// NormalizeTrack reduces a track name to a comparable form: "Org Ops", "org_ops"
// and "OrgOps" all become "orgops".
func NormalizeTrack(s string) string {
	return strings.ToLower(strings.NewReplacer("-", "", "_", "", " ", "").Replace(s))
}
