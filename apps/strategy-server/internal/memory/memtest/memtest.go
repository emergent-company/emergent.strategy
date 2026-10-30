// Package memtest is an in-memory fake of the emergent.memory REST API for
// tests. It implements only the endpoints the strategy server calls and keeps
// the semantics the ingest code relies on: objects are unique on (type, key),
// an upsert replaces labels and properties, deleting an object removes its
// relationships, and list/search filters by key, type and label (overlap).
package memtest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// Server is a running fake. Safe for concurrent use.
type Server struct {
	*httptest.Server

	mu       sync.Mutex
	nextID   int
	objects  map[string]*memory.Object // by id
	rels     map[string]*memory.Relationship
	branches map[string]*memory.Branch
	requests []Request

	// Scores ranks search hits by object key; a key not listed scores 0.5.
	// Hits come back best first, ties by key, cut to the request's limit.
	Scores map[string]float64
	// FailSearch makes /api/graph/search return HTTP 500.
	FailSearch bool
	// FailUpsertKeys makes upserts of these keys return HTTP 400.
	FailUpsertKeys map[string]bool
	// OnUpsert, if set, runs after each successful object upsert, outside the lock.
	OnUpsert func(key string)
	// Version is reported by /health. Empty omits the field, as old Memory
	// versions do.
	Version string
}

// Request is one recorded call.
type Request struct {
	Method string
	Path   string
	Query  string
	Body   string
}

// New starts a fake and registers cleanup.
func New(t testing.TB) *Server {
	t.Helper()
	s := &Server{
		objects:        map[string]*memory.Object{},
		rels:           map[string]*memory.Relationship{},
		branches:       map[string]*memory.Branch{},
		FailUpsertKeys: map[string]bool{},
		Scores:         map[string]float64{},
	}
	s.Server = httptest.NewServer(http.HandlerFunc(s.handle))
	t.Cleanup(s.Close)
	return s
}

// Client returns a Memory client pointed at the fake.
func (s *Server) Client(t testing.TB) *memory.Client {
	t.Helper()
	c, err := memory.New(memory.Config{
		BaseURL: s.URL, ProjectID: "test-project", Token: "test-token", AuthMode: memory.AuthModeAPIKey,
	})
	if err != nil {
		t.Fatalf("memtest client: %v", err)
	}
	return c
}

// AddObject inserts an object directly and returns its ID.
func (s *Server) AddObject(o memory.Object) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.putLocked(o).ID
}

// AddBranch inserts a branch directly and returns its ID.
func (s *Server) AddBranch(name string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	id := "br-" + strconv.Itoa(s.nextID)
	s.branches[id] = &memory.Branch{ID: id, Name: name, Status: "active"}
	return id
}

// Objects returns a snapshot of all live objects sorted by key.
func (s *Server) Objects() []memory.Object {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]memory.Object, 0, len(s.objects))
	for _, o := range s.objects {
		out = append(out, *o)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

// ObjectByKey returns the live object with key, or nil.
func (s *Server) ObjectByKey(key string) *memory.Object {
	for _, o := range s.Objects() {
		if o.Key == key {
			cp := o
			return &cp
		}
	}
	return nil
}

// Relationships returns a snapshot of all live relationships.
func (s *Server) Relationships() []memory.Relationship {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]memory.Relationship, 0, len(s.rels))
	for _, r := range s.rels {
		out = append(out, *r)
	}
	return out
}

// Branches returns a snapshot of all branches.
func (s *Server) Branches() []memory.Branch {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]memory.Branch, 0, len(s.branches))
	for _, b := range s.branches {
		out = append(out, *b)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Requests returns every recorded call.
func (s *Server) Requests() []Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Request(nil), s.requests...)
}

// Count returns how many recorded calls match method and path prefix.
func (s *Server) Count(method, pathPrefix string) int {
	n := 0
	for _, r := range s.Requests() {
		if r.Method == method && strings.HasPrefix(r.Path, pathPrefix) {
			n++
		}
	}
	return n
}

