# Chat Object Cards UX - Interactive Entity References

**Date:** October 21, 2025  
**Status:** 🔄 In Progress (Backend ✅ Complete, Frontend ⏳ Pending)  
**Area:** Chat UI/UX Enhancement

## Problem

Chat responses for entity queries were showing **raw data dumps** with lots of metadata:

```
### 1. Pursue Partnership Model for LegalPlant Sales

- ID: fd01db9d-0ed0-410b-90d4-3de327ab8b48
- Key: decision-pursue-partnership-model-for-legalplant-sales-6dfc5db2
- Created: 10/20/2025
- name: Pursue Partnership Model for LegalPlant Sales
- tags: ["legalplant","product-strategy","ai"]
- title: Pursue a partnership model...
- status: approved
- rationale: Building a direct sales team...
- description: The team decided that...
- _extraction_job_id: 3052d52e-6ffd-45cb-94f3-d13216ed5e59
- _extraction_source: document
- _extraction_source_id: cf478205-9197-4ea0-a3eb-06623f8037e5
- _extraction_confidence: 0.807
- _extraction_llm_confidence: 0.97
```

**Issues:**
- ❌ Too much information overwhelms users
- ❌ Internal metadata fields (`_extraction_*`) exposed
- ❌ No way to see details on demand
- ❌ Poor mobile experience (endless scrolling)
- ❌ No visual hierarchy or icons

## Solution Overview

Transform entity query responses into **interactive object cards**:

```
Here are the last 5 decisions:

┌─────────────────────────────────────────┐
│ 🧩 Decision                             │
│ Pursue Partnership Model               │
│ Status: Approved • Oct 20, 2025       │
│                              [View →]  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🧩 Decision                             │
│ Expand European Market                 │
│ Status: Under Review • Oct 18, 2025   │
│                              [View →]  │
└─────────────────────────────────────────┘
```

Click card → Opens modal with full details

## Implementation

### Phase 1: Backend - Structured Response Format ✅

**Changes Made:**

1. **Filter Metadata** (`chat-generation.service.ts` line 172-178)
   ```typescript
   // Skip extraction metadata fields
   if (key.startsWith('_extraction_')) continue;
   ```

2. **Instruct LLM** (`chat-generation.service.ts` line 63-73)
   ```typescript
   systemPrompt += ' When presenting entity query results, respond with structured object references:';
   systemPrompt += '```object-ref\n';
   systemPrompt += '{\n';
   systemPrompt += '  "id": "entity-uuid-here",\n';
   systemPrompt += '  "type": "EntityType",\n';
   systemPrompt += '  "name": "Display Name",\n';
   systemPrompt += '  "summary": "Brief one-line description"\n';
   systemPrompt += '}\n';
   systemPrompt += '```\n';
   ```

**Expected LLM Response:**
```markdown
Here are the last 5 decisions:

```object-ref
{
  "id": "fd01db9d-0ed0-410b-90d4-3de327ab8b48",
  "type": "Decision",
  "name": "Pursue Partnership Model for LegalPlant Sales",
  "summary": "Status: approved • Piggyback partnership strategy"
}
```

```object-ref
{
  "id": "uuid-2",
  "type": "Decision",
  "name": "Expand European Market",
  "summary": "Status: under review • Q2 2026 target"
}
```
```

### Phase 2: Frontend - Interactive Card Component ⏳

**Component Structure:**

```tsx
// apps/admin/src/components/molecules/ObjectRefCard/ObjectRefCard.tsx

interface ObjectRef {
    id: string;
    type: string;
    name: string;
    summary?: string;
}

interface ObjectRefCardProps {
    object: ObjectRef;
    onView?: (id: string, type: string) => void;
}

