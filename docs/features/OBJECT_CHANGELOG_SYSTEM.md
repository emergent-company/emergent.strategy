# Object Changelog System

## Overview
Add changelog/version history display to ObjectDetailModal showing how objects have evolved over time, who changed them, and what changed.

## Current Database Support

### ✅ Versioning Infrastructure Already Exists

The `kb.graph_objects` table already has comprehensive versioning support:

```sql
CREATE TABLE kb.graph_objects (
    id UUID PRIMARY KEY,
    version INT NOT NULL DEFAULT 1,
    supersedes_id UUID NULL,              -- Points to previous version
    canonical_id UUID NULL,               -- Logical root (groups all versions)
    change_summary JSONB NULL,            -- What changed in this version
    content_hash BYTEA NULL,              -- For detecting duplicates
    properties JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ NULL,
    -- ... other columns
)
```

### Supporting Tables

**Branch Management:**
```sql
kb.branches                    -- Feature branches for isolation
kb.branch_lineage              -- Ancestor chains for fast queries
```

**Merge Tracking:**
```sql
kb.merge_provenance (
    child_version_id UUID,
    parent_version_id UUID,
    role TEXT,                 -- 'source', 'target', 'base'
)
```

**Release Snapshots:**
```sql
kb.product_versions            -- Named releases (e.g., '1.2.0')
kb.product_version_members     -- Objects included in each release
```

## Versioning Model

### How Versions Work

Each time an object is updated:
1. **New Row Created**: A new `graph_objects` row is inserted
2. **Link to Previous**: `supersedes_id` points to the old version
3. **Version Incremented**: `version` number increases
4. **Same Logical Identity**: `canonical_id` stays the same for all versions
5. **Change Summary**: `change_summary` JSONB stores what changed

### Example Version Chain

```
canonical_id: abc-123

Version 1 (Initial):
- id: v1-uuid
- supersedes_id: NULL
- version: 1
- properties: { "name": "John", "role": "Developer" }

Version 2 (Update role):
- id: v2-uuid
- supersedes_id: v1-uuid
- version: 2
- properties: { "name": "John", "role": "Senior Developer" }
- change_summary: { "fields": ["role"], "reason": "Promotion" }

Version 3 (Add email):
- id: v3-uuid
- supersedes_id: v2-uuid
- version: 3
- properties: { "name": "John", "role": "Senior Developer", "email": "john@example.com" }
- change_summary: { "fields": ["email"], "reason": "Contact info added" }
```

## Proposed Changelog UI

### Location
Add a new "History" section in `ObjectDetailModal` below the System Information section.

### Design

