# Improved Chrome DevTools MCP Instructions for AI Assistants

**Status**: ✅ Completed  
**Date**: 2025-01-19  
**Category**: Documentation / AI Guidelines  
**Priority**: High  
**Type**: Safety & UX Enhancement

## Summary

Enhanced the Chrome DevTools MCP usage instructions in `.opencode/instructions.md` to provide comprehensive safety guidelines, tab management practices, and collaboration workflows for AI assistants using Chrome remote debugging.

## Problem

Previous instructions were minimal and didn't address:

- **Safety concerns**: No warning about closing browser affecting multiple users
- **Tab management**: No guidance on creating separate tabs for AI testing
- **User collaboration**: No workflow for observing user demonstrations
- **Active tab detection**: No instructions on identifying which tab user is working in
- **Best practices**: No examples of proper tab isolation patterns

This created risks:

- AI might close browser, disrupting all users
- AI might navigate away from user's active work
- AI might modify user's tab instead of creating its own
- No clear pattern for "show me" scenarios where user demonstrates an issue

## Solution

Added comprehensive guidelines covering:

1. **Critical Safety Rules** (never close browser, never navigate active tab)
2. **Tab Management Best Practices** (create own tabs, check active tab, switch safely)
3. **User Observation Workflow** (list pages, take snapshot, wait for actions)
4. **Practical Examples** (bug investigation, feature testing, tab isolation)

## Changes Made

### File Modified

`.opencode/instructions.md` - Section 5: "Using Chrome DevTools MCP" (lines 184-316)

### 1. Enhanced Workflow Description (lines 186-230)

**Added**:

- Clarified Chrome/Chromium instance sharing
- Added example queries for tab management
- Emphasized observation during manual testing

**New queries**:

```
- "What tab is currently active? I want to show you something"
- "List all open tabs in the browser"
```

### 2. CRITICAL Safety Guidelines (lines 232-240)

**New Section**: Explicit DO NOT / DO rules with warning symbols

```markdown
- ⚠️ **NEVER close the browser or quit Chrome/Chromium**
- ⚠️ **NEVER navigate the active tab** unless explicitly instructed
- ⚠️ **DO create new tabs for your own interactions**
- ⚠️ **DO check the active tab first** when user says "look at this"
- ⚠️ **DO switch to your own tab** before performing actions
- ⚠️ **DO take snapshots instead of screenshots**
- ⚠️ **DO ask before making changes**
```

**Key Points**:

- Multiple users/processes may share the browser instance
- User may be demonstrating something in their active tab
- AI should isolate its work in separate tabs

### 3. Tab Management Best Practices (lines 242-275)

**New Section**: Step-by-step examples with specific tool calls

1. **Checking Current State**:

   - Use `chrome-devtools_list_pages` to see active tab
   - User is working in tab with `active: true`
   - Take snapshot to observe without disruption

2. **Creating Your Own Tab**:

   - Use `chrome-devtools_new_page` for AI's own work
   - Automatically switches to new tab
   - Safe to interact without affecting user

3. **Switching Between Tabs**:

   - Tab 0: User's work (observe only)
   - Tab 1: AI's testing (full interaction)
   - Use `chrome-devtools_select_page(N)` to switch

4. **Closing Tabs (Only Your Own)**:
   - Use `chrome-devtools_close_page(1)` for AI's tab
   - NEVER close tab 0 or user-created tabs

### 4. Observing User Demonstrations (lines 277-285)

**New Section**: Workflow for "let me show you" scenarios

**Steps**:

