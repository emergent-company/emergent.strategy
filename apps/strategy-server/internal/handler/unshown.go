package handler

import "strings"

// pathSeg is one step of a path through a payload: a map key or a list position.
type pathSeg struct {
	key   string
	index bool
}

// unshownContent returns the part of payload that no dedicated view shows, or
// nil when the view shows everything. It is how a bespoke page keeps the promise
// that stored content is never silently dropped: whatever it returns is rendered
// by the generic renderer under a notice.
//
// shown lists the paths the dedicated view renders, dot separated, with "*"
// standing for any map key or list position. A path names a scalar. It covers a
// leaf when it equals the leaf's path, or when it names the list of scalars the
// leaf is an item of ("a.evidence" covers both "a.evidence" as a lone string and
// each "a.evidence.<n>"). A path never covers a map or a list of maps under the
// same name, so a field the view reads as text but the payload stores as an
// object is returned, not lost. Empty values are not content.
func unshownContent(payload map[string]any, shown []string) map[string]any {
	patterns := make([][]string, len(shown))
	for i, s := range shown {
		patterns[i] = strings.Split(s, ".")
	}
	pruned, keep := pruneShown(payload, nil, patterns)
	if !keep {
		return nil
	}
	out, _ := pruned.(map[string]any)
	return out
}

// pruneShown returns v without the leaves covered by a pattern, and whether
// anything is left.
func pruneShown(v any, path []pathSeg, patterns [][]string) (any, bool) {
	switch val := v.(type) {
	case map[string]any:
		out := make(map[string]any)
		for k, child := range val {
			if pruned, keep := pruneShown(child, append(path[:len(path):len(path)], pathSeg{key: k}), patterns); keep {
				out[k] = pruned
			}
		}
		return out, len(out) > 0
	case []any:
		out := make([]any, 0, len(val))
		for _, child := range val {
			if pruned, keep := pruneShown(child, append(path[:len(path):len(path)], pathSeg{index: true}), patterns); keep {
				out = append(out, pruned)
			}
		}
		return out, len(out) > 0
	case nil:
		return nil, false
	case string:
		if strings.TrimSpace(val) == "" || covered(path, patterns) {
			return nil, false
		}
		return val, true
	default:
		if covered(path, patterns) {
			return nil, false
		}
		return val, true
	}
}

func covered(leaf []pathSeg, patterns [][]string) bool {
	for _, p := range patterns {
		switch {
		case len(p) == len(leaf) && segsMatch(p, leaf):
			return true
		case len(p)+1 == len(leaf) && leaf[len(leaf)-1].index && segsMatch(p, leaf[:len(p)]):
			return true
		}
	}
	return false
}

func segsMatch(pattern []string, leaf []pathSeg) bool {
	for i, p := range pattern {
		if p == "*" {
			continue
		}
		if leaf[i].index || leaf[i].key != p {
			return false
		}
	}
	return true
}

// rootOf returns the block of a payload that sits under rootKey. Some payloads
// wrap their content in that key, others do not.
func rootOf(payload map[string]any, rootKey string) (root map[string]any, wrapped bool) {
	if inner, ok := payload[rootKey].(map[string]any); ok {
		return inner, true
	}
	return payload, false
}

// unshownInRoot is unshownContent for an artifact whose schema has a root block
// (inner paths, relative to it) and sections beside it (outer paths, relative to
// the payload: a change log, say). An unwrapped payload holds both in one map and
// is checked against both lists. A wrapped one is checked block by block, so the
// notice names real sections and not the wrapper.
func unshownInRoot(payload map[string]any, rootKey string, inner, outer []string) map[string]any {
	root, wrapped := rootOf(payload, rootKey)
	if !wrapped {
		return unshownContent(root, append(append([]string{}, inner...), outer...))
	}
	out := unshownContent(root, inner)
	rest := make(map[string]any, len(payload))
	for k, v := range payload {
		if k != rootKey {
			rest[k] = v
		}
	}
	for k, v := range unshownContent(rest, outer) {
		if out == nil {
			out = make(map[string]any)
		}
		if _, taken := out[k]; taken {
			k = "outside_" + rootKey + "_" + k
		}
		out[k] = v
	}
	return out
}
