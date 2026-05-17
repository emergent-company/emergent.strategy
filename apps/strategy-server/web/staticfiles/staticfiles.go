// Package staticfiles embeds the project's local static assets (CSS, etc.)
// which are built by the Tailwind CSS pipeline in web/.
// These override go-daisy's pre-built assets when served.
package staticfiles

import (
	"embed"
	"io/fs"
)

//go:embed static/css/app.css
var embedded embed.FS

// FS returns the embedded static file system rooted at the static/ directory.
func FS() fs.FS {
	sub, err := fs.Sub(embedded, "static")
	if err != nil {
		panic("staticfiles.FS: " + err.Error())
	}
	return sub
}