1. List pages to identify active tab
2. Take snapshot (don't navigate!)
3. Ask clarifying questions
4. Wait for user actions
5. Re-snapshot to compare before/after states

**Pattern**: Non-invasive observation with comparison analysis

### 5. Example Interactions (lines 287-306)

**New Section**: Two complete examples showing proper workflows

**Example 1: Bug Investigation**

- User: "I uploaded a document but it's not showing up"
- AI observes active tab, checks console/network, reports findings
- Never creates new tab - just observes user's state

**Example 2: Feature Testing**

- User: "Can you verify the extraction config saves correctly?"
- AI creates new tab, tests in isolation, closes own tab when done
- Never touches user's original tab

### 6. Enhanced Important Notes (lines 308-316)

**Added**:

- Script prioritizes Chromium over Chrome
- Multiple tabs can coexist (user + AI work)
- **Closing browser window affects ALL users** (emphasized)
- Browser stays open until manually closed

## Benefits

### For AI Assistants

- **Clear safety boundaries**: Know what NEVER to do
- **Practical patterns**: Step-by-step examples to follow
- **Tool guidance**: Specific MCP tool calls to use
- **Workflow clarity**: When to observe vs. when to test

### For Users

- **Protected work**: AI won't disrupt active demonstrations
- **Collaborative debugging**: AI can observe while user demonstrates
- **Isolated testing**: AI can test features without affecting user's session
- **Shared browser**: Multiple users/processes can safely share instance

### For Team

- **Reduced accidents**: Clear rules prevent browser closure incidents
- **Better debugging**: AI can help investigate issues in real-time
- **Safer automation**: Tab isolation prevents cross-contamination
- **Documented patterns**: Examples serve as training material

## Key Improvements

| Aspect               | Before        | After                          |
| -------------------- | ------------- | ------------------------------ |
| Safety warnings      | Minimal       | Explicit DO NOT rules          |
| Tab management       | Not mentioned | Complete workflow              |
| User observation     | Not covered   | Step-by-step process           |
| Active tab detection | Not mentioned | Primary tool for collaboration |
| Examples             | None          | Two complete scenarios         |
| Tool guidance        | Generic       | Specific MCP tool calls        |

## Example Scenarios

### Scenario 1: User Demonstrating Bug

```
User: "Look at this, the modal isn't closing"
AI:
  ✅ Lists pages to find active tab
  ✅ Takes snapshot of active tab
  ✅ Observes modal state
  ✅ Checks console for errors
  ✅ Reports findings without disrupting user
  ❌ Does NOT navigate or close anything
```

### Scenario 2: AI Testing Feature

```
User: "Can you test the upload flow?"
AI:
  ✅ Creates new tab (chrome-devtools_new_page)
  ✅ Tests upload in isolated tab
  ✅ Verifies results
  ✅ Closes own tab when done
  ❌ Does NOT test in user's active tab
```

### Scenario 3: Comparing Before/After

```
User: "Watch what happens when I click this button"
AI:
  ✅ Takes snapshot of active tab (before)
  ✅ Waits for user to click button
  ✅ Takes another snapshot (after)
  ✅ Compares states to identify changes
  ❌ Does NOT click button itself
```

## Documentation Structure

The enhanced section follows this structure:

1. **Introduction** - What DevTools MCP is and when to use it
2. **Workflow** - Step-by-step startup and usage instructions
3. **Safety Guidelines** - Critical rules (DO NOT / DO format)
4. **Tab Management** - Four specific patterns with examples
5. **User Observation** - Workflow for demonstrations
6. **Example Interactions** - Two complete real-world scenarios
7. **Important Notes** - Technical details and reminders

## Impact

### Immediate

- AI assistants have clear, actionable guidelines
- Reduced risk of browser closure accidents
- Better collaboration during debugging sessions

### Long-term

- Establishes patterns for AI-user collaboration
- Creates training material for onboarding
- Documents best practices for Chrome DevTools MCP usage

## Related Documentation

- Chrome debug script: `scripts/start-chrome-debug.sh`
- Main instructions: `.opencode/instructions.md`
- Custom tools: Section 4 (credentials, logs, open-browser)

## Testing

To verify these instructions are effective:

1. **AI follows safety rules**:

   - ✅ Never closes browser during session
   - ✅ Creates own tabs for testing
   - ✅ Checks active tab before observing

2. **Tab isolation works**:

   - ✅ AI's testing doesn't affect user's work
   - ✅ User can demonstrate while AI observes
   - ✅ Multiple tabs coexist peacefully

3. **Workflows are clear**:
   - ✅ AI knows when to observe vs. test
   - ✅ Examples provide actionable patterns
   - ✅ Tool calls are specific and correct

## Priority Justification

**High Priority** because:

- Prevents destructive actions (closing browser)
- Enables safe AI-user collaboration
- Critical for Chrome DevTools MCP adoption
- Protects user work and system state
