# Chat Object Cards - Visual Examples & Integration

## 🎨 Chat UX Examples

### Example 1: Query Response with Object Cards

**User Query:**
```
What are the last 5 decisions?
```

**AI Response (rendered):**
```
Here are the 5 most recent decisions from your knowledge base:

┌─────────────────────────────────────────────────────┐
│ [📦] Decision                       [Decision]      │
│      Use React for frontend                         │
│      Modern framework with strong ecosystem      [→]│
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [📦] Decision                       [Decision]      │
│      Adopt TypeScript for type safety               │
│      Reduces bugs and improves DX               [→]│
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [📦] Decision                       [Decision]      │
│      Use NestJS for backend                         │
│      Structured framework with dependency inject[→]│
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [📦] Decision                       [Decision]      │
│      Implement graph-based knowledge system         │
│      Enables relationships and better search     [→]│
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [📦] Decision                       [Decision]      │
│      Use Playwright for E2E testing                 │
│      Reliable cross-browser testing              [→]│
└─────────────────────────────────────────────────────┘

These decisions were made during the initial architecture phase.
```

**Backend Response (raw):**
```markdown
Here are the 5 most recent decisions from your knowledge base:

```object-ref
{
  "id": "d7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca",
  "type": "Decision",
  "name": "Use React for frontend",
  "summary": "Modern framework with strong ecosystem"
}
```

```object-ref
{
  "id": "e8ebe7c7-bed8-59d9-9ga8-1d4f15def3db",
  "type": "Decision",
  "name": "Adopt TypeScript for type safety",
  "summary": "Reduces bugs and improves DX"
}
```

```object-ref
{
  "id": "f9fcf8d8-cfe9-60ea-aha9-2e5g26efg4ec",
  "type": "Decision",
  "name": "Use NestJS for backend",
  "summary": "Structured framework with dependency injection"
}
```

```object-ref
{
  "id": "g0gdg9e9-dffa-71fb-bhba-3f6h37fgh5fd",
  "type": "Decision",
  "name": "Implement graph-based knowledge system",
  "summary": "Enables relationships and better search"
}
```

```object-ref
{
  "id": "h1heh0f0-eggb-82gc-cicb-4g7i48ghi6ge",
  "type": "Decision",
  "name": "Use Playwright for E2E testing",
  "summary": "Reliable cross-browser testing"
}
```

These decisions were made during the initial architecture phase.
```

---

### Example 2: Mixed Content (Text + Object Cards)

**User Query:**
```
What risks should I be aware of for the AI extraction feature?
```

**AI Response (rendered):**
```
Based on your knowledge base, here are the main risks associated with the AI extraction feature:

┌─────────────────────────────────────────────────────┐
│ [📦] Risk                           [Risk]          │
│      Uncertainty of AI success                      │
│      Hard to predict exact success rate          [→]│
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [📦] Risk                           [Risk]          │
│      Data privacy concerns                          │
│      Sensitive data may be extracted incorrectly [→]│
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [📦] Risk                           [Risk]          │
│      Performance degradation                        │
│      Large documents may timeout during extract [→]│
└─────────────────────────────────────────────────────┘

**Mitigation Strategies:**
- Implement human review for high-confidence extractions (>80%)
- Start with small document sets to validate quality
- Set timeout limits and chunk large documents
- Use confidence thresholds to flag uncertain extractions

**Related Objects:**
Click any risk card above to see full details, mitigation strategies, and linked decisions.
```

---

### Example 3: Single Object Reference

**User Query:**
```
Tell me about the decision to use React
```

**AI Response (rendered):**
```
Here's the decision you're asking about:

┌─────────────────────────────────────────────────────┐
│ [📦] Decision                       [Decision]      │
│      Use React for frontend                         │
│      Modern framework with strong ecosystem      [→]│
└─────────────────────────────────────────────────────┘

**Context:**
React was chosen for its component-based architecture, large ecosystem, and excellent TypeScript support. The decision was made during the initial tech stack evaluation in Q3 2024.

**Key Factors:**
- Proven at scale (used by Facebook, Netflix, etc.)
- Rich ecosystem of libraries and tools
- Strong community support
- Excellent documentation
- Native TypeScript support via React 19

**Trade-offs:**
While Vue 3 and Svelte were also considered, React's larger community and ecosystem made it the safer choice for long-term maintenance.

Click the card above to see full decision details, linked risks, and related features.
```

---

## 🔄 User Flow

### Step 1: User asks question
```
User types: "What are the last 5 decisions?"
```

### Step 2: Backend processes with MCP + LLM
1. McpToolSelectorService picks `query_entities` tool
2. Executes query: `type:Decision` with limit:5, sort:recent
3. Gets results from graph database
4. ChatGenerationService formats with metadata filtering
5. LLM generates response with ```object-ref blocks

### Step 3: Frontend parses and renders
```tsx
// Chat message component receives:
message.content = `
Here are the 5 most recent decisions:

` + "```object-ref\n{...}\n```" + `

These decisions were made during...
`;

