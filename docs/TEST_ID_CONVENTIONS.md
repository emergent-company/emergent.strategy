# Test ID Naming Conventions

## Overview

This document defines the standard conventions for using `data-testid` attributes in E2E tests. Following these conventions ensures test stability, readability, and maintainability across the codebase.

## Why Test IDs?

### Benefits
- ✅ **Resilient**: Survive UI redesigns, text changes, and class restructuring
- ✅ **Fast**: Direct DOM queries are faster than complex text/role selectors
- ✅ **i18n-Ready**: Work across all languages and locales
- ✅ **Clear Intent**: Explicitly mark elements for testing
- ✅ **Team-Friendly**: Designers and developers can refactor UI without breaking tests

### When to Use Test IDs vs Semantic Queries

| Scenario | Use | Example |
|----------|-----|---------|
| **Clicking/Interacting** | `data-testid` | `getByTestId('submit-button')` |
| **Filling Forms** | `data-testid` | `getByTestId('email-input')` |
| **Navigating** | `data-testid` | `getByTestId('nav-settings-link')` |
| **Asserting Content** | Semantic queries | `expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()` |
| **Checking Accessibility** | Semantic queries | `getByRole('button', { name: 'Submit' })` |
| **Verifying Messages** | Semantic queries | `expect(page.getByText('Success!')).toBeVisible()` |

**Rule of Thumb**: Use test IDs for **actions**, semantic queries for **assertions**.

---

## Naming Convention

### General Format

```
{feature}-{element}-{type}
```

- **feature**: The feature/domain area (lowercase, kebab-case)
- **element**: The specific element name (lowercase, kebab-case)
- **type**: The element type (optional, for clarity)

### Examples

```tsx
// Integration gallery
data-testid="integration-card-clickup"
data-testid="integration-connect-button-clickup"
data-testid="integration-status-badge-clickup"

// Forms
data-testid="clickup-api-token-input"
data-testid="clickup-workspace-id-input"
data-testid="user-email-input"
data-testid="user-password-input"

// Buttons
data-testid="modal-submit-button"
data-testid="modal-cancel-button"
data-testid="nav-settings-link"

// Modals/Dialogs
data-testid="clickup-config-modal"
data-testid="delete-confirmation-dialog"

// Lists/Trees
data-testid="workspace-tree-node-space-123"
data-testid="workspace-tree-checkbox-list-456"
data-testid="document-list-item-doc-789"
```

---

## Element Type Suffixes

Use these consistent suffixes for common element types:

| Type | Suffix | Example |
|------|--------|---------|
| Button | `-button` | `submit-button`, `cancel-button` |
| Link | `-link` | `nav-settings-link`, `footer-about-link` |
| Input (text/email/etc) | `-input` | `email-input`, `password-input` |
| Textarea | `-textarea` | `description-textarea`, `notes-textarea` |
| Select/Dropdown | `-select` | `country-select`, `role-select` |
| Checkbox | `-checkbox` | `terms-checkbox`, `remember-me-checkbox` |
| Radio | `-radio` | `payment-method-radio-credit`, `payment-method-radio-paypal` |
| Modal/Dialog | `-modal`, `-dialog` | `confirm-modal`, `settings-dialog` |
| Card | `-card` | `user-card`, `integration-card-clickup` |
| Badge | `-badge` | `status-badge`, `count-badge` |
| Icon | `-icon` | `close-icon`, `menu-icon` |
| Spinner/Loader | `-spinner`, `-loader` | `page-spinner`, `button-loader` |
| Error Message | `-error` | `email-error`, `form-error` |
| Success Message | `-success` | `save-success`, `upload-success` |

---

## Reusable Components Pattern

### CRITICAL: Static Strings for LLM Discoverability

**When you have reusable components (Modal, Drawer, Dialog) used in multiple places, always pass explicit test IDs as props with static strings at usage sites.**

