package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "Start the Web Dashboard (Stakeholder View)",
	Long: `Start the ProductFactoryOS web server.

The web dashboard provides:
  - Git-backed CMS for visual editing
  - Stakeholder-friendly views of EPF state
  - Form-based editing that commits to Git

This is "Mode C: Visual Editing" from the Master Plan.

Tech: Go + HTMX + Templ`,
	Run: func(cmd *cobra.Command, args []string) {
		port, _ := cmd.Flags().GetInt("port")
		fmt.Printf("Starting PFOS web server on http://localhost:%d\n", port)

		// TODO: Implement HTMX + Templ server
		fmt.Println("Web dashboard ready.")
	},
}

func init() {
	rootCmd.AddCommand(serverCmd)
	serverCmd.Flags().IntP("port", "p", 8080, "port for web server")
}
