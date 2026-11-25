package sync

import (
	"strings"
	"testing"
)

// No part of a user's token may appear in the key its scan is cached under.
func TestScanCacheKeyHoldsNoPartOfTheToken(t *testing.T) {
	const token = "gho_Zq8LwN3rT6yUb1XcV4mK7pJ2hG5dF9sA0eRi"
	key := userScanKey(token)
	for i := 0; i+6 <= len(token); i++ {
		if strings.Contains(key, token[i:i+6]) {
			t.Fatalf("the cache key %q contains %q from the token", key, token[i:i+6])
		}
	}
}
