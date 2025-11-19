import { tool } from '@opencode-ai/plugin';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom OpenCode tool to retrieve test user credentials from environment variables.
 *
 * This tool provides AI assistants with instant access to test credentials without
 * needing to manually search .env files or run bash scripts.
 *
 * @returns Structured JSON with test user credentials, E2E user credentials, application URLs, and usage guidance
 */
export default tool({
  description: 'Get test user credentials and application URLs from .env file',
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

    // Define defaults (matching existing bash scripts)
    const defaults = {
      TEST_USER_EMAIL: 'test@example.com',
      TEST_USER_PASSWORD: 'TestPassword123!',
      E2E_TEST_USER_EMAIL: 'e2e-test@example.com',
      E2E_TEST_USER_PASSWORD: 'E2eTestPassword123!',
      ADMIN_PORT: '5176',
      SERVER_PORT: '3002',
      ZITADEL_DOMAIN: 'localhost:8200',
    };

    // Extract values with defaults
    const getEnvVar = (key: string) =>
      envVars[key] || defaults[key as keyof typeof defaults];

    // Build structured output
    const credentials = {
      testUser: {
        email: getEnvVar('TEST_USER_EMAIL'),
        password: getEnvVar('TEST_USER_PASSWORD'),
      },
      e2eUser: {
        email: getEnvVar('E2E_TEST_USER_EMAIL'),
        password: getEnvVar('E2E_TEST_USER_PASSWORD'),
      },
      urls: {
        admin: `http://localhost:${getEnvVar('ADMIN_PORT')}`,
        server: `http://localhost:${getEnvVar('SERVER_PORT')}`,
        zitadel: `http://${getEnvVar('ZITADEL_DOMAIN')}`,
      },
      usage: {
        purpose:
          'testUser is for manual testing and development. e2eUser is dedicated for automated E2E tests only.',
        devToolsWorkflow: [
          '1. Start Chrome with debugging: npm run chrome:debug',
          '2. Login with credentials above',
          '3. Navigate to feature you want to test',
          '4. Ask AI to inspect browser state with DevTools MCP',
        ],
        exampleCommands: [
          'Check the browser console for errors',
          'What network requests failed?',
          'Show me the DOM structure of this page',
          'What selectors should I use for this button?',
        ],
      },
    };

    return JSON.stringify(credentials, null, 2);
  },
});