```typescript
// ✅ Step 1: Component accepts test ID as prop (stays reusable)
interface ModalProps {
  'data-testid'?: string;
  children: React.ReactNode;
}

export function Modal({ 'data-testid': testId, children }: ModalProps) {
  return (
    <div data-testid={testId} className="modal">
      {children}
    </div>
  );
}

// ✅ Step 2: Parent passes EXPLICIT STATIC STRING
// In IntegrationConfigModal.tsx
export function IntegrationConfigModal() {
  return (
    <Modal data-testid="clickup-config-modal">
      <h2 data-testid="clickup-config-title">Configure ClickUp</h2>
      <input data-testid="clickup-api-token-input" />
      <button data-testid="clickup-connect-button">Connect</button>
    </Modal>
  );
}

// ✅ Step 3: Test uses EXACT STATIC STRING
test('configure integration', async ({ page }) => {
  await page.getByTestId('clickup-config-modal').waitFor();
  await page.getByTestId('clickup-api-token-input').fill('token');
  await page.getByTestId('clickup-connect-button').click();
});
```

### ❌ Anti-Pattern: Dynamic Construction Inside Component

```typescript
// ❌ AVOID: Hard for LLM to discover
interface ModalProps {
  feature: string; // e.g., "clickup-config"
}

export function Modal({ feature }: ModalProps) {
  // LLM cannot grep for final test ID!
  return <div data-testid={`${feature}-modal`}>...</div>;
}

// Usage
<Modal feature="clickup-config" />

// LLM challenges:
// 1. grep_search("clickup-config-modal") won't find the component
// 2. Must trace `feature` prop through component tree
// 3. Must understand template literal construction
```

### Why Static Strings Matter for LLMs

When you or an LLM searches for `"clickup-config-modal"`:

**✅ With Static Strings:**
```bash
grep_search("clickup-config-modal")
# Finds:
# - IntegrationConfigModal.tsx: <Modal data-testid="clickup-config-modal">
# - integrations.clickup.spec.ts: page.getByTestId('clickup-config-modal')
```

**❌ With Dynamic Construction:**
```bash
grep_search("clickup-config-modal")
# Finds:
# - integrations.clickup.spec.ts: page.getByTestId('clickup-config-modal')
# Does NOT find the component! Must manually trace prop values.
```

### Key Principle

**Test IDs should be literal grep-able strings in your JSX code.**

---

## Feature-Specific Patterns

### Authentication

```tsx
// Login page
data-testid="login-email-input"
data-testid="login-password-input"
data-testid="login-submit-button"
data-testid="login-forgot-password-link"
data-testid="login-error-message"

// Registration
data-testid="register-email-input"
data-testid="register-password-input"
data-testid="register-confirm-password-input"
data-testid="register-terms-checkbox"
data-testid="register-submit-button"
```

### Navigation

```tsx
// Sidebar
data-testid="sidebar-nav"
data-testid="nav-documents-link"
data-testid="nav-integrations-link"
data-testid="nav-settings-link"

// Breadcrumbs
data-testid="breadcrumb-home"
data-testid="breadcrumb-integrations"
data-testid="breadcrumb-clickup"

// Mobile menu
data-testid="mobile-menu-toggle"
data-testid="mobile-menu-drawer"
```

### Integrations (ClickUp Example)

```tsx
// Integration card in gallery
data-testid="integration-card-clickup"
data-testid="integration-title-clickup"
data-testid="integration-description-clickup"
data-testid="integration-status-badge-clickup"
data-testid="integration-connect-button-clickup"
data-testid="integration-configure-button-clickup"

// Configuration modal
data-testid="clickup-config-modal"
data-testid="clickup-api-token-input"
data-testid="clickup-workspace-id-input"
data-testid="clickup-config-submit-button"
data-testid="clickup-config-cancel-button"
data-testid="clickup-config-error-message"

// Sync modal
data-testid="clickup-sync-modal"
data-testid="clickup-sync-select-all-button"
data-testid="clickup-sync-deselect-all-button"
data-testid="clickup-sync-next-button"
data-testid="clickup-sync-start-button"
data-testid="clickup-sync-progress-bar"

// Tree structure (dynamic IDs)
data-testid="tree-node-workspace-{workspaceId}"
data-testid="tree-node-space-{spaceId}"
data-testid="tree-node-folder-{folderId}"
data-testid="tree-node-list-{listId}"
data-testid="tree-checkbox-{nodeId}"
data-testid="tree-expand-button-{nodeId}"
```

