# React Contexts for AI Assistants

This document helps AI assistants understand the context architecture and avoid recreating existing state management.

## Context Overview

| Context                | Hook                   | Purpose                                      | Scope    |
| ---------------------- | ---------------------- | -------------------------------------------- | -------- |
| `AuthContext`          | `useAuth`              | Authentication state, tokens, login/logout   | App root |
| `ConfigContext`        | `useConfig`            | Theme, org/project selection, UI preferences | App root |
| `ToastContext`         | `useToast`             | Toast notifications                          | App root |
| `AccessTreeContext`    | `useAccessTreeContext` | User's orgs/projects permissions tree        | App root |
| `DataUpdatesContext`   | `useDataUpdates`       | Real-time SSE entity subscriptions           | App root |
| `ViewAsContext`        | `useViewAs`            | Superadmin user impersonation                | App root |
| `ObjectPreviewContext` | `useObjectPreview`     | Knowledge graph object preview drawer        | Layout   |
| `SwitcherPanelContext` | `useSwitcherPanel`     | Theme/logo configuration panels              | Layout   |

## Provider Hierarchy

```tsx
// App.tsx - Correct provider nesting order
<AuthProvider>
  <ConfigProvider>
    <ToastProvider>
      <ViewAsProvider>
        <AccessTreeProvider>
          <DataUpdatesProvider>{/* Router and pages */}</DataUpdatesProvider>
        </AccessTreeProvider>
      </ViewAsProvider>
    </ToastProvider>
  </ConfigProvider>
</AuthProvider>
```

**Order matters**: `AccessTreeProvider` requires `AuthProvider` and `ConfigProvider` to be ancestors.

---

## AuthContext (`useAuth`)

**File**: `auth.tsx`, `useAuth.ts`

Manages OIDC authentication with Zitadel.

### Interface

```tsx
type AuthContextType = {
  isAuthenticated: boolean;
  isInitialized: boolean; // True after localStorage hydration
  user?: { sub: string; email?: string; name?: string };
  beginLogin: () => Promise<void>;
  logout: () => void;
  getAccessToken: () => string | undefined;
  handleCallback: (code: string) => Promise<void>;
  ensureAuthenticated: () => void;
  refreshAccessToken: () => Promise<boolean>;
};
```

### Usage

```tsx
import { useAuth } from '@/contexts/useAuth';

function MyComponent() {
  const { isAuthenticated, user, logout, getAccessToken } = useAuth();

  // ✅ Check authentication
  if (!isAuthenticated) {
    return <LoginPrompt />;
  }

  // ✅ Get current user
  console.log('User:', user?.email);

  // ✅ Get token for manual API calls (prefer useApi instead)
  const token = getAccessToken();
}
```

### Key Features

- **Auto-refresh**: Tokens refresh automatically 2 minutes before expiry
- **localStorage persistence**: Auth state survives page reload
- **SSO logout**: `logout()` redirects to Zitadel's end_session endpoint

### Anti-patterns

```tsx
// ❌ WRONG: Accessing AuthContext directly
const auth = useContext(AuthContext);

// ✅ CORRECT: Use the hook
const auth = useAuth();

// ❌ WRONG: Manual token handling for API calls
const token = getAccessToken();
fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } });

// ✅ CORRECT: Use useApi which handles tokens automatically
const { fetchJson } = useApi();
const data = await fetchJson('/api/data');
```

---

## ConfigContext (`useConfig`)

**File**: `config.tsx`

Manages app configuration: theme, active org/project, UI preferences.

### Interface

```tsx
type IConfig = {
  theme: 'light' | 'dark' | 'system' | 'contrast' | 'material' | 'dim' | 'material-dark';
  direction: 'ltr' | 'rtl';
  sidebarTheme: 'light' | 'dark';
  fontFamily: 'default' | 'dm-sans' | 'inclusive' | 'ar-one' | 'wix';
  fullscreen: boolean;
  activeOrgId?: string;
  activeOrgName?: string;
  activeProjectId?: string;
  activeProjectName?: string;
};

// Hook return type
{
  config: IConfig;
  calculatedSidebarTheme: 'dark' | undefined;
  toggleTheme: () => void;
  changeTheme: (theme: IConfig['theme']) => void;
  setActiveOrg: (id: string | undefined, name?: string) => void;
  setActiveProject: (id: string | undefined, name?: string) => void;
  // ... other setters
}
```

### Usage

