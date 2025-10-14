---
applyTo: "**/*.tsx"
---

# Test ID Conventions - AI Assistant Instructions

## Critical Rules

1. **ALWAYS use static strings for data-testid attributes** - Never construct test IDs dynamically inside components
2. **Follow the naming pattern**: `{feature}-{element}-{type}` (e.g., `clickup-api-token-input`)
3. **Use kebab-case** for all parts of test IDs
4. **Production builds automatically strip test IDs** via babel-plugin-react-remove-properties

## Naming Pattern

```
{feature}-{element}-{type}
```

- **feature**: The feature/domain area (lowercase, kebab-case)
- **element**: The specific element name (lowercase, kebab-case)
- **type**: The element type suffix (see table below)

## Element Type Suffixes

| Element Type | Suffix | Example |
|-------------|--------|---------|
| Button | `-button` | `clickup-connect-button` |
| Link | `-link` | `nav-settings-link` |
| Input | `-input` | `clickup-api-token-input` |
| Textarea | `-textarea` | `description-textarea` |
| Select | `-select` | `country-select` |
| Checkbox | `-checkbox` | `terms-checkbox` |
| Radio | `-radio` | `payment-credit-radio` |
| Modal/Dialog | `-modal`, `-dialog` | `clickup-config-modal` |
| Card | `-card` | `integration-card-clickup` |
| Badge | `-badge` | `status-badge` |

## ✅ Correct Patterns

### Static Strings for Reusable Components

```tsx
// ✅ Component accepts test ID as prop
interface ModalProps {
  'data-testid'?: string;
  children: React.ReactNode;
}

export function Modal({ 'data-testid': testId, children }: ModalProps) {
  return <div data-testid={testId} className="modal">{children}</div>;
}

// ✅ Parent passes EXPLICIT STATIC STRING
export function IntegrationConfigModal() {
  return (
    <Modal data-testid="clickup-config-modal">
      <input data-testid="clickup-api-token-input" />
      <button data-testid="clickup-connect-button">Connect</button>
    </Modal>
  );
}

// ✅ Test uses EXACT STATIC STRING (LLM can grep!)
await page.getByTestId('clickup-config-modal');
await page.getByTestId('clickup-api-token-input');
```

### Dynamic IDs (Only for Data-Driven Collections)

```tsx
// ✅ Dynamic IDs for list items from API
{integrations.map(integration => (
  <Card key={integration.id} data-testid={`integration-card-${integration.id}`}>
    <Button data-testid={`integration-connect-${integration.id}`}>
      Connect
    </Button>
  </Card>
))}

// ✅ Tree nodes with backend IDs
{nodes.map(node => (
  <TreeNode data-testid={`tree-node-${node.type}-${node.id}`}>
    <Checkbox data-testid={`tree-checkbox-${node.id}`} />
  </TreeNode>
))}
```

## ❌ Anti-Patterns to Avoid

```tsx
// ❌ NEVER construct test ID inside component
interface ModalProps {
  feature: string; // "clickup-config"
}
export function Modal({ feature }: ModalProps) {
  // LLM cannot grep for "clickup-config-modal"!
  return <div data-testid={`${feature}-modal`}>...</div>;
}

// ❌ NEVER use too generic IDs
data-testid="button"
data-testid="input"
data-testid="modal"

// ❌ NEVER use implementation details
data-testid="div-1"
data-testid="form-field-0"

// ❌ NEVER use duplicate IDs across features
data-testid="submit" // Which submit? Login? Register?
```

## Why Static Strings Matter for LLMs

When searching for test IDs:

```bash
# ✅ With static strings - LLM finds both component AND test
grep_search("clickup-config-modal")
# → IntegrationConfigModal.tsx: <Modal data-testid="clickup-config-modal">
# → integrations.clickup.spec.ts: page.getByTestId('clickup-config-modal')

# ❌ With dynamic construction - LLM only finds test
grep_search("clickup-config-modal")
# → integrations.clickup.spec.ts: page.getByTestId('clickup-config-modal')
# → Component NOT found! Must trace prop values manually.
```

## Feature-Specific Examples

### Integration Components

```tsx
// Integration card
data-testid="integration-card-clickup"
data-testid="integration-connect-button-clickup"
data-testid="integration-configure-button-clickup"
data-testid="integration-sync-button-clickup"

// Configuration modal
data-testid="clickup-config-modal"
data-testid="clickup-api-token-input"
data-testid="clickup-workspace-id-input"
data-testid="clickup-save-button"

// Sync modal
data-testid="clickup-sync-modal"
data-testid="clickup-sync-next-button"
data-testid="clickup-sync-start-button"
```

### Authentication

```tsx
data-testid="login-email-input"
data-testid="login-password-input"
data-testid="login-submit-button"
data-testid="login-forgot-password-link"
```

### Navigation

```tsx
data-testid="nav-documents-link"
data-testid="nav-integrations-link"
data-testid="nav-settings-link"
data-testid="sidebar-nav"
```

## Implementation Checklist

When adding test IDs to components:

- [ ] Use static strings (not template literals inside component)
- [ ] Follow `{feature}-{element}-{type}` pattern
- [ ] Use kebab-case
- [ ] Add to all interactive elements (buttons, inputs, links)
- [ ] Use dynamic IDs only for list items from API
- [ ] Verify test ID is grep-able in code

## In Playwright Tests

```typescript
// ✅ ALWAYS use static strings in tests
await page.getByTestId('clickup-config-modal');
await page.getByTestId('clickup-api-token-input').fill('token');
await page.getByTestId('clickup-connect-button').click();

// ❌ NEVER use helper functions that construct IDs
const testId = { modal: (name) => `${name}-modal` };
await page.getByTestId(testId.modal('clickup-config')); // Hard to grep!
```

## Production Build

Test IDs are automatically removed from production builds via:
- `babel-plugin-react-remove-properties` in `vite.config.ts`
- Only applies when `NODE_ENV === 'production'`
- Zero runtime overhead
- Verify with: `grep -r 'data-testid=' dist/` (should return 0 results)

## Full Documentation

See `/Users/mcj/code/spec-server/docs/TEST_ID_CONVENTIONS.md` for complete guidelines, examples, and anti-patterns.