### Forms

```tsx
// Generic form pattern
data-testid="{form-name}-{field-name}-input"
data-testid="{form-name}-submit-button"
data-testid="{form-name}-cancel-button"
data-testid="{form-name}-error-message"

// Example: Project settings
data-testid="project-settings-name-input"
data-testid="project-settings-description-textarea"
data-testid="project-settings-visibility-select"
data-testid="project-settings-submit-button"
```

### Lists and Tables

```tsx
// List items
data-testid="document-list"
data-testid="document-list-item-{documentId}"
data-testid="document-list-item-title-{documentId}"
data-testid="document-list-item-delete-button-{documentId}"

// Table rows
data-testid="users-table"
data-testid="users-table-row-{userId}"
data-testid="users-table-cell-name-{userId}"
data-testid="users-table-cell-email-{userId}"
data-testid="users-table-actions-{userId}"
```

### Modals and Dialogs

```tsx
// Modal structure
data-testid="{feature}-modal"
data-testid="{feature}-modal-close-button"
data-testid="{feature}-modal-title"
data-testid="{feature}-modal-content"
data-testid="{feature}-modal-submit-button"
data-testid="{feature}-modal-cancel-button"

// Confirmation dialogs
data-testid="delete-confirmation-dialog"
data-testid="delete-confirmation-confirm-button"
data-testid="delete-confirmation-cancel-button"
```

---

## Dynamic IDs

**Only use dynamic test IDs when the ID comes from runtime data (API responses, user-generated content).**

### When Dynamic IDs Are Necessary

✅ **Use dynamic IDs for:**
- List items from API (documents, users, integrations)
- Tree nodes with IDs from backend
- Collection items that can be added/removed at runtime
- Items where the specific ID matters for the test

❌ **Don't use dynamic IDs for:**
- Reusable components with static instances (use static strings instead)
- Feature-specific modals, dialogs, drawers
- Navigation items, form fields, buttons with fixed purposes

### Pattern
```tsx
data-testid={`{base}-{id}`}
```

### Examples

```tsx
// ✅ CORRECT: Dynamic IDs for data-driven lists
{integrations.map(integration => (
  <Card data-testid={`integration-card-${integration.id}`}>
    <Button data-testid={`integration-connect-button-${integration.id}`}>
      Connect
    </Button>
  </Card>
))}

// ✅ CORRECT: Tree nodes from API
{nodes.map(node => (
  <TreeNode data-testid={`tree-node-${node.type}-${node.id}`}>
    <Checkbox data-testid={`tree-checkbox-${node.id}`} />
  </TreeNode>
))}

// ✅ CORRECT: Document list from database
{documents.map(doc => (
  <ListItem data-testid={`document-list-item-${doc.id}`}>
    <Button data-testid={`document-delete-button-${doc.id}`}>Delete</Button>
  </ListItem>
))}

// ❌ WRONG: Static modal doesn't need dynamic ID
// Don't do this:
<Modal data-testid={`${feature}-config-modal`}>
  
// Do this instead:
<Modal data-testid="clickup-config-modal">
```

### Test Usage

```typescript
// For static elements - use literal strings (LLM can grep!)
await page.getByTestId('integration-card-clickup').click();

// For dynamic collections - construct ID when you know the value
const integrationId = 'clickup'; // Known value
await page.getByTestId(`integration-card-${integrationId}`).click();

// For lists - loop through known values
const spaceIds = ['space-123', 'space-456'];
for (const spaceId of spaceIds) {
  await page.getByTestId(`tree-checkbox-${spaceId}`).check();
}
```
await page.getByTestId(`tree-checkbox-${listId}`).check();
await page.getByTestId(`document-delete-button-${documentId}`).click();
```

---

## Playwright Helper Functions

Create helper functions for common patterns:

```typescript
## Test ID Usage in Tests