```tsx
import { useConfig } from '@/contexts/config';

function OrgSwitcher() {
  const { config, setActiveOrg, setActiveProject } = useConfig();

  // ✅ Read current selection
  console.log('Active org:', config.activeOrgId, config.activeOrgName);
  console.log('Active project:', config.activeProjectId);

  // ✅ Change org (clears project automatically)
  const handleOrgChange = (orgId: string, orgName: string) => {
    setActiveOrg(orgId, orgName);
  };

  // ✅ Change project
  const handleProjectChange = (projectId: string, projectName: string) => {
    setActiveProject(projectId, projectName);
  };
}

function ThemeToggle() {
  const { config, toggleTheme, changeTheme } = useConfig();

  return (
    <>
      {/* Simple toggle */}
      <button onClick={toggleTheme}>
        {config.theme === 'dark' ? 'Light' : 'Dark'}
      </button>

      {/* Explicit theme */}
      <button onClick={() => changeTheme('system')}>System</button>
    </>
  );
}
```

### Key Features

- **localStorage persistence**: Config survives page reload (key: `emergent`)
- **System theme detection**: `'system'` follows OS preference
- **Org/project cascade**: Setting org clears project selection

### Anti-patterns

```tsx
// ❌ WRONG: Direct localStorage access
const orgId = localStorage.getItem('activeOrgId');

// ✅ CORRECT: Use context
const { config } = useConfig();
const orgId = config.activeOrgId;

// ❌ WRONG: Setting project without org
setActiveProject(projectId); // May break if org mismatch

// ✅ CORRECT: Ensure org is set first
setActiveOrg(orgId, orgName);
setActiveProject(projectId, projectName);
```

---

## ToastContext (`useToast`)

**File**: `toast.tsx`

Global toast notification system.

### Interface

```tsx
type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  message: string;
  variant: ToastVariant;
  duration?: number | null;  // null = manual dismiss, default 5000ms
  actions?: Array<{ label: string; onClick: () => void }>;
}

// Hook return
{
  toasts: Toast[];
  showToast: (options: ToastOptions) => string;  // Returns toast ID
  dismissToast: (id: string) => void;
}
```

### Usage

```tsx
import { useToast } from '@/contexts/toast';

function SaveButton() {
  const { showToast } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      showToast({ message: 'Saved successfully', variant: 'success' });
    } catch (error) {
      showToast({
        message: error.message || 'Failed to save',
        variant: 'error',
        duration: 7000, // Longer for errors
      });
    }
  };
}

// With action button
showToast({
  message: 'Item deleted',
  variant: 'success',
  actions: [{ label: 'Undo', onClick: handleUndo }],
});

// Manual dismiss only
const toastId = showToast({
  message: 'Processing...',
  variant: 'info',
  duration: null,
});
// Later: dismissToast(toastId);
```

### Key Features

- **Max 5 toasts**: FIFO removal when exceeded
- **Auto-dismiss**: Default 5 seconds
- **Action buttons**: Support undo/retry patterns

### Anti-patterns

```tsx
// ❌ WRONG: Custom toast state
const [toast, setToast] = useState(null);

// ✅ CORRECT: Use context
const { showToast } = useToast();

// ❌ WRONG: Alert for user feedback
alert('Saved!');

// ✅ CORRECT: Toast notification
showToast({ message: 'Saved!', variant: 'success' });
```

---

## AccessTreeContext (`useAccessTreeContext`)

**File**: `access-tree.tsx`

User's organization and project permissions hierarchy.

### Interface

```tsx
type OrgWithProjects = {
  id: string;
  name: string;
  role: string; // 'owner' | 'admin' | 'member' | 'viewer'
  projects: ProjectWithRole[];
};

type ProjectWithRole = {
  id: string;
  name: string;
  orgId: string;
  role: string;
  kb_purpose?: string;
  auto_extract_objects?: boolean;
};

type AccessTreeContextValue = {
  tree: OrgWithProjects[]; // Raw hierarchical data
  orgs: Array<{ id; name; role }>; // Flattened orgs
  projects: ProjectWithRole[]; // Flattened projects
  getOrgRole: (orgId: string) => string | undefined;
  getProjectRole: (projectId: string) => string | undefined;
  loading: boolean;
  error: string | undefined;
  refresh: () => Promise<void>;
};
```

### Usage

```tsx
import { useAccessTreeContext } from '@/contexts/access-tree';

function OrgProjectPicker() {
  const { orgs, projects, loading, error, getOrgRole } = useAccessTreeContext();

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} />;

  // ✅ List user's orgs
  return (
    <select>
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name} ({org.role})
        </option>
      ))}
    </select>
  );
}

function PermissionGate({ orgId, requiredRole, children }) {
  const { getOrgRole } = useAccessTreeContext();
  const role = getOrgRole(orgId);

  // ✅ Check permissions
  const hasAccess = role === 'owner' || role === 'admin';
  if (!hasAccess) return null;

  return children;
}
```

### Key Features

- **Single fetch**: Data fetched once at app root, shared everywhere
- **Auto-refresh on auth**: Refetches when authentication changes
- **Error boundary**: Shows full-page error if API fails
- **Role lookups**: O(1) via internal maps

