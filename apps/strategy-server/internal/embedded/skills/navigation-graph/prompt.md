# Navigation Graph Authoring Skill

You are guiding the user through creating an EPF navigation graph artifact. This defines the product's interaction topology — where users can be, how they move between screens, and what guards control access.

## Before Starting

1. **Get the schema**: `epf_get_schema { "artifact_type": "navigation_graph" }`
2. **Get the template**: `epf_get_template { "artifact_type": "navigation_graph" }`
3. **Load personas**: `epf_get_personas { "instance_path": "<path>" }` — you need to understand who navigates the product
4. **Check for features**: Look at existing feature definitions for interaction contexts and capabilities

## Two Authoring Modes

### Greenfield (no existing implementation)
The product is being planned. Work from EPF strategy artifacts (personas, features, roadmap) to design the navigation topology top-down.

### Retrofit (existing implementation)
The product exists. Extract the navigation topology from code (routes, screen definitions, guards) into a YAML artifact that captures the current state.

Ask the user which mode applies.

---

## Step 0: Understand the Product Shape

Before creating contexts, understand the product's shape:

- **How many services?** Single service or multi-service composition?
- **Who are the personas?** Each persona sees a different slice of the graph
- **What are the entry points?** Public pages, authenticated dashboards, admin panels
- **What guards exist?** Authentication, subscriptions, entity state, roles

Ask the user these questions. Use `epf_get_personas` to load persona data.

---

## Step 1: Define Guards

Guards are named preconditions that control access. Define them first because they shape the entire graph.

```yaml
guards:
  - id: authenticated
    description: "User is logged in"
    type: session
    message: "Please log in to continue"
    fallback: login  # redirect target when guard fails
  - id: company-selected
    description: "A company is selected in context"
    type: entity-state
    fallback: company-list
    message: "Select a company first"
```

**Guard types** (informational, not enforced):
- `session` — authentication/session state
- `entity-state` — data precondition (e.g., "share classes exist")
- `permission` — role-based access
- `subscription` — tier/plan gating
- `feature-flag` — gradual rollout

**Guard groups** — cluster related guards for bulk profile testing:
```yaml
  - id: premium-feature
    description: "Premium subscription required"
    type: subscription
    guard_group: premium
    message: "Upgrade to premium"
```

---

## Step 2: Define Groups

Groups are logical sections of the UI (sidebar tabs, navigation sections). Each group should have exactly one landing context (the default view when the group is selected).

```yaml
groups:
  - id: overview
    title: "Overview"
    order: 1
  - id: settings
    title: "Settings"
    order: 2
    visibility_guard: authenticated  # only visible when guard passes
```

---

## Step 3: Define Interaction Contexts

Contexts are meaningful places a user can be. Map each screen, page, or modal in the product.

**Naming convention**: Use kebab-case IDs that describe the *what*, not the *how*:
- `company-dashboard` (not `company-page` or `/companies/:id`)
- `share-issue` (not `issue-form` or `POST /shares`)

**Hierarchy**: Use `parent` to model containment (e.g., `share-issue` is a child of `cap-table`):
```yaml
contexts:
  - id: home
    title: "Home"
    group: overview
    mode: landing  # one per group
  - id: company-dashboard
    title: "Company Dashboard"
    parent: home
    group: overview
    scoped: true  # requires entity selection
  - id: cap-table
    title: "Cap Table"
    parent: company-dashboard
    group: captable
    scoped: true
    mode: landing
    data_requirements:
      - type: shareholders
        qualifier: all
```

**Key fields**:
| Field | When to use |
|-------|-------------|
| `parent` | When this context is "inside" another (breadcrumb parent) |
| `group` | Which tab/section this belongs to |
| `mode: landing` | Exactly one per group — the default view |
| `scoped: true` | When the context operates on a selected entity |
| `category` | Semantic domain (core, operations, equity, governance, etc.) |
| `data_requirements` | What data must be loaded for this context |
| `implementation_hints` | Technical notes (URL pattern, render mode, etc.) |