```
┌─────────────────────────────────────────────────────────┐
│ 📜 Version History                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ● Version 3 (Current)                           [View] │
│   Oct 20, 2025 3:45 PM                                 │
│   Added: email                                         │
│   Contact info added                                   │
│                                                         │
│ ○ Version 2                                     [View] │
│   Oct 15, 2025 2:30 PM                                 │
│   Changed: role                                        │
│   Promotion                                            │
│                                                         │
│ ○ Version 1 (Initial)                           [View] │
│   Oct 1, 2025 10:00 AM                                 │
│   Object created                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Features

**Version List:**
- Show all versions in reverse chronological order (newest first)
- Current version has filled dot (●), older versions have empty dot (○)
- Display creation timestamp for each version
- Show change summary (what fields changed)
- Show reason if available

**View Previous Versions:**
- "View" button opens version in modal/side panel
- Shows full property snapshot from that time
- Side-by-side diff view (optional enhancement)

**Visual Indicators:**
- **Added**: Green badge `+ email`
- **Changed**: Blue badge `~ role`
- **Removed**: Red badge `- oldField`

**Metadata:**
- Show who made the change (when user tracking added)
- Link to extraction job if version came from auto-extraction
- Show merge provenance if version was result of merge

## Implementation Plan

### Phase 1: Backend API ✅ ALREADY EXISTS!

The backend API is **already implemented** at:

**Endpoint:** `GET /graph/objects/:id/history`

**Implementation:**
```typescript
// apps/server/src/modules/graph/graph.controller.ts (line 145)
@Get('objects/:id/history')
@Scopes('graph:read')
@ApiOperation({ summary: 'List version history for a graph object' })
history(@Param('id') id: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string, @Req() req?: any) {
    const parsed = limit ? parseInt(limit, 10) : 20;
    return this.service.listHistory(id, parsed, cursor, this.extractContext(req));
}
```

**Service Method:**
```typescript
// apps/server/src/modules/graph/graph.service.ts (line 546)
async listHistory(id: string, limitParam = 20, cursor?: string, ctx?: GraphTenantContext): 
    Promise<{ items: GraphObjectDto[]; next_cursor?: string }> {
    // 1. Finds canonical_id from object ID
    // 2. Queries all versions in chain
    // 3. Orders by version DESC (newest first)
    // 4. Returns paginated results with cursor
}
```

**Response Format:**
```typescript
{
    items: [
        {
            id: string;
            version: number;
            supersedes_id?: string;
            canonical_id: string;
            type: string;
            key?: string;
            properties: Record<string, unknown>;
            labels: string[];
            change_summary?: {
                fields?: string[];
                reason?: string;
                added?: string[];
                modified?: string[];
                removed?: string[];
            };
            created_at: string;
            deleted_at?: string;
        },
        // ... more versions
    ],
    next_cursor?: string  // For pagination
}
```

**Features:**
- ✅ Finds all versions by canonical_id
- ✅ Orders newest to oldest (version DESC)
- ✅ Supports pagination (limit + cursor)
- ✅ Includes change_summary JSONB
- ✅ Tenant context (RLS) enforced
- ✅ Returns GraphObjectDto with all metadata

### Phase 2: Frontend UI

**1. Update ObjectDetailModal:**
```tsx
// apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx

