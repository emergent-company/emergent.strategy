# Component Patterns for AI Assistants

This document helps AI assistants understand the component architecture and avoid recreating existing functionality.

## Architecture: Atomic Design

Components follow **Atomic Design** methodology:

```
components/
├── atoms/          # 12 basic building blocks (Button, Icon, Spinner, Avatar)
├── molecules/      # 29 compositions of atoms (FormField, FileUploader, Dropdown)
├── organisms/      # 41 complex UI sections (DataTable, Sidebar, Modals)
├── chat/           # Chat-specific components (MessageBubble, ChatInput, etc.)
├── guards/         # Route guards (SetupGuard, ReverseSetupGuard)
└── wireframes/     # Prototypes and wireframes
```

## Styling: DaisyUI + Tailwind

**Framework**: DaisyUI component classes on Tailwind CSS

**Class Utilities**:

- `clsx` - Conditional class concatenation
- `twMerge` - Resolve Tailwind class conflicts

```tsx
// ✅ CORRECT: Use clsx + twMerge for conditional classes
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const classes = twMerge(
  'btn',
  clsx({
    'btn-primary': variant === 'primary',
    'btn-outline': outline,
  }),
  className
);

// ❌ WRONG: String concatenation
const classes = `btn ${
  variant === 'primary' ? 'btn-primary' : ''
} ${className}`;
```

## Available Atoms (MUST use, DO NOT recreate)

| Component             | Location                                 | Usage                                                                               |
| --------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `Button`              | `@/components/atoms/Button`              | All buttons. Supports `color`, `variant`, `size`, `loading`, `startIcon`, `endIcon` |
| `Icon`                | `@/components/atoms/Icon`                | All icons. Uses Iconify with lucide icons (e.g., `icon="lucide--home"`)             |
| `Spinner`             | `@/components/atoms/Spinner`             | Loading states. Supports `size` prop                                                |
| `Avatar`              | `@/components/atoms/Avatar`              | User/entity avatars                                                                 |
| `Tooltip`             | `@/components/atoms/Tooltip`             | Hover tooltips                                                                      |
| `Logo`                | `@/components/atoms/Logo`                | App logo variants                                                                   |
| `CountBadge`          | `@/components/atoms/CountBadge`          | Numeric badges                                                                      |
| `NotificationDot`     | `@/components/atoms/NotificationDot`     | Status indicators                                                                   |
| `LoadingEffect`       | `@/components/atoms/LoadingEffect`       | Skeleton/shimmer loading                                                            |
| `MetaData`            | `@/components/atoms/MetaData`            | Metadata display                                                                    |
| `ConnectionIndicator` | `@/components/atoms/ConnectionIndicator` | Connection status                                                                   |

### Button Examples

```tsx
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';

// Basic button
<Button color="primary">Save</Button>

// With loading state
<Button loading disabled>Saving...</Button>

// With icons
<Button
  startIcon={<Icon icon="lucide--plus" />}
  color="primary"
>
  Add Item
</Button>

// Outline variant
<Button variant="outline" color="error">Delete</Button>

// Sizes: xs, sm, md, lg, xl
<Button size="sm">Small</Button>

// Shapes: circle, square
<Button shape="circle">
  <Icon icon="lucide--x" />
</Button>
```

### Icon Pattern

```tsx
import { Icon } from '@/components/atoms/Icon';

// ✅ CORRECT: Use Iconify lucide icons
<Icon icon="lucide--home" />
<Icon icon="lucide--settings" className="size-5" />
<Icon icon="lucide--chevron-right" ariaLabel="Next" />

// ❌ WRONG: Import SVG directly or use other icon libraries
import HomeIcon from './home.svg';
import { FaHome } from 'react-icons/fa';
```

## Available Molecules (MUST use, DO NOT recreate)

### Form & Input

| Component      | Location                              | Usage                                      |
| -------------- | ------------------------------------- | ------------------------------------------ |
| `FormField`    | `@/components/molecules/FormField`    | Form inputs with label, error, description |
| `FileUploader` | `@/components/molecules/FileUploader` | File upload with FilePond                  |
| `Dropdown`     | `@/components/molecules/Dropdown`     | Dropdown menus                             |
| `ThemeToggle`  | `@/components/molecules/ThemeToggle`  | Theme switcher                             |
| `ThemePicker`  | `@/components/molecules/ThemePicker`  | Theme selection                            |

