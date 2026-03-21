// Command genpack generates the epf-engine blueprint pack JSON from Go source of truth.
// Usage: go run ./cmd/genpack > .memory/blueprints/epf-engine/packs/epf-engine.json
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/decompose"
)

func main() {
	pack := decompose.GenerateTemplatePack()

	// Fix field names: Memory blueprints expect sourceTypes/targetTypes
	if rels, ok := pack["relationshipTypes"].([]map[string]any); ok {
		for i, rel := range rels {
			if from, ok := rel["fromTypes"]; ok {
				rels[i]["sourceTypes"] = from
				delete(rels[i], "fromTypes")
			}
			if to, ok := rel["toTypes"]; ok {
				rels[i]["targetTypes"] = to
				delete(rels[i], "toTypes")
			}
		}
	}

	out, err := json.MarshalIndent(pack, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(out))
}