func (s *Server) putLocked(o memory.Object) *memory.Object {
	for _, ex := range s.objects {
		if ex.Type == o.Type && ex.Key == o.Key && o.Key != "" {
			ex.Status, ex.Labels, ex.Properties = o.Status, o.Labels, o.Properties
			ex.Version++
			return ex
		}
	}
	s.nextID++
	o.ID = "obj-" + strconv.Itoa(s.nextID)
	o.EntityID = o.ID
	o.Version = 1
	s.objects[o.ID] = &o
	return &o
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	body := ""
	if r.Body != nil {
		var sb strings.Builder
		buf := make([]byte, 4096)
		for {
			n, err := r.Body.Read(buf)
			sb.Write(buf[:n])
			if err != nil {
				break
			}
		}
		body = sb.String()
	}
	s.mu.Lock()
	s.requests = append(s.requests, Request{r.Method, r.URL.Path, r.URL.RawQuery, body})
	s.mu.Unlock()

	path := r.URL.Path
	switch {
	case path == "/health":
		resp := map[string]any{"status": "healthy", "timestamp": "2026-01-01T00:00:00Z", "uptime": "1s"}
		if s.Version != "" {
			resp["version"] = s.Version
		}
		writeJSON(w, resp)
	case path == "/api/graph/objects/upsert" && r.Method == http.MethodPut:
		s.upsertObject(w, body)
	case path == "/api/graph/objects/search" && r.Method == http.MethodGet:
		s.listObjects(w, r)
	case path == "/api/graph/search" && r.Method == http.MethodPost:
		s.search(w, body)
	case path == "/api/graph/expand" && r.Method == http.MethodPost:
		s.expand(w, body)
	case strings.HasPrefix(path, "/api/graph/objects/") && strings.HasSuffix(path, "/edges"):
		s.edges(w, strings.TrimSuffix(strings.TrimPrefix(path, "/api/graph/objects/"), "/edges"))
	case strings.HasPrefix(path, "/api/graph/objects/") && r.Method == http.MethodDelete:
		s.deleteObject(w, strings.TrimPrefix(path, "/api/graph/objects/"))
	case strings.HasPrefix(path, "/api/graph/objects/") && r.Method == http.MethodGet:
		s.getObject(w, strings.TrimPrefix(path, "/api/graph/objects/"))
	case path == "/api/graph/relationships/upsert" && r.Method == http.MethodPut:
		s.upsertRel(w, body)
	case strings.HasPrefix(path, "/api/graph/relationships/") && r.Method == http.MethodDelete:
		s.mu.Lock()
		delete(s.rels, strings.TrimPrefix(path, "/api/graph/relationships/"))
		s.mu.Unlock()
		writeJSON(w, map[string]any{})
	case path == "/api/graph/branches" && r.Method == http.MethodGet:
		writeJSON(w, s.Branches())
	case path == "/api/graph/branches" && r.Method == http.MethodPost:
		var req memory.CreateBranchRequest
		_ = json.Unmarshal([]byte(body), &req)
		id := s.AddBranch(req.Name)
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, map[string]any{"id": id, "name": req.Name, "status": "active"})
	case strings.HasPrefix(path, "/api/graph/branches/") && strings.HasSuffix(path, "/merge") && r.Method == http.MethodPost:
		writeJSON(w, map[string]any{"objects_created": 0, "objects_updated": 0, "relationships_created": 0})
	case strings.HasPrefix(path, "/api/graph/branches/") && r.Method == http.MethodGet:
		s.mu.Lock()
		b := s.branches[strings.TrimPrefix(path, "/api/graph/branches/")]
		s.mu.Unlock()
		if b == nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		writeJSON(w, b)
	case strings.HasPrefix(path, "/api/graph/branches/") && r.Method == http.MethodDelete:
		s.mu.Lock()
		delete(s.branches, strings.TrimPrefix(path, "/api/graph/branches/"))
		s.mu.Unlock()
		writeJSON(w, map[string]any{})
	default:
		http.Error(w, `{"error":"memtest: unhandled `+r.Method+" "+path+`"}`, http.StatusNotFound)
	}
}

func (s *Server) upsertObject(w http.ResponseWriter, body string) {
	var req memory.UpsertObjectRequest
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	if s.FailUpsertKeys[req.Key] {
		s.mu.Unlock()
		http.Error(w, `{"error":"rejected"}`, http.StatusBadRequest)
		return
	}
	o := s.putLocked(memory.Object{
		Type: req.Type, Key: req.Key, Status: req.Status, Labels: req.Labels, Properties: req.Properties,
	})
	cp := *o
	hook := s.OnUpsert
	s.mu.Unlock()
	if hook != nil {
		hook(req.Key)
	}
	writeJSON(w, cp)
}

func hasLabel(o *memory.Object, want []string) bool {
	if len(want) == 0 {
		return true
	}
	for _, l := range o.Labels {
		for _, w := range want {
			if l == w {
				return true
			}
		}
	}
	return false
}

func (s *Server) listObjects(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	want := q["label"]
	want = append(want, q["labels"]...)
	s.mu.Lock()
	var matched []memory.Object
	for _, o := range s.objects {
		if k := q.Get("key"); k != "" && o.Key != k {
			continue
		}
		if t := q.Get("type"); t != "" && o.Type != t {
			continue
		}
		if !hasLabel(o, want) {
			continue
		}
		matched = append(matched, *o)
	}
	s.mu.Unlock()
	sort.Slice(matched, func(i, j int) bool { return matched[i].Key < matched[j].Key })

	limit := 50
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 {
		limit = l
	}
	start, _ := strconv.Atoi(q.Get("cursor"))
	end := min(start+limit, len(matched))
	if start > len(matched) {
		start = len(matched)
	}
	page := map[string]any{"items": matched[start:end], "total": len(matched)}
	if end < len(matched) {
		page["next_cursor"] = strconv.Itoa(end)
	}
	writeJSON(w, page)
}