### Page Layout

| Component       | Location                               | Usage                     |
| --------------- | -------------------------------------- | ------------------------- |
| `PageTitle`     | `@/components/molecules/PageTitle`     | Page headers              |
| `PageTitleHero` | `@/components/molecules/PageTitleHero` | Hero-style page headers   |
| `IconButton`    | `@/components/molecules/IconButton`    | Icon-only buttons         |
| `IconBadge`     | `@/components/molecules/IconBadge`     | Icon with badge indicator |

### Sidebar Components

| Component            | Location                                    | Usage                    |
| -------------------- | ------------------------------------------- | ------------------------ |
| `SidebarMenuItem`    | `@/components/molecules/SidebarMenuItem`    | Sidebar navigation items |
| `SidebarProjectItem` | `@/components/molecules/SidebarProjectItem` | Project item in sidebar  |

### Table Components

| Component         | Location                                 | Usage                  |
| ----------------- | ---------------------------------------- | ---------------------- |
| `TableEmptyState` | `@/components/molecules/TableEmptyState` | Empty table states     |
| `TableAvatarCell` | `@/components/molecules/TableAvatarCell` | Avatar cell for tables |

### User & Avatar

| Component     | Location                             | Usage           |
| ------------- | ------------------------------------ | --------------- |
| `AvatarGroup` | `@/components/molecules/AvatarGroup` | Stacked avatars |

### Chat Components

| Component            | Location                                    | Usage                      |
| -------------------- | ------------------------------------------- | -------------------------- |
| `ChatPromptComposer` | `@/components/molecules/ChatPromptComposer` | Chat input composer        |
| `ChatPromptActions`  | `@/components/molecules/ChatPromptActions`  | Chat prompt action buttons |
| `ChatCtaCard`        | `@/components/molecules/ChatCtaCard`        | Chat call-to-action cards  |
| `NewChatCtas`        | `@/components/molecules/NewChatCtas`        | New chat starter prompts   |

### Notifications & Tasks

| Component               | Location                                       | Usage                              |
| ----------------------- | ---------------------------------------------- | ---------------------------------- |
| `NotificationBell`      | `@/components/molecules/NotificationBell`      | Notification indicator in header   |
| `NotificationRow`       | `@/components/molecules/NotificationRow`       | Single notification row            |
| `NotificationTabButton` | `@/components/molecules/NotificationTabButton` | Tab button for notification types  |
| `TaskRow`               | `@/components/molecules/TaskRow`               | Single task/suggestion row         |
| `TaskActionsPanel`      | `@/components/molecules/TaskActionsPanel`      | Actions panel for tasks            |
| `PendingInvitationCard` | `@/components/molecules/PendingInvitationCard` | Pending membership invitation card |

### Object & Extraction

| Component                  | Location                                          | Usage                  |
| -------------------------- | ------------------------------------------------- | ---------------------- |
| `ObjectRefCard`            | `@/components/molecules/ObjectRefCard`            | Object reference cards |
| `ObjectRefLink`            | `@/components/molecules/ObjectRefLink`            | Object reference links |
| `ExtractionJobStatusBadge` | `@/components/molecules/ExtractionJobStatusBadge` | Job status badges      |

### System Status

| Component              | Location                                      | Usage                         |
| ---------------------- | --------------------------------------------- | ----------------------------- |
| `SystemStatusDropdown` | `@/components/molecules/SystemStatusDropdown` | System health status dropdown |
| `DebugInfoPanel`       | `@/components/molecules/DebugInfoPanel`       | Debug information panel       |

### FormField Example

```tsx
import { FormField } from '@/components/molecules/FormField';

// ✅ CORRECT: Use FormField for form inputs
<FormField
  label="Email Address"
  type="email"
  placeholder="Enter your email"
  description="We'll never share your email"
  error={errors.email?.message}
  required
  leftIcon="lucide--mail"
/>

// ❌ WRONG: Build custom form field with raw input
<div className="form-control">
  <label className="label">Email</label>
  <input className="input input-bordered" />
</div>
```

