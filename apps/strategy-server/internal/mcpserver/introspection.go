package mcpserver

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/server"

	activitydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/activity"
	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	evidencedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	rippledom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillexec"
	skillrundom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillrun"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// NewMCPServerForIntrospection builds a *server.MCPServer with every tool
// registered — including every optional one gated behind a "svc.X == nil"
// check (Activity, AIM, Evidence, Heartbeat, Org, Orchestration, Ripple,
// SkillExecutor, SkillRun, Sync, Version) — against inert, never-invoked
// stand-ins, purely so the real tool catalogue (names, descriptions, input
// schemas) can be read back via the returned server's ListTools().
//
// This exists for internal/selfmodel: publishing a self-description of this
// service's tool catalogue by hand-copying tool names elsewhere would be
// exactly the "master list that rots" failure the self-model is supposed to
// prevent. Introspecting the actual registration path (NewMCPServer) is what
// makes drift structurally impossible rather than merely policed by review.
//
// The stand-ins below are safe specifically because registration functions
// only ever check a service field for nil to decide *whether* to call
// s.AddTool(...) — they never call a method on the field itself until a
// tool's own handler closure runs, which introspection never does. Verified
// empirically before this was written: a fully zero-value Services{} only
// registers 106 of 153 tools (several register* functions early-return on a
// nil optional field), so a partially-stubbed set would silently
// under-report the catalogue — every optional field must be given a
// non-nil, inert stand-in for this to be a complete catalogue, not most of
// one.
//
// Keep this in sync with Services (server.go) when a new optional field is
// added — a compile error here on a missing struct literal field is exactly
// the signal that this needs updating, which is why it is a plain struct
// literal rather than something that could silently skip a new field.
func NewMCPServerForIntrospection() *server.MCPServer {
	return NewMCPServer(Services{
		Workspace:     &workspace.Service{},
		Instance:      &instance.Service{},
		Strategy:      &strategy.Service{},
		Pack:          &pack.Service{},
		App:           &appdom.Service{},
		Semantic:      &semantic.Service{},
		Org:           &orgdom.Service{},
		Schema:        &schemadom.Service{},
		Version:       &versiondom.Service{},
		Sync:          &syncdom.Service{},
		Ripple:        &rippledom.Service{},
		AIM:           &aimdom.Service{},
		SkillExecutor: &skillexec.Executor{},
		SkillRun:      &skillrundom.Service{},
		Heartbeat:     inertHeartbeat{},
		Resolver:      inertResolver{},
		Ingest:        inertIngest{},
		Orchestration: inertEngine{},
		Evidence:      &evidencedom.Service{},
		Activity:      &activitydom.Service{},
		Watchdog:      inertWatchdog{},
	})
}

// The stand-ins below are never invoked — introspection only reads tool
// metadata, it never calls a tool's handler. Every method exists solely to
// satisfy an interface so the corresponding Services field is non-nil.

type inertHeartbeat struct{}

func (inertHeartbeat) ListSignals(context.Context, uuid.UUID) ([]heartbeat.Signal, error) {
	return nil, nil
}
func (inertHeartbeat) ListAllSignals(context.Context, uuid.UUID) ([]heartbeat.Signal, error) {
	return nil, nil
}
func (inertHeartbeat) Acknowledge(context.Context, uuid.UUID) error { return nil }
func (inertHeartbeat) ListProposals(context.Context, uuid.UUID, string) ([]heartbeat.Proposal, error) {
	return nil, nil
}
func (inertHeartbeat) GetProposal(context.Context, uuid.UUID) (*heartbeat.Proposal, error) {
	return nil, nil
}
func (inertHeartbeat) ApproveProposal(context.Context, uuid.UUID, heartbeat.CycleStarter, string) (*heartbeat.Proposal, error) {
	return nil, nil
}
func (inertHeartbeat) DeferProposal(context.Context, uuid.UUID, time.Duration) (*heartbeat.Proposal, error) {
	return nil, nil
}

type inertWatchdog struct{}

func (inertWatchdog) RunAny(context.Context, uuid.UUID) (any, error) { return nil, nil }

type inertIngest struct{}

func (inertIngest) EnqueueBatch(uuid.UUID, uuid.UUID) {}

type inertResolver struct{}

func (inertResolver) Resolve(context.Context, *domain.RippleSignal, json.RawMessage) (*rippledom.ResolveResult, error) {
	return nil, nil
}

type inertEngine struct{}

func (inertEngine) Register(orchestration.Workflow) {}
func (inertEngine) Start(context.Context) error     { return nil }
func (inertEngine) Stop(context.Context) error      { return nil }
func (inertEngine) StartRun(context.Context, string, string, map[string]any) (*orchestration.Run, error) {
	return nil, nil
}
func (inertEngine) Resume(context.Context, uuid.UUID, bool) error { return nil }
func (inertEngine) GetRun(context.Context, uuid.UUID) (*orchestration.Run, error) {
	return nil, nil
}
func (inertEngine) ListRuns(context.Context, string, string) ([]*orchestration.Run, error) {
	return nil, nil
}
func (inertEngine) ActiveRun(context.Context, string, string) (*orchestration.Run, error) {
	return nil, nil
}
func (inertEngine) Abort(context.Context, uuid.UUID) error { return nil }
func (inertEngine) Retry(context.Context, uuid.UUID) error { return nil }
func (inertEngine) FindRunByBatch(context.Context, string) (*orchestration.Run, error) {
	return nil, nil
}
func (inertEngine) Replan(context.Context, uuid.UUID) error { return nil }