// Parsing logic:
const refs = parseObjectRefs(message.content);
// refs = [{id, type, name, summary}, ...]

const cleanMarkdown = stripObjectRefBlocks(message.content);
// cleanMarkdown = "Here are the 5 most recent decisions:\n\nThese decisions..."

// Render:
<>
  {refs.length > 0 && <ChatObjectRefs refs={refs} />}
  <ReactMarkdown>{cleanMarkdown}</ReactMarkdown>
</>
```

### Step 4: User clicks card
```tsx
// ObjectRefCard onClick triggers:
async function handleCardClick(objectId: string) {
  // 1. Show loading spinner
  setLoading(true);
  
  // 2. Fetch full object from API
  const obj = await fetchJson(`/api/graph/objects/${objectId}`);
  // Returns: GraphObject with all properties, metadata, relationships
  
  // 3. Open modal with full details
  setSelectedObject(obj);
  setIsModalOpen(true);
}
```

### Step 5: Modal displays full details
```
┌─────────────────────────────────────────────────────────────────┐
│                                                           [×]    │
│  Use React for frontend                                         │
│  [Decision] [document] [12 relationships]                       │
│                                                                 │
│  ✨ Extraction Metadata                                         │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Confidence Score            93.6%  ████████████████░░░  │  │
│  │ Sources                     [Document] Document 1       │  │
│  │ Extraction Job              [View Job]                  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  📋 Properties                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Name        Use React for frontend                      │  │
│  │ Description Modern framework with component arch...      │  │
│  │ Status      Approved                                     │  │
│  │ Tags        [Frontend] [Framework] [React]               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ℹ️  System Information                                        │
│  Object ID:   d7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca            │
│  Last Updated: 2025-10-05 10:30:00                             │
│                                                                 │
│                          [Edit] [View Graph] [Delete] [Close]  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Implementation Checklist

### Phase 1: Create ObjectRefCard ⏳
- [ ] Create `apps/admin/src/components/molecules/ObjectRefCard/` directory
- [ ] Implement `ObjectRefCard.tsx` component
- [ ] Create `ObjectRefCard.stories.tsx` with 4+ stories
- [ ] Add `index.ts` barrel export
- [ ] Test in Storybook (all stories render correctly)
- [ ] Verify hover effects work (border, icon, chevron animation)

### Phase 2: Create ChatObjectRefs Parser ⏳
- [ ] Create `apps/admin/src/components/organisms/ChatObjectRefs/` directory
- [ ] Implement `ChatObjectRefs.tsx` with parser functions
- [ ] Implement `parseObjectRefs()` regex function
- [ ] Implement `stripObjectRefBlocks()` cleanup function
- [ ] Add loading state handling
- [ ] Add error state handling
- [ ] Import and wire ObjectDetailModal
- [ ] Create integration tests for parser functions
- [ ] Add `index.ts` barrel export

### Phase 3: Integrate into Chat UI ⏳
- [ ] Import ChatObjectRefs components in chat/conversation/index.tsx
- [ ] Add parsing logic before ReactMarkdown rendering
- [ ] Update assistant message rendering to show cards first
- [ ] Strip object-ref blocks from markdown content
- [ ] Test with real chat responses containing ```object-ref blocks
- [ ] Verify modal opens when clicking cards
- [ ] Verify full object details load correctly
- [ ] Handle edge cases (malformed JSON, missing fields)

### Phase 4: Backend Verification ✅
- [x] Verify `/api/graph/objects/:id` endpoint exists
- [x] Verify endpoint requires `graph:read` scope
- [x] Verify endpoint returns GraphObject type
- [x] Confirm response includes all required fields (id, name, type, properties)

### Phase 5: Testing & QA ⏳
- [ ] Unit tests for parseObjectRefs() function
- [ ] Unit tests for stripObjectRefBlocks() function
- [ ] Integration test: query → cards → modal → details
- [ ] Test error handling (network failure, 404, malformed JSON)
- [ ] Test accessibility (keyboard navigation, screen readers)
- [ ] Test responsive layout (mobile, tablet, desktop)
- [ ] Test with various object types (Decision, Risk, Feature, etc.)
- [ ] Test with long names and summaries (truncation)
- [ ] Test with objects without summaries
- [ ] Load testing with 10+ object cards in single response

### Phase 6: Documentation ⏳
- [ ] Add usage examples to Storybook
- [ ] Document parser functions with JSDoc
- [ ] Add troubleshooting guide for common issues
- [ ] Update main documentation with object card UX
- [ ] Add screenshots/GIFs to docs

---

## 🐛 Edge Cases & Error Handling

### Malformed ```object-ref Blocks
```tsx
// Missing required fields
```object-ref
{
  "id": "abc123"
  // Missing: type, name
}
```

**Handling:** Parser skips block, logs warning, continues with other blocks

### API Errors (404, 403, 500)
```tsx
// Catch and display user-friendly error
try {
  await fetchJson(`/api/graph/objects/${objectId}`);
} catch (err) {
  setError('Unable to load object details. It may have been deleted or you lack permission.');
}
```

**UI:** Show small error alert below cards, don't break entire chat

### Object with No Properties
```tsx
// Empty properties object
const object = {
  id: "abc123",
  name: "Empty Object",
  type: "Unknown",
  properties: {}
};
```

**Handling:** ObjectDetailModal gracefully shows "No properties" message

### Multiple Rapid Clicks
```tsx
// Prevent duplicate API calls
const [loading, setLoading] = useState(false);