### FileUploader Example

```tsx
import { FileUploader } from '@/components/molecules/FileUploader';

// ✅ CORRECT: Use FileUploader for file uploads
<FileUploader
  onFilesChange={handleFiles}
  accept={['application/pdf', 'text/*']}
  maxFiles={5}
  label="Upload documents"
/>

// ❌ WRONG: Build custom file input
<input type="file" onChange={handleChange} />
```

## Available Organisms (MUST use, DO NOT recreate)

### Layout

| Component                | Location                                        | Usage                        |
| ------------------------ | ----------------------------------------------- | ---------------------------- |
| `Sidebar`                | `@/components/organisms/Sidebar`                | Main navigation sidebar      |
| `SidebarSection`         | `@/components/organisms/SidebarSection`         | Sidebar section grouping     |
| `SidebarProjectDropdown` | `@/components/organisms/SidebarProjectDropdown` | Project selector in sidebar  |
| `Topbar`                 | `@/components/organisms/Topbar`                 | Top navigation bar           |
| `Rightbar`               | `@/components/organisms/Rightbar`               | Right sidebar panel          |
| `Footer`                 | `@/components/organisms/Footer`                 | Page footer                  |
| `ToastContainer`         | `@/components/organisms/ToastContainer`         | Toast notification container |

### Data Display

| Component             | Location                                     | Usage                                   |
| --------------------- | -------------------------------------------- | --------------------------------------- |
| `DataTable`           | `@/components/organisms/DataTable`           | Reusable data table with sorting/paging |
| `ObjectBrowser`       | `@/components/organisms/ObjectBrowser`       | Browse knowledge graph objects          |
| `ObjectDetailModal`   | `@/components/organisms/ObjectDetailModal`   | Object detail view modal                |
| `ObjectPreviewDrawer` | `@/components/organisms/ObjectPreviewDrawer` | Object preview slide-out drawer         |
| `RelationshipGraph`   | `@/components/organisms/RelationshipGraph`   | Interactive relationship visualization  |
| `GraphViewerModal`    | `@/components/organisms/GraphViewerModal`    | Full-screen graph viewer                |

### Modals & Dialogs

| Component                   | Location                                           | Usage                                  |
| --------------------------- | -------------------------------------------------- | -------------------------------------- |
| `Modal`                     | `@/components/organisms/Modal`                     | Base modal component                   |
| `ConfirmActionModal`        | `@/components/organisms/ConfirmActionModal`        | Confirmation dialog                    |
| `DeletionConfirmationModal` | `@/components/organisms/DeletionConfirmationModal` | Deletion confirmation with impact info |
| `DocumentMetadataModal`     | `@/components/organisms/DocumentMetadataModal`     | Document metadata editor               |
| `ExtractionConfigModal`     | `@/components/organisms/ExtractionConfigModal`     | Extraction configuration               |
| `ExtractionLogsModal`       | `@/components/organisms/ExtractionLogsModal`       | View extraction job logs               |
| `MergeComparisonModal`      | `@/components/organisms/MergeComparisonModal`      | Compare objects for merge              |

### Extraction & Jobs

| Component              | Location                                      | Usage                      |
| ---------------------- | --------------------------------------------- | -------------------------- |
| `ExtractionJobCard`    | `@/components/organisms/ExtractionJobCard`    | Single extraction job card |
| `ExtractionJobList`    | `@/components/organisms/ExtractionJobList`    | List of extraction jobs    |
| `ExtractionJobFilters` | `@/components/organisms/ExtractionJobFilters` | Filter controls for jobs   |
| `JobDetailsView`       | `@/components/organisms/JobDetailsView`       | Detailed job view          |

### Chat Components

| Component        | Location                                | Usage                     |
| ---------------- | --------------------------------------- | ------------------------- |
| `ChatObjectRefs` | `@/components/organisms/ChatObjectRefs` | Object references in chat |
| `CodeDiffViewer` | `@/components/organisms/CodeDiffViewer` | Code diff display         |

### Notifications & Tasks

| Component           | Location                                   | Usage                         |
| ------------------- | ------------------------------------------ | ----------------------------- |
| `NotificationInbox` | `@/components/organisms/NotificationInbox` | Full notification inbox panel |
| `TasksInbox`        | `@/components/organisms/TasksInbox`        | Task/suggestion inbox panel   |

