# Chat Object Cards - Testing Quick Reference

## Quick Test Commands

### Build Check
```bash
npm --prefix apps/admin run build
```
Expected: ✅ Build succeeds in ~3 seconds

### Storybook
```bash
npm --prefix apps/admin run storybook
```
Navigate to: **Components > Molecules > ObjectRefCard**

### Development Server
```bash
npm run workspace:start
```
Then open: http://localhost:5175/admin/apps/chat/c/new

## Manual Test Scenarios

### Scenario 1: Single Object Reference
**Query**: "What is the main project decision?"

**Expected Response**:
```markdown
Here is the key decision:

```object-ref
{
  "id": "dec_12345",
  "type": "Decision",
  "name": "Adopt microservices architecture",
  "summary": "Decision to transition from monolith to microservices"
}
```

This decision was made in Q3 2024...
```

**Verify**:
- [ ] Card renders above markdown text
- [ ] Card shows icon, name "Adopt microservices...", type badge "Decision"
- [ ] Card shows summary (2 lines max)
- [ ] Hover: border → primary, shadow appears, icon background changes
- [ ] Object-ref block NOT visible in markdown
- [ ] Click card → loading spinner → modal opens
- [ ] Modal shows full object details

### Scenario 2: Multiple Object References
**Query**: "Show me the top 3 people"

**Expected**: Grid of 3 cards (2 columns on desktop, 1 on mobile)

**Verify**:
- [ ] Cards render in grid layout (gap-2)
- [ ] Each card ~60px height, full width
- [ ] All cards clickable
- [ ] Hover effects independent per card
- [ ] Clicking different cards opens different object details

### Scenario 3: No Summary
**Expected**: Card without summary text (just icon, name, type badge)

**Verify**:
- [ ] Card still renders correctly
- [ ] Height slightly smaller (~50px)
- [ ] No empty space where summary would be

### Scenario 4: Long Text Truncation
**Expected**: Card with very long name or summary

**Verify**:
- [ ] Name truncates with ellipsis (line-clamp-1)
- [ ] Summary truncates at 2 lines (line-clamp-2)
- [ ] No text overflow

### Scenario 5: API Error
**Simulate**: Click card, API returns 404 or 500

**Verify**:
- [ ] Loading spinner appears briefly
- [ ] Error message displays: "Failed to load object details"
- [ ] User can dismiss error
- [ ] User can try clicking again

### Scenario 6: Mixed Content
**Query**: "Tell me about the project and show related people"

**Expected**: Markdown text + object-ref cards + more markdown text

**Verify**:
- [ ] Cards render in correct position
- [ ] Markdown above and below cards renders correctly
- [ ] No duplicate content
- [ ] Object-ref blocks not visible anywhere

## Storybook Stories to Verify

### ObjectRefCard Component
1. **Default**: Full card with icon, name, type, summary
2. **WithoutSummary**: Card without summary text
3. **LongText**: Name and summary truncation
4. **ShortText**: Minimal content
5. **MultipleCards**: Grid layout (2 columns)
6. **DifferentTypes**: Person, Location, Decision types
7. **ResponsiveWidths**: Mobile vs desktop width

### Expected Appearance
```
┌──────────────────────────────────────┐
│ [Icon]  Entity Name          [Type]  │
│         Summary text that may        │
│         span two lines max...      > │
└──────────────────────────────────────┘
```

## Integration Points to Check

### Chat Conversation Page
**File**: `apps/admin/src/pages/admin/chat/conversation/index.tsx`

**Line 6**: Imports
```tsx
import { ChatObjectRefs, parseObjectRefs, stripObjectRefBlocks } from "@/components/organisms/ChatObjectRefs";
```

**Lines 174-260**: Assistant message rendering
```tsx
m.role === "assistant" ? (
  (() => {
    const refs = parseObjectRefs(m.content);
    const cleanMarkdown = stripObjectRefBlocks(m.content);
    return (
      <>
        {refs.length > 0 && <ChatObjectRefs refs={refs} />}
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{cleanMarkdown}</ReactMarkdown>
        </div>
      </>
    );
  })()
)
```

## API Verification

### Endpoint
```
GET /api/graph/objects/:id
```

### Test with curl
```bash
# Replace {id} with actual object ID from database
curl http://localhost:3001/graph/objects/{id} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Org-ID: your-org-id" \
  -H "X-Project-ID: your-project-id"
```

**Expected Response**:
```json
{
  "id": "dec_12345",
  "type": "Decision",
  "name": "Adopt microservices architecture",
  "summary": "Decision to transition...",
  "properties": [...],
  "extractionMetadata": {...},
  "createdAt": "2024-10-15T10:30:00Z",
  "updatedAt": "2024-10-15T10:30:00Z"
}
```

## Common Issues & Solutions

### Issue: Cards not appearing
**Check**:
1. LLM response contains ```object-ref blocks
2. JSON inside blocks is valid
3. Required fields present: id, type, name
4. Console errors (F12 Developer Tools)

### Issue: Cards render but click does nothing
**Check**:
1. API endpoint accessible (Network tab)
2. Authorization headers present
3. Object ID exists in database
4. Console shows API errors

### Issue: Modal doesn't open
**Check**:
1. API response successful (200 status)
2. Response contains valid GraphObject
3. ObjectDetailModal component imported
4. Modal state updates (React DevTools)

### Issue: Object-ref blocks still visible in markdown
**Check**:
1. stripObjectRefBlocks() called correctly
2. Regex pattern matches blocks: /```object-ref\n[\s\S]*?```/g
3. cleanMarkdown passed to ReactMarkdown, not m.content

### Issue: Build fails
**Check**:
1. TypeScript errors (should be warnings only)
2. Import paths correct (@/ alias)
3. Dependencies installed (npm install)
4. Vite config valid

## Performance Checks

### Load Time
- Cards should render instantly (no delay)
- Markdown parsing < 10ms
- API fetch 100-500ms (network dependent)
- Modal open < 100ms

### Memory
- No memory leaks when opening/closing modal
- Cards cleanup when message removed
- Event listeners removed on unmount

### Responsiveness
- Hover effects smooth (no lag)
- Grid layout adapts to screen size
- Text truncation works on all devices

## Regression Tests

After changes, verify:
- [ ] Existing chat messages still render
- [ ] Messages without object-refs unchanged
- [ ] Citations component still works
- [ ] Streaming messages still animate
- [ ] User messages still right-aligned
- [ ] Assistant messages still left-aligned
- [ ] Message timestamps still show
- [ ] Copy message button still works

## Success Checklist

Before marking complete:
- [ ] Build succeeds
- [ ] All 7 Storybook stories render
- [ ] Cards render from ```object-ref blocks
- [ ] Cards clickable, open modal
- [ ] Modal shows full object details
- [ ] Multiple cards grid layout works
- [ ] Text truncation works
- [ ] Hover effects smooth
- [ ] Loading states during fetch
- [ ] Error handling works
- [ ] Object-ref blocks removed from markdown
- [ ] No console errors
- [ ] No TypeScript blocking errors
- [ ] Responsive on mobile/desktop
- [ ] No memory leaks

## Documentation References

- **Implementation Guide**: `docs/CHAT_OBJECT_CARDS_IMPLEMENTATION.md`
- **Visual Examples**: `docs/CHAT_OBJECT_CARDS_VISUAL_EXAMPLES.md`
- **Completion Report**: `docs/CHAT_OBJECT_CARDS_INTEGRATION_COMPLETE.md`

---

**Last Updated**: 2025-01-18  
**Status**: Integration Complete ✅
