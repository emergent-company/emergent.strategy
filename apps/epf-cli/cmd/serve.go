package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the MCP server for schema definitions",
	Long: `Start the Model Context Protocol (MCP) server.

This exposes EPF schema definitions to AI agents like OpenCode,
enabling them to write valid YAML with autocomplete support.

The MCP server provides:
  - Schema definitions for all EPF artifact types
  - Validation endpoints
  - Context about EPF structure`,
	Run: func(cmd *cobra.Command, args []string) {
		port, _ := cmd.Flags().GetInt("port")
		fmt.Printf("Starting MCP server on port %d...\n", port)

		// TODO: Implement MCP server
		fmt.Println("MCP server ready. Waiting for connections...")
	},
}

func init() {
	rootCmd.AddCommand(serveCmd)
	serveCmd.Flags().IntP("port", "p", 3100, "port for MCP server")
}
