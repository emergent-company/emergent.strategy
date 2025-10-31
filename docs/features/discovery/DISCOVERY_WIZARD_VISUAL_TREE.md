# Discovery Wizard - Visual Component Tree

```
DiscoveryWizard (Main Modal)
├── Modal Dialog (DaisyUI modal, modal-box)
│   ├── Header
│   │   ├── Title: "Auto-Discovery Wizard"
│   │   └── Close Button (X icon)
│   │
│   ├── Error Alert Banner (if error exists)
│   │   └── Dismissable error message
│   │
│   ├── Progress Steps (Horizontal Stepper)
│   │   ├── Step 1: Configure ○○○○○
│   │   ├── Step 2: Analyzing ●○○○○
│   │   ├── Step 3: Review Types ●●○○○
│   │   ├── Step 4: Review Relationships ●●●○○
│   │   └── Step 5: Complete ●●●●●
│   │
│   └── Step Content Area
│       │
│       ├─ [Step 1: Configure] ────────────────────────────────
│       │  ├── Document List (checkboxes)
│       │  │   ├── Document 1 ☑️
│       │  │   ├── Document 2 ☑️
│       │  │   ├── Document 3 ☐
│       │  │   └── [Select All] [Clear] buttons
│       │  │
│       │  ├── Advanced Settings (collapsible)
│       │  │   ├── Batch Size: [slider] ──────o─── 50
│       │  │   ├── Min Confidence: [slider] ─────o── 0.70
│       │  │   ├── Include Relationships: ☑️
│       │  │   └── Max Iterations: [slider] ──o─── 3
│       │  │
│       │  └── Actions
│       │      ├── [Cancel] button
│       │      └── [▶ Start Discovery] button (primary)
│       │
│       ├─ [Step 2: Analyzing] ────────────────────────────────
│       │  ├── Status Icon (animated pulse)
│       │  │   └── 🧠 Analyzing Documents
│       │  │
│       │  ├── Progress Bar
│       │  │   └── ████████░░░░░░░░ 40% (Step 2 of 5)
│       │  │
│       │  ├── Stats Cards
│       │  │   ├── [5] Types Discovered
│       │  │   └── [8] Relationships Found
│       │  │
│       │  ├── Live Type Preview (scrollable)
│       │  │   ├── Customer (conf: 85%)
│       │  │   ├── Order (conf: 92%)
│       │  │   └── Product (conf: 78%)
│       │  │
│       │  └── Actions
│       │      └── [Cancel Discovery] button
│       │
│       ├─ [Step 3: Review Types] ────────────────────────────
│       │  ├── Header
│       │  │   └── "Review Discovered Types"
│       │  │
│       │  ├── Types Table (scrollable)
│       │  │   │
│       │  │   ├── Row 1: Customer [expand button]
│       │  │   │   ├── Name: "Customer" (editable)
│       │  │   │   ├── Description: "A person who..." (editable)
│       │  │   │   ├── Confidence: 85% (green)
│       │  │   │   ├── Instances: 12
│       │  │   │   ├── [🗑️ Delete]
│       │  │   │   └── [Expanded] Examples:
│       │  │   │       • John Smith
│       │  │   │       • Acme Corp
│       │  │   │       • Sarah Johnson
│       │  │   │
│       │  │   ├── Row 2: Order [expand button]
│       │  │   │   └── ... (similar structure)
│       │  │   │
│       │  │   └── Row 3: Product
│       │  │       └── ... (similar structure)
│       │  │
│       │  ├── Summary Card
│       │  │   └── ℹ️ "3 entity types will be included..."
│       │  │
│       │  └── Actions
│       │      ├── [Back] button
│       │      └── [→ Review Relationships] button (primary)
│       │
│       ├─ [Step 4: Review Relationships] ─────────────────────
│       │  ├── Header
│       │  │   └── "Review Discovered Relationships"
│       │  │
│       │  ├── Relationships Table (scrollable)
│       │  │   │
│       │  │   ├── Row 1:
│       │  │   │   ├── From: [Customer] badge
│       │  │   │   ├── Relationship: "places" (editable) →
│       │  │   │   ├── To: [Order] badge
│       │  │   │   ├── Cardinality: [1:N ▼] dropdown
│       │  │   │   ├── Confidence: 88% (green)
│       │  │   │   └── [🗑️ Delete]
│       │  │   │
│       │  │   ├── Row 2:
│       │  │   │   ├── [Order] → "contains" → [Product]
│       │  │   │   └── Cardinality: [N:M ▼]
│       │  │   │
│       │  │   └── Row 3:
│       │  │       └── ... (similar structure)
│       │  │
│       │  ├── Summary Card
│       │  │   └── ℹ️ "3 relationships will be included..."
│       │  │
│       │  ├── Cardinality Legend (collapsible)
│       │  │   ├── 1:1 - One-to-one
│       │  │   ├── 1:N - One-to-many
│       │  │   ├── N:1 - Many-to-one
│       │  │   └── N:M - Many-to-many
│       │  │
│       │  └── Actions
│       │      ├── [Back] button
│       │      └── [📦 Generate Template Pack] (primary)
│       │
│       └─ [Step 5: Complete] ─────────────────────────────────
│          ├── Success Icon
│          │   └── ✅ Large green checkmark
│          │
│          ├── Success Message
│          │   ├── "Discovery Complete!"
│          │   └── "Your template pack has been generated."
│          │
│          ├── Summary Card
│          │   ├── 📦 Template Pack Summary
│          │   ├── Entity Types: 3
│          │   ├── Relationships: 3
│          │   └── Pack ID: abc-123-def
│          │
│          ├── Type List (collapsible)
│          │   └── View Discovered Types (3)
│          │       ├── Customer (12 instances)
│          │       ├── Order (45 instances)
│          │       └── Product (128 instances)
│          │
│          ├── Actions
│          │   ├── [⬇️ Install Template Pack] (primary)
│          │   ├── [👁️ View Pack Details] (ghost)
│          │   ├── [🔄 Start New Discovery] (outline)
│          │   └── [Close] (ghost)
│          │
│          └── Next Steps Card
│              └── 💡 Tips and recommendations
│
└── Backdrop (modal-backdrop, click to close)
```