### Wizards & Guides

| Component         | Location                                 | Usage                                |
| ----------------- | ---------------------------------------- | ------------------------------------ |
| `DiscoveryWizard` | `@/components/organisms/DiscoveryWizard` | Document discovery flow wizard       |
| `KBPurposeEditor` | `@/components/organisms/KBPurposeEditor` | Knowledge base purpose configuration |

### Guards & Gates

| Component           | Location                                   | Usage                            |
| ------------------- | ------------------------------------------ | -------------------------------- |
| `OrgAndProjectGate` | `@/components/organisms/OrgAndProjectGate` | Require org and project selected |
| `ProjectGate`       | `@/components/organisms/ProjectGate`       | Require project selected         |
| `ViewAsBanner`      | `@/components/organisms/ViewAsBanner`      | Impersonation mode banner        |

### Monitoring

| Component     | Location                             | Usage                           |
| ------------- | ------------------------------------ | ------------------------------- |
| (monitoring/) | `@/components/organisms/monitoring/` | Monitoring dashboard components |

## Component Creation Guidelines

### When to Create New Components

1. **Check existing components first** - Use the tables above
2. **Check Storybook** - Components have `.stories.tsx` files for reference
3. **Ask before creating** - If unsure, ask rather than duplicate

### New Component Checklist

If you must create a new component:

1. **Choose correct level**: atom (basic) → molecule (composition) → organism (section)
2. **Co-locate story**: Create `ComponentName.stories.tsx` alongside
3. **Follow naming**: PascalCase for component, kebab-case for directory
4. **Use existing atoms**: Build molecules from atoms, not raw HTML
5. **Export pattern**: Named export + default export

```tsx
// ComponentName/index.tsx
export const ComponentName = () => { ... };
export default ComponentName;

// ComponentName/ComponentName.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ComponentName } from './index';

const meta: Meta<typeof ComponentName> = {
  component: ComponentName,
  title: 'Molecules/ComponentName',
};
export default meta;

type Story = StoryObj<typeof ComponentName>;
export const Default: Story = {};
```

### Props Pattern

```tsx
// ✅ CORRECT: Extend HTML attributes, use specific prop types
export interface ComponentProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'size'> {
  /** Document the prop */
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

// ✅ CORRECT: Use forwardRef for DOM-wrapping components
export const Component = forwardRef<HTMLDivElement, ComponentProps>(
  ({ variant, size, className, ...rest }, ref) => {
    // implementation
  }
);
```

## Import Aliases

Always use path aliases, never relative paths outside the current directory:

```tsx
// ✅ CORRECT
import { Button } from '@/components/atoms/Button';
import { useApi } from '@/hooks/use-api';

// ❌ WRONG
import { Button } from '../../../components/atoms/Button';
```

## DaisyUI Class Reference

Common DaisyUI patterns used in this codebase:

| Pattern | Classes                                                          |
| ------- | ---------------------------------------------------------------- |
| Buttons | `btn`, `btn-primary`, `btn-outline`, `btn-ghost`, `btn-sm`       |
| Forms   | `form-control`, `label`, `label-text`, `input`, `input-bordered` |
| Cards   | `card`, `card-body`, `card-title`                                |
| Badges  | `badge`, `badge-primary`, `badge-outline`                        |
| Alerts  | `alert`, `alert-error`, `alert-success`                          |
| Layout  | `flex`, `grid`, `gap-*` (Tailwind)                               |

## Common Mistakes to Avoid

| Mistake                       | Correct Approach                      |
| ----------------------------- | ------------------------------------- |
| Creating new Button component | Use `@/components/atoms/Button`       |
| Using `<i>` or SVG for icons  | Use `<Icon icon="lucide--name" />`    |
| Raw `<input>` in forms        | Use `<FormField>` molecule            |
| Custom loading spinner        | Use `<Spinner>` or `<Button loading>` |
| Manual class concatenation    | Use `clsx` + `twMerge`                |
| react-icons, heroicons, etc.  | Use Iconify lucide icons only         |
| Inline styles for theming     | Use DaisyUI semantic colors           |
