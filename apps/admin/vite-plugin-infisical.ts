/**
 * Vite Plugin: Infisical Secrets Loader
 * 
 * Loads secrets from Infisical at build time and injects them into the Vite config
 * Only loads secrets prefixed with VITE_ to expose to the browser
 * 
 * Based on: https://infisical.com/docs/integrations/frameworks/vite
 * 
 * Usage:
 *   import { infisicalPlugin } from './vite-plugin-infisical';
 *   
 *   export default defineConfig(async () => {
 *     const secrets = await infisicalPlugin();
 *     return {
 *       plugins: [...],
 *       define: secrets
 *     };
 *   });
 */

import { config } from 'dotenv';
import path from 'path';

// Load .env files from workspace root (two levels up from apps/admin)
const rootDir = path.resolve(__dirname, '../..');
config({ path: path.join(rootDir, '.env') });
config({ path: path.join(rootDir, '.env.local'), override: false });

interface InfisicalConfig {
  siteUrl: string;
  clientId?: string;
  clientSecret?: string;
  projectId: string;
  environment: string;
  enabled: boolean;
}

interface InfisicalSecret {
  secretKey: string;
  secretValue: string;
}

/**
 * Get Infisical configuration from environment
 */
function getInfisicalConfig(): InfisicalConfig {
  const enabled = process.env.INFISICAL_ENABLED?.toLowerCase() === 'true';
  
  if (!enabled) {
    return { 
      enabled: false,
      siteUrl: '',
      projectId: '',
      environment: 'dev'
    };
  }

  const environment = process.env.INFISICAL_ENVIRONMENT || process.env.NODE_ENV || 'dev';

  return {
    enabled: true,
    siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET,
    projectId: process.env.INFISICAL_PROJECT_ID || '',
    environment,
  };
}

/**
 * Authenticate with Infisical using Universal Auth and get access token
 */
async function getAccessToken(config: InfisicalConfig): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET are required');
  }

  const response = await fetch(`${config.siteUrl}/api/v1/auth/universal-auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Authentication failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.accessToken;
}

/**
 * Fetch secrets from a specific Infisical folder path
 */
async function fetchSecretsFromPath(
  accessToken: string,
  config: InfisicalConfig,
  secretPath: string
): Promise<Record<string, string>> {
  const url = new URL(`${config.siteUrl}/api/v3/secrets/raw`);
  url.searchParams.set('workspaceId', config.projectId);
  url.searchParams.set('environment', config.environment);
  url.searchParams.set('secretPath', secretPath);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch secrets from ${secretPath} (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const secrets: Record<string, string> = {};
  
  if (data.secrets && Array.isArray(data.secrets)) {
    for (const secret of data.secrets as InfisicalSecret[]) {
      secrets[secret.secretKey] = secret.secretValue;
    }
  }

  return secrets;
}

/**
 * Load secrets from Infisical and return as Vite define object
 * Only includes secrets prefixed with VITE_ for security
 * 
 * Returns object in format:
 * {
 *   'import.meta.env.VITE_KEY': JSON.stringify(value),
 *   ...
 * }
 */
export async function infisicalPlugin(): Promise<Record<string, string>> {
  const config = getInfisicalConfig();

  if (!config.enabled) {
    console.log('⏭️  Infisical: Disabled (INFISICAL_ENABLED=false or not set)');
    return {};
  }

  try {
    console.log('🔐 Infisical: Loading secrets for Vite...');
    console.log(`   Site: ${config.siteUrl}`);
    console.log(`   Environment: ${config.environment}`);
    console.log(`   Project: ${config.projectId}`);

    // Authenticate
    console.log('   🔑 Authenticating with Universal Auth...');
    const accessToken = await getAccessToken(config);
    console.log('   ✅ Authentication successful');

    // Load secrets from /workspace and /admin folders
    const workspaceSecrets = await fetchSecretsFromPath(accessToken, config, '/workspace');
    console.log(`   ✅ Loaded ${Object.keys(workspaceSecrets).length} secrets from /workspace`);

    const adminSecrets = await fetchSecretsFromPath(accessToken, config, '/admin');
    console.log(`   ✅ Loaded ${Object.keys(adminSecrets).length} secrets from /admin`);

    // Merge secrets (admin overrides workspace)
    const allSecrets = { ...workspaceSecrets, ...adminSecrets };

    // Filter to only VITE_ prefixed secrets (for browser exposure)
    const viteSecrets = Object.entries(allSecrets)
      .filter(([key]) => key.startsWith('VITE_'))
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

    console.log(`   🎯 Filtered to ${Object.keys(viteSecrets).length} VITE_* secrets for browser`);

    // Convert to Vite define format
    const defineObject = Object.entries(viteSecrets).reduce((acc, [key, value]) => {
      acc[`import.meta.env.${key}`] = JSON.stringify(value);
      return acc;
    }, {} as Record<string, string>);

    console.log(`   🎉 Total: ${Object.keys(defineObject).length} secrets loaded from Infisical\n`);

    return defineObject;
  } catch (error) {
    console.error('❌ Infisical: Failed to load secrets');
    console.error('   Error:', error instanceof Error ? error.message : String(error));
    console.error('   ⚠️  Falling back to local environment variables');
    console.error('   ℹ️  Vite will use VITE_* variables from .env files\n');
    
    // Return empty object - Vite will use .env files as fallback
    return {};
  }
}
