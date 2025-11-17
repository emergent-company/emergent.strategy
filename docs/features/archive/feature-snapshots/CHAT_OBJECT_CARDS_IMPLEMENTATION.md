# Chat Object Cards - Implementation Guide

## ✅ Existing Components Verified

### 1. ObjectDetailModal Component
**Location:** `apps/admin/src/components/organisms/ObjectDetailModal/`

**Features:**
- Full object details display
- Extraction metadata with confidence scores
- Source document links
- Property sections (metadata vs regular)
- Version history with change tracking
- Color-coded confidence indicators (green ≥80%, yellow ≥60%, red <60%)
- Badge arrays for tags
- JSON formatting for nested objects

**Storybook Stories:** 10+ examples showing extracted objects, manual objects, different confidence levels, array/nested properties

### 2. ObjectBrowser Component
**Location:** `apps/admin/src/components/organisms/ObjectBrowser/`

**Features:**
- Table view with sorting, filtering, bulk selection
- **Card view** with grid layout (`md:grid-cols-2 lg:grid-cols-3`)
- Search and type/tag filtering
- Clickable cards with hover effects
- Selection checkboxes
- Relationship count indicators

**Design Pattern:**
```tsx
<div className="card bg-base-100 border border-base-300 hover:border-primary/30 rounded p-4 cursor-pointer">
  <div className="flex items-start gap-3">
    <input type="checkbox" className="checkbox" />
    <div className="flex-1">
      <h3 className="font-semibold truncate">{name}</h3>
      <div className="flex items-center gap-2">
        <span className="badge badge-sm">{type}</span>
        <span className="text-xs">{source}</span>
      </div>
    </div>
  </div>
  <div className="flex items-center gap-3 text-xs">
    <Icon /> {date}
    <Icon /> {relationshipCount}
  </div>
</div>
```

### 3. ExtractionJobCard Component
**Location:** `apps/admin/src/components/organisms/ExtractionJobCard/`

**Pattern:** Perfect reference for compact, clickable cards
```tsx
<div className="card card-border hover:shadow-lg transition-shadow">
  <div className="card-body">
    {/* Header: Status badge + timestamp */}
    <div className="flex justify-between">
      <Badge status={status} />
      <time>{date}</time>
    </div>
    
    {/* Icon + title */}
    <div className="flex items-center gap-2">
      <Icon />
      <span className="font-medium">{title}</span>
    </div>
    
    {/* Stats and badges */}
    <div className="grid grid-cols-2 gap-3">
      <div className="stat bg-base-200">{stat1}</div>
      <div className="stat bg-base-200">{stat2}</div>
    </div>
    
    {/* Entity type badges */}
    <div className="flex flex-wrap gap-1">
      <span className="badge">Type 1</span>
      <span className="badge">Type 2</span>
    </div>
  </div>
</div>
```

### 4. IntegrationCard Component
**Location:** `apps/admin/src/pages/admin/pages/integrations/`

**Pattern:** Icon + title + badges layout
```tsx
<div className="card bg-base-100 border hover:border-primary/50">
  <div className="card-body">
    <div className="flex items-start gap-4">
      {/* Icon container */}
      <div className="flex-shrink-0 w-12 h-12 bg-base-200 rounded-lg flex items-center justify-center">
        <Icon icon={icon} className="w-6 h-6" />
      </div>
      
      {/* Content */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold truncate">{title}</h3>
          <span className="badge badge-sm">{status}</span>
        </div>
        <p className="text-sm text-base-content/70 line-clamp-2">{description}</p>
      </div>
    </div>
    
    {/* Capability badges */}
    <div className="flex flex-wrap gap-2 mt-4">
      <span className="badge badge-sm badge-ghost">
        <Icon className="mr-1 w-3 h-3" /> Import
      </span>
    </div>
  </div>
</div>
```

### 5. API Endpoint Already Exists! ✅
**Endpoint:** `GET /graph/objects/:id`
**Controller:** `apps/server/src/modules/graph/graph.controller.ts` (line 119)
**Scope:** Requires `graph:read` permission
**Response:** Returns latest version of graph object with all properties

---

## 🎯 Design System Patterns

### Card Component Structure
All cards in your system follow this pattern:

```tsx
<div className="card bg-base-100 border border-base-300 hover:border-primary/50 transition-colors">
  <div className="card-body">
    {/* 1. Header Section */}
    <div className="flex items-start gap-4">
      <Icon container />
      <Content />
      <Status badge />
    </div>
    
    {/* 2. Description */}
    <p className="text-sm text-base-content/70 line-clamp-2">...</p>
    
    {/* 3. Metadata badges */}
    <div className="flex flex-wrap gap-2 mt-3">
      <span className="badge badge-sm badge-ghost">...</span>
    </div>
    
    {/* 4. Actions */}
    <div className="card-actions justify-end">
      <button className="btn btn-sm">Action</button>
    </div>
  </div>
</div>
```

