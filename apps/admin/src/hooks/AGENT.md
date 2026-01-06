# Hooks Patterns for AI Assistants

This document helps AI assistants understand the custom hooks architecture and avoid recreating existing functionality.

**Total hooks: 33** (see full list in tables below)

## Central API Hook: `use-api`

**All API calls MUST go through `useApi()`**. Never use raw `fetch` directly.

```tsx
import { useApi } from '@/hooks/use-api';

function MyComponent() {
  const { fetchJson, fetchForm, apiBase, buildHeaders } = useApi();

  // ✅ CORRECT: Use fetchJson for JSON APIs
  const data = await fetchJson<ResponseType>('/api/v1/documents', {
    method: 'GET',
  });

  // ✅ CORRECT: Use fetchForm for file uploads
  const result = await fetchForm<UploadResponse>('/api/v1/upload', formData);
}
```

### Why useApi is Required

1. **Auth headers** - Automatically adds `Authorization: Bearer {token}`
2. **Project context** - Adds `X-Project-ID` header
3. **Token refresh** - Handles 401 and refreshes tokens automatically
4. **Error handling** - Consistent `ApiError` with status and response data
5. **View-as mode** - Supports `X-View-As-User-ID` for superadmin

### fetchJson Options

```tsx
interface FetchJsonInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown; // Auto-serialized to JSON
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  json?: boolean; // Set false for non-JSON body
  suppressErrorLog?: boolean; // Suppress logging for expected errors (e.g., polling 404s)
}

// Examples
await fetchJson<User>('/api/v1/users/me');
await fetchJson<Doc>('/api/v1/documents', {
  method: 'POST',
  body: { title: 'New' },
});
await fetchJson<void>('/api/v1/items/123', { method: 'DELETE' });
```

### fetchForm for File Uploads

```tsx
const { fetchForm } = useApi();

// ✅ CORRECT: Use fetchForm for FormData
const formData = new FormData();
formData.append('file', file);
const result = await fetchForm<UploadResult>('/api/v1/upload', formData);

// ❌ WRONG: Manual fetch with FormData
const res = await fetch('/api/v1/upload', { method: 'POST', body: formData });
```

## Available Hooks (MUST use, DO NOT recreate)

### Data Fetching & State

| Hook                     | Purpose             | Usage                                                    |
| ------------------------ | ------------------- | -------------------------------------------------------- |
| `useApi`                 | API calls with auth | All backend requests                                     |
| `useProjects`            | Projects CRUD       | `const { projects, createProject } = useProjects()`      |
| `useOrganizations`       | Orgs management     | `const { orgs, activeOrg } = useOrganizations()`         |
| `useTasks`               | Tasks state         | `const { tasks, refetch } = useTasks()`                  |
| `useNotifications`       | Notifications       | `const { notifications, markRead } = useNotifications()` |
| `usePendingInvites`      | Invitations         | `const { invites } = usePendingInvites()`                |
| `useReleases`            | Release notes       | `const { releases } = useReleases()`                     |
| `useAccessTree`          | Permission tree     | `const { tree } = useAccessTree()`                       |
| `useHealthCheck`         | Server health       | `const { status } = useHealthCheck()`                    |
| `useExtractionJobsCount` | Job counts          | Badge counts                                             |

### Chat & Streaming

| Hook                             | Purpose                | Usage                              |
| -------------------------------- | ---------------------- | ---------------------------------- |
| `useChat`                        | Main chat hook         | Conversations, messages, streaming |
| `useSSE`                         | Server-Sent Events     | Real-time subscriptions            |
| `useFetchSSE`                    | Fetch-based SSE        | Streaming responses                |
| `useMergeChat`                   | Merge suggestions chat | Specialized chat for merging       |
| `useObjectRefinementChat`        | Object refinement      | AI refinement dialog               |
| `useTemplateStudioChat`          | Template studio        | Template editing chat              |
| `useEmailTemplateRefinementChat` | Email templates        | Email template chat                |

### UI & Utilities

| Hook                    | Purpose             | Usage                                                     |
| ----------------------- | ------------------- | --------------------------------------------------------- |
| `useToast`              | Toast notifications | `showToast({ message, variant })`                         |
| `useDialog`             | Modal dialogs       | `const { open, close } = useDialog()`                     |
| `useLocalStorage`       | Persistent state    | `const [value, setValue] = useLocalStorage(key, default)` |
| `useClickOutside`       | Click detection     | `useClickOutside(ref, callback)`                          |
| `useScrollToBottom`     | Auto-scroll         | Chat-style auto-scroll                                    |
| `useAutoResizeTextarea` | Textarea height     | Auto-growing textareas                                    |
| `useRovingTabindex`     | Keyboard nav        | Accessible list navigation                                |
| `usePageVisibility`     | Tab visibility      | `const isVisible = usePageVisibility()`                   |
| `useAsyncEffect`        | Async useEffect     | `useAsyncEffect(async () => {...}, [deps])`               |
| `useLogoVariant`        | Theme-aware logo    | `const variant = useLogoVariant()`                        |

### Superadmin Hooks

| Hook                     | Purpose             |
| ------------------------ | ------------------- |
| `useSuperadmin`          | Superadmin context  |
| `useSuperadminUsers`     | User management     |
| `useSuperadminOrgs`      | Org management      |
| `useSuperadminProjects`  | Project management  |
| `useSuperadminEmails`    | Email management    |
| `useSuperadminTemplates` | Template management |