### ⚠️ CRITICAL: Use Static Strings for LLM Discoverability

**Always use exact static strings in your tests, not helper functions or template literals.**

```typescript
// ✅ CORRECT: Static string - LLM can grep and find instantly
await page.getByTestId('clickup-config-modal');
await page.getByTestId('clickup-api-token-input');
await page.getByTestId('clickup-connect-button');

// ❌ AVOID: Helper function - LLM must trace logic
const testId = { modal: (name) => `${name}-modal` };
await page.getByTestId(testId.modal('clickup-config')); // Hard to grep
```

**Why static strings?**
1. **LLM Discovery**: `grep_search("clickup-config-modal")` finds all occurrences instantly
2. **Refactoring Safety**: Simple find-and-replace across codebase
3. **Code Review**: Reviewers see exact test ID without tracing variables
4. **No Runtime Logic**: No template literals or function calls to debug

### Exception: Dynamic Collections Only

Helper functions are **only** useful when dealing with dynamic collections:

```typescript
// ✅ OK for dynamic lists (ID comes from data)
{spaces.map(space => (
  <TreeNode key={space.id} data-testid={`tree-node-space-${space.id}`} />
))}

// Test loops through dynamic IDs
const spaceIds = ['123', '456', '789'];
for (const id of spaceIds) {
  await page.getByTestId(`tree-node-space-${id}`).click();
}
```

### Optional: Helper Functions for Dynamic Cases Only

If you have many dynamic collections, create focused utilities:

```typescript
// e2e/utils/selectors.ts - ONLY for truly dynamic cases
export const dynamicTestId = {
  // For tree nodes with dynamic IDs from API
  treeNode: (type: string, id: string) => `tree-node-${type}-${id}`,
  
  // For list items with IDs from data
  listItem: (list: string, id: string) => `${list}-item-${id}`,
};

// Usage - only when ID comes from runtime data
const spaces = await api.getSpaces();
for (const space of spaces) {
  await page.getByTestId(dynamicTestId.treeNode('space', space.id)).click();
}
```
```

---

## Production Build Optimization

### Removing Test IDs from Production

**For performance and security, you should strip `data-testid` attributes from production builds.**

### Method 1: Babel Plugin (Recommended for Vite/React)

Install the babel plugin:
```bash
npm install --save-dev babel-plugin-react-remove-properties
```

Add to `vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          // Remove data-testid in production
          process.env.NODE_ENV === 'production' && [
            'babel-plugin-react-remove-properties',
            { properties: ['data-testid'] }
          ]
        ].filter(Boolean)
      }
    })
  ]
});
```

### Method 2: PostCSS Plugin

For a CSS-based approach, you can hide the attributes:
```bash
npm install --save-dev postcss postcss-attribute-selector-prefix
```

Add to PostCSS config (less common, mainly for debugging):
```javascript
module.exports = {
  plugins: [
    process.env.NODE_ENV === 'production' && 
      require('postcss-attribute-selector-prefix')({ prefix: 'data-test-' })
  ].filter(Boolean)
};
```

### Method 3: Vite Plugin (Custom)

Create a simple Vite plugin in `vite.config.ts`:
```typescript
import { defineConfig, Plugin } from 'vite';

function removeTestIds(): Plugin {
  return {
    name: 'remove-test-ids',
    enforce: 'post',
    apply: 'build', // Only apply during build
    transformIndexHtml(html) {
      // Remove from HTML
      return html.replace(/\s*data-testid="[^"]*"/g, '');
    },
    transform(code, id) {
      // Remove from JS/JSX (simple regex, Babel is more reliable)
      if (id.endsWith('.tsx') || id.endsWith('.jsx')) {
        return code.replace(/data-testid=["'{][^"'}]*["'}]/g, '');
      }
      return code;
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    process.env.NODE_ENV === 'production' && removeTestIds()
  ].filter(Boolean)
});
```

### Method 4: TypeScript Helper (Runtime, Not Recommended)

For runtime stripping (has performance cost):
```typescript
// src/utils/testId.ts
export function testId(id: string): Record<string, string> {
  return import.meta.env.PROD ? {} : { 'data-testid': id };
}