export function ObjectRefCard({ object, onView }: ObjectRefCardProps) {
    const icon = getIconForType(object.type);
    
    return (
        <div 
            className="card card-compact bg-base-200 hover:bg-base-300 cursor-pointer transition-colors"
            onClick={() => onView?.(object.id, object.type)}
            data-testid={`object-ref-card-${object.type.toLowerCase()}`}
        >
            <div className="card-body">
                <div className="flex items-start gap-3">
                    <span className={`iconify ${icon} text-2xl text-primary`} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="badge badge-sm badge-ghost">
                                {object.type}
                            </span>
                        </div>
                        <h3 className="font-semibold text-base truncate">
                            {object.name}
                        </h3>
                        {object.summary && (
                            <p className="text-sm opacity-70 mt-1 line-clamp-2">
                                {object.summary}
                            </p>
                        )}
                    </div>
                    <button className="btn btn-ghost btn-sm btn-circle">
                        <span className="iconify lucide--chevron-right" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function getIconForType(type: string): string {
    const icons: Record<string, string> = {
        'Decision': 'lucide--lightbulb',
        'Project': 'lucide--folder',
        'Document': 'lucide--file-text',
        'Task': 'lucide--check-square',
        'Person': 'lucide--user',
        'Location': 'lucide--map-pin',
        'Event': 'lucide--calendar',
        'Organization': 'lucide--building',
    };
    return icons[type] || 'lucide--box';
}
```

**Parser Component:**

```tsx
// apps/admin/src/components/molecules/ChatObjectRefs/ChatObjectRefs.tsx

interface ChatObjectRefsProps {
    content: string;
    onViewObject: (id: string, type: string) => void;
}

export function ChatObjectRefs({ content, onViewObject }: ChatObjectRefsProps) {
    // Parse ```object-ref blocks from markdown
    const objectRefs = useMemo(() => {
        const refs: ObjectRef[] = [];
        const regex = /```object-ref\n([\s\S]*?)\n```/g;
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            try {
                const obj = JSON.parse(match[1]);
                if (obj.id && obj.type && obj.name) {
                    refs.push(obj);
                }
            } catch (e) {
                console.warn('Failed to parse object-ref:', match[1]);
            }
        }
        
        return refs;
    }, [content]);

    if (objectRefs.length === 0) return null;

    return (
        <div className="space-y-2 my-4">
            {objectRefs.map((ref) => (
                <ObjectRefCard 
                    key={ref.id} 
                    object={ref} 
                    onView={onViewObject}
                />
            ))}
        </div>
    );
}
```

**Integration in Chat:**

```tsx
// apps/admin/src/pages/admin/chat/conversation/index.tsx

import { ChatObjectRefs } from '@/components/molecules/ChatObjectRefs';

// Inside message rendering:
{m.role === "assistant" ? (
    <>
        {/* Check if content has object-ref blocks */}
        {m.content.includes('```object-ref') ? (
            <>
                {/* Render intro text (before first object-ref) */}
                <ReactMarkdown>
                    {m.content.split('```object-ref')[0]}
                </ReactMarkdown>
                
                {/* Render object cards */}
                <ChatObjectRefs 
                    content={m.content}
                    onViewObject={handleViewObject}
                />
                
                {/* Render any trailing text (after last object-ref) */}
                <ReactMarkdown>
                    {m.content.split('```').slice(-1)[0]}
                </ReactMarkdown>
            </>
        ) : (
            <ReactMarkdown>{m.content}</ReactMarkdown>
        )}
    </>
) : (
    m.content
)}
```

**Modal for Object Details:**

```tsx
// apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx

interface ObjectDetailModalProps {
    objectId: string;
    objectType: string;
    open: boolean;
    onClose: () => void;
}

export function ObjectDetailModal({ objectId, objectType, open, onClose }: ObjectDetailModalProps) {
    const { data, loading } = useObjectDetails(objectId, objectType);
    
    return (
        <dialog className="modal" open={open}>
            <div className="modal-box max-w-4xl">
                <form method="dialog">
                    <button 
                        className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </form>
                
                <h3 className="font-bold text-lg mb-4">
                    <span className="badge badge-primary mr-2">{objectType}</span>
                    {data?.name}
                </h3>
                
                {loading ? (
                    <div className="loading loading-spinner loading-lg" />
                ) : data ? (
                    <div className="space-y-4">
                        {/* Render all properties */}
                        {Object.entries(data.properties || {}).map(([key, value]) => (
                            !key.startsWith('_extraction_') && (
                                <div key={key} className="form-control">
                                    <label className="label">
                                        <span className="label-text font-semibold">{key}</span>
                                    </label>
                                    <div className="text-sm opacity-90">
                                        {typeof value === 'object' 
                                            ? JSON.stringify(value, null, 2)
                                            : String(value)
                                        }
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                ) : (
                    <p className="text-error">Failed to load object details</p>
                )}
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={onClose}>close</button>
            </form>
        </dialog>
    );
}
```

**API Hook:**

```tsx
// apps/admin/src/hooks/use-object-details.ts

export function useObjectDetails(objectId: string, objectType: string) {
    const { fetchJson } = useApi();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (!objectId || !objectType) return;
        
        setLoading(true);
        fetchJson(`/api/graph/objects/${objectId}`)
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [objectId, objectType, fetchJson]);
    
    return { data, loading };
}
```

### Phase 3: Backend - Graph Object Details Endpoint ⏳

Need to add endpoint to fetch full object details by ID:

```typescript
// apps/server/src/modules/graph/graph.controller.ts

@Get('objects/:id')
@ApiOkResponse({ description: 'Get object by ID' })
@Scopes('graph:read')
async getObjectById(
    @Param('id') id: string,
    @Req() req: Request
): Promise<any> {
    const projectId = req.headers['x-project-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    
    return this.graphService.getObjectById(id, projectId, orgId);
}
```

## Benefits

### User Experience
- ✅ **Scannable**: Quick visual scan of results
- ✅ **Progressive Disclosure**: See summaries, click for details
- ✅ **Mobile-Friendly**: Cards work better than long lists
- ✅ **Visual Hierarchy**: Icons and badges improve clarity
- ✅ **Clickable**: Direct interaction with entities

### Technical
- ✅ **Clean Data**: No internal metadata exposed
- ✅ **Structured Format**: Consistent parsing and rendering
- ✅ **Extensible**: Easy to add more object types
- ✅ **Testable**: Clear component boundaries

### Performance
- ✅ **Less Data**: Only essentials in initial response
- ✅ **Lazy Loading**: Details fetched on demand
- ✅ **Better Streaming**: Smaller tokens for cards vs full data

## Testing Plan

### Backend Tests
1. Verify `_extraction_*` fields are filtered from context
2. Verify LLM responds with ```object-ref blocks
3. Verify blocks contain required fields (id, type, name)

### Frontend Tests
1. **Unit**: ObjectRefCard renders correctly with props
2. **Unit**: ChatObjectRefs parses blocks correctly
3. **Integration**: Clicking card opens modal
4. **Integration**: Modal fetches and displays details
5. **E2E**: Full flow from query → cards → modal

### Manual Testing
1. Ask "what are the last 5 decisions?"
2. Verify cards render instead of raw data
3. Click first card
4. Verify modal shows all properties (without `_extraction_*`)
5. Close modal
6. Click another card
7. Verify different data loads

## Rollout Plan

1. ✅ **Phase 1: Backend** (Complete)
   - Filter metadata
   - Update LLM prompt
   - Test structured response

2. ⏳ **Phase 2: Frontend Components**
   - Create ObjectRefCard component
   - Create ChatObjectRefs parser
   - Add to Storybook

3. ⏳ **Phase 3: Integration**
   - Add graph object details endpoint
   - Create useObjectDetails hook
   - Create ObjectDetailModal
   - Wire up in chat page

4. ⏳ **Phase 4: Polish**
   - Add loading states
   - Add error handling
   - Add animations
   - Mobile optimization

## Future Enhancements

- **Quick Actions**: Add buttons to cards (Edit, Delete, Share)
- **Preview**: Hover card shows mini preview
- **Relationships**: Show related objects in modal
- **History**: Track viewed objects for quick access
- **Grouping**: Group objects by type in results
- **Sorting**: Allow user to sort cards
- **Filtering**: Filter card list by type/property
- **Export**: Export results as JSON/CSV
- **Share**: Share specific object link

## Related Documentation

- [Chat Markdown Rendering](./CHAT_MARKDOWN_RENDERING.md)
- [Chat Markdown Prose Fix](./CHAT_MARKDOWN_PROSE_FIX.md)
- [MCP Data Queries](./MCP_CHAT_DATA_QUERIES_COMPLETE.md)
