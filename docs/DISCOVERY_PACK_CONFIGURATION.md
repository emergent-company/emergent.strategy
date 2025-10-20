# Discovery Pack Configuration Feature

## Overview

Added Step 4.5 to the Discovery Wizard, allowing users to configure template pack settings before completion. This includes naming the pack and choosing whether to create a new pack or extend an existing one.

## Changes Made

### 1. New Component: Step4_5_ConfigurePack

**File**: `apps/admin/src/components/organisms/DiscoveryWizard/Step4_5_ConfigurePack.tsx`

**Features**:
- Radio button mode selection: Create New Pack vs. Extend Existing Pack
- Pack name input field (required for create mode)
- Existing packs list with:
  - Search/filter functionality
  - Visual cards showing pack details (name, description, type/relationship counts)
  - Selection highlighting
- Real-time validation (pack name required for create, pack selection required for extend)
- Fetches existing packs from `/api/template-packs` API

**Interface**:
```typescript
export interface PackConfig {
    mode: 'create' | 'extend';
    packName: string;
    existingPackId?: string;
}

interface Step4_5Props {
    initialPackName: string;
    onNext: (config: PackConfig) => void;
    onBack: () => void;
}
```

### 2. Updated Wizard Flow

**File**: `apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx`

**Changes**:
- Updated step type: `type CurrentStep = 1 | 2 | 3 | 4 | 4.5 | 5;`
- Added state: `const [packConfig, setPackConfig] = useState<PackConfig | null>(null);`
- Renamed handler: `handleGenerateTemplatePack` → `handleReviewRelationshipsComplete`
  - Now transitions to step 4.5 instead of step 5
- New handler: `handlePackConfigured(config: PackConfig)`
  - Saves pack config to state
  - Transitions to step 5 (completion)
- Updated step rendering switch to include case 4.5
- Reset function clears `packConfig` state

**New Step Flow**:
1. Configure Discovery
2. Analyzing (progress)
3. Review Types
4. Review Relationships
5. **Configure Pack** (NEW)
6. Complete

### 3. Updated Completion Display

**File**: `apps/admin/src/components/organisms/DiscoveryWizard/Step5_Complete.tsx`

**Changes**:
- Added `packConfig` prop to `Step5Props`
- Display pack configuration in summary card:
  - Pack name (from config)
  - Mode: "Create New Pack" or "Extend Pack (id...)"
- Shows pack info above entity type and relationship counts

**Summary Display**:
```
Template Pack Summary
├── Pack Name: "My Custom Pack"
├── Mode: "Create New Pack"
├── ────────────────────────
├── Entity Types: 3 / 14 (11 excluded)
└── Relationships: 1 / 15 (14 excluded)
```

## User Experience

### Creating a New Pack

1. User reaches Step 4.5 after reviewing relationships
2. Default mode is "Create New Pack"
3. Initial pack name provided: "Discovery Pack - [date]"
4. User can customize the name
5. Click "Continue" proceeds to completion

### Extending an Existing Pack

1. User selects "Extend Existing Pack" radio button
2. List of existing packs appears with search functionality
3. User clicks a pack card to select it
4. Pack name auto-filled from selected pack
5. Click "Continue" proceeds to completion

## Default Pack Name

Format: `Discovery Pack - [localeDateString]`

Example: `Discovery Pack - 1/19/2025`

Generated in wizard: 
```typescript
initialPackName={`Discovery Pack - ${new Date().toLocaleDateString()}`}
```

## Validation Rules

### Create Mode
- Pack name is required (minimum 1 character)
- Continue button disabled if name is empty

### Extend Mode
- Pack selection is required
- Continue button disabled until pack is selected
- Pack name field is read-only (auto-filled from selection)

## API Integration

### Existing Packs Endpoint

**Request**: `GET /api/template-packs`

**Response**:
```typescript
{
    packs: TemplatePack[],
    total: number,
    page: number,
    limit: number
}

interface TemplatePack {
    id: string;
    name: string;
    description?: string;
    type_count?: number;
    relationship_count?: number;
}
```

### Future Backend Integration

The `PackConfig` object will be used to:

**Create Mode**:
```typescript
POST /api/template-packs
{
    name: "My Custom Pack",
    types: [...includedTypes],
    relationships: [...includedRelationships]
}
```

**Extend Mode**:
```typescript
PUT /api/template-packs/{existingPackId}
{
    types: [...additionalTypes],
    relationships: [...additionalRelationships]
}
```

## State Management

### Pack Config State
```typescript
packConfig: PackConfig | null = {
    mode: 'create',
    packName: 'Discovery Pack - 1/19/2025',
    existingPackId: undefined  // Only set when extending
}
```

### State Flow
1. Start: `packConfig = null`
2. Step 4.5: User configures pack
3. Continue: `packConfig` set with user's choices
4. Step 5: Display pack config in summary
5. Reset: `packConfig = null`

## Testing Checklist

- [ ] Step 4.5 renders after Step 4 (Review Relationships)
- [ ] Default pack name appears in input field
- [ ] Can switch between Create/Extend modes
- [ ] Create mode: pack name is editable and required
- [ ] Extend mode: pack list loads and displays correctly
- [ ] Extend mode: pack selection highlights card
- [ ] Extend mode: pack name auto-fills from selection
- [ ] Extend mode: pack name field is read-only
- [ ] Continue button validation works (disabled when invalid)
- [ ] Back button returns to Step 4
- [ ] Pack config appears in Step 5 summary
- [ ] Reset wizard clears pack config

## Related Files

- `apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx`
- `apps/admin/src/components/organisms/DiscoveryWizard/Step4_5_ConfigurePack.tsx`
- `apps/admin/src/components/organisms/DiscoveryWizard/Step5_Complete.tsx`

## Next Steps

1. **Backend Integration**: Implement API endpoints for:
   - Creating new template packs with discovered types/relationships
   - Extending existing packs with additional types/relationships

2. **Error Handling**: Add error states for:
   - Failed pack creation/extension
   - API errors when fetching existing packs
   - Validation errors (duplicate names, etc.)

3. **Enhanced UX**:
   - Show loading spinner while fetching existing packs
   - Display pack creation progress
   - Add success toast on completion
   - Show link to view created/extended pack

4. **Testing**:
   - Add unit tests for Step4_5_ConfigurePack component
   - Add E2E tests for complete wizard flow including pack configuration
   - Test edge cases (empty pack list, network errors, etc.)
