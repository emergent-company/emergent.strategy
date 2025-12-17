# Layout Standards

This document defines the standard layout components and when to use them for consistent page structures across the admin application.

## Overview

All layout components are located in `apps/admin/src/components/layouts/` and exported from `@/components/layouts`.

| Component          | Purpose                                                  | Use Case                                  |
| ------------------ | -------------------------------------------------------- | ----------------------------------------- |
| `Panel`            | Container with header/content/footer and scroll handling | Any panel that needs structured sections  |
| `TwoPanelLayout`   | Two panels side-by-side, one fixed width                 | Sidebar + main content layouts            |
| `SplitPanelLayout` | Two panels with configurable ratio                       | Editor + preview, comparison views        |
| `PageContainer`    | Centered container with max-width                        | Single-panel pages with constrained width |

## Component Reference

### Panel

Container with optional header, scrollable content, and footer. Handles overflow correctly.

```tsx
import { Panel } from '@/components/layouts';

<Panel>
  <Panel.Header>Title or toolbar</Panel.Header>
  <Panel.Content>Scrollable content here</Panel.Content>
  <Panel.Footer>Action buttons</Panel.Footer>
</Panel>;
```

**Key features:**

- Header and footer are fixed (shrink-0)
- Content scrolls independently (overflow-y-auto)
- No visual styling - add borders/backgrounds via className

### TwoPanelLayout

Two panels side-by-side with one fixed width and one flexible.

```tsx
import { TwoPanelLayout } from '@/components/layouts';

<TwoPanelLayout fixedPanel="left" fixedWidth={320}>
  <TwoPanelLayout.Left>Sidebar content (fixed width)</TwoPanelLayout.Left>
  <TwoPanelLayout.Right>Main content (flexible)</TwoPanelLayout.Right>
</TwoPanelLayout>;
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fixedPanel` | `'left' \| 'right'` | `'left'` | Which panel has fixed width |
| `fixedWidth` | `number \| string` | `320` | Width in px or CSS value (e.g., `'30%'`) |
| `stackOnMobile` | `boolean` | `false` | Stack panels vertically below `lg` breakpoint |

**With header spanning both panels:**

```tsx
<TwoPanelLayout fixedPanel="left" fixedWidth={256}>
  <TwoPanelLayout.Header>
    Shared header across both panels
  </TwoPanelLayout.Header>
  <TwoPanelLayout.Left>Sidebar</TwoPanelLayout.Left>
  <TwoPanelLayout.Right>Main</TwoPanelLayout.Right>
</TwoPanelLayout>
```

**Responsive stacking:**

```tsx
<TwoPanelLayout fixedPanel="left" fixedWidth={320} stackOnMobile>
  <TwoPanelLayout.Left>Stacks on top on mobile</TwoPanelLayout.Left>
  <TwoPanelLayout.Right>Below on mobile</TwoPanelLayout.Right>
</TwoPanelLayout>
```

### SplitPanelLayout

Two panels with configurable ratio (percentage-based split).

```tsx
import { SplitPanelLayout } from '@/components/layouts';

<SplitPanelLayout ratio="50/50">
  <SplitPanelLayout.Left>Left panel</SplitPanelLayout.Left>
  <SplitPanelLayout.Right>Right panel</SplitPanelLayout.Right>
</SplitPanelLayout>;
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `ratio` | `SplitRatio` | `'50/50'` | Split ratio between panels |

**Available ratios:**

- `'50/50'` - Equal split
- `'40/60'` / `'60/40'` - Slight imbalance
- `'33/67'` / `'67/33'` - One-third / two-thirds
- `'25/75'` / `'75/25'` - Quarter / three-quarters

**With header:**

```tsx
<SplitPanelLayout ratio="50/50">
  <SplitPanelLayout.Header>
    Full-width header above both panels
  </SplitPanelLayout.Header>
  <SplitPanelLayout.Left>Editor</SplitPanelLayout.Left>
  <SplitPanelLayout.Right>Preview</SplitPanelLayout.Right>