---

## Step 4: Define Transitions

Transitions are directed edges between contexts — how users navigate.

```yaml
transitions:
  - id: dashboard-to-captable
    from: company-dashboard
    to: cap-table
    label: "cap table"
    guard: shares-allowed
    category: navigation
```

**Categories**:
- `navigation` — standard link/menu item
- `transaction` — initiates a business operation
- `action` — triggers a specific action (create, delete, submit)
- `modal` — opens a modal/dialog
- `reporting` — navigates to a report view

**Common mistake**: Forgetting back-links. If a user can go from A to B, can they go back? Add transitions in both directions where needed.

---

## Step 5: Define Menus (optional)

Menus group actions available from a specific context:

```yaml
menus:
  - context: reporting-overview
    title: "Reports"
    items:
      - transition_id: reporting-to-rf1086
        label: "RF-1086"
        description: "Tax reporting submission"
      - transition_id: reporting-to-export
        label: "Export PDF"
```

---

## Step 6: Multi-Service Composition (if applicable)

If the product spans multiple services, use `imports` and `portal_edges`:

```yaml
imports:
  - service: captable
    path: captable_navigation.yaml

portal_edges:
  - id: portal-to-captable
    source: shareholders  # local context
    target: "captable:cap-table"  # service:context-id
    label: "view cap table"
    guard: company-selected
  - id: portal-from-captable
    source: "captable:ga-voting"
    target: meeting-detail
    label: "back to meeting"
```

**Rules**:
- Source and target can be local (`context-id`) or namespaced (`service:context-id`)
- Guard references can be from either the root or imported graph
- Each imported service is a separate YAML file with its own complete graph

---

## Step 7: Validate and Test

After writing the YAML:

1. **Validate**: `epf_validate_file { "path": "<file>" }`
2. **Search**: `epf_journey_search { "instance_path": "<path>", "query": "dashboard" }` — verify contexts are findable
3. **Reachability**: `epf_journey_reachability { "instance_path": "<path>", "source": "<entry>", "guards": "authenticated,company-selected" }` — verify persona can reach expected screens
4. **Path finding**: `epf_journey_path { "instance_path": "<path>", "from": "home", "to": "share-issue", "guards": "authenticated,share-classes" }` — verify key journeys
5. **Guard blocking**: `epf_journey_guards { "instance_path": "<path>", "context_id": "cap-table" }` — verify access control
6. **Journey scenarios**: `epf_journey_run { "instance_path": "<path>", "steps": [...] }` — test scripted user journeys

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| No landing context for a group | Add `mode: landing` to exactly one context per group |
| Guard referenced but not defined | Add the guard to the `guards` array |
| Orphan context (no transitions, no parent) | Add a transition or set a parent |
| Circular parent chain | A context cannot be its own ancestor |
| Duplicate IDs | Context, transition, and guard IDs must be unique within their category |
| URL patterns in context IDs | Use semantic names (`share-issue`), not URL paths (`/shares/issue`) |
| Missing back-links | If users can navigate A -> B, add B -> A unless it's a one-way action |

---

## Greenfield Checklist

When designing from scratch:

- [ ] One context per meaningful screen/state (not per UI component)
- [ ] Entry context is the first thing users see
- [ ] Every persona can reach their key workflows
- [ ] Guards block unauthorized access but don't create dead ends (use fallbacks)
- [ ] Groups map to navigation sections the user sees
- [ ] Data requirements capture what each context needs to function
- [ ] Journey scenarios cover the top 3-5 user stories

## Retrofit Checklist

When extracting from existing code:

- [ ] Every route/screen has a corresponding context
- [ ] Every link/button has a corresponding transition
- [ ] Authentication/authorization checks become guards
- [ ] Sidebar/tab groups become groups
- [ ] Data fetching on page load becomes data_requirements
- [ ] URL patterns go in implementation_hints, not context IDs
- [ ] Rendering details (icons, CSS, layout) go in properties, not the graph structure
