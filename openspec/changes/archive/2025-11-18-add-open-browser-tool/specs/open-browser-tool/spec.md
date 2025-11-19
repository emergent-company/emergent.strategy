# Open Browser Tool

**Capability:** Developer Tooling  
**Change Type:** ADDED  
**Status:** Draft

## Overview

Custom OpenCode tool that automates opening a Chrome browser for manual testing with proper debug configuration and test credentials. Streamlines the developer workflow by combining Chrome debug launching, credential display, and URL navigation into a single command.

## ADDED Requirements

### Requirement: Tool Registration and Discovery

The system SHALL provide a custom OpenCode tool named `open-browser` that automates browser launching with test credentials for manual testing.

**Acceptance Criteria:**

- Tool is defined in `.opencode/tool/open-browser.ts`
- Tool follows OpenCode tool structure with `description`, `args`, and `execute` function
- Tool is automatically discovered by OpenCode CLI
- AI assistants can invoke the tool via natural language requests

#### Scenario: AI assistant opens browser for testing

**Given** the AI assistant needs to help a developer test a feature manually  
**When** the assistant invokes the open-browser tool  
**Then** the tool should launch Chrome with debugging enabled  
**And** display test credentials in the response  
**And** open the admin app URL automatically

### Requirement: Environment Configuration Reading

The open-browser tool SHALL read required configuration from the `.env` file to construct URLs and retrieve test user credentials.

**Acceptance Criteria:**

- Reads `ADMIN_PORT` from `.env` (default: 5176 if not present)
- Reads `TEST_USER_EMAIL` from `.env` (default: test@example.com)
- Reads `TEST_USER_PASSWORD` from `.env` (default: TestPassword123!)
- Shows helpful error if `.env` file is missing
- Uses same parsing logic as existing credentials tool

#### Scenario: Missing .env file

**Given** the `.env` file does not exist  
**When** the tool is invoked  
**Then** it should return an error message  
**And** provide instructions to create `.env` from `.env.example`  
**And** not attempt to launch Chrome

#### Scenario: Custom port configuration

**Given** the `.env` file has `ADMIN_PORT=5175`  
**When** the tool is invoked  
**Then** it should construct URL as `http://localhost:5175`  
**And** launch Chrome with that URL

### Requirement: Chrome Debug Browser Launch

The open-browser tool SHALL launch Chrome with remote debugging enabled by invoking the existing start-chrome-debug.sh script.

**Acceptance Criteria:**

- Invokes `npm run chrome:debug` with the constructed URL
- Uses Node.js child_process module (spawn or exec)
- Passes URL as argument to the script
- Handles script execution errors gracefully
- Returns script output/errors to user

#### Scenario: Chrome launches successfully

**Given** Chrome is installed and the script is available  
**When** the tool launches Chrome with URL `http://localhost:5176`  
**Then** Chrome should open with remote debugging on port 9222  
**And** the admin app URL should load in the browser  
**And** the tool should return success status

#### Scenario: Chrome is already running

**Given** Chrome debug is already running on port 9222  
**When** the tool attempts to launch Chrome  
**Then** the existing script should detect it  
**And** inform the user that Chrome is already running  
**And** the tool should return this status to the user

#### Scenario: Chrome launch fails

**Given** Chrome is not installed or script fails  
**When** the tool attempts to launch Chrome  
**Then** it should catch the error  
**And** return a meaningful error message  
**And** not hang or crash

### Requirement: Credential Display

The open-browser tool SHALL display test user credentials in a clear, readable format that users and AI assistants can easily use.

**Acceptance Criteria:**

- Returns TEST_USER_EMAIL and TEST_USER_PASSWORD in structured format
- Includes instructions for logging in
- Formats output as JSON or readable text
- Does not expose E2E user credentials (those are for automated tests only)

#### Scenario: Credentials displayed after launch

**Given** Chrome was launched successfully  
**When** the tool returns its response  
**Then** it should include TEST_USER credentials  
**And** provide a clear message about how to use them  
**And** NOT include E2E_TEST_USER credentials (those are for automation)

### Requirement: Documentation and Discoverability

The open-browser tool SHALL be documented in `.opencode/instructions.md` so developers and AI assistants know when and how to use it.

**Acceptance Criteria:**

- Added to `.opencode/instructions.md` Section 4 (Available Custom Tools)
- Includes description, usage examples, and when to use
- Follows same documentation pattern as credentials and logs tools
- Listed alongside other custom tools

#### Scenario: Developer reads documentation

**Given** a developer is looking for available tools  
**When** they read `.opencode/instructions.md`  
**Then** they should see the open-browser tool listed  
**And** understand what it does  
**And** see example usage commands

#### Scenario: AI assistant discovers tool

**Given** an AI assistant needs to help with browser testing  
**When** it reads the instructions file  
**Then** it should understand when to use open-browser  
**And** be able to suggest it proactively  
**And** explain its benefits to the user

## Implementation Notes

### Tool Structure

```typescript
import { tool } from '@opencode-ai/plugin';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export default tool({
  description: 'Open Chrome browser with test credentials for manual testing',
  args: {},
  async execute() {
    // 1. Read .env file
    // 2. Extract ADMIN_PORT, TEST_USER_EMAIL, TEST_USER_PASSWORD
    // 3. Construct URL: http://localhost:${ADMIN_PORT}
    // 4. Launch Chrome: npm run chrome:debug <URL>
    // 5. Return credentials + status
  },
});
```

### Dependencies

- Node.js built-in modules: `fs`, `path`, `child_process`
- Existing script: `scripts/start-chrome-debug.sh`
- Existing npm script: `chrome:debug` in package.json

### Error Handling

- Missing .env file → return error with instructions
- Chrome script failure → return error with script output
- Invalid port → use default 5176

## Testing Strategy

### Manual Testing

1. Test with clean .env (default values)
2. Test with custom ADMIN_PORT
3. Test with missing .env file
4. Test with Chrome already running
5. Test with Chrome not installed (verify error message)

### AI Assistant Testing

1. Ask AI "open the browser for testing"
2. Verify AI invokes the tool correctly
3. Verify AI communicates credentials clearly
4. Verify AI can then use DevTools MCP to inspect browser

## Success Metrics

- Tool can be invoked successfully by AI assistants
- Chrome launches within 5 seconds
- Credentials are displayed clearly
- 95%+ success rate across supported platforms (macOS, Linux, Windows)

## Future Enhancements

- Add optional URL parameter to open specific pages
- Support choosing between TEST_USER and E2E_TEST_USER
- Add option to open without launching (just print credentials)
- Support opening multiple browser instances for testing