## Component File Locations

```
apps/admin/src/components/organisms/DiscoveryWizard/
├── DiscoveryWizard.tsx          ← Main wrapper (270 lines)
├── Step1_Configure.tsx          ← Document selection (265 lines)
├── Step2_Analyzing.tsx          ← Progress polling (180 lines)
├── Step3_ReviewTypes.tsx        ← Type review (220 lines)
├── Step4_ReviewRelationships.tsx ← Relationship review (190 lines)
├── Step5_Complete.tsx           ← Success screen (160 lines)
└── index.ts                     ← Barrel export (8 lines)
```

## State Flow Diagram

```
┌─────────────┐
│  Settings   │
│    Page     │
└──────┬──────┘
       │ Click "Run Discovery"
       ▼
┌─────────────────────────────────────────────────────────┐
│              DiscoveryWizard (Modal Opens)              │
│                                                         │
│  State:                                                 │
│  • currentStep = 1                                      │
│  • jobId = null                                         │
│  • config = { document_ids: [], batch_size: 50, ... }  │
│  • jobData = null                                       │
│  • error = null                                         │
└─────────────────────────────────────────────────────────┘
       │
       │ Step 1: User selects documents & configures
       │ onClick: handleStartDiscovery()
       ▼
┌─────────────────────────────────────────────────────────┐
│     POST /api/discovery-jobs/projects/:id/start         │
│     Response: { id: "job-123", status: "pending", ... } │
└─────────────────────────────────────────────────────────┘
       │
       │ Set jobId = "job-123", currentStep = 2
       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 2: Poll job status every 2 seconds                │
│  GET /api/discovery-jobs/job-123                        │
│  • status: pending → analyzing_documents →               │
│    extracting_types → refining_types → completed        │
│  • progress: { current_step: X, total_steps: Y }        │
│  • discovered_types: [...] (accumulates)                │
│  • discovered_relationships: [...] (accumulates)        │
└─────────────────────────────────────────────────────────┘
       │
       │ status === "completed"
       │ onComplete(jobData) → currentStep = 3
       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 3: Review Types                                   │
│  • User clicks type name/description to edit inline     │
│  • User clicks delete icon to remove type               │
│  • User clicks expand to see example instances          │
│  • onClick: handleTypesReviewed() → currentStep = 4     │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 4: Review Relationships                           │
│  • User edits relationship names                        │
│  • User changes cardinality dropdown                    │
│  • User deletes relationships                           │
│  • onClick: handleGenerateTemplatePack() → Step 5       │
└─────────────────────────────────────────────────────────┘
       │
       │ currentStep = 5
       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 5: Complete                                       │
│  • Shows summary                                        │
│  • Actions:                                             │
│    - Install Pack → navigate to template gallery        │
│    - View Details → navigate to pack details page       │
│    - Start New → reset wizard state, currentStep = 1    │
│    - Close → reset state, close modal                   │
└─────────────────────────────────────────────────────────┘
```

