import { tool } from '@opencode-ai/plugin';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * Check if Chrome is running with remote debugging on the specified port
 */
async function checkChromeRunning(port: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Create a new tab in the running Chrome instance
 */
async function createNewTab(
  url: string,
  port: string
): Promise<{ id: string; webSocketDebuggerUrl: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${url}`, {
    method: 'PUT',
  });

  if (!response.ok) {
    throw new Error(`Failed to create new tab: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    webSocketDebuggerUrl: data.webSocketDebuggerUrl,
  };
}

/**
 * Custom OpenCode tool to open Chrome browser with test credentials for manual testing.
 *
 * This tool automates the browser testing workflow by:
 * 1. Reading test credentials from .env
 * 2. Checking if Chrome is already running with remote debugging
 * 3. If running, creates a new tab (avoiding interference with existing tabs)
 * 4. If not running, launches Chrome with remote debugging enabled
 * 5. Returns tab ID for MCP targeting
 * 6. Displaying credentials for easy login
 *
 * @returns Formatted output with launch status, tab ID, and test credentials
 */
export default tool({
  description: 'Open Chrome browser with test credentials for manual testing',
  args: {},
  async execute() {
    const envPath = path.join(process.cwd(), '.env');

    // Check if .env file exists
    if (!fs.existsSync(envPath)) {
      return JSON.stringify(
        {
          error: '.env file not found',
          message:
            'Copy .env.example to .env and configure it before using this tool',
          hint: 'Run: cp .env.example .env',
        },
        null,
        2
      );
    }

    // Load and parse .env file
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};

    // Parse .env file (ignoring comments and empty lines)
    envContent.split('\n').forEach((line) => {
      // Skip comments and empty lines
      if (!line || line.trim().startsWith('#')) {
        return;
      }

      // Parse KEY=VALUE or KEY="VALUE" format
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        // Remove surrounding quotes if present
        envVars[key] = value.replace(/^["']|["']$/g, '');
      }
    });

    // Define defaults
    const defaults = {
      TEST_USER_EMAIL: 'test@example.com',
      TEST_USER_PASSWORD: 'TestPassword123!',
      ADMIN_PORT: '5176',
    };

    // Extract values with defaults
    const getEnvVar = (key: string) =>
      envVars[key] || defaults[key as keyof typeof defaults];

    const adminPort = getEnvVar('ADMIN_PORT');
    const testUserEmail = getEnvVar('TEST_USER_EMAIL');
    const testUserPassword = getEnvVar('TEST_USER_PASSWORD');

    // Construct URL
    const url = `http://localhost:${adminPort}`;

    // Check if Chrome is already running with remote debugging
    const debugPort = process.env.CHROME_DEBUG_PORT || '9222';
    const isRunning = await checkChromeRunning(debugPort);

    if (isRunning) {
      // Chrome is already running - create a new tab instead of launching
      try {
        const newTab = await createNewTab(url, debugPort);

        return JSON.stringify(
          {
            status: 'success',
            message: 'New tab created in existing Chrome instance',
            mode: 'new-tab',
            url,
            debugPort,
            tabId: newTab.id,
            tabWebSocketUrl: newTab.webSocketDebuggerUrl,
            credentials: {
              email: testUserEmail,
              password: testUserPassword,
            },
            instructions: [
              '1. A new Chrome tab should now be open with the admin app URL',
              '2. Use the credentials above to log in',
              '3. Navigate to the feature you want to test',
              '4. Ask AI to inspect browser state using DevTools MCP',
              `5. This tab has ID: ${newTab.id}`,
            ],
            devToolsCommands: [
              'Check the browser console for errors',
              'What network requests failed?',
              'Show me the DOM structure of this page',
              'What selectors should I use for this element?',
            ],
            note: 'Chrome was already running, so a new tab was created to avoid interfering with existing work',
          },
          null,
          2
        );
      } catch (error) {
        return JSON.stringify(
          {
            error: 'Failed to create new tab',
            message: error instanceof Error ? error.message : String(error),
            hint: 'Chrome debug server may not be responding. Try closing Chrome and starting fresh.',
          },
          null,
          2
        );
      }
    }

    // Chrome not running - launch it normally
    let chromeOutput = '';
    let chromeError = '';

    try {
      // Use npm run chrome:debug with the URL
      const chromeProcess = spawn('npm', ['run', 'chrome:debug', '--', url], {
        cwd: process.cwd(),
        stdio: 'pipe',
        shell: true,
      });

      // Collect output (don't wait for process to exit as Chrome runs in background)
      chromeProcess.stdout?.on('data', (data) => {
        chromeOutput += data.toString();
      });

      chromeProcess.stderr?.on('data', (data) => {
        chromeError += data.toString();
      });

      // Wait a bit for initial output
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if Chrome started successfully by checking for error patterns
      const hasError =
        chromeError.toLowerCase().includes('error') ||
        chromeError.toLowerCase().includes('failed') ||
        chromeOutput.toLowerCase().includes('error');

      if (hasError && chromeError.trim()) {
        return JSON.stringify(
          {
            error: 'Chrome launch failed',
            message: chromeError || chromeOutput,
            url,
            hint: 'Make sure Chrome is installed and npm is available in PATH',
          },
          null,
          2
        );
      }

      // Success - format response with credentials
      const response = {
        status: 'success',
        message: 'Chrome launched with debugging enabled',
        mode: 'new-instance',
        url,
        debugPort: '9222',
        credentials: {
          email: testUserEmail,
          password: testUserPassword,
        },
        instructions: [
          '1. Chrome should now be open with the admin app URL',
          '2. Use the credentials above to log in',
          '3. Navigate to the feature you want to test',
          '4. Ask AI to inspect browser state using DevTools MCP',
          '5. Use chrome-devtools MCP tools to interact with this browser',
        ],
        devToolsCommands: [
          'Check the browser console for errors',
          'What network requests failed?',
          'Show me the DOM structure of this page',
          'What selectors should I use for this element?',
        ],
        output: chromeOutput || 'Chrome process started',
      };

      return JSON.stringify(response, null, 2);
    } catch (error) {
      return JSON.stringify(
        {
          error: 'Failed to launch Chrome',
          message: error instanceof Error ? error.message : String(error),
          url,
          hint: 'Make sure npm and Chrome are installed. Check if Chrome is already running on the debug port.',
        },
        null,
        2
      );
    }
  },
});
