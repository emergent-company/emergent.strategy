package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/mcp"
	"github.com/spf13/cobra"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the MCP server for EPF tools",
	Long: `Start the Model Context Protocol (MCP) server over stdio.

This exposes EPF tools to AI agents, enabling them to:
  - Validate EPF artifacts against schemas
  - Get templates and schema definitions
  - Run health checks on EPF instances
  - Query strategic relationships between artifacts
  - Maintain implementation references and capability maturity
  - Discover and use EPF wizards and generators

The server communicates over stdio (stdin/stdout) using the MCP protocol.

Usage with VS Code / Cursor (add to .vscode/mcp.json):
  {
    "servers": {
      "epf": {
        "command": "/path/to/epf-cli",
        "args": ["serve"]
      }
    }
  }

Or with custom schemas directory:
  {
    "servers": {
      "epf": {
        "command": "/path/to/epf-cli",
        "args": ["serve", "--schemas-dir", "/path/to/schemas"]
      }
    }
  }`,
	Run: func(cmd *cobra.Command, args []string) {
		schemasDir, _ := cmd.Flags().GetString("schemas-dir")

		// Auto-detect schemas directory if not specified
		if schemasDir == "" {
			// Try common locations relative to the binary or working directory
			candidates := []string{
				"docs/EPF/schemas",
				"../../docs/EPF/schemas",
				"../docs/EPF/schemas",
			}

			// Also check relative to executable
			if exe, err := os.Executable(); err == nil {
				exeDir := filepath.Dir(exe)
				candidates = append(candidates,
					filepath.Join(exeDir, "docs/EPF/schemas"),
					filepath.Join(exeDir, "../../docs/EPF/schemas"),
				)
			}

			for _, candidate := range candidates {
				if info, err := os.Stat(candidate); err == nil && info.IsDir() {
					schemasDir = candidate
					break
				}
			}

			if schemasDir == "" {
				fmt.Fprintln(os.Stderr, "Error: Could not find schemas directory. Please specify --schemas-dir")
				os.Exit(1)
			}
		}

		// Create and start the MCP server
		server, err := mcp.NewServer(schemasDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error creating MCP server: %v\n", err)
			os.Exit(1)
		}

		// Serve over stdio (blocks until EOF/client disconnect)
		if err := server.ServeStdio(); err != nil {
			fmt.Fprintf(os.Stderr, "MCP server error: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	rootCmd.AddCommand(serveCmd)
	serveCmd.Flags().String("schemas-dir", "", "path to EPF schemas directory (auto-detected if not specified)")
}
