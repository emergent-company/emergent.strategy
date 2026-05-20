package navigation

import (
	"fmt"
	"testing"
)

func TestDebugAimSubNav(t *testing.T) {
	g := DefaultGraph()
	screens := g.TabSubNavScreens(TabAim)
	fmt.Printf("AIM sub-nav screens (%d):\n", len(screens))
	for _, s := range screens {
		fmt.Printf("  ID=%s Title=%q URL=%s SubNavHidden=%v RenderMode=%q\n", s.ID, s.Title, s.URLPattern, s.SubNavHidden, s.RenderMode)
	}
}
