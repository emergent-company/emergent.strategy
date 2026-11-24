package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	workspacedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/authz"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// accessClass says what a web route needs from the caller before its handler
// runs. Every route of RegisterRoutes has one (TestEveryWebRouteIsClassified): a
// route without a class is refused, so a new handler cannot ship open.
type accessClass int

const (
	// accessAuthenticated: any signed-in user. The route acts on the caller's own
	// account (their language, their GitHub connection) or does its own tenant
	// checks (the connect import resolves its target with resolveImportTarget).
	accessAuthenticated accessClass = iota + 1
	// accessList: any signed-in user, but the page shows lists. The queries behind
	// it filter by the caller's organisations; the guard cannot do that for them.
	accessList
	// accessInstanceRead: GET or HEAD under /strategies/:id. The caller must reach
	// the instance (a member of its organisation, or a token granted it).
	accessInstanceRead
	// accessInstanceWrite: any other method under /strategies/:id. The caller must
	// be org_admin of the instance's organisation; a viewer reads, never writes,
	// and an access token never administers.
	accessInstanceWrite
	// accessInstanceInForm: a POST outside /strategies/:id that names its instance
	// in the form field instance_id. Treated as a write on that instance.
	accessInstanceInForm
)

func (c accessClass) String() string {
	switch c {
	case accessAuthenticated:
		return "authenticated"
	case accessList:
		return "list"
	case accessInstanceRead:
		return "instance-read"
	case accessInstanceWrite:
		return "instance-write"
	case accessInstanceInForm:
		return "instance-in-form"
	}
	return "unclassified"
}

// routesOutsideInstances are the web routes that are not under /strategies/:id.
var routesOutsideInstances = map[string]accessClass{
	"GET /":                         accessList,
	"GET /settings":                 accessList,
	"POST /settings/lang":           accessAuthenticated,
	"POST /settings/sync":           accessInstanceInForm,
	"POST /settings/import":         accessInstanceInForm,
	"GET /github/connect":           accessAuthenticated,
	"GET /github/connect/repos":     accessAuthenticated,
	"GET /github/connect/authorize": accessAuthenticated,
	"GET /github/connect/callback":  accessAuthenticated,
	"POST /github/connect/scan":     accessAuthenticated,
	"POST /github/connect/import":   accessAuthenticated,
}

// subResourceSpec says that a route names a record next to its instance (a run, a
// staged batch, a proposal, a signal) and where to find which instance owns it.
// The guard checks the instance in :id; this makes sure the record in the second
// position is that instance's too, so a user cannot pair their own instance with
// another tenant's record id. The names are constants, never request input.
type subResourceSpec struct {
	routeContains  string // part of the route pattern that identifies the route family
	param          string // the URL parameter that holds the record id
	table          string
	idColumn       string
	instanceColumn string // holds the instance id (the AIM run stores it as text in concurrency_key)
}

var subResourceSpecs = []subResourceSpec{
	{"/aim/draft-review/", "batchID", "strategy_mutations", "batch_id", "instance_id"},
	{"/aim/proposals/", "proposalID", "cycle_proposals", "id", "instance_id"},
	{"/aim/coherence/signals/", "signalID", "ripple_signals", "id", "instance_id"},
	{"/aim/runs/", "runID", "aim_cycle_runs", "id", "concurrency_key"},
	{"/skill-runs/", "runID", "skill_runs", "id", "instance_id"},
}

// recordOfAnotherInstance reports whether the record the URL names exists and
// belongs to an instance other than the one in the URL. A record that does not
// exist, or an id that is not an id, is not an answer for the guard: the handler
// gives its own 404 or 400, which says nothing about any other tenant.
func (s *Server) recordOfAnotherInstance(ctx context.Context, c echo.Context, instanceID uuid.UUID) (bool, error) {
	for _, spec := range subResourceSpecs {
		if !strings.Contains(c.Path(), spec.routeContains) {
			continue
		}
		recordID, err := uuid.Parse(c.Param(spec.param))
		if err != nil {
			continue
		}
		other, err := s.db.NewSelect().
			TableExpr(spec.table).
			Where(spec.idColumn+" = ?", recordID).
			Where(spec.instanceColumn+" <> ?", instanceID.String()).
			Exists(ctx)
		if err != nil {
			return false, err
		}
		if other {
			return true, nil
		}
	}
	return false, nil
}

