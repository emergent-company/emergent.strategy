package adk_test

import (
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/workflowagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	adksession "google.golang.org/adk/v2/session"
	wf "google.golang.org/adk/v2/workflow"
	"google.golang.org/genai"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

// testAppName and testUserID were shared with aim_graph_test.go before the
// AIM-specific graph moved to internal/aimdbos
// (openspec/changes/adopt-dbos-dynamic-aim); this is their only remaining
// consumer.
const (
	testAppName = "strategy-server"
	testUserID  = "user-1"
)

// TestPerf_SessionHistoryGrowth measures what a growing event stream costs.
//
// ADK reloads and rescans a session's entire event history on every turn:
// runner.getOrCreateSession issues an unbounded Get, and the workflow layer
// then walks the whole list several times over (ReconstructRunState alone is
// three passes, and it runs whether or not the turn is a resume). Nothing in
// ADK v2.2.0 bounds this — there is no compaction, and although GetRequest
// exposes NumRecentEvents, no ADK code path sets it.
//
// For the AIM cycle the streams are short and none of this matters. It matters
// a great deal for callers with long-running sessions, so this quantifies the
// curve rather than leaving it as an argument.
//
// Opt-in, because seeding tens of thousands of rows is slow:
//
//	ADK_PERF=1 go test ./internal/adk/ -run TestPerf_SessionHistoryGrowth -v
func TestPerf_SessionHistoryGrowth(t *testing.T) {
	if os.Getenv("ADK_PERF") == "" {
		t.Skip("set ADK_PERF=1 to run the session-history growth measurement")
	}

	db := database.TestDB(t)
	store := adk.NewSessionStore(db)
	eventCounts := []int{0, 100, 500, 1_000, 2_500, 5_000, 10_000}

	type row struct {
		events  int
		loadMS  float64
		turnMS  float64
		bytesKB float64
	}
	var results []row

	for _, n := range eventCounts {
		sessionID := fmt.Sprintf("perf-%d-%s", n, uuid.NewString()[:8])

		// A cycle paused at a review gate, which is the state a resume has to
		// reconstruct.
		h := newPerfHarness(t, store, sessionID)
		interruptID := h.startAndPause(t)

		// Pad with completed prior turns, as a long-lived session accumulates.
		seedFillerEvents(t, db, sessionID, n, fillerEventBytes)

		loadMS, bytesKB := measureLoad(t, store, sessionID)
		turnMS := measureResume(t, h, interruptID)

		results = append(results, row{n, loadMS, turnMS, bytesKB})
		t.Logf("events=%-6d load=%7.2fms resume-turn=%8.2fms payload=%8.1fKB", n, loadMS, turnMS, bytesKB)
	}

	t.Log("")
	t.Log("events   load(ms)  turn(ms)  payload(KB)  load/event(us)  turn/event(us)")
	for _, r := range results {
		perLoad, perTurn := 0.0, 0.0
		if r.events > 0 {
			perLoad = r.loadMS * 1000 / float64(r.events)
			perTurn = r.turnMS * 1000 / float64(r.events)
		}
		t.Logf("%-8d %8.2f  %8.2f  %11.1f  %14.2f  %14.2f",
			r.events, r.loadMS, r.turnMS, r.bytesKB, perLoad, perTurn)
	}

	// Characterise the shape: compare cost growth against event growth.
	if len(results) >= 2 {
		first, last := results[1], results[len(results)-1]
		eventRatio := float64(last.events) / float64(first.events)
		loadRatio := last.loadMS / first.loadMS
		turnRatio := last.turnMS / first.turnMS
		t.Logf("")
		t.Logf("scaling from %d to %d events (%.0fx): load %.1fx, resume turn %.1fx",
			first.events, last.events, eventRatio, loadRatio, turnRatio)
	}
}

// ── measurement ───────────────────────────────────────────────────────────────

func measureLoad(t *testing.T, store *adk.SessionStore, sessionID string) (ms, payloadKB float64) {
	t.Helper()

	const iterations = 5
	var samples []float64
	var events int

	for range iterations {
		start := time.Now()
		resp, err := store.Get(t.Context(), &adksession.GetRequest{
			AppName:   testAppName,
			UserID:    testUserID,
			SessionID: sessionID,
		})
		elapsed := time.Since(start)
		if err != nil {
			t.Fatalf("get session: %v", err)
		}
		events = resp.Session.Events().Len()
		samples = append(samples, float64(elapsed.Microseconds())/1000)
	}

	slices.Sort(samples)
	return samples[len(samples)/2], float64(events) * float64(fillerEventBytes) / 1024
}

func measureResume(t *testing.T, h *perfHarness, interruptID string) float64 {
	t.Helper()

	start := time.Now()
	h.reply(t, interruptID)
	return float64(time.Since(start).Microseconds()) / 1000
}

// ── seeding ───────────────────────────────────────────────────────────────────

// fillerEventBytes approximates a modest tool-call event. Real coding-agent
// payloads are larger, which scales the constant but not the shape.
const fillerEventBytes = 400

type perfEventRow struct {
	bun.BaseModel `bun:"table:adk_session_events"`

	AppName   string          `bun:"app_name,pk"`
	UserID    string          `bun:"user_id,pk"`
	SessionID string          `bun:"session_id,pk"`
	ID        string          `bun:"id,pk"`
	Timestamp time.Time       `bun:"timestamp"`
	Event     json.RawMessage `bun:"event,type:jsonb"`
}

// seedFillerEvents writes n events from earlier, completed invocations. They
// are inserted directly rather than through AppendEvent, which would spend a
// transaction per row on setup rather than on what is being measured.
func seedFillerEvents(t *testing.T, db *bun.DB, sessionID string, n, eventBytes int) {
	t.Helper()
	if n == 0 {
		return
	}

	filler := make([]byte, 0, eventBytes)
	for len(filler) < eventBytes {
		filler = append(filler, "the quick brown fox jumps over the lazy dog. "...)
	}

	// Timestamps sit in the past so the paused invocation stays newest.
	base := time.Now().UTC().Add(-24 * time.Hour)
	rows := make([]perfEventRow, 0, n)

	for i := range n {
		author := "user"
		role := genai.RoleUser
		if i%2 == 1 {
			author = "assistant"
			role = genai.RoleModel
		}

		ev := &adksession.Event{
			ID:           uuid.NewString(),
			InvocationID: fmt.Sprintf("filler-%d", i/2),
			Author:       author,
			Timestamp:    base.Add(time.Duration(i) * time.Millisecond),
			LLMResponse: model.LLMResponse{
				Content: &genai.Content{
					Role:  role,
					Parts: []*genai.Part{{Text: string(filler)}},
				},
			},
		}

		encoded, err := json.Marshal(ev)
		if err != nil {
			t.Fatalf("marshal filler event: %v", err)
		}

		rows = append(rows, perfEventRow{
			AppName:   testAppName,
			UserID:    testUserID,
			SessionID: sessionID,
			ID:        ev.ID,
			Timestamp: ev.Timestamp,
			Event:     encoded,
		})
	}

	for chunk := 0; chunk < len(rows); chunk += 500 {
		end := min(chunk+500, len(rows))
		batch := rows[chunk:end]
		if _, err := db.NewInsert().Model(&batch).Exec(t.Context()); err != nil {
			t.Fatalf("seed filler events: %v", err)
		}
	}
}

// ── harness ───────────────────────────────────────────────────────────────────

type perfHarness struct {
	runner    *runner.Runner
	sessionID string
}

// newPerfHarness builds a one-gate workflow, the smallest thing that can be
// paused and resumed.
func newPerfHarness(t *testing.T, store *adk.SessionStore, sessionID string) *perfHarness {
	t.Helper()

	work := wf.NewFunctionNode("work",
		func(agent.Context, any) (string, error) { return "staged", nil },
		wf.NodeConfig{})

	gate := wf.NewEmittingFunctionNode[string, any]("gate",
		func(ctx agent.Context, _ string, emit func(*adksession.Event) error) (any, error) {
			err := emit(wf.NewRequestInputEvent(ctx, adksession.RequestInput{
				InterruptID: "perf-" + uuid.NewString(),
				Message:     "approve?",
			}))
			if err != nil {
				return nil, err
			}
			return nil, wf.ErrNodeInterrupted
		}, wf.NodeConfig{})

	done := wf.NewFunctionNode("done",
		func(agent.Context, any) (string, error) { return "done", nil },
		wf.NodeConfig{})

	root, err := buildPerfAgent(wf.Chain(wf.Start, work, gate, done))
	if err != nil {
		t.Fatalf("build workflow: %v", err)
	}

	if _, err := store.Create(t.Context(), &adksession.CreateRequest{
		AppName: testAppName, UserID: testUserID, SessionID: sessionID,
	}); err != nil {
		t.Fatalf("create session: %v", err)
	}

	r, err := runner.New(runner.Config{AppName: testAppName, Agent: root, SessionService: store})
	if err != nil {
		t.Fatalf("runner: %v", err)
	}
	return &perfHarness{runner: r, sessionID: sessionID}
}

func (h *perfHarness) run(t *testing.T, msg *genai.Content) []*adksession.Event {
	t.Helper()

	var events []*adksession.Event
	for ev, err := range h.runner.Run(t.Context(), testUserID, h.sessionID, msg, agent.RunConfig{}) {
		if err != nil {
			t.Fatalf("run: %v", err)
		}
		events = append(events, ev)
	}
	return events
}

func (h *perfHarness) startAndPause(t *testing.T) string {
	t.Helper()

	for _, ev := range h.run(t, genai.NewContentFromText("go", genai.RoleUser)) {
		if ev != nil && ev.RequestedInput != nil {
			return ev.RequestedInput.InterruptID
		}
	}
	t.Fatal("workflow did not pause")
	return ""
}

func (h *perfHarness) reply(t *testing.T, interruptID string) {
	t.Helper()

	h.run(t, &genai.Content{Role: genai.RoleUser, Parts: []*genai.Part{{
		FunctionResponse: &genai.FunctionResponse{
			ID:       interruptID,
			Name:     wf.WorkflowInputFunctionCallName,
			Response: map[string]any{"result": true},
		},
	}}})
}

func buildPerfAgent(edges []wf.Edge) (agent.Agent, error) {
	return workflowagent.New(workflowagent.Config{Name: "perf", Edges: edges})
}

// TestPerf_EventPayloadSize varies payload size at a fixed event count.
//
// Event count alone understates the risk for callers whose events carry tool
// output — file contents, diffs, command logs — because the per-turn cost is
// dominated by bytes read and deserialised, not by the number of records.
//
//	ADK_PERF=1 go test ./internal/adk/ -run TestPerf_EventPayloadSize -v
func TestPerf_EventPayloadSize(t *testing.T) {
	if os.Getenv("ADK_PERF") == "" {
		t.Skip("set ADK_PERF=1 to run the payload-size measurement")
	}

	const events = 1_000
	db := database.TestDB(t)
	store := adk.NewSessionStore(db)

	t.Logf("holding event count at %d, varying payload size", events)
	t.Log("")
	t.Log("payload/event   total(MB)   load(ms)   turn(ms)")

	for _, size := range []int{400, 2_048, 8_192, 32_768} {
		sessionID := fmt.Sprintf("perfsz-%d-%s", size, uuid.NewString()[:8])

		h := newPerfHarness(t, store, sessionID)
		interruptID := h.startAndPause(t)
		seedFillerEvents(t, db, sessionID, events, size)

		loadMS, _ := measureLoad(t, store, sessionID)
		turnMS := measureResume(t, h, interruptID)
		totalMB := float64(events) * float64(size) / (1024 * 1024)

		t.Logf("%-13s %9.1f  %9.2f  %9.2f", humanBytes(size), totalMB, loadMS, turnMS)
	}
}

func humanBytes(n int) string {
	switch {
	case n >= 1024*1024:
		return fmt.Sprintf("%dMB", n/(1024*1024))
	case n >= 1024:
		return fmt.Sprintf("%dKB", n/1024)
	default:
		return fmt.Sprintf("%dB", n)
	}
}
