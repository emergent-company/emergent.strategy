# Extraction Modal Object Types Fix

## Issue
The object types picker in the extraction modal showed hardcoded generic types (Requirement, Decision, Feature, Task, Bug, Risk, Actor, UseCase) instead of the actual object types from installed template packs.

## Root Cause
The `ExtractionConfigModal` component had a static list of `ENTITY_TYPES` hardcoded in the component file. It never fetched the actual object types from the project's type registry.

```tsx
// OLD - Hardcoded types
const ENTITY_TYPES = [
    { value: 'Requirement', label: 'Requirements', description: '...' },
    { value: 'Decision', label: 'Decisions', description: '...' },
    // ...
];
```

## Solution

### 1. Created Type Registry API Client
**File:** `apps/admin/src/api/type-registry.ts`

```typescript
export function createTypeRegistryClient(
    apiBase: string,
    fetchJson: <T>(url: string, options?: RequestInit) => Promise<T>
) {
    return {
        async getProjectTypes(projectId: string): Promise<TypeRegistryResponse> {
            return fetchJson<TypeRegistryResponse>(
                `${apiBase}/api/type-registry/projects/${projectId}`
            );
        },
        // ... other methods
    };
}
```

### 2. Updated ExtractionConfigModal Component
**File:** `apps/admin/src/components/organisms/ExtractionConfigModal.tsx`

**Changes:**
1. Added imports for `useConfig`, `useApi`, and `createTypeRegistryClient`
2. Added state for available types and loading:
   ```tsx
   const [availableTypes, setAvailableTypes] = useState<EntityType[]>([]);
   const [isLoadingTypes, setIsLoadingTypes] = useState(true);
   ```
3. Added `useEffect` to fetch types from type registry on mount
4. Updated initial config to start with empty entity_types array (filled after fetch)
5. Updated JSX to:
   - Show loading spinner while fetching types
   - Show warning alert if no types available (with link to install template packs)
   - Dynamically render checkboxes from fetched types
6. Disabled submit button when no types available

## How It Works

### Fetch Flow
1. Modal opens
2. Component reads `activeProjectId` from config context
3. Calls `GET /api/type-registry/projects/:projectId`
4. Backend returns all object types from installed template packs
5. Component transforms response into `EntityType[]` format:
   ```tsx
   {
     value: "Person",           // Type name (used as ID)
     label: "Person",           // Display name
     description: "Human entities..." // Description for UI
   }
   ```
6. Sets first 4 types as default selected

### UI States

#### Loading State
```
┌─────────────────────────────────┐
│ Entity Types to Extract         │
│                                  │
│         🔄 Loading...            │
│                                  │
└─────────────────────────────────┘
```

#### No Types Available
```
┌─────────────────────────────────┐
│ Entity Types to Extract         │
│                                  │
│ ⚠ No Object Types Available     │
│ Install a template pack from    │
│ Settings → Templates to enable   │
│ extraction                       │
└─────────────────────────────────┘
```

#### Types Available (From Template Packs)
```
┌─────────────────────────────────┐
│ Entity Types to Extract         │
│                                  │
│ ☑ Person                        │
│   Human entities and individuals │
│                                  │
│ ☑ Organization                  │
│   Companies and institutions     │
│                                  │
│ ☑ Meeting                       │
│   Meeting records and notes      │
│                                  │
│ ☐ Decision                      │
│   Decisions made in meetings     │
└─────────────────────────────────┘
```

## Example: Template Pack Types

### Extraction Demo Pack
- Person
- Organization  
- Location

### TOGAF Enterprise Architecture Pack
- BusinessCapability
- BusinessProcess
- Application
- ApplicationComponent
- DataEntity
- TechnologyComponent
- InformationSystemService
- Platform
- Node
- Actor
- Role
- BusinessService
- ValueStream

### Meeting & Decision Management Pack
- Meeting
- MeetingSeries
- Decision
- ActionItem
- Question

## API Endpoint

**Endpoint:** `GET /api/type-registry/projects/:projectId`

**Response:**
```json
{
  "object_types": {
    "Person": {
      "name": "Person",
      "label": "Person",
      "description": "Human entities and individuals",
      "schema": { "type": "object", "properties": { ... } }
    },
    "Organization": {
      "name": "Organization",
      "label": "Organization",
      "description": "Companies and institutions",
      "schema": { "type": "object", "properties": { ... } }
    }
  },
  "relationship_types": { ... }
}
```

## Testing

### Manual Test
1. **Install a template pack:**
   - Go to Settings → Templates
   - Install "TOGAF Enterprise Architecture" pack (13 types)

2. **Open extraction modal:**
   - Go to Documents page
   - Click "Extract" button on any document

3. **Verify object types:**
   - Modal should show object types from installed pack:
     - BusinessCapability
     - BusinessProcess
     - Application
     - etc. (not generic Requirement, Decision, etc.)

4. **Select types and extract:**
   - Check 2-3 types
   - Adjust confidence threshold
   - Click "Start Extraction"
   - Verify extraction job starts with selected types

### Test Without Template Packs
1. **Remove all template packs** (in database or via UI)
2. **Open extraction modal**
3. **Verify warning message:**
   - Should show: "No Object Types Available"
   - Should show: "Install a template pack from Settings → Templates..."
4. **Verify submit button disabled**

## Related Files
- `apps/admin/src/components/organisms/ExtractionConfigModal.tsx` - Fixed component
- `apps/admin/src/api/type-registry.ts` - New API client
- `apps/server/src/modules/type-registry/type-registry.controller.ts` - Backend endpoint
- `apps/server/src/modules/type-registry/type-registry.service.ts` - Service

## Benefits
1. ✅ Shows actual object types from installed template packs
2. ✅ No hardcoded type lists
3. ✅ Automatically updates when packs are installed/uninstalled
4. ✅ Better UX with loading states and warnings
5. ✅ Consistent with project's configured types
6. ✅ Shows pack-specific descriptions for each type

## Future Improvements
1. Cache type registry response to avoid refetching on every modal open
2. Add search/filter for projects with many object types
3. Group types by template pack
4. Show type count: "13 types available from 2 installed packs"
5. Add "Install Pack" quick action button when no types available
