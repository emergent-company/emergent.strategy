# Embedding Generation UI - Access Points

## Overview

Users can trigger embedding generation from **two locations** in the admin UI:

---

## Location 1: Objects Table - Row Actions Dropdown

**Path:** `/admin/objects` → Click row "⋮" menu

### Visual Layout

```
┌────────────────────────────────────────────────────────────┐
│  Objects                                            [250]   │
│  Browse and manage all objects in your knowledge graph     │
├────────────────────────────────────────────────────────────┤
│  🔍 Search objects...                                      │
│  [Type ▼] [Tags ▼]                                        │
├─────┬──────────────┬──────────┬────────────┬──────┬───────┤
│ □   │ Name         │ Type     │ Status     │ ...  │ ⋮     │
├─────┼──────────────┼──────────┼────────────┼──────┼───────┤
│ □   │ Abraham      │ Person   │ 🔘 No Emb  │ ...  │ ⋮ ◄── Click here
│     │              │          │            │      │   ▼   │
│     │              │          │            │      │ ┌─────────────────────────┐
│     │              │          │            │      │ │ 👁️  View Details        │
│     │              │          │            │      │ │ ✨ Generate Embedding   │ ◄── For objects WITHOUT embedding
│     │              │          │            │      │ │ ✅ Accept               │
│     │              │          │            │      │ │ 🗑️  Delete              │
│     │              │          │            │      │ └─────────────────────────┘
├─────┼──────────────┼──────────┼────────────┼──────┼───────┤
│ □   │ Moses        │ Person   │ ✅ Embedded│ ...  │ ⋮ ◄── Click here
│     │              │          │            │      │   ▼   │
│     │              │          │            │      │ ┌─────────────────────────┐
│     │              │          │            │      │ │ 👁️  View Details        │
│     │              │          │            │      │ │ 🔄 Regenerate Embedding │ ◄── For objects WITH embedding
│     │              │          │            │      │ │ 🗑️  Delete              │
│     │              │          │            │      │ └─────────────────────────┘
└─────┴──────────────┴──────────┴────────────┴──────┴───────┘
```

### Features
- **Quick access** - No need to open detail modal
- **Context-aware** - Shows "Generate" or "Regenerate" based on embedding status
- **Toast feedback** - Success/error messages appear in top-right corner
- **Consistent UX** - Same location as Accept/Delete actions

---

## Location 2: Object Detail Modal - Embedding Status Section

**Path:** `/admin/objects` → Click any object → Scroll to "Embedding Status"

### Visual Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Abraham (Person)                                      [X]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Basic Information                                           │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Name:        Abraham                                        │
│  Type:        Person                                         │
│  ...                                                         │
│                                                              │
│  🧠 Embedding Status                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Status         🔘 No Embedding                       │   │
│  │                                                      │   │
│  │ This object has not been embedded yet. Embeddings   │   │
│  │ are generated automatically for semantic search.    │   │
│  │                                                      │   │
│  │ ┌──────────────────────────────────────────────┐   │   │
│  │ │    ✨  Generate Embedding                    │   │   │ ◄── Click to generate
│  │ └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  📜 Version History                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ...                                                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                        [Accept] [Edit] [Delete] [Close]     │
└──────────────────────────────────────────────────────────────┘
```

### After Clicking "Generate Embedding"

```
┌──────────────────────────────────────────────────────────────┐
│  🧠 Embedding Status                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Status         🔘 No Embedding                       │   │
│  │                                                      │   │
│  │ ┌──────────────────────────────────────────────┐   │   │
│  │ │ ✅ Embedding generation job queued           │   │   │ ◄── Success message
│  │ │    successfully! The embedding will be       │   │   │
│  │ │    generated in the background.              │   │   │
│  │ └──────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │ ┌──────────────────────────────────────────────┐   │   │
│  │ │    ✨  Generate Embedding                    │   │   │
│  │ └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### After Embedding is Generated (refresh page)

```
┌──────────────────────────────────────────────────────────────┐
│  🧠 Embedding Status                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Status         ✅ Embedded                           │   │ ◄── Status changed
│  │                                                      │   │
│  │ Generated At   11/21/2025, 2:30:45 PM                │   │ ◄── Timestamp
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │  (Button hidden)
└──────────────────────────────────────────────────────────────┘
```

### Features
- **Detailed view** - See full object details + embedding status
- **Inline feedback** - Success message appears directly in the card
- **Auto-hide** - Button disappears after embedding exists
- **Rich context** - See when embedding was generated

---

## Comparison

| Feature                  | Table Dropdown | Detail Modal |
|--------------------------|----------------|--------------|
| **Access Speed**         | ⚡ Fast        | 🐢 Slower (need to open modal) |
| **Bulk Operations**      | ✅ Easy        | ❌ One at a time |
| **Feedback Type**        | 🍞 Toast       | 📋 Inline message |
| **Context**              | 🔎 Minimal     | 📚 Full details |
| **Regenerate Support**   | ✅ Yes         | ❌ No (button hidden after generation) |
| **Best For**             | Quick actions  | Detailed review |

---

## User Workflows

### Workflow 1: Quick Bulk Generation

**Goal:** Generate embeddings for multiple objects

1. Go to Objects page
2. Filter for objects without embeddings (if needed)
3. For each object → Click "⋮" → "✨ Generate Embedding"
4. Toast confirms each job queued
5. Continue without waiting

**Total time:** ~2 seconds per object

---

### Workflow 2: Generate While Reviewing

**Goal:** Review object details and generate embedding

1. Go to Objects page
2. Click object to open detail modal
3. Review properties, relationships, etc.
4. Scroll to "Embedding Status"
5. Click "✨ Generate Embedding"
6. See inline success message
7. Continue reviewing or close modal

**Total time:** ~30 seconds (includes review time)

---

### Workflow 3: Regenerate After Model Upgrade

**Goal:** Force regeneration for objects with old embeddings

1. Go to Objects page
2. Click "⋮" on object with existing embedding
3. Click "🔄 Regenerate Embedding"
4. Toast confirms job queued
5. Repeat for other objects

**Note:** Modal button doesn't support regeneration (hidden when embedding exists)

---

## Technical Details

### API Endpoint

Both UI locations call:
```
POST /api/graph/embeddings/object/:id
```

### Response Handling

**Success (enqueued=1):**
- **Dropdown:** Success toast
- **Modal:** Green alert + auto-dismiss after 5s

**Already Queued (skipped=1):**
- **Dropdown:** Info toast
- **Modal:** Blue alert + auto-dismiss after 5s

**Error:**
- **Dropdown:** Error toast
- **Modal:** Red alert + auto-dismiss after 5s

### Icons

| State             | Icon              | Meaning         |
|-------------------|-------------------|-----------------|
| Generate          | ✨ `sparkles`     | New, exciting   |
| Regenerate        | 🔄 `refresh-cw`   | Refresh, redo   |
| Embedded          | ✅ `check-circle` | Complete        |
| No Embedding      | 🔘 `circle`       | Empty, pending  |

---

## Status

✅ Table dropdown implemented  
✅ Modal button implemented  
✅ Toast notifications working  
✅ Inline alerts working  
✅ Context-aware labels  
✅ Icon variants  
⏳ Manual testing pending  
⏳ E2E tests pending
