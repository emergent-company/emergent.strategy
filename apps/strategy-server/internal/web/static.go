package web

import (
	"net/http"

	"github.com/emergent-company/go-daisy/staticfs"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/web/staticfiles"
)

// StaticHandler returns an http.Handler that serves static files.
// Our local web/staticfiles/static/ directory takes precedence (so our rebuilt
// app.css with responsive classes overrides go-daisy's pre-built CSS), falling
// back to go-daisy's staticfs for JS, fonts, and other assets we don't override.
func StaticHandler() http.Handler {
	local := http.FileServer(http.FS(staticfiles.FS()))
	fallback := staticfs.Handler("/static/")

	return http.StripPrefix("/static", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// r.URL.Path after StripPrefix is "/css/app.css" -- strip leading slash for fs.Open.
		path := r.URL.Path
		if len(path) > 0 && path[0] == '/' {
			path = path[1:]
		}
		f, err := staticfiles.FS().Open(path)
		if err == nil {
			_ = f.Close() // probe-only open
			local.ServeHTTP(w, r)
			return
		}
		// Restore the /static prefix that StripPrefix removed, then serve from go-daisy.
		r.URL.Path = "/static" + r.URL.Path
		fallback.ServeHTTP(w, r)
	}))
}
