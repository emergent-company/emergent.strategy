package cmd

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

var tuiCmd = &cobra.Command{
	Use:   "tui",
	Short: "Launch the interactive TUI (Developer Console)",
	Long: `Launch the ProductFactoryOS Terminal User Interface.

The TUI provides:
  - Real-time visualization of EPF state
  - Build loop orchestration
  - Quality Council management
  - OpenCode integration

This is "Mode B: Agent Coding" from the Master Plan.`,
	Run: func(cmd *cobra.Command, args []string) {
		p := tea.NewProgram(initialModel())
		if _, err := p.Run(); err != nil {
			fmt.Printf("Error running TUI: %v\n", err)
			os.Exit(1)
		}
	},
}

// Model represents the TUI state
type model struct {
	ready    bool
	selected int
	items    []string
}

func initialModel() model {
	return model{
		items: []string{
			"📊 Dashboard",
			"🔨 Build",
			"✅ Validate",
			"👥 Quality Council",
			"⚙️  Settings",
		},
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "up", "k":
			if m.selected > 0 {
				m.selected--
			}
		case "down", "j":
			if m.selected < len(m.items)-1 {
				m.selected++
			}
		}
	}
	return m, nil
}

func (m model) View() string {
	s := "\n  ProductFactoryOS\n\n"

	for i, item := range m.items {
		cursor := "  "
		if m.selected == i {
			cursor = "▶ "
		}
		s += fmt.Sprintf("%s%s\n", cursor, item)
	}

	s += "\n  Press q to quit.\n"
	return s
}

func init() {
	rootCmd.AddCommand(tuiCmd)
}