</SplitPanelLayout>
```

### PageContainer

Centered container with configurable max-width. No default padding.

```tsx
import { PageContainer } from '@/components/layouts';

<PageContainer maxWidth="4xl">
  <div className="p-6">Content with custom padding</div>
</PageContainer>;
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `maxWidth` | `MaxWidth` | `'7xl'` | Maximum width constraint |
| `testId` | `string` | - | Test ID for automation |

**Available max-widths:**
`'sm'`, `'md'`, `'lg'`, `'xl'`, `'2xl'`, `'3xl'`, `'4xl'`, `'5xl'`, `'6xl'`, `'7xl'`, `'full'`

## Decision Tree

Use this to pick the right layout component:

```
Need two side-by-side panels?
├── Yes → Is one panel a sidebar with fixed width?
│         ├── Yes → TwoPanelLayout
│         └── No → Is it a percentage-based split?
│                  ├── Yes → SplitPanelLayout
│                  └── No → Custom flex layout
└── No → Is it a single-panel page?
         ├── Yes → Need centered content with max-width?
         │         ├── Yes → PageContainer
         │         └── No → Direct content or Panel
         └── No → Does it need header/content/footer structure?
                  ├── Yes → Panel
                  └── No → Direct flex/grid layout
```

### Quick Reference

| Scenario                   | Component                                 |
| -------------------------- | ----------------------------------------- |
| Settings page with sidebar | `TwoPanelLayout` with `fixedPanel="left"` |
| Chat app (list + messages) | `TwoPanelLayout` with `stackOnMobile`     |
| Editor + live preview      | `SplitPanelLayout` with `ratio="50/50"`   |
| Form page with max width   | `PageContainer`                           |
| DataTable with header      | `Panel`                                   |
| Dashboard (full width)     | Direct layout, no wrapper needed          |

## Migration Examples

### From Grid Columns to TwoPanelLayout

**Before:**

```tsx
<div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
  <div className="lg:col-span-4">
    <Sidebar />
  </div>
  <div className="lg:col-span-8">
    <MainContent />
  </div>
</div>
```

**After:**

```tsx
<TwoPanelLayout fixedPanel="left" fixedWidth={320} stackOnMobile>
  <TwoPanelLayout.Left>
    <Sidebar />
  </TwoPanelLayout.Left>
  <TwoPanelLayout.Right>
    <MainContent />
  </TwoPanelLayout.Right>
</TwoPanelLayout>
```

### From Manual Split to SplitPanelLayout

**Before:**

```tsx
<div className="flex-1 flex min-h-0 overflow-hidden">
  <div className="w-1/2 border-r flex flex-col min-h-0">
    <Editor />
  </div>
  <div className="w-1/2 flex flex-col min-h-0">
    <Preview />
  </div>
</div>
```

**After:**

```tsx
<SplitPanelLayout ratio="50/50" className="flex-1">
  <SplitPanelLayout.Left className="border-r">
    <Editor />
  </SplitPanelLayout.Left>
  <SplitPanelLayout.Right>
    <Preview />
  </SplitPanelLayout.Right>
</SplitPanelLayout>
```

### From Container Classes to PageContainer

**Before:**

```tsx
<div className="container mx-auto max-w-4xl px-4 py-6">
  <PageContent />
</div>
```

**After:**

```tsx
<PageContainer maxWidth="4xl" className="px-4 py-6">
  <PageContent />
</PageContainer>
```

## Best Practices

1. **Use semantic components** - Prefer layout components over raw div soup
2. **No inline overflow handling** - Let Panel handle scrolling
3. **Consistent breakpoints** - Use `stackOnMobile` for responsive two-panel layouts
4. **Pass borders/backgrounds via className** - Layout components are unstyled
5. **Nest Panel inside layout panels** - For scroll handling within split panels