func (s *Server) search(w http.ResponseWriter, body string) {
	if s.FailSearch {
		http.Error(w, `{"error":"search is down"}`, http.StatusInternalServerError)
		return
	}
	var req struct {
		Query  string   `json:"query"`
		Limit  int      `json:"limit"`
		Labels []string `json:"labels"`
		Types  []string `json:"types"`
	}
	_ = json.Unmarshal([]byte(body), &req)
	s.mu.Lock()
	type hit struct {
		obj   memory.Object
		score float64
	}
	var hits []hit
	for _, o := range s.objects {
		if !hasLabel(o, req.Labels) {
			continue
		}
		if len(req.Types) > 0 && !contains(req.Types, o.Type) {
			continue
		}
		score, ok := s.Scores[o.Key]
		if !ok {
			score = 0.5
		}
		hits = append(hits, hit{*o, score})
	}
	s.mu.Unlock()
	sort.Slice(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score > hits[j].score
		}
		return hits[i].obj.Key < hits[j].obj.Key
	})
	if req.Limit > 0 && len(hits) > req.Limit {
		hits = hits[:req.Limit]
	}
	results := make([]map[string]any, 0, len(hits))
	for _, h := range hits {
		results = append(results, map[string]any{"object": h.obj, "score": h.score})
	}
	writeJSON(w, map[string]any{"data": results, "total": len(results)})
}

// expand answers a breadth-first expansion over every relationship, in both
// directions, up to max_depth and max_nodes, as Memory does. It does not look at
// labels: what comes back is whatever the graph connects.
func (s *Server) expand(w http.ResponseWriter, body string) {
	var req struct {
		RootIDs  []string `json:"root_ids"`
		MaxDepth int      `json:"max_depth"`
		MaxNodes int      `json:"max_nodes"`
	}
	_ = json.Unmarshal([]byte(body), &req)
	if req.MaxDepth <= 0 {
		req.MaxDepth = 1
	}
	if req.MaxNodes <= 0 {
		req.MaxNodes = 100
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	seen := map[string]bool{}
	var order []string
	frontier := []string{}
	for _, id := range req.RootIDs {
		if s.objects[id] != nil && !seen[id] {
			seen[id] = true
			order = append(order, id)
			frontier = append(frontier, id)
		}
	}
	for depth := 0; depth < req.MaxDepth && len(frontier) > 0; depth++ {
		var next []string
		for _, id := range frontier {
			for _, r := range s.rels {
				other := ""
				switch id {
				case r.FromID:
					other = r.ToID
				case r.ToID:
					other = r.FromID
				default:
					continue
				}
				if s.objects[other] == nil || seen[other] || len(order) >= req.MaxNodes {
					continue
				}
				seen[other] = true
				order = append(order, other)
				next = append(next, other)
			}
		}
		frontier = next
	}
	objs := make([]memory.Object, 0, len(order))
	for _, id := range order {
		objs = append(objs, *s.objects[id])
	}
	var rels []memory.Relationship
	for _, r := range s.rels {
		if seen[r.FromID] && seen[r.ToID] {
			rels = append(rels, *r)
		}
	}
	sort.Slice(rels, func(i, j int) bool { return rels[i].ID < rels[j].ID })
	writeJSON(w, map[string]any{"objects": objs, "relationships": rels})
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func (s *Server) getObject(w http.ResponseWriter, id string) {
	s.mu.Lock()
	o := s.objects[id]
	s.mu.Unlock()
	if o == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, o)
}

func (s *Server) deleteObject(w http.ResponseWriter, id string) {
	s.mu.Lock()
	delete(s.objects, id)
	for rid, r := range s.rels {
		if r.FromID == id || r.ToID == id {
			delete(s.rels, rid)
		}
	}
	s.mu.Unlock()
	writeJSON(w, map[string]any{})
}

func (s *Server) edges(w http.ResponseWriter, id string) {
	s.mu.Lock()
	out := map[string][]memory.Relationship{"incoming": {}, "outgoing": {}}
	for _, r := range s.rels {
		if r.ToID == id {
			out["incoming"] = append(out["incoming"], *r)
		}
		if r.FromID == id {
			out["outgoing"] = append(out["outgoing"], *r)
		}
	}
	s.mu.Unlock()
	writeJSON(w, out)
}

func (s *Server) upsertRel(w http.ResponseWriter, body string) {
	var req memory.UpsertRelationshipRequest
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.rels {
		if r.Type == req.Type && r.FromID == req.FromID && r.ToID == req.ToID {
			r.Properties = req.Properties
			writeJSON(w, r)
			return
		}
	}
	s.nextID++
	r := &memory.Relationship{
		ID: "rel-" + strconv.Itoa(s.nextID), Type: req.Type, FromID: req.FromID, ToID: req.ToID, Properties: req.Properties,
	}
	s.rels[r.ID] = r
	writeJSON(w, r)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