export const ObjectDetailModal: React.FC<ObjectDetailModalProps> = ({
    object,
    isOpen,
    onClose,
    onDelete,
}) => {
    const [versions, setVersions] = useState<ObjectVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<ObjectVersion | null>(null);
    const { fetchJson } = useApi();

    // Load version history when modal opens
    useEffect(() => {
        if (isOpen && object) {
            loadVersionHistory();
        }
    }, [isOpen, object?.id]);

    const loadVersionHistory = async () => {
        if (!object) return;
        
        setLoadingVersions(true);
        try {
            const data = await fetchJson<ObjectVersion[]>(
                `/api/graph/objects/${object.id}/versions`
            );
            setVersions(data);
        } catch (error) {
            console.error('Failed to load version history:', error);
        } finally {
            setLoadingVersions(false);
        }
    };

    return (
        <dialog open={isOpen} className="modal modal-open">
            <div className="max-w-4xl modal-box">
                {/* Existing sections... */}

                {/* Version History Section */}
                <div className="mb-6">
                    <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                        <Icon icon="lucide--history" className="size-5" />
                        Version History
                    </h4>
                    
                    {loadingVersions ? (
                        <div className="flex justify-center p-4">
                            <span className="loading loading-spinner loading-md"></span>
                        </div>
                    ) : versions.length > 0 ? (
                        <div className="space-y-3">
                            {versions.map((version, idx) => (
                                <VersionItem 
                                    key={version.id}
                                    version={version}
                                    isFirst={idx === 0}
                                    onView={() => setSelectedVersion(version)}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-base-content/70">
                            No version history available
                        </p>
                    )}
                </div>

                {/* Actions */}
            </div>
        </dialog>
    );
};
```

**2. VersionItem Component:**
```tsx
// apps/admin/src/components/organisms/ObjectDetailModal/VersionItem.tsx

interface VersionItemProps {
    version: ObjectVersion;
    isFirst: boolean;
    onView: () => void;
}

export const VersionItem: React.FC<VersionItemProps> = ({
    version,
    isFirst,
    onView,
}) => {
    const changeSummary = version.change_summary;
    
    return (
        <div className={`flex gap-3 p-3 rounded border ${
            isFirst ? 'bg-primary/5 border-primary' : 'bg-base-200 border-base-300'
        }`}>
            {/* Version Indicator */}
            <div className="flex flex-col items-center">
                <div className={`size-3 rounded-full ${
                    isFirst ? 'bg-primary' : 'bg-base-300'
                }`} />
                {!isFirst && <div className="w-px flex-1 bg-base-300 mt-1" />}
            </div>

            {/* Content */}
            <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                    <div>
                        <span className="font-semibold">
                            Version {version.version}
                        </span>
                        {isFirst && (
                            <span className="ml-2 badge badge-primary badge-sm">
                                Current
                            </span>
                        )}
                        {version.version === 1 && (
                            <span className="ml-2 badge badge-ghost badge-sm">
                                Initial
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onView}
                        className="btn btn-xs btn-ghost gap-1"
                    >
                        <Icon icon="lucide--eye" className="size-3" />
                        View
                    </button>
                </div>

                <div className="text-xs text-base-content/70 mb-2">
                    {new Date(version.created_at).toLocaleString()}
                    {version.created_by && ` • ${version.created_by}`}
                </div>

                {/* Change Summary */}
                {changeSummary && (
                    <div className="space-y-1">
                        {changeSummary.added?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                <span className="text-xs text-success">Added:</span>
                                {changeSummary.added.map(field => (
                                    <span key={field} className="badge badge-success badge-sm gap-1">
                                        <Icon icon="lucide--plus" className="size-2" />
                                        {field}
                                    </span>
                                ))}
                            </div>
                        )}
                        {changeSummary.modified?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                <span className="text-xs text-info">Changed:</span>
                                {changeSummary.modified.map(field => (
                                    <span key={field} className="badge badge-info badge-sm gap-1">
                                        <Icon icon="lucide--edit-2" className="size-2" />
                                        {field}
                                    </span>
                                ))}
                            </div>
                        )}
                        {changeSummary.removed?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                <span className="text-xs text-error">Removed:</span>
                                {changeSummary.removed.map(field => (
                                    <span key={field} className="badge badge-error badge-sm gap-1">
                                        <Icon icon="lucide--minus" className="size-2" />
                                        {field}
                                    </span>
                                ))}
                            </div>
                        )}
                        {changeSummary.reason && (
                            <p className="text-xs italic text-base-content/60">
                                {changeSummary.reason}
                            </p>
                        )}
                    </div>
                )}

                {version.extraction_job_id && (
                    <a
                        href={`/admin/extraction-jobs/${version.extraction_job_id}`}
                        className="mt-2 btn btn-xs btn-ghost gap-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Icon icon="lucide--zap" className="size-2" />
                        From Extraction
                    </a>
                )}
            </div>
        </div>
    );
};
```

**3. Version Viewer Modal:**
```tsx
// apps/admin/src/components/organisms/ObjectDetailModal/VersionViewerModal.tsx

interface VersionViewerModalProps {
    version: ObjectVersion | null;
    currentVersion: ObjectVersion;
    onClose: () => void;
}

export const VersionViewerModal: React.FC<VersionViewerModalProps> = ({
    version,
    currentVersion,
    onClose,
}) => {
    if (!version) return null;

    const isCurrentVersion = version.id === currentVersion.id;

    return (
        <dialog open className="modal modal-open">
            <div className="max-w-3xl modal-box">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="font-bold text-xl">
                            Version {version.version}
                            {isCurrentVersion && (
                                <span className="ml-2 badge badge-primary">Current</span>
                            )}
                        </h3>
                        <p className="text-sm text-base-content/70">
                            {new Date(version.created_at).toLocaleString()}
                        </p>
                    </div>
                    <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
                        <Icon icon="lucide--x" className="size-4" />
                    </button>
                </div>

                {/* Properties from this version */}
                <div className="mb-4">
                    <h4 className="font-semibold mb-2">Properties</h4>
                    <pre className="bg-base-200 p-3 rounded overflow-x-auto text-xs">
                        {JSON.stringify(version.properties, null, 2)}
                    </pre>
                </div>

                {/* Side-by-side diff (future enhancement) */}
                {!isCurrentVersion && (
                    <div className="alert alert-info">
                        <Icon icon="lucide--info" />
                        <span>This is a historical version. Current version may differ.</span>
                    </div>
                )}

                <div className="modal-action">
                    <button onClick={onClose} className="btn btn-primary">
                        Close
                    </button>
                </div>
            </div>
        </dialog>
    );
};
```

### Phase 3: Automatic Change Tracking (Enhancement)

**Update GraphService.patchObject:**
```typescript
async patchObject(
    objectId: string,
    updates: PatchGraphObjectDto,
    ctx?: GraphTenantContext
): Promise<GraphObjectDto> {
    // Calculate change summary by comparing old vs new
    const oldObject = await this.getObjectById(objectId, ctx);
    
    const changeSummary = this.calculateChangeSummary(
        oldObject.properties,
        updates.properties || {}
    );

    // Create new version with change summary
    const newVersion = await this.createObject({
        type: oldObject.type,
        key: oldObject.key,
        properties: { ...oldObject.properties, ...updates.properties },
        labels: updates.labels || oldObject.labels,
        change_summary: changeSummary,
    }, ctx);

    return newVersion;
}

private calculateChangeSummary(
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>
): ChangeS {
    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    // Find added and modified
    for (const key of Object.keys(newProps)) {
        if (!(key in oldProps)) {
            added.push(key);
        } else if (JSON.stringify(oldProps[key]) !== JSON.stringify(newProps[key])) {
            modified.push(key);
        }
    }

    // Find removed
    for (const key of Object.keys(oldProps)) {
        if (!(key in newProps)) {
            removed.push(key);
        }
    }

    return { added, removed, modified };
}
```

## Future Enhancements

### Phase 4: Advanced Features

**Diff Viewer:**
- Side-by-side comparison of any two versions
- Highlight added (green), removed (red), changed (blue) properties
- JSON diff library integration

**Version Restore:**
- "Revert to this version" button
- Creates new version with old properties
- Preserves full history (no data loss)

**User Attribution:**
- Track who made each change
- Requires user context in API headers
- Store in `properties._created_by` or separate column

**Change Reasons:**
- Optional "Reason for change" field in update UI
- Stored in `change_summary.reason`
- Helps with compliance/auditing

**Merge Visualization:**
- Show when versions were merged from branches
- Display merge provenance tree
- Indicate source/target/base roles

**Release Tagging:**
- Mark specific versions as releases
- "As of version 2.1.0" badges
- Filter versions by release

**Export History:**
- Download full version history as JSON/CSV
- Include diffs between versions
- Useful for compliance/auditing

## Testing Strategy

### Unit Tests
- `graph.service.spec.ts`: Test version chain queries
- `graph.service.spec.ts`: Test change summary calculation
- Test supersedes_id linkage

### Integration Tests
- Create object → update → verify 2 versions exist
- Query versions by canonical_id
- Test version ordering (DESC)

### E2E Tests
- Open object detail → see version history
- Click "View" on old version → see historical properties
- Verify current version has filled dot indicator

## Benefits

1. **Transparency**: See complete history of object changes
2. **Auditing**: Track what changed, when, and why
3. **Debugging**: Identify when a problem was introduced
4. **Compliance**: Maintain audit trail for regulated industries
5. **Collaboration**: Understand team member contributions
6. **Recovery**: Ability to see and restore previous versions

## Related Documentation
- `docs/spec/19-dynamic-object-graph.md` - Versioning strategy (section 5)
- Database schema has `version`, `supersedes_id`, `canonical_id`, `change_summary` columns
- `kb.merge_provenance` table for merge tracking
- `kb.product_versions` for release snapshots

## Summary

✅ **Database is ready**: Versioning infrastructure fully implemented  
✅ **Just needs UI**: Backend API + frontend components required  
✅ **No migrations needed**: Schema already supports changelog  
📊 **High value**: Provides transparency and auditability  
🚀 **Medium effort**: ~2-3 days for full implementation

The foundation is solid. We just need to expose it through the UI!
