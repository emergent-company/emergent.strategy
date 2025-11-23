/**
 * Infisical Secrets Loader
 * 
 * Loads secrets from Infisical at server startup and injects them into process.env
 * This runs BEFORE any other modules are loaded
 * 
 * Usage:
 *   import { initializeInfisical } from './config/infisical-loader';
 *   await initializeInfisical();
 */

import { config } from 'dotenv';

// Load .env and .env.local files first
config(); // Load .env
config({ path: '.env.local', override: false }); // Load .env.local (don't override .env)

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
 * Load secrets from Infisical folder using access token
 */
async function loadSecretsFromFolder(
  accessToken: string,
  config: InfisicalConfig,
  folderPath: string
): Promise<number> {
  try {
    const url = `${config.siteUrl}/api/v3/secrets/raw?workspaceId=${config.projectId}&environment=${config.environment}&secretPath=${folderPath}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch secrets (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const secrets: InfisicalSecret[] = data.secrets || [];
    let loadedCount = 0;

    for (const secret of secrets) {
      // Only set if not already defined (local .env takes precedence)
      if (!process.env[secret.secretKey]) {
        process.env[secret.secretKey] = secret.secretValue;
        loadedCount++;
      }
    }

    return loadedCount;
  } catch (error: any) {
    console.error(`   ⚠️  Warning: Could not load secrets from ${folderPath}:`, error.message);
    return 0;
  }
}

/**
 * Load secrets from Infisical at startup
 */
async function loadInfisicalSecrets(): Promise<void> {
  const config = getInfisicalConfig();

  if (!config.enabled) {
    console.log('🔐 Infisical: Disabled (using local .env files)');
    return;
  }

  console.log('🔐 Infisical: Loading secrets...');
  console.log(`   Site: ${config.siteUrl}`);
  console.log(`   Environment: ${config.environment}`);
  console.log(`   Project: ${config.projectId}`);

  // Validate required config
  if (!config.clientId || !config.clientSecret) {
    console.error('   ❌ INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET are required');
    console.error('   💡 Falling back to local .env files\n');
    return;
  }

  if (!config.projectId) {
    console.error('   ❌ INFISICAL_PROJECT_ID is required when Infisical is enabled');
    console.error('   💡 Falling back to local .env files\n');
    return;
  }

  try {
    // Step 1: Authenticate and get access token
    console.log('   🔑 Authenticating with Universal Auth...');
    const accessToken = await getAccessToken(config);
    console.log('   ✅ Authentication successful');

    // Step 2: Load secrets from /workspace (shared infrastructure)
    const workspaceCount = await loadSecretsFromFolder(
      accessToken,
      config,
      '/workspace'
    );
    console.log(`   ✅ Loaded ${workspaceCount} secrets from /workspace`);

    // Step 3: Load secrets from /server (server-specific, can override workspace)
    const serverCount = await loadSecretsFromFolder(
      accessToken,
      config,
      '/server'
    );
    console.log(`   ✅ Loaded ${serverCount} secrets from /server`);

    // Step 4: Derive PG* variables from POSTGRES_* for PostgreSQL client tools
    if (process.env.POSTGRES_HOST && !process.env.PGHOST) {
      process.env.PGHOST = process.env.POSTGRES_HOST;
      process.env.PGPORT = process.env.POSTGRES_PORT || '5432';
      process.env.PGUSER = process.env.POSTGRES_USER;
      process.env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
      process.env.PGDATABASE = process.env.POSTGRES_DB;
      console.log('   ✅ Derived PG* variables from POSTGRES_*');
    }

    const totalLoaded = workspaceCount + serverCount;
    console.log(`   🎉 Total: ${totalLoaded} secrets loaded from Infisical\n`);

  } catch (error: any) {
    console.error('   ❌ Failed to load secrets from Infisical:', error.message);
    console.error('   💡 Falling back to local .env files\n');
    // Don't throw - allow fallback to local .env
  }
}

/**
 * Load secrets synchronously using top-level await
 * This must be called at the top level of main.ts before any imports
 */
export async function initializeInfisical(): Promise<void> {
  await loadInfisicalSecrets();
}

// Auto-load if this module is run directly
if (require.main === module) {
  loadInfisicalSecrets().catch((error) => {
    console.error('Fatal error loading Infisical secrets:', error);
    process.exit(1);
  });
}
