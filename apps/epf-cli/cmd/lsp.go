package cmd

import (
	"fmt"
	"os"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/lsp"
	"github.com/spf13/cobra"
)

var lspCmd = &cobra.Command{
	Use:   "lsp",
	Short: "Start the EPF Language Server Protocol server",
	Long: `Start the LSP server for real-time EPF YAML validation in editors.

This provides diagnostics (errors, warnings, hints) as you edit EPF YAML files,
making it virtually impossible to write invalid strategy artifacts.

By default the server communicates over stdio (stdin/stdout).
Use --tcp to listen on a TCP port instead (useful for debugging).

Configure your editor to use this as a language server for YAML files:

  VS Code / Cursor (settings.json):
    "lsp": {
      "epf": {
        "command": "/path/to/epf-cli",
        "args": ["lsp"],
        "filetypes": ["yaml"]
      }
    }

  Neovim (lua):
    vim.lsp.start({
      name = "epf-lsp",
      cmd = { "/path/to/epf-cli", "lsp" },
      root_dir = vim.fn.getcwd(),
      filetypes = { "yaml" },
    })`,
	Run: func(cmd *cobra.Command, args []string) {
		schemasDir, _ := cmd.Flags().GetString("schemas-dir")
		tcpAddr, _ := cmd.Flags().GetString("tcp")

		// Auto-detect schemas directory if not specified
		if schemasDir == "" {
			detected, err := GetSchemasDir()
			if err == nil && detected != "" {
				schemasDir = detected
			}
		}

		if schemasDir == "" {
			fmt.Fprintln(os.Stderr, "Note: Using embedded schemas (no filesystem schemas found)")
		}

		// Create the LSP server
		server, err := lsp.NewServer(schemasDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error creating LSP server: %v\n", err)
			os.Exit(1)
		}

		// Serve over TCP or stdio
		if tcpAddr != "" {
			fmt.Fprintf(os.Stderr, "EPF LSP server listening on %s\n", tcpAddr)
			if err := server.ServeTCP(tcpAddr); err != nil {
				fmt.Fprintf(os.Stderr, "LSP server error: %v\n", err)
				os.Exit(1)
			}
		} else {
			if err := server.ServeStdio(); err != nil {
				fmt.Fprintf(os.Stderr, "LSP server error: %v\n", err)
				os.Exit(1)
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(lspCmd)
	lspCmd.Flags().String("schemas-dir", "", "path to EPF schemas directory (auto-detected if not specified)")
	lspCmd.Flags().String("tcp", "", "listen on TCP address instead of stdio (e.g. :7998)")
}