// classifyRoute returns the access class of a route by its method and registered
// pattern, and false for a route nobody classified.
func classifyRoute(method, pattern string) (accessClass, bool) {
	if pattern == "/strategies/:id" || strings.HasPrefix(pattern, "/strategies/:id/") {
		if method == http.MethodGet || method == http.MethodHead {
			return accessInstanceRead, true
		}
		return accessInstanceWrite, true
	}
	c, ok := routesOutsideInstances[method+" "+pattern]
	return c, ok
}

// authorizer returns the access rules wired to this server's database.
func (s *Server) authorizer() *authz.Authorizer {
	return authz.New(orgdom.NewService(s.db), workspacedom.NewService(s.db), instancedom.NewService(s.db))
}

// webAccess is the guard every web route runs behind. It enforces the route's
// access class before the handler: a caller who may not reach an instance gets the
// answer for an instance that does not exist, whatever the method, so ids cannot be
// probed and nothing about another tenant is revealed.
func (s *Server) webAccess(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		class, ok := classifyRoute(c.Request().Method, c.Path())
		if !ok {
			// Closed: an unclassified route is refused rather than guessed at.
			s.log.Error("web route has no access class; refusing", "method", c.Request().Method, "path", c.Path())
			return notFoundPage(ctx)
		}
		if p := web.PrincipalFromContext(ctx); p == nil || p.User == nil {
			return echo.NewHTTPError(http.StatusUnauthorized, langs.T(ctx, "error.unauthorized"))
		}

		var err error
		switch class {
		case accessInstanceRead, accessInstanceWrite:
			id, perr := uuid.Parse(c.Param("id"))
			if perr != nil {
				return notFoundPage(ctx)
			}
			if class == accessInstanceRead {
				err = s.authorizer().InstanceAccess(ctx, id)
			} else {
				err = s.authorizer().InstanceAdmin(ctx, id)
			}
		case accessInstanceInForm:
			id, perr := uuid.Parse(strings.TrimSpace(c.FormValue("instance_id")))
			if perr != nil {
				return notFoundPage(ctx)
			}
			err = s.authorizer().InstanceAdmin(ctx, id)
		}
		if err != nil {
			return s.accessRefusal(c, err)
		}
		if class == accessInstanceRead || class == accessInstanceWrite {
			instanceID, _ := uuid.Parse(c.Param("id")) // checked above
			other, rerr := s.recordOfAnotherInstance(ctx, c, instanceID)
			if rerr != nil {
				return s.accessRefusal(c, rerr)
			}
			if other {
				return notFoundPage(ctx)
			}
		}
		return next(c)
	}
}

// accessRefusal turns a failed access check into the one answer a missing instance
// gets. A failure of the check itself (a database error) is a server error.
func (s *Server) accessRefusal(c echo.Context, err error) error {
	ctx := c.Request().Context()
	var ae *apperror.AppError
	if errors.As(err, &ae) {
		switch ae.HTTPStatus {
		case http.StatusNotFound, http.StatusForbidden, http.StatusUnauthorized:
			return notFoundPage(ctx)
		}
	}
	s.log.Error("web access check failed", "path", c.Path(), "err", err)
	return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.internal"))
}

// notFoundPage is the answer for an instance that does not exist or that the
// caller may not reach. Both give exactly this, so the two cannot be told apart.
func notFoundPage(ctx context.Context) error {
	return echo.NewHTTPError(http.StatusNotFound, langs.T(ctx, "error.instance_not_found"))
}