if (loading) return; // Ignore click if already loading
```

### Network Timeout
```tsx
// Set timeout on fetch
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s

try {
  await fetchJson(url, { signal: controller.signal });
} catch (err) {
  if (err.name === 'AbortError') {
    setError('Request timed out. Please try again.');
  }
} finally {
  clearTimeout(timeoutId);
}
```

---

## 🎯 Success Criteria

### Functional Requirements ✅
- [ ] Object cards render from ```object-ref blocks in chat
- [ ] Clicking card fetches and displays full object details in modal
- [ ] Modal shows all properties, metadata, version history
- [ ] Cards gracefully handle missing/optional fields (summary)
- [ ] Error states are user-friendly and actionable
- [ ] Loading states are visible and informative

### Performance Requirements ✅
- [ ] Cards render in <100ms after message received
- [ ] API call to fetch object completes in <500ms
- [ ] Modal opens in <300ms after API response
- [ ] No jank/layout shift when cards load
- [ ] Smooth transitions and animations

### UX Requirements ✅
- [ ] Cards are visually distinct from markdown content
- [ ] Hover states provide clear affordance (clickable)
- [ ] Keyboard navigation works (Tab, Enter)
- [ ] Screen readers announce cards correctly
- [ ] Mobile touch targets are appropriately sized (min 44x44px)
- [ ] Cards stack nicely on narrow screens

### Design Requirements ✅
- [ ] Cards match existing component design patterns
- [ ] Colors follow established system (base-*, primary, success, etc.)
- [ ] Icons are consistent with rest of application
- [ ] Typography hierarchy is clear (name > type > summary)
- [ ] Spacing is consistent with existing cards (p-3, gap-2)

---

## 📸 Visual Reference

### ObjectBrowser Card View (Existing)
**Path:** `/admin/apps/objects` with card view toggle

This shows the established pattern for clickable entity cards in grid layout.

### ExtractionJobCard (Existing)
**Path:** `/admin/extraction-jobs`

This shows the pattern for compact status cards with badges, stats, and hover effects.

### IntegrationCard (Existing)
**Path:** `/admin/integrations`

This shows the icon + title + badges layout pattern.

### ObjectDetailModal (Existing)
**Path:** Storybook → Organisms → ObjectDetailModal

This shows the full details view that opens when clicking object cards.

---

## 🚀 Deployment

### Build & Test
```bash
# 1. Build admin
nx run admin:build

# 2. Run Storybook (verify components)
nx run admin:storybook

# 3. Run unit tests
nx run admin:test

# 4. Run E2E tests (if applicable)
E2E_FORCE_TOKEN=1 nx run admin:e2e
```

### Deployment Checklist
- [ ] All unit tests passing
- [ ] Storybook stories render correctly
- [ ] E2E tests pass (chat flow)
- [ ] No TypeScript errors
- [ ] No console warnings/errors
- [ ] Backend endpoint tested and verified
- [ ] Performance benchmarks met
- [ ] Accessibility audit passed

---

## 📚 Related Documentation

- **CHAT_OBJECT_CARDS_UX.md** - Original specification document
- **CHAT_OBJECT_CARDS_IMPLEMENTATION.md** - Component implementation guide (this doc)
- **Storybook** - Interactive component documentation
  - ObjectDetailModal stories
  - ObjectBrowser stories  
  - ExtractionJobCard stories
  - IntegrationCard stories
- **API Documentation** - `/api/graph/objects/:id` endpoint spec

---

## 🤝 Contributing

When updating object card components:
1. Follow existing design patterns (see reference components above)
2. Update Storybook stories to show new functionality
3. Add unit tests for new behavior
4. Update this documentation with changes
5. Test across browsers and screen sizes
6. Verify accessibility with screen reader

---

## Summary

**What exists:**
- ✅ ObjectDetailModal (full details view)
- ✅ ObjectBrowser with card view (reference pattern)
- ✅ ExtractionJobCard (compact card pattern)
- ✅ IntegrationCard (icon + badges pattern)
- ✅ API endpoint: `GET /graph/objects/:id`

**What to implement:**
- ⏳ ObjectRefCard (compact chat card component)
- ⏳ ChatObjectRefs (parser + renderer component)
- ⏳ Integration into chat conversation page

**Estimated effort:** 4-6 hours
- 1-2 hours: ObjectRefCard component + stories
- 1-2 hours: ChatObjectRefs parser + integration
- 1-2 hours: Testing, refinement, documentation
