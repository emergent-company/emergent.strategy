package main

import (
	"fmt"
	"os"

	"github.com/alexflint/go-arg"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
)

func main() {
	var cfg config.Config
	p := arg.MustParse(&cfg)

	switch {
	case cfg.Server != nil:
		if err := runServer(&cfg); err != nil {
			fmt.Fprintf(os.Stderr, "strategy-server: %v\n", err)
			os.Exit(1)
		}
	case cfg.DB != nil:
		if err := runDB(&cfg); err != nil {
			fmt.Fprintf(os.Stderr, "strategy-server: %v\n", err)
			os.Exit(1)
		}
	case cfg.Import != nil:
		if err := runImport(&cfg); err != nil {
			fmt.Fprintf(os.Stderr, "strategy-server: %v\n", err)
			os.Exit(1)
		}
	default:
		p.WriteHelp(os.Stdout)
		os.Exit(1)
	}
}
