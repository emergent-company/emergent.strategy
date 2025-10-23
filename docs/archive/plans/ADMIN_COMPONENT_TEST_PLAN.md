# Admin Component Test Implementation Plan

**Created:** October 8, 2025  
**Status:** In Progress  
**Goal:** Add 40+ component unit tests to improve fast feedback and balance test pyramid

## Current State

**Existing Tests (9 files):**
- ✅ Avatar.test.tsx
- ✅ AvatarGroup.test.tsx
- ✅ MetaData.test.tsx
- ✅ PageTitle.test.tsx
- ✅ ThemeToggle.test.tsx
- ✅ Modal.test.tsx (organisms)
- ✅ use-local-storage.test.ts (hook)
- ✅ use-api.test.ts (hook)
- ✅ config.test.tsx (context)

**Component Inventory (60+ components without tests):**

### Atoms (13 components)
- NotificationDot
- Tooltip
- CountBadge
- Button ⭐ (high priority)
- Logo
- LoadingEffect
- Icon ⭐ (high priority)
- SidebarMenuItemBadges

### Molecules (20 components)
- NotificationBell ⭐
- TableEmptyState ⭐
- ChatCtaCard
- SidebarMenuItem ⭐ (high priority - navigation)
- NewChatCtas
- SidebarProjectItem ⭐ (high priority - navigation)
- ExtractionJobStatusBadge
- IconBadge
- DebugInfoPanel
- ChatPromptComposer ⭐ (high priority - form)
- ChatPromptActions
- NotificationTabButton
- NotificationRow ⭐
- TableAvatarCell
- IconButton ⭐
- FileUploader ⭐ (high priority - form)
- PageTitleHero

### Organisms (17 components)
- Sidebar ⭐ (high priority - navigation)
- ExtractionJobFilters ⭐ (high priority - form)
- SidebarProjectDropdown ⭐ (high priority - navigation)
- Footer
- ExtractionJobList ⭐ (high priority - data display)
- ProjectGate ⭐ (high priority - routing)
- NotificationInbox ⭐ (high priority)
- SidebarSection
- OrgAndProjectGate ⭐ (high priority - routing)
- ExtractionConfigModal ⭐ (high priority - form)
- ObjectDetailModal ⭐ (high priority)
- ConfirmActionModal ⭐ (high priority)
- ExtractionJobCard ⭐ (high priority - data display)
- Topbar (with 5 partials)
- Rightbar (with 4 partials)
- ObjectBrowser ⭐ (high priority)

### Page-Level Components (7 components)
- ConfigureIntegrationModal ⭐ (high priority - form)
- ClickUpSyncModal ⭐ (high priority - complex state machine)
- ImportConfigForm ⭐ (high priority - form)
- WorkspaceTree ⭐ (high priority - selection)
- ChatCallModal

## Implementation Priority

### Phase 1: Critical Forms & Navigation (Week 1)
**Target:** 15 tests  
**Focus:** Components users interact with most

1. **Forms** (5 tests)
   - [ ] ConfigureIntegrationModal.test.tsx
   - [ ] ImportConfigForm.test.tsx
   - [ ] ChatPromptComposer.test.tsx
   - [ ] FileUploader.test.tsx
   - [ ] ExtractionConfigModal.test.tsx

2. **Navigation** (5 tests)
   - [ ] SidebarMenuItem.test.tsx
   - [ ] SidebarProjectItem.test.tsx
   - [ ] SidebarProjectDropdown.test.tsx
   - [ ] ProjectGate.test.tsx
   - [ ] OrgAndProjectGate.test.tsx

3. **Critical UI** (5 tests)
   - [ ] Button.test.tsx
   - [ ] Icon.test.tsx
   - [ ] IconButton.test.tsx
   - [ ] ConfirmActionModal.test.tsx
   - [ ] NotificationBell.test.tsx

### Phase 2: Data Display & Complex Components (Week 2)
**Target:** 15 tests  
**Focus:** Lists, tables, cards, complex state machines

1. **Data Display** (7 tests)
   - [ ] ExtractionJobList.test.tsx
   - [ ] ExtractionJobCard.test.tsx
   - [ ] ExtractionJobFilters.test.tsx
   - [ ] TableEmptyState.test.tsx
   - [ ] TableAvatarCell.test.tsx
   - [ ] NotificationRow.test.tsx
   - [ ] NotificationInbox.test.tsx

2. **Complex State Machines** (5 tests)
   - [ ] ClickUpSyncModal.test.tsx (4-step wizard)
   - [ ] WorkspaceTree.test.tsx (selection tree)
   - [ ] ObjectBrowser.test.tsx
   - [ ] ObjectDetailModal.test.tsx
   - [ ] Sidebar.test.tsx (collapsible, routing)

3. **Status & Badges** (3 tests)
   - [ ] ExtractionJobStatusBadge.test.tsx
   - [ ] NotificationDot.test.tsx
   - [ ] CountBadge.test.tsx

### Phase 3: Remaining Components & Polish (Week 3)
**Target:** 10+ tests  
**Focus:** Complete coverage, edge cases

1. **Remaining Molecules** (5 tests)
   - [ ] ChatCtaCard.test.tsx
   - [ ] NewChatCtas.test.tsx
   - [ ] ChatPromptActions.test.tsx
   - [ ] IconBadge.test.tsx
   - [ ] PageTitleHero.test.tsx