### Anti-patterns

```tsx
// ❌ WRONG: Fetching orgs/projects in components
const [orgs, setOrgs] = useState([]);
useEffect(() => {
  fetchJson('/api/user/orgs-and-projects').then(setOrgs);
}, []);

// ✅ CORRECT: Use shared context
const { orgs } = useAccessTreeContext();

// ❌ WRONG: Using on auth routes (will throw)
// AccessTreeProvider skips fetch and shows error UI on non-auth routes

// ✅ CORRECT: Check if on auth route before using
const isAuthRoute = location.pathname.startsWith('/auth/');
if (!isAuthRoute) {
  const { orgs } = useAccessTreeContext();
}
```

---

## DataUpdatesContext (`useDataUpdates`)

**File**: `data-updates.tsx`

Real-time entity update subscriptions via Server-Sent Events.

### Interface

```tsx
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

type EntityEvent = {
  type: 'entity.created' | 'entity.updated' | 'entity.deleted' | 'entity.batch';
  entity: string; // e.g., 'document', 'chunk', 'object'
  id?: string; // Single entity ID
  ids?: string[]; // Batch entity IDs
  data?: any; // Updated data (for updates)
  timestamp: string;
};

// Pattern formats: '*' | 'entity:*' | 'entity:id'
type SubscriptionPattern = string;

// Main hook
function useDataUpdates(
  pattern: SubscriptionPattern,
  handler: (event: EntityEvent) => void,
  deps?: DependencyList
): { connectionState: ConnectionState; reconnect: () => void };

// Connection-only hook
function useDataUpdatesConnection(): {
  connectionState: ConnectionState;
  connectionId: string | null;
  reconnect: () => void;
};
```

### Usage

```tsx
import {
  useDataUpdates,
  useDataUpdatesConnection,
} from '@/contexts/data-updates';

function DocumentList() {
  const [documents, setDocuments] = useState([]);
  const { refetch } = useDocuments();

  // ✅ Subscribe to all document events
  useDataUpdates('document:*', (event) => {
    console.log('Document event:', event.type, event.id);
    refetch(); // Refresh list
  });

  return <List items={documents} />;
}

function ChunkEditor({ chunkId }) {
  const [chunk, setChunk] = useState(null);

  // ✅ Subscribe to specific entity
  useDataUpdates(
    `chunk:${chunkId}`,
    (event) => {
      if (event.type === 'entity.updated' && event.data) {
        setChunk((prev) => ({ ...prev, ...event.data }));
      }
    },
    [chunkId]
  ); // Re-subscribe when chunkId changes
}

function ConnectionIndicator() {
  const { connectionState, reconnect } = useDataUpdatesConnection();

  return (
    <div
      className={
        connectionState === 'connected' ? 'text-success' : 'text-warning'
      }
    >
      {connectionState}
      {connectionState === 'error' && (
        <button onClick={reconnect}>Reconnect</button>
      )}
    </div>
  );
}
```

### Key Features

- **Pattern matching**: `*`, `entity:*`, `entity:id`
- **Auto-reconnect**: Up to 10 attempts with exponential backoff
- **Health status**: Server health data from heartbeat events
- **Token auth**: Sends Authorization header via fetch-based SSE

### Anti-patterns

```tsx
// ❌ WRONG: Manual WebSocket/SSE for real-time
const ws = new WebSocket('/ws');
ws.onmessage = handleMessage;

// ✅ CORRECT: Use context subscription
useDataUpdates('document:*', handleEvent);

// ❌ WRONG: Polling for updates
useEffect(() => {
  const interval = setInterval(refetch, 5000);
  return () => clearInterval(interval);
}, []);

// ✅ CORRECT: Subscribe to real-time updates
useDataUpdates('document:*', () => refetch());
```

---

## ViewAsContext (`useViewAs`)

**File**: `view-as.tsx`

Superadmin user impersonation feature.

### Interface

```tsx
type ViewAsUser = {
  id: string;
  displayName: string;
  email?: string;
};

type ViewAsContextType = {
  viewAsUser: ViewAsUser | null;
  isViewingAs: boolean;
  startViewAs: (user: ViewAsUser) => void;
  stopViewAs: () => void;
};

// Standalone helper (no React context needed)
function getViewAsUserId(): string | null;
```

### Usage