```tsx
// Good: Panel inside TwoPanelLayout for proper scroll handling
<TwoPanelLayout fixedPanel="left" fixedWidth={320}>
  <TwoPanelLayout.Left>
    <Panel>
      <Panel.Header>Sidebar Header</Panel.Header>
      <Panel.Content>Scrollable sidebar content</Panel.Content>
    </Panel>
  </TwoPanelLayout.Left>
  <TwoPanelLayout.Right>
    <Panel>
      <Panel.Header>Main Header</Panel.Header>
      <Panel.Content>Scrollable main content</Panel.Content>
    </Panel>
  </TwoPanelLayout.Right>
</TwoPanelLayout>
```

## File Locations

```
apps/admin/src/components/layouts/
├── Panel/
│   ├── Panel.tsx
│   ├── Panel.stories.tsx
│   └── index.ts
├── TwoPanelLayout/
│   ├── TwoPanelLayout.tsx
│   ├── TwoPanelLayout.stories.tsx
│   └── index.ts
├── SplitPanelLayout/
│   ├── SplitPanelLayout.tsx
│   ├── SplitPanelLayout.stories.tsx
│   └── index.ts
├── PageContainer/
│   ├── PageContainer.tsx
│   └── index.ts
└── index.ts  # Barrel export
```

## Pages Using Layout Components

| Page            | Component          | Notes                                        |
| --------------- | ------------------ | -------------------------------------------- |
| AI Prompts      | `TwoPanelLayout`   | Fixed left sidebar (256px)                   |
| Chat App        | `TwoPanelLayout`   | Fixed left sidebar (320px), stacks on mobile |
| Template Studio | `SplitPanelLayout` | 50/50 split for schema preview + chat        |

## PageContainer Coverage

All main pages now use `PageContainer` for consistent layout. The standardization was completed with the following files:

### Settings Pages (maxWidth="4xl")

| File                                                     | testId                  |
| -------------------------------------------------------- | ----------------------- |
| `pages/admin/pages/settings/project/llm-settings.tsx`    | `page-llm-settings`     |
| `pages/admin/pages/settings/project/auto-extraction.tsx` | `page-auto-extraction`  |
| `pages/admin/pages/settings/project/chunking.tsx`        | `page-chunking`         |
| `pages/admin/pages/settings/ProfileSettings.tsx`         | `page-settings-profile` |

### Settings Pages (maxWidth="6xl")

| File                                               | testId           |
| -------------------------------------------------- | ---------------- |
| `pages/admin/pages/settings/project/templates.tsx` | `page-templates` |

### Standard Pages (varying maxWidth)

| File                                                    | maxWidth | testId              |
| ------------------------------------------------------- | -------- | ------------------- |
| `pages/admin/tasks/index.tsx`                           | `7xl`    | `page-tasks`        |
| `pages/admin/inbox/index.tsx`                           | `7xl`    | `page-inbox`        |
| `pages/admin/pages/agents/index.tsx`                    | `5xl`    | `page-agents`       |
| `pages/admin/pages/integrations/index.tsx`              | `7xl`    | `page-integrations` |
| `pages/admin/apps/chat/index.tsx`                       | `7xl`    | `page-chat`         |
| `pages/admin/pages/extraction-jobs/detail.tsx`          | `6xl`    | -                   |
| `pages/admin/pages/monitoring/ChatSessionsListPage.tsx` | default  | -                   |
| `pages/admin/monitoring/dashboard/index.tsx`            | default  | -                   |

### Full-Width Pages (maxWidth="full" className="px-4")

| File                                          | testId                 |
| --------------------------------------------- | ---------------------- |
| `pages/admin/pages/objects/index.tsx`         | `page-objects`         |
| `pages/admin/apps/documents/index.tsx`        | `page-documents`       |
| `pages/admin/apps/chunks/index.tsx`           | `page-chunks`          |
| `pages/admin/pages/recent/index.tsx`          | `page-recent`          |
| `pages/admin/pages/extraction-jobs/index.tsx` | `page-extraction-jobs` |