2. **Remaining Atoms** (3 tests)
   - [ ] Tooltip.test.tsx
   - [ ] LoadingEffect.test.tsx
   - [ ] Logo.test.tsx

3. **Topbar & Rightbar** (2+ tests)
   - [ ] Topbar.test.tsx
   - [ ] Rightbar.test.tsx

## Test Patterns & Standards

### Setup Pattern
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ComponentName } from './ComponentName';

// For components using router
import { BrowserRouter } from 'react-router-dom';
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

// For components using config context
import { ConfigProvider } from '@/contexts/config';
const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};
```

### Test Categories

**1. Rendering Tests** (All components)
```typescript
describe('ComponentName', () => {
  it('renders without crashing', () => {
    render(<ComponentName />);
    expect(screen.getByRole('...')).toBeInTheDocument();
  });

  it('renders with required props', () => {
    render(<ComponentName prop="value" />);
    expect(screen.getByText('value')).toBeInTheDocument();
  });
});
```

**2. Interaction Tests** (Buttons, forms, interactive)
```typescript
it('calls onClick handler when clicked', async () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click me</Button>);
  
  fireEvent.click(screen.getByRole('button', { name: 'Click me' }));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

it('updates input value on change', async () => {
  render(<InputComponent />);
  const input = screen.getByRole('textbox');
  
  fireEvent.change(input, { target: { value: 'test value' } });
  expect(input).toHaveValue('test value');
});
```

**3. Conditional Rendering** (Loading, empty states, errors)
```typescript
it('shows loading state while fetching', () => {
  render(<Component isLoading={true} />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});

it('shows empty state when no data', () => {
  render(<List items={[]} />);
  expect(screen.getByText(/no items/i)).toBeInTheDocument();
});

it('shows error message on failure', () => {
  render(<Component error="Failed to load" />);
  expect(screen.getByText('Failed to load')).toBeInTheDocument();
});
```

**4. Form Validation** (Forms with validation)
```typescript
it('shows validation error for invalid input', async () => {
  render(<Form />);
  const input = screen.getByLabelText('Email');
  
  fireEvent.change(input, { target: { value: 'invalid' } });
  fireEvent.blur(input);
  
  await waitFor(() => {
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });
});

it('submits form with valid data', async () => {
  const onSubmit = vi.fn();
  render(<Form onSubmit={onSubmit} />);
  
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'John' } });
  fireEvent.click(screen.getByRole('button', { name: /submit/i }));
  
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({ name: 'John' });
  });
});
```

**5. API Mocking** (Components with async operations)
```typescript
import { vi } from 'vitest';

// Mock API module
vi.mock('@/api/integrations', () => ({
  fetchIntegrations: vi.fn().mockResolvedValue([
    { id: '1', name: 'clickup', enabled: true }
  ])
}));

it('fetches and displays integrations', async () => {
  render(<IntegrationList />);
  
  await waitFor(() => {
    expect(screen.getByText('clickup')).toBeInTheDocument();
  });
});
```

**6. Navigation Tests** (Router components)
```typescript
import { MemoryRouter } from 'react-router-dom';

it('navigates to correct route on click', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/']}>
      <Navigation />
    </MemoryRouter>
  );
  
  fireEvent.click(screen.getByText('Documents'));
  expect(window.location.pathname).toBe('/documents');
});
```

## Test Coverage Goals

### Minimum Coverage Per Component Type

**Atoms (simple components):**
- 3-5 tests per component
- Render + props + variants

**Molecules (interactive components):**
- 5-8 tests per component
- Render + interactions + state changes

**Organisms (complex components):**
- 8-15 tests per component
- Full user flows + edge cases + error handling

### Overall Targets
- **Unit Test Count:** 40+ tests (from 9)
- **Test Execution Time:** <10 seconds for all unit tests
- **Coverage:** 70%+ for components with tests
- **Maintainability:** Clear, focused test names

## Tooling & Setup

### Already Configured ✅
- Vitest test runner
- @testing-library/react
- @testing-library/user-event
- React Testing Library best practices

### Need to Verify
- [ ] jsdom environment configured correctly
- [ ] CSS imports handled (via vitest config)
- [ ] SVG/image imports mocked
- [ ] Router mock utilities available

## Success Metrics

### Quantitative
- 40+ new test files created
- 150+ new test cases added
- All tests passing in <10 seconds
- Zero flaky tests

### Qualitative
- Developers can run tests locally easily
- Tests catch real regressions
- Test output is clear and actionable
- Components are more maintainable

## Documentation Updates Needed

After implementation:
1. Update `ADMIN_VS_API_TEST_COMPARISON.md` with new stats
2. Update `TEST_COVERAGE_SUMMARY.md` with component coverage
3. Add `COMPONENT_TESTING_GUIDE.md` with examples
4. Update package.json scripts if needed

## Notes

- **Storybook Integration:** All major components already have Storybook stories. Consider using Storybook test runner for visual regression tests in future.
- **E2E vs Unit Balance:** Focus on unit tests for fast feedback. E2E tests (Playwright) already cover user flows.
- **Mock Strategy:** Mock API calls, avoid mocking component internals.
- **Accessibility:** Use `getByRole`, `getByLabelText` over `getByTestId` when possible.

## Progress Tracking

**Phase 1:** 0/15 tests ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜  
**Phase 2:** 0/15 tests ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜  
**Phase 3:** 0/10 tests ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜  

**Total Progress:** 0/40+ tests (0%)