## Hook Usage Examples

### useToast

```tsx
import { useToast } from '@/hooks/use-toast';

function MyComponent() {
  const { showToast } = useToast();

  // ✅ CORRECT: Use existing toast system
  const handleSave = async () => {
    try {
      await saveData();
      showToast({ message: 'Saved successfully', variant: 'success' });
    } catch (error) {
      showToast({
        message: error.message || 'Failed to save',
        variant: 'error',
        duration: 7000,
      });
    }
  };

  // With actions
  showToast({
    message: 'Item deleted',
    variant: 'success',
    actions: [{ label: 'Undo', onClick: handleUndo }],
  });
}

// ❌ WRONG: Custom toast implementation
const [toast, setToast] = useState(null);
```

### useLocalStorage

```tsx
import { useLocalStorage } from '@/hooks/use-local-storage';

function Settings() {
  // ✅ CORRECT: Persistent state with type safety
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');

  return (
    <button onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
      Toggle
    </button>
  );
}

// ❌ WRONG: Manual localStorage
const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
useEffect(() => localStorage.setItem('theme', theme), [theme]);
```

### useSSE (Server-Sent Events)

```tsx
import { useSSE } from '@/hooks/use-sse';

function RealtimeUpdates() {
  const { connectionState, close, reconnect } = useSSE(
    '/api/v1/events/stream',
    {
      onMessage: (data) => {
        const event = JSON.parse(data);
        handleEvent(event);
      },
      onError: (err) => console.error('SSE error:', err),
      autoReconnect: true,
      maxReconnectAttempts: 10,
    }
  );

  return <ConnectionIndicator state={connectionState} />;
}
```

### useChat (Main Chat Hook)

```tsx
import { useChat } from '@/hooks/use-chat';

function ChatPage() {
  const {
    conversations,
    activeConversation,
    streaming,
    mcpToolActive,
    sendMessage,
    createConversation,
    selectConversation,
    deleteConversation,
  } = useChat();

  // Conversations persist to localStorage per org/project
  // Streaming state managed automatically
  // MCP tool status tracked for UI indicators
}
```

### useClickOutside

```tsx
import { useClickOutside } from '@/hooks/use-click-outside';

function Dropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ✅ CORRECT: Use hook for click outside
  useClickOutside(ref, () => setOpen(false));

  return <div ref={ref}>{/* dropdown content */}</div>;
}

// ❌ WRONG: Manual event listener
useEffect(() => {
  const handler = (e) => {
    if (!ref.current?.contains(e.target)) setOpen(false);
  };
  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}, []);
```

### useAsyncEffect

```tsx
import { useAsyncEffect } from '@/hooks/use-async-effect';

function DataLoader() {
  const [data, setData] = useState(null);

  // ✅ CORRECT: Clean async effects
  useAsyncEffect(async () => {
    const result = await fetchData();
    setData(result);
  }, [dependency]);

  // ❌ WRONG: IIFE in useEffect
  useEffect(() => {
    (async () => {
      const result = await fetchData();
      setData(result);
    })();
  }, [dependency]);
}
```

## Creating New Hooks

### When to Create

1. **Check existing hooks first** - Use tables above
2. **Reusable logic only** - 3+ components should need it
3. **Not just state** - Should encapsulate behavior, not just `useState`

### Hook File Naming

```
hooks/
├── use-feature-name.ts    # kebab-case with 'use-' prefix
├── useFeatureName.ts      # Legacy: camelCase (existing only)
```

New hooks should use `use-kebab-case.ts` format.

### Hook Structure

```tsx
// use-my-feature.ts
import { useState, useCallback, useEffect } from 'react';

export interface UseMyFeatureOptions {
  enabled?: boolean;
}

export interface UseMyFeatureReturn {
  data: Data | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useMyFeature(
  opts: UseMyFeatureOptions = {}
): UseMyFeatureReturn {
  const { enabled = true } = opts;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    // implementation
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { data, loading, error, refresh };
}
```

## Contexts (Not Hooks)

These are contexts, use their hooks:

| Context       | Hook        | Purpose                        |
| ------------- | ----------- | ------------------------------ |
| AuthContext   | `useAuth`   | Authentication state           |
| ConfigContext | `useConfig` | App config, active org/project |
| ToastContext  | `useToast`  | Toast notifications            |
| ThemeContext  | `useTheme`  | Theme state                    |

```tsx
// ✅ CORRECT
import { useAuth } from '@/contexts/useAuth';
import { useConfig } from '@/contexts/config';

// ❌ WRONG
import { AuthContext } from '@/contexts/auth';
const auth = useContext(AuthContext);
```

## Common Mistakes

| Mistake                     | Correct Approach                                       |
| --------------------------- | ------------------------------------------------------ |
| Raw `fetch()` for API calls | Use `useApi().fetchJson()`                             |
| Manual localStorage         | Use `useLocalStorage`                                  |
| Custom toast state          | Use `useToast`                                         |
| Manual click outside        | Use `useClickOutside`                                  |
| Async IIFE in useEffect     | Use `useAsyncEffect`                                   |
| Creating new data hooks     | Check if `useProjects`, `useOrganizations`, etc. exist |
| Manual SSE handling         | Use `useSSE` or `useFetchSSE`                          |