## Data Flow (Props & Callbacks)

```
┌─────────────────────────┐
│   DiscoveryWizard       │  Props: projectId, isOpen, onClose
│   (Main Component)      │
└───────┬─────────────────┘
        │
        │ renderStep() switch (currentStep)
        │
        ├─ Step 1 ──────────────────────────────────────┐
        │  Props:                                        │
        │  • projectId                                   │
        │  • config                                      │
        │  • onConfigChange(config) → setState          │
        │  • onStart() → handleStartDiscovery()         │
        │  • onCancel() → handleClose()                 │
        └────────────────────────────────────────────────┘
        │
        ├─ Step 2 ──────────────────────────────────────┐
        │  Props:                                        │
        │  • jobId                                       │
        │  • onComplete(jobData) → setState + step++    │
        │  • onCancel() → handleCancelJob()             │
        └────────────────────────────────────────────────┘
        │
        ├─ Step 3 ──────────────────────────────────────┐
        │  Props:                                        │
        │  • types (discovered_types)                   │
        │  • onTypesChange(types) → setState            │
        │  • onNext() → step++                          │
        │  • onBack() → step--                          │
        └────────────────────────────────────────────────┘
        │
        ├─ Step 4 ──────────────────────────────────────┐
        │  Props:                                        │
        │  • relationships (discovered_relationships)   │
        │  • onRelationshipsChange(rels) → setState    │
        │  • onGeneratePack() → step++                  │
        │  • onBack() → step--                          │
        └────────────────────────────────────────────────┘
        │
        └─ Step 5 ──────────────────────────────────────┐
           Props:                                        │
           • jobData (full job object)                  │
           • onClose() → handleClose()                  │
           • onStartNew() → reset state, step = 1       │
           └────────────────────────────────────────────┘
```

## Icon Legend

| Icon | Component | Purpose |
|------|-----------|---------|
| 🗑️ | trash-2 | Delete action |
| ▶️ | play | Start action |
| ✅ | check-circle | Success state |
| 🧠 | brain | Analyzing status |
| 📦 | package | Template pack |
| 💡 | lightbulb | Tips/help |
| ⬇️ | download | Install action |
| 👁️ | eye | View action |
| 🔄 | refresh-cw | Reset action |
| ❌ | x | Close action |
| ➡️ | arrow-right | Navigation |
| ℹ️ | info | Information |
| ☑️ | checkbox (checked) | Selected |
| ☐ | checkbox (unchecked) | Not selected |
| ▼ | chevron-down | Dropdown |
| ► | chevron-right | Collapsed |
| ▼ | chevron-down | Expanded |

## Responsive Behavior

### Desktop (≥1024px)
- Modal: 800px width
- Tables: Full width with horizontal scroll if needed
- Buttons: Inline with text labels

### Tablet (768px-1023px)
- Modal: 90vw width
- Tables: Scrollable with sticky headers
- Buttons: Full width, stacked

### Mobile (<768px)
- Modal: 95vw width, 90vh height
- Content: Vertical scroll
- Progress steps: Compact/numbered view
- Buttons: Full width, large touch targets

## Accessibility Features

✅ **Keyboard Navigation**
- Tab order: Documents → Settings → Buttons
- Enter: Submit forms, save edits
- Escape: Cancel edits, close modal

✅ **Screen Readers**
- ARIA labels on all interactive elements
- Role="dialog" on modal
- Role="progressbar" on progress bar
- Live regions for status updates

✅ **Visual**
- High contrast colors
- Color-blind safe palette (green/yellow/red alternatives provided)
- Focus indicators on all interactive elements
- Minimum touch target size: 44×44px

✅ **Motion**
- Respects prefers-reduced-motion
- Optional animations (can be disabled)
- No auto-playing animations longer than 5 seconds