### Color Coding System
- **Confidence Scores:**
  - ≥80% → `text-success` / `progress-success` (green)
  - ≥60% → `text-warning` / `progress-warning` (yellow)
  - <60% → `text-error` / `progress-error` (red)

- **Status Badges:**
  - Active/Success → `badge-success`
  - Warning/Pending → `badge-warning`
  - Error/Failed → `badge-error`
  - Neutral/Info → `badge-ghost` or `badge-primary`

### Icon Patterns
- File/Document → `lucide--file-text`
- AI/Extraction → `lucide--sparkles`
- Relationships → `lucide--git-branch`
- Time → `lucide--clock`
- Link/External → `lucide--external-link`
- Details/Info → `lucide--info`
- Chevron/Expand → `lucide--chevron-right`

---

## 📦 Implementation Plan

### Phase 1: Create ObjectRefCard Component ⏳

**File:** `apps/admin/src/components/molecules/ObjectRefCard/ObjectRefCard.tsx`

```tsx
import { Icon } from '@/components/atoms/Icon';

export interface ObjectRefCardProps {
    /** Object UUID */
    id: string;
    /** Object type (e.g., "Decision", "Risk", "Feature") */
    type: string;
    /** Display name */
    name: string;
    /** Optional one-line summary */
    summary?: string;
    /** Click handler to open details */
    onClick: () => void;
}

/**
 * Compact card for displaying entity references in chat responses.
 * Designed to be embedded inline with chat messages.
 */
export function ObjectRefCard({ id, type, name, summary, onClick }: ObjectRefCardProps) {
    return (
        <button
            onClick={onClick}
            className="card bg-base-100 border border-base-300 hover:border-primary hover:shadow-md transition-all text-left w-full group"
        >
            <div className="card-body p-3">
                <div className="flex items-center gap-2">
                    {/* Icon */}
                    <div className="flex-shrink-0 w-8 h-8 bg-base-200 rounded flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <Icon icon="lucide--box" className="w-4 h-4 text-base-content/70 group-hover:text-primary" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="font-medium text-sm truncate">{name}</h4>
                            <span className="badge badge-xs badge-ghost">{type}</span>
                        </div>
                        {summary && (
                            <p className="text-xs text-base-content/70 line-clamp-1">{summary}</p>
                        )}
                    </div>
                    
                    {/* Chevron indicator */}
                    <Icon 
                        icon="lucide--chevron-right" 
                        className="w-4 h-4 text-base-content/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" 
                    />
                </div>
            </div>
        </button>
    );
}
```

**File:** `apps/admin/src/components/molecules/ObjectRefCard/ObjectRefCard.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ObjectRefCard } from './ObjectRefCard';

const meta = {
    title: 'Molecules/ObjectRefCard',
    component: ObjectRefCard,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: 'Compact card for displaying entity references in chat responses. Designed to be clickable and open full details in a modal.',
            },
        },
    },
    tags: ['autodocs'],
} satisfies Meta<typeof ObjectRefCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        id: 'd7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca',
        type: 'Risk',
        name: 'Uncertainty of AI success',
        summary: 'Hard to predict exact success rate of AI in generating specifications',
        onClick: () => console.log('Card clicked'),
    },
};

export const WithoutSummary: Story = {
    args: {
        id: 'd7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca',
        type: 'Decision',
        name: 'Use React for frontend',
        onClick: () => console.log('Card clicked'),
    },
};

export const LongName: Story = {
    args: {
        id: 'd7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca',
        type: 'Feature',
        name: 'Implement comprehensive AI-powered extraction system with multiple entity types and relationship detection',
        summary: 'This is a very long summary that should be truncated to one line to maintain compact layout',
        onClick: () => console.log('Card clicked'),
    },
};

export const MultipleCards: Story = {
    render: () => (
        <div className="space-y-2 max-w-md">
            <ObjectRefCard
                id="1"
                type="Decision"
                name="Use React for frontend"
                summary="Modern framework with strong ecosystem"
                onClick={() => console.log('Decision clicked')}
            />
            <ObjectRefCard
                id="2"
                type="Risk"
                name="Performance bottleneck"
                summary="Large dataset queries may timeout"
                onClick={() => console.log('Risk clicked')}
            />
            <ObjectRefCard
                id="3"
                type="Feature"
                name="Graph visualization"
                onClick={() => console.log('Feature clicked')}
            />
        </div>
    ),
};
```

### Phase 2: Create ChatObjectRefs Parser Component ⏳

**File:** `apps/admin/src/components/organisms/ChatObjectRefs/ChatObjectRefs.tsx`

