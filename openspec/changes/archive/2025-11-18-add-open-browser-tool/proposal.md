# Add Open Browser Tool

**Change ID:** `add-open-browser-tool`  
**Status:** Draft  
**Created:** 2025-11-18

## Why

Manual browser testing is a frequent developer workflow that currently requires multiple manual steps: starting Chrome with debugging, looking up credentials, and navigating to the correct URL. Developers and AI assistants need to repeat this process many times throughout the day when testing features, debugging issues, or writing E2E tests.

This repetitive workflow creates friction and slows down development velocity. By automating these steps into a single tool invocation, we can significantly improve developer experience and reduce context-switching overhead.

The tool will leverage existing infrastructure (Chrome debug script, credentials tool patterns) to provide a seamless "open and test" experience that integrates naturally with our AI-assisted development workflow.

## Problem Statement

Developers and AI assistants frequently need to quickly open a browser for manual testing with proper test credentials. Currently, this requires:

1. Running `npm run chrome:debug` to start Chrome with debugging enabled
2. Manually looking up test credentials from `.env` file or running a script
3. Remembering which URL to navigate to (admin app, server, etc.)
4. Manually entering credentials and navigating to the correct page

This multi-step process is repetitive and error-prone, especially when context-switching between development tasks or helping AI assistants set up browser-based testing.

## Proposed Solution

Create a custom OpenCode tool `open-browser` that automates the entire workflow:

1. **Start Chrome with debugging** - Invoke `npm run chrome:debug` to ensure the browser is ready for MCP inspection
2. **Display test credentials** - Show TEST_USER credentials in console for easy copy/paste
3. **Open the landing page** - Launch the admin app URL automatically in the debug browser

The tool will leverage existing infrastructure:

- `scripts/start-chrome-debug.sh` - Already handles Chrome launching with proper debug configuration
- `.opencode/tool/credentials.ts` - Already fetches credentials from `.env` file
- Environment variables (`ADMIN_PORT`, test user credentials) - Already configured

## Benefits

- **Faster development workflow** - Single command to start browser testing
- **Reduced cognitive load** - No need to remember multiple commands or credentials
- **Better AI assistant integration** - AI can quickly set up browser testing context
- **Consistent testing environment** - Always uses the same debug configuration
- **Improved developer experience** - Streamlines the most common manual testing task

## Implementation Approach

Create a new OpenCode tool at `.opencode/tool/open-browser.ts` that:

1. Reads `ADMIN_PORT` from `.env` to construct the landing page URL
2. Invokes `npm run chrome:debug` with the constructed URL as an argument
3. Returns formatted credentials and instructions to the user/AI assistant

The tool will be similar in structure to the existing `credentials.ts` and `logs.ts` tools, following established patterns.

## Alternatives Considered

1. **Shell script in `scripts/`** - Rejected because it wouldn't be discoverable to AI assistants via OpenCode tooling
2. **npm script** - Rejected because it can't provide formatted credentials output to AI context
3. **Combined with credentials tool** - Rejected to maintain single responsibility (credentials tool just retrieves data)

## Dependencies

- Existing `scripts/start-chrome-debug.sh` script
- Existing `.env` configuration (ADMIN_PORT, TEST_USER_EMAIL, TEST_USER_PASSWORD)
- Chrome installed on the system
- npm available in PATH

## Success Criteria

- Single command opens browser with correct URL
- Test credentials displayed clearly in console
- Chrome launches with remote debugging enabled on correct port
- Works consistently across macOS, Linux, and Windows (via existing script support)
- AI assistants can discover and use the tool effectively

## Related Changes

- Built on top of `add-opencode-credential-tool` (archived)
- Complements Chrome DevTools MCP integration (archived)
- Part of improving developer tooling workflow