// Usage
<button {...testId('submit-button')}>Submit</button>
```

**Note:** Runtime stripping adds overhead. Use build-time removal (Method 1 or 3) instead.

### Verification

After implementing, build and check the output:
```bash
npm run build
grep -r "data-testid" dist/
```

Should return no results in production build.

### Recommendation

✅ **Use Method 1 (Babel Plugin)** - Most reliable and widely used
- Clean removal at build time
- No runtime overhead
- Works with all JSX patterns
- Battle-tested in production

---

## Implementation Checklist

When adding test IDs to a new component:

- [ ] Use kebab-case for all parts
- [ ] Follow `{feature}-{element}-{type}` pattern
- [ ] Add test ID to interactive elements (buttons, inputs, links)
- [ ] Use dynamic IDs for list items: `` data-testid={`base-${id}`} ``
- [ ] Document any custom patterns in this file
- [ ] Update Playwright helper functions if needed
- [ ] Update E2E tests to use new test IDs
- [ ] Remove old fragile selectors after verification

---

## Migration Strategy

### Phase 1: New Components
- All new components must include test IDs from day 1
- Review in PR: "Are test IDs present and following conventions?"

### Phase 2: Critical Paths
- Add test IDs to existing critical user flows
- Priority: Auth, integrations, document management
- Update tests as you go

### Phase 3: Gradual Replacement
- When touching existing tests, replace text/class selectors with test IDs
- Keep both during transition period for safety
- Remove old selectors once stable

### Phase 4: Enforcement
- Add ESLint rule to encourage test IDs (optional)
- Add PR template checklist item for test IDs
- Include in component library documentation

---

## Anti-Patterns to Avoid

### ❌ Don't Do This

```tsx
// Too generic
data-testid="button"
data-testid="input"
data-testid="modal"

// Coupled to implementation
data-testid="div-1"
data-testid="form-field-0"
data-testid="card-component-wrapper"

// Using CSS classes
data-testid="btn-primary"
data-testid="text-gray-500"

// Duplicates
data-testid="submit" // Used in multiple forms - which one?
data-testid="button-1" // What does "1" mean?

// Too verbose
data-testid="clickup-integration-card-in-gallery-view-connect-button"
```

### ✅ Do This Instead

```tsx
// Specific and clear
data-testid="login-submit-button"
data-testid="email-input"
data-testid="settings-modal"

// Feature-scoped
data-testid="login-submit-button"
data-testid="register-submit-button"
data-testid="payment-submit-button"

// Concise but descriptive
data-testid="clickup-connect-button"
data-testid="integration-card-clickup"
```

---

## Testing the Test IDs

### Verify Test IDs Are Present

```typescript
// Check test ID exists in DOM
const element = await page.getByTestId('clickup-connect-button');
expect(element).toBeTruthy();

// Check test ID is unique
const count = await page.getByTestId('clickup-connect-button').count();
expect(count).toBe(1);
```

### Debug Missing Test IDs

```typescript
// If test ID not found, check the DOM
const html = await page.content();
console.log('Page HTML:', html);

// Or use Playwright Inspector
// Run with: PWDEBUG=1 npx playwright test
```

---

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles/)
- [Component Testing Trade-offs](https://kentcdodds.com/blog/making-your-ui-tests-resilient-to-change)

---

## Questions & Clarifications

If you're unsure about a test ID pattern:

1. Check this document for similar examples
2. Check existing test IDs in the codebase
3. Ask in the team chat or PR review
4. When in doubt, prioritize clarity over brevity

**Remember**: Test IDs are part of the component API. Choose names that will make sense 6 months from now!
