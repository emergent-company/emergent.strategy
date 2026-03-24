package compute

import (
	"context"
	"fmt"
	"sync"
)

// Registry manages registered inline skill handlers.
type Registry struct {
	mu       sync.RWMutex
	handlers map[string]SkillHandler
}

// NewRegistry creates a new handler registry.
func NewRegistry() *Registry {
	return &Registry{
		handlers: make(map[string]SkillHandler),
	}
}

// Register adds a handler to the registry. Panics if the name is already registered.
func (r *Registry) Register(handler SkillHandler) {
	r.mu.Lock()
	defer r.mu.Unlock()

	name := handler.Name()
	if _, exists := r.handlers[name]; exists {
		panic(fmt.Sprintf("compute: handler %q already registered", name))
	}
	r.handlers[name] = handler
}

// Get returns the handler for the given name, or nil if not found.
func (r *Registry) Get(name string) SkillHandler {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.handlers[name]
}

// Has returns true if a handler is registered for the given name.
func (r *Registry) Has(name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.handlers[name]
	return ok
}

// Names returns all registered handler names.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.handlers))
	for name := range r.handlers {
		names = append(names, name)
	}
	return names
}

// Execute looks up the handler by name and executes it.
func (r *Registry) Execute(ctx context.Context, handlerName string, input *ExecutionInput) (*ExecutionResult, error) {
	handler := r.Get(handlerName)
	if handler == nil {
		return nil, fmt.Errorf("no inline handler registered for %q", handlerName)
	}
	return handler.Execute(ctx, input)
}

// DefaultRegistry is the global registry used by the MCP server.
var DefaultRegistry = NewRegistry()