```tsx
import { useViewAs, getViewAsUserId } from '@/contexts/view-as';

function SuperadminUserPicker() {
  const { startViewAs, stopViewAs, isViewingAs, viewAsUser } = useViewAs();

  if (isViewingAs) {
    return (
      <div className="alert alert-warning">
        Viewing as: {viewAsUser?.displayName}
        <button onClick={stopViewAs}>Exit</button>
      </div>
    );
  }

  return (
    <UserSelector
      onSelect={(user) =>
        startViewAs({
          id: user.id,
          displayName: user.name,
          email: user.email,
        })
      }
    />
  );
}

// In useApi hook (internal usage)
const viewAsUserId = getViewAsUserId();
if (viewAsUserId) {
  headers['X-View-As-User-ID'] = viewAsUserId;
}
```

### Key Features

- **sessionStorage**: Clears on tab close (not persisted across sessions)
- **API header injection**: `useApi` automatically adds `X-View-As-User-ID`
- **Superadmin only**: Only superadmins can use this feature

---

## ObjectPreviewContext (`useObjectPreview`)

**File**: `object-preview.tsx`

Knowledge graph object preview drawer state.

### Interface

```tsx
type ObjectPreviewTab = 'properties' | 'relationships' | 'system' | 'history';

type ObjectPreviewContextValue = {
  state: {
    isOpen: boolean;
    objectId: string | null;
    activeTab: ObjectPreviewTab;
  };
  openPreview: (objectId: string) => void;
  closePreview: () => void;
  setActiveTab: (tab: ObjectPreviewTab) => void;
};
```

### Usage

```tsx
import { useObjectPreview } from '@/contexts/object-preview';

function ObjectCard({ object }) {
  const { openPreview } = useObjectPreview();

  return <div onClick={() => openPreview(object.id)}>{object.name}</div>;
}

function ObjectPreviewDrawer() {
  const { state, closePreview, setActiveTab } = useObjectPreview();

  if (!state.isOpen) return null;

  return (
    <Drawer onClose={closePreview}>
      <Tabs value={state.activeTab} onChange={setActiveTab}>
        <Tab value="properties">Properties</Tab>
        <Tab value="relationships">Relationships</Tab>
      </Tabs>
      <ObjectDetails objectId={state.objectId} tab={state.activeTab} />
    </Drawer>
  );
}
```

---

## SwitcherPanelContext (`useSwitcherPanel`)

**File**: `switcher-panel.tsx`

Theme/logo configuration panel state.

### Interface

```tsx
type PanelType =
  | 'color'
  | 'logo-gradient'
  | 'logo-font'
  | 'theme-config'
  | null;

type SwitcherPanelContextValue = {
  openPanel: PanelType;
  setOpenPanel: (panel: PanelType) => void;
  togglePanel: (panel: PanelType) => void;
};
```

### Usage

```tsx
import { useSwitcherPanel } from '@/contexts/switcher-panel';

function SettingsMenu() {
  const { togglePanel, openPanel } = useSwitcherPanel();

  return (
    <>
      <button
        onClick={() => togglePanel('color')}
        className={openPanel === 'color' ? 'active' : ''}
      >
        Colors
      </button>
      <button onClick={() => togglePanel('theme-config')}>Theme Config</button>
    </>
  );
}
```

---

## Common Mistakes Summary

| Mistake                               | Correct Approach                    |
| ------------------------------------- | ----------------------------------- |
| `useContext(AuthContext)`             | `useAuth()`                         |
| Direct localStorage for config        | `useConfig()`                       |
| Custom toast state                    | `useToast()`                        |
| Fetching orgs/projects per component  | `useAccessTreeContext()`            |
| Manual WebSocket/polling              | `useDataUpdates()`                  |
| Creating new context for shared state | Check if existing context covers it |

## Creating New Contexts

### When to Create

1. **Truly global state** - Needed by many unrelated components
2. **Prop drilling > 3 levels** - Context is cleaner
3. **Not just a hook** - If only 1-2 components need it, use a hook

### Context Structure

```tsx
// my-feature.tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

interface MyFeatureContextValue {
  // State
  data: Data | null;
  loading: boolean;
  // Actions
  doSomething: () => void;
}

const MyFeatureContext = createContext<MyFeatureContextValue | undefined>(
  undefined
);

export function MyFeatureProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  const doSomething = useCallback(() => {
    // implementation
  }, []);

  const value = useMemo<MyFeatureContextValue>(
    () => ({
      data,
      loading,
      doSomething,
    }),
    [data, loading, doSomething]
  );

  return (
    <MyFeatureContext.Provider value={value}>
      {children}
    </MyFeatureContext.Provider>
  );
}

export function useMyFeature(): MyFeatureContextValue {
  const context = useContext(MyFeatureContext);
  if (!context) {
    throw new Error('useMyFeature must be used within MyFeatureProvider');
  }
  return context;
}
```

### Checklist

- [ ] Export both Provider and hook
- [ ] Throw descriptive error if hook used outside provider
- [ ] Memoize context value to prevent unnecessary re-renders
- [ ] Document in this AGENT.md file
