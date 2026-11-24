package handler

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	workspacedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/authz"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// The values of the workspace picker that are not a workspace id.
const (
	importWorkspaceNew      = "__new__"      // create an organisation and workspace inline
	importWorkspaceExisting = "__existing__" // re-import into the repository's existing instance
)

// importTargetRequest is what the import form asks for.
type importTargetRequest struct {
	WorkspaceID  string // "", importWorkspaceNew, importWorkspaceExisting, or a workspace id
	NewName      string // name of the organisation and workspace to create inline
	GithubRepo   string // "owner/repo"
	BasePath     string
	RepoOwner    string
	InstanceName string
}

// importTarget says where the import writes.
type importTarget struct {
	WorkspaceID uuid.UUID
	// Existing is the instance already linked to the repository, when the caller
	// may re-import into it.
	Existing *domain.StrategyInstance
	// NeedsMove is true when Existing must be moved to WorkspaceID first.
	NeedsMove bool
}

// resolveImportTarget decides which workspace an import may write into, or
// refuses with an app error (404 not found, 403 forbidden, 409 conflict, 400 bad
// request). It enforces the tenant boundary of the connect flow:
//
//   - a workspace picked from the list must belong to an organisation the caller
//     administers; one that belongs to anyone else answers as if it did not exist;
//   - creating inline always makes a new organisation with the caller as its
//     admin. It never returns an existing organisation by name, and never adds
//     the caller to one they did not create;
//   - an instance already linked to the repository is reused only when the caller
//     administers its organisation, and moved only when they administer the
//     target as well. Otherwise the answer is a conflict that names nothing.
//
// It writes only what creating a new organisation and workspace needs.
func (s *Server) resolveImportTarget(ctx context.Context, req importTargetRequest) (*importTarget, error) {
	user := web.UserFromContext(ctx)
	if user == nil {
		return nil, apperror.ErrUnauthorized
	}
	az := authz.New(orgdom.NewService(s.db), workspacedom.NewService(s.db), instancedom.NewService(s.db))
	instSvc := instancedom.NewService(s.db)

	existing, err := instSvc.GetByGithubRepo(ctx, req.GithubRepo, req.BasePath)
	if err != nil {
		return nil, err
	}

	// The instance already linked to this repository decides first.
	if existing != nil {
		if err := az.InstanceAdmin(ctx, existing.ID); err != nil {
			return nil, existingInstanceRefusal(err)
		}
		switch req.WorkspaceID {
		case "", importWorkspaceExisting:
			return &importTarget{WorkspaceID: existing.WorkspaceID, Existing: existing}, nil
		case importWorkspaceNew:
			// A new organisation cannot hold an instance that already exists.
			return nil, apperror.ErrConflict.WithDetail("this repository is already connected")
		}
		target, err := parseImportWorkspace(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if err := az.WorkspaceAdmin(ctx, target); err != nil {
			return nil, err
		}
		return &importTarget{WorkspaceID: target, Existing: existing, NeedsMove: target != existing.WorkspaceID}, nil
	}

	switch req.WorkspaceID {
	case importWorkspaceExisting:
		return nil, apperror.ErrBadRequest.WithDetail("this repository has no instance to re-import into")
	case "", importWorkspaceNew:
		id, err := s.createImportOrganisation(ctx, az, user.ID, req)
		if err != nil {
			return nil, err
		}
		return &importTarget{WorkspaceID: id}, nil
	}

	target, err := parseImportWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := az.WorkspaceAdmin(ctx, target); err != nil {
		return nil, err
	}
	return &importTarget{WorkspaceID: target}, nil
}

func parseImportWorkspace(raw string) (uuid.UUID, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, apperror.ErrBadRequest.WithDetail("invalid workspace id")
	}
	return id, nil
}

// existingInstanceRefusal turns a failed access check on an already-linked
// instance into an answer that tells the caller nothing about it: not found and
// forbidden both become "already connected" (a viewer of that organisation keeps
// forbidden, since they can already see the instance).
func existingInstanceRefusal(err error) error {
	if ae := apperror.AsAppError(err); ae != nil && ae.Code == apperror.ErrForbidden.Code {
		return apperror.ErrForbidden.WithDetail("an organisation administrator is required")
	}
	return apperror.ErrConflict.WithDetail("this repository is already connected in another organisation")
}

