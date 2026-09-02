package adk

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	adksession "google.golang.org/adk/v2/session"
)

// SessionStore is a Postgres-backed implementation of the ADK v2
// session.Service, built on bun so ADK persistence shares this service's single
// connection pool and goose migration history rather than introducing a second
// ORM (ADK's own database store is GORM-based and self-migrating).
//
// Durability here is what makes an interrupted workflow resumable: ADK
// reconstructs run state by replaying a session's event stream, so the ordered
// event log below is the substrate for "a run survives a server restart".
//
// Correctness is validated against ADK's own conformance suite
// (session/sessiontestsuite), not just hand-written expectations.
type SessionStore struct {
	db *bun.DB
}

var _ adksession.Service = (*SessionStore)(nil)

// NewSessionStore builds a session service over the given database.
func NewSessionStore(db *bun.DB) *SessionStore {
	return &SessionStore{db: db}
}

// --- storage models -------------------------------------------------------

type dbSession struct {
	bun.BaseModel `bun:"table:adk_sessions,alias:s"`

	AppName    string          `bun:"app_name,pk"`
	UserID     string          `bun:"user_id,pk"`
	ID         string          `bun:"id,pk"`
	State      json.RawMessage `bun:"state,type:jsonb"`
	CreateTime time.Time       `bun:"create_time,nullzero"`
	UpdateTime time.Time       `bun:"update_time,nullzero"`
}

type dbSessionEvent struct {
	bun.BaseModel `bun:"table:adk_session_events,alias:e"`

	AppName   string          `bun:"app_name,pk"`
	UserID    string          `bun:"user_id,pk"`
	SessionID string          `bun:"session_id,pk"`
	ID        string          `bun:"id,pk"`
	Timestamp time.Time       `bun:"timestamp"`
	Event     json.RawMessage `bun:"event,type:jsonb"`
}

type dbAppState struct {
	bun.BaseModel `bun:"table:adk_app_states,alias:as"`

	AppName    string          `bun:"app_name,pk"`
	State      json.RawMessage `bun:"state,type:jsonb"`
	UpdateTime time.Time       `bun:"update_time,nullzero"`
}

type dbUserState struct {
	bun.BaseModel `bun:"table:adk_user_states,alias:us"`

	AppName    string          `bun:"app_name,pk"`
	UserID     string          `bun:"user_id,pk"`
	State      json.RawMessage `bun:"state,type:jsonb"`
	UpdateTime time.Time       `bun:"update_time,nullzero"`
}

// --- Service ---------------------------------------------------------------