```tsx
import { useState } from 'react';
import { ObjectRefCard } from '@/components/molecules/ObjectRefCard';
import { ObjectDetailModal } from '@/components/organisms/ObjectDetailModal';
import type { GraphObject } from '@/components/organisms/ObjectBrowser/ObjectBrowser';
import { useApi } from '@/hooks/use-api';

export interface ObjectRef {
    id: string;
    type: string;
    name: string;
    summary?: string;
}

export interface ChatObjectRefsProps {
    /** Parsed object references from ```object-ref blocks */
    refs: ObjectRef[];
}

/**
 * Renders a list of object reference cards from chat responses.
 * Handles clicking to fetch and display full object details in modal.
 */
export function ChatObjectRefs({ refs }: ChatObjectRefsProps) {
    const { fetchJson } = useApi();
    const [selectedObject, setSelectedObject] = useState<GraphObject | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCardClick = async (objectId: string) => {
        setLoading(true);
        setError(null);
        
        try {
            const obj = await fetchJson<GraphObject>(`/api/graph/objects/${objectId}`);
            setSelectedObject(obj);
            setIsModalOpen(true);
        } catch (err) {
            console.error('Failed to load object details:', err);
            setError('Failed to load object details');
        } finally {
            setLoading(false);
        }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedObject(null);
        setError(null);
    };

    if (refs.length === 0) return null;

    return (
        <>
            <div className="space-y-2 my-3">
                {refs.map((ref) => (
                    <ObjectRefCard
                        key={ref.id}
                        id={ref.id}
                        type={ref.type}
                        name={ref.name}
                        summary={ref.summary}
                        onClick={() => handleCardClick(ref.id)}
                    />
                ))}
                
                {/* Loading spinner */}
                {loading && (
                    <div className="flex justify-center py-2">
                        <span className="loading loading-spinner loading-sm"></span>
                    </div>
                )}
                
                {/* Error alert */}
                {error && (
                    <div className="alert alert-error alert-sm">
                        <span>{error}</span>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            <ObjectDetailModal
                object={selectedObject}
                isOpen={isModalOpen}
                onClose={handleCloseModal}
            />
        </>
    );
}

/**
 * Parse ```object-ref code blocks from markdown text.
 * Each block should contain JSON with: { id, type, name, summary? }
 */
export function parseObjectRefs(markdown: string): ObjectRef[] {
    const refs: ObjectRef[] = [];
    const regex = /```object-ref\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
        try {
            const json = JSON.parse(match[1]);
            if (json.id && json.type && json.name) {
                refs.push({
                    id: json.id,
                    type: json.type,
                    name: json.name,
                    summary: json.summary,
                });
            }
        } catch (err) {
            console.warn('Failed to parse object-ref block:', err);
        }
    }

    return refs;
}

/**
 * Remove ```object-ref blocks from markdown to avoid rendering them as code.
 */
export function stripObjectRefBlocks(markdown: string): string {
    return markdown.replace(/```object-ref\n[\s\S]*?```/g, '').trim();
}
```

### Phase 3: Integrate into Chat Interface ⏳

**File:** `apps/admin/src/pages/admin/chat/conversation/index.tsx` (update)

```tsx
// Add imports
import { ChatObjectRefs, parseObjectRefs, stripObjectRefBlocks } from '@/components/organisms/ChatObjectRefs';

// In the chat message rendering logic, update the assistant message section:
{message.role === 'assistant' && (
  <div className="chat-message assistant">
    {/* Parse object refs BEFORE rendering markdown */}
    {(() => {
      const refs = parseObjectRefs(message.content);
      const cleanMarkdown = stripObjectRefBlocks(message.content);
      
      return (
        <>
          {/* Render object cards first (above message) */}
          {refs.length > 0 && <ChatObjectRefs refs={refs} />}
          
          {/* Render markdown without object-ref blocks */}
          <ReactMarkdown
            className="prose prose-sm max-w-none"
            components={{
              // ... existing custom components
            }}
          >
            {cleanMarkdown}
          </ReactMarkdown>
        </>
      );
    })()}
  </div>
)}
```

---

## 🎨 Visual Design Specification

### Compact Object Card (ObjectRefCard)
```
┌─────────────────────────────────────────────────┐
│  [Icon]  Risk                          [Badge]  │
│          Uncertainty of AI success              │
│          Hard to predict exact success rate  [→]│
└─────────────────────────────────────────────────┘
```

**Dimensions:**
- Height: ~60px (auto with padding)
- Width: 100% (responsive)
- Border: 1px solid base-300 → primary on hover
- Padding: 12px (p-3)
- Gap: 8px between elements
- Icon container: 32x32px with base-200 background

**Hover Effects:**
- Border color: base-300 → primary
- Shadow: none → md
- Icon background: base-200 → primary/10
- Icon color: base-content/70 → primary
- Chevron: translate-x-0.5

### In Chat Context
```
User: What are the last 5 decisions?