// createImportOrganisation creates the organisation and workspace for an inline
// import and returns the workspace id. The workspace table holds one workspace
// per GitHub owner, so when one already exists for the repository's owner it is
// used only if the caller administers its organisation; otherwise the answer is a
// conflict and nothing is created.
func (s *Server) createImportOrganisation(ctx context.Context, az *authz.Authorizer, userID uuid.UUID, req importTargetRequest) (uuid.UUID, error) {
	wsSvc := workspacedom.NewService(s.db)

	if ws, err := wsSvc.GetWorkspaceByOwner(ctx, req.RepoOwner); err == nil {
		if err := az.WorkspaceAdmin(ctx, ws.ID); err != nil {
			return uuid.Nil, apperror.ErrConflict.WithDetail(
				"a workspace for this GitHub owner already exists in another organisation")
		}
		return ws.ID, nil
	}

	name := strings.TrimSpace(req.NewName)
	if name == "" {
		name = repoNameToTitle(req.RepoOwner)
	}
	if name == "" {
		name = req.InstanceName
	}
	if name == "" {
		return uuid.Nil, apperror.ErrBadRequest.WithDetail("a name for the new workspace is required")
	}

	return s.newOrganisationWithWorkspace(ctx, userID, name, req.RepoOwner)
}

// newOrganisationWithWorkspace creates an organisation called orgName with the
// caller as its admin, and a workspace for githubOwner in it, and returns the
// workspace id. An organisation name that is taken, or a GitHub owner that already
// has a workspace, is a conflict, and nothing is created: this never returns an
// existing organisation and never adds the caller to one they did not create.
func (s *Server) newOrganisationWithWorkspace(ctx context.Context, userID uuid.UUID, orgName, githubOwner string) (uuid.UUID, error) {
	wsSvc := workspacedom.NewService(s.db)
	if _, err := wsSvc.GetWorkspaceByOwner(ctx, githubOwner); err == nil {
		return uuid.Nil, apperror.ErrConflict.WithDetail("a workspace for this GitHub owner already exists")
	}
	orgSvc := orgdom.NewService(s.db)
	if _, err := orgSvc.GetByName(ctx, orgName); err == nil {
		return uuid.Nil, apperror.ErrConflict.WithDetail("an organisation with this name already exists")
	} else if ae := apperror.AsAppError(err); ae == nil || ae.HTTPStatus != 404 {
		return uuid.Nil, err
	}
	org, err := orgSvc.Create(ctx, orgdom.CreateParams{Name: orgName}, userID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("create organisation: %w", err)
	}
	ws, err := wsSvc.CreateWorkspace(ctx, githubOwner, &orgName, org.ID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("create workspace: %w", err)
	}
	return ws.ID, nil
}

// moveRequest is what the move form asks for.
type moveRequest struct {
	WorkspaceID string // a workspace id, "" or importWorkspaceNew for a new one
	NewName     string // name of the organisation and workspace to create
}

// resolveMoveTarget decides where an instance may be moved, or refuses with an app
// error. The caller must administer the instance's organisation, and the target
// is either a workspace of an organisation they administer or a new organisation
// of their own; a name that is taken is a conflict, never a way into that
// organisation.
func (s *Server) resolveMoveTarget(ctx context.Context, instanceID uuid.UUID, req moveRequest) (uuid.UUID, error) {
	user := web.UserFromContext(ctx)
	if user == nil {
		return uuid.Nil, apperror.ErrUnauthorized
	}
	az := s.authorizer()
	if err := az.InstanceAdmin(ctx, instanceID); err != nil {
		return uuid.Nil, err
	}

	switch strings.TrimSpace(req.WorkspaceID) {
	case "", importWorkspaceNew:
		name := strings.TrimSpace(req.NewName)
		if name == "" {
			return uuid.Nil, apperror.ErrBadRequest.WithDetail("a name for the new workspace is required")
		}
		return s.newOrganisationWithWorkspace(ctx, user.ID, name, name)
	}
	target, err := parseImportWorkspace(strings.TrimSpace(req.WorkspaceID))
	if err != nil {
		return uuid.Nil, err
	}
	if err := az.WorkspaceAdmin(ctx, target); err != nil {
		return uuid.Nil, err
	}
	return target, nil
}