// Create inserts a new session. The caller may supply a session ID; when empty
// one is generated. Creating a session that already exists is an error.
func (s *SessionStore) Create(ctx context.Context, req *adksession.CreateRequest) (*adksession.CreateResponse, error) {
	if req == nil {
		return nil, errors.New("adk session: nil CreateRequest")
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = uuid.NewString()
	}

	// Route the initial state to its scopes. "temp:" keys are dropped: they are
	// invocation-scoped by definition and must never reach storage.
	appDelta, userDelta, sessionDelta := splitStateByScope(req.State)

	now := time.Now().UTC()

	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		exists, err := tx.NewSelect().Model((*dbSession)(nil)).
			Where("app_name = ?", req.AppName).
			Where("user_id = ?", req.UserID).
			Where("id = ?", sessionID).
			Exists(ctx)
		if err != nil {
			return fmt.Errorf("check existing session: %w", err)
		}
		if exists {
			return fmt.Errorf("adk session: session %q already exists for app %q user %q",
				sessionID, req.AppName, req.UserID)
		}

		if err := mergeAppState(ctx, tx, req.AppName, appDelta, now); err != nil {
			return err
		}
		if err := mergeUserState(ctx, tx, req.AppName, req.UserID, userDelta, now); err != nil {
			return err
		}

		stateJSON, err := marshalState(sessionDelta)
		if err != nil {
			return err
		}
		_, err = tx.NewInsert().Model(&dbSession{
			AppName:    req.AppName,
			UserID:     req.UserID,
			ID:         sessionID,
			State:      stateJSON,
			CreateTime: now,
			UpdateTime: now,
		}).Exec(ctx)
		if err != nil {
			return fmt.Errorf("insert session: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Read back through the same merge path Get uses, so the returned view is
	// identical to what a subsequent Get would produce.
	view, err := s.load(ctx, req.AppName, req.UserID, sessionID, 0, time.Time{})
	if err != nil {
		return nil, err
	}
	return &adksession.CreateResponse{Session: view}, nil
}

// Get returns a session with its merged state and (optionally filtered) events.
func (s *SessionStore) Get(ctx context.Context, req *adksession.GetRequest) (*adksession.GetResponse, error) {
	if req == nil {
		return nil, errors.New("adk session: nil GetRequest")
	}

	view, err := s.load(ctx, req.AppName, req.UserID, req.SessionID, req.NumRecentEvents, req.After)
	if err != nil {
		return nil, err
	}
	return &adksession.GetResponse{Session: view}, nil
}

// List returns sessions for an app, optionally narrowed to one user.
//
// An empty UserID means "every user of this app", not "the user whose id is the
// empty string" — a semantic that is not stated on the interface and is pinned
// by ADK's conformance suite.
//
// Events and state are not populated: ADK uses this for enumeration, and
// loading every event stream would be wasteful.
func (s *SessionStore) List(ctx context.Context, req *adksession.ListRequest) (*adksession.ListResponse, error) {
	if req == nil {
		return nil, errors.New("adk session: nil ListRequest")
	}

	q := s.db.NewSelect().Model((*dbSession)(nil)).
		Where("app_name = ?", req.AppName).
		Order("create_time ASC")
	if req.UserID != "" {
		q = q.Where("user_id = ?", req.UserID)
	}

	var rows []dbSession
	if err := q.Scan(ctx, &rows); err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}

	sessions := make([]adksession.Session, 0, len(rows))
	for _, r := range rows {
		sessions = append(sessions, newSessionView(r.AppName, r.UserID, r.ID, nil, nil, r.UpdateTime))
	}
	return &adksession.ListResponse{Sessions: sessions}, nil
}

// Delete removes a session. Its events cascade. Deleting a session that does
// not exist is a no-op.
func (s *SessionStore) Delete(ctx context.Context, req *adksession.DeleteRequest) error {
	if req == nil {
		return errors.New("adk session: nil DeleteRequest")
	}

	_, err := s.db.NewDelete().Model((*dbSession)(nil)).
		Where("app_name = ?", req.AppName).
		Where("user_id = ?", req.UserID).
		Where("id = ?", req.SessionID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// AppendEvent persists an event and applies its state delta to the appropriate
// scopes, then mirrors both onto the in-memory session view.
//
// Partial events are streaming fragments, not durable facts, and are ignored.
func (s *SessionStore) AppendEvent(ctx context.Context, cur adksession.Session, event *adksession.Event) error {
	if cur == nil {
		return errors.New("adk session: nil session")
	}
	if event == nil {
		return errors.New("adk session: nil event")
	}
	if event.Partial {
		return nil
	}

	appName, userID, sessionID := cur.AppName(), cur.UserID(), cur.ID()

	if event.ID == "" {
		event.ID = uuid.NewString()
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}

	appDelta, userDelta, sessionDelta := splitStateByScope(event.Actions.StateDelta)

	// The stored event must not carry "temp:" keys, or replaying the stream
	// would resurrect invocation-scoped state.
	storedEvent := withoutTempStateDelta(event)
	eventJSON, err := json.Marshal(storedEvent)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	err = s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		row, err := fetchSessionRow(ctx, tx, appName, userID, sessionID)
		if err != nil {
			return err
		}

		if err := mergeAppState(ctx, tx, appName, appDelta, event.Timestamp); err != nil {
			return err
		}
		if err := mergeUserState(ctx, tx, appName, userID, userDelta, event.Timestamp); err != nil {
			return err
		}

		if len(sessionDelta) > 0 {
			current, err := unmarshalState(row.State)
			if err != nil {
				return err
			}
			maps.Copy(current, sessionDelta)
			stateJSON, err := marshalState(current)
			if err != nil {
				return err
			}
			row.State = stateJSON
		}

		if _, err := tx.NewUpdate().Model(row).
			Set("state = ?", row.State).
			Set("update_time = ?", event.Timestamp).
			WherePK().
			Exec(ctx); err != nil {
			return fmt.Errorf("update session state: %w", err)
		}

		if _, err := tx.NewInsert().Model(&dbSessionEvent{
			AppName:   appName,
			UserID:    userID,
			SessionID: sessionID,
			ID:        event.ID,
			Timestamp: event.Timestamp,
			Event:     eventJSON,
		}).Exec(ctx); err != nil {
			return fmt.Errorf("insert event: %w", err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Keep the caller's view consistent with what was just written.
	if view, ok := cur.(*sessionView); ok {
		view.applyEvent(event)
	}
	return nil
}

// --- internals -------------------------------------------------------------

// load assembles a session view: the merged three-scope state plus the event
// stream, applying the optional recency filters.
func (s *SessionStore) load(ctx context.Context, appName, userID, sessionID string, numRecent int, after time.Time) (*sessionView, error) {
	var row dbSession
	err := s.db.NewSelect().Model(&row).
		Where("app_name = ?", appName).
		Where("user_id = ?", userID).
		Where("id = ?", sessionID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("adk session: session %q not found for app %q user %q",
			sessionID, appName, userID)
	}
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}

	sessionState, err := unmarshalState(row.State)
	if err != nil {
		return nil, err
	}
	appState, err := s.loadAppState(ctx, appName)
	if err != nil {
		return nil, err
	}
	userState, err := s.loadUserState(ctx, appName, userID)
	if err != nil {
		return nil, err
	}

	events, err := s.loadEvents(ctx, appName, userID, sessionID, numRecent, after)
	if err != nil {
		return nil, err
	}

	return newSessionView(
		appName, userID, sessionID,
		mergeStateScopes(appState, userState, sessionState),
		events,
		row.UpdateTime,
	), nil
}

// loadEvents returns the session's events in chronological order.
//
// NumRecentEvents selects the most recent N, which requires fetching in
// descending order and reversing — the returned slice is always chronological.
func (s *SessionStore) loadEvents(ctx context.Context, appName, userID, sessionID string, numRecent int, after time.Time) ([]*adksession.Event, error) {
	q := s.db.NewSelect().Model((*dbSessionEvent)(nil)).
		Where("app_name = ?", appName).
		Where("user_id = ?", userID).
		Where("session_id = ?", sessionID)

	if !after.IsZero() {
		q = q.Where("timestamp >= ?", after)
	}
	if numRecent > 0 {
		q = q.Order("timestamp DESC", "id DESC").Limit(numRecent)
	} else {
		q = q.Order("timestamp ASC", "id ASC")
	}

	var rows []dbSessionEvent
	if err := q.Scan(ctx, &rows); err != nil {
		return nil, fmt.Errorf("load events: %w", err)
	}
	if numRecent > 0 {
		slicesReverse(rows)
	}

	events := make([]*adksession.Event, 0, len(rows))
	for i := range rows {
		var ev adksession.Event
		if err := json.Unmarshal(rows[i].Event, &ev); err != nil {
			return nil, fmt.Errorf("unmarshal event %q: %w", rows[i].ID, err)
		}
		events = append(events, &ev)
	}
	return events, nil
}

func (s *SessionStore) loadAppState(ctx context.Context, appName string) (map[string]any, error) {
	var row dbAppState
	err := s.db.NewSelect().Model(&row).Where("app_name = ?", appName).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load app state: %w", err)
	}
	return unmarshalState(row.State)
}

func (s *SessionStore) loadUserState(ctx context.Context, appName, userID string) (map[string]any, error) {
	var row dbUserState
	err := s.db.NewSelect().Model(&row).
		Where("app_name = ?", appName).
		Where("user_id = ?", userID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load user state: %w", err)
	}
	return unmarshalState(row.State)
}

func fetchSessionRow(ctx context.Context, tx bun.Tx, appName, userID, sessionID string) (*dbSession, error) {
	var row dbSession
	err := tx.NewSelect().Model(&row).
		Where("app_name = ?", appName).
		Where("user_id = ?", userID).
		Where("id = ?", sessionID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("adk session: session %q not found, cannot apply event", sessionID)
	}
	if err != nil {
		return nil, fmt.Errorf("load session for event: %w", err)
	}
	return &row, nil
}

// mergeAppState upserts app-scoped keys, preserving keys not in the delta.
func mergeAppState(ctx context.Context, tx bun.Tx, appName string, delta map[string]any, at time.Time) error {
	if len(delta) == 0 {
		return nil
	}
	var row dbAppState
	err := tx.NewSelect().Model(&row).Where("app_name = ?", appName).Scan(ctx)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		stateJSON, mErr := marshalState(delta)
		if mErr != nil {
			return mErr
		}
		if _, iErr := tx.NewInsert().Model(&dbAppState{
			AppName: appName, State: stateJSON, UpdateTime: at,
		}).Exec(ctx); iErr != nil {
			return fmt.Errorf("insert app state: %w", iErr)
		}
		return nil
	case err != nil:
		return fmt.Errorf("load app state for merge: %w", err)
	}

	current, err := unmarshalState(row.State)
	if err != nil {
		return err
	}
	maps.Copy(current, delta)
	stateJSON, err := marshalState(current)
	if err != nil {
		return err
	}
	if _, err := tx.NewUpdate().Model(&row).
		Set("state = ?", stateJSON).
		Set("update_time = ?", at).
		WherePK().Exec(ctx); err != nil {
		return fmt.Errorf("update app state: %w", err)
	}
	return nil
}

// mergeUserState upserts user-scoped keys, preserving keys not in the delta.
func mergeUserState(ctx context.Context, tx bun.Tx, appName, userID string, delta map[string]any, at time.Time) error {
	if len(delta) == 0 {
		return nil
	}
	var row dbUserState
	err := tx.NewSelect().Model(&row).
		Where("app_name = ?", appName).
		Where("user_id = ?", userID).
		Scan(ctx)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		stateJSON, mErr := marshalState(delta)
		if mErr != nil {
			return mErr
		}
		if _, iErr := tx.NewInsert().Model(&dbUserState{
			AppName: appName, UserID: userID, State: stateJSON, UpdateTime: at,
		}).Exec(ctx); iErr != nil {
			return fmt.Errorf("insert user state: %w", iErr)
		}
		return nil
	case err != nil:
		return fmt.Errorf("load user state for merge: %w", err)
	}

	current, err := unmarshalState(row.State)
	if err != nil {
		return err
	}
	maps.Copy(current, delta)
	stateJSON, err := marshalState(current)
	if err != nil {
		return err
	}
	if _, err := tx.NewUpdate().Model(&row).
		Set("state = ?", stateJSON).
		Set("update_time = ?", at).
		WherePK().Exec(ctx); err != nil {
		return fmt.Errorf("update user state: %w", err)
	}
	return nil
}

// splitStateByScope routes a state delta into its three persistence scopes,
// stripping the prefix that selected each one. "temp:" keys are dropped: they
// live only for the duration of an invocation.
func splitStateByScope(delta map[string]any) (appDelta, userDelta, sessionDelta map[string]any) {
	appDelta = map[string]any{}
	userDelta = map[string]any{}
	sessionDelta = map[string]any{}

	for key, value := range delta {
		switch {
		case strings.HasPrefix(key, adksession.KeyPrefixApp):
			appDelta[strings.TrimPrefix(key, adksession.KeyPrefixApp)] = value
		case strings.HasPrefix(key, adksession.KeyPrefixUser):
			userDelta[strings.TrimPrefix(key, adksession.KeyPrefixUser)] = value
		case strings.HasPrefix(key, adksession.KeyPrefixTemp):
			// Invocation-scoped; never persisted.
		default:
			sessionDelta[key] = value
		}
	}
	return appDelta, userDelta, sessionDelta
}

// mergeStateScopes reassembles the client-visible state, re-applying the
// prefixes that were stripped on write.
func mergeStateScopes(appState, userState, sessionState map[string]any) map[string]any {
	merged := make(map[string]any, len(appState)+len(userState)+len(sessionState))
	maps.Copy(merged, sessionState)
	for k, v := range appState {
		merged[adksession.KeyPrefixApp+k] = v
	}
	for k, v := range userState {
		merged[adksession.KeyPrefixUser+k] = v
	}
	return merged
}

// withoutTempStateDelta returns an event whose state delta carries no "temp:"
// keys, copying only when a key actually needs removing.
func withoutTempStateDelta(event *adksession.Event) *adksession.Event {
	if len(event.Actions.StateDelta) == 0 {
		return event
	}
	filtered := make(map[string]any, len(event.Actions.StateDelta))
	for k, v := range event.Actions.StateDelta {
		if !strings.HasPrefix(k, adksession.KeyPrefixTemp) {
			filtered[k] = v
		}
	}
	if len(filtered) == len(event.Actions.StateDelta) {
		return event
	}
	clone := *event
	clone.Actions.StateDelta = filtered
	return &clone
}

func marshalState(state map[string]any) (json.RawMessage, error) {
	if state == nil {
		state = map[string]any{}
	}
	b, err := json.Marshal(state)
	if err != nil {
		return nil, fmt.Errorf("marshal state: %w", err)
	}
	return b, nil
}

func unmarshalState(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var state map[string]any
	if err := json.Unmarshal(raw, &state); err != nil {
		return nil, fmt.Errorf("unmarshal state: %w", err)
	}
	if state == nil {
		state = map[string]any{}
	}
	return state, nil
}

func slicesReverse[T any](s []T) {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		s[i], s[j] = s[j], s[i]
	}
}
