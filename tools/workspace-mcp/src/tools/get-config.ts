/**
 * Get Config Tool
 *
 * Returns environment configuration with optional masking.
 */

import { loadAllEnvironmentVariables } from '../workspace-client.js';

export const getConfigSchema = {
  type: 'object' as const,
  properties: {
    category: {
      type: 'string',
      enum: ['database', 'auth', 'ai', 'observability', 'services', 'all'],
      description: 'Configuration category to retrieve (default: all)',
    },
    showSecrets: {
      type: 'boolean',
      description:
        'Show full secret values instead of masked (default: false). Use with caution.',
    },
  },
  required: [],
};

export interface GetConfigInput {
  category?: 'database' | 'auth' | 'ai' | 'observability' | 'services' | 'all';
  showSecrets?: boolean;
}

type CategoryType = 'database' | 'auth' | 'ai' | 'observability' | 'services';

interface ConfigVar {
  key: string;
  category: CategoryType;
  secret: boolean;
  description: string;
}

const CONFIG_VARS: ConfigVar[] = [
  // Database
  {
    key: 'POSTGRES_HOST',
    category: 'database',
    secret: false,
    description: 'Database host',
  },
  {
    key: 'POSTGRES_PORT',
    category: 'database',
    secret: false,
    description: 'Database port',
  },
  {
    key: 'POSTGRES_DB',
    category: 'database',
    secret: false,
    description: 'Database name',
  },
  {
    key: 'POSTGRES_USER',
    category: 'database',
    secret: false,
    description: 'Database user',
  },
  {
    key: 'POSTGRES_PASSWORD',
    category: 'database',
    secret: true,
    description: 'Database password',
  },
  {
    key: 'DATABASE_URL',
    category: 'database',
    secret: true,
    description: 'Full database connection URL',
  },

  // Auth
  {
    key: 'ZITADEL_DOMAIN',
    category: 'auth',
    secret: false,
    description: 'Zitadel domain',
  },
  {
    key: 'ZITADEL_ISSUER',
    category: 'auth',
    secret: false,
    description: 'Zitadel OIDC issuer URL',
  },
  {
    key: 'ZITADEL_PROJECT_ID',
    category: 'auth',
    secret: false,
    description: 'Zitadel project ID',
  },
  {
    key: 'ZITADEL_CLIENT_JWT',
    category: 'auth',
    secret: true,
    description: 'Zitadel client JWT',
  },
  {
    key: 'ZITADEL_API_JWT',
    category: 'auth',
    secret: true,
    description: 'Zitadel API JWT',
  },

  // AI
  {
    key: 'GCP_PROJECT_ID',
    category: 'ai',
    secret: false,
    description: 'Google Cloud project ID',
  },
  {
    key: 'VERTEX_AI_LOCATION',
    category: 'ai',
    secret: false,
    description: 'Vertex AI region',
  },
  {
    key: 'VERTEX_AI_MODEL',
    category: 'ai',
    secret: false,
    description: 'Default Vertex AI model',
  },
  {
    key: 'GOOGLE_API_KEY',
    category: 'ai',
    secret: true,
    description: 'Google API key',
  },
  {
    key: 'GOOGLE_APPLICATION_CREDENTIALS',
    category: 'ai',
    secret: false,
    description: 'Service account credentials path',
  },

  // Observability
  {
    key: 'LANGFUSE_ENABLED',
    category: 'observability',
    secret: false,
    description: 'Langfuse enabled flag',
  },
  {
    key: 'LANGFUSE_HOST',
    category: 'observability',
    secret: false,
    description: 'Langfuse host URL',
  },
  {
    key: 'LANGFUSE_PUBLIC_KEY',
    category: 'observability',
    secret: true,
    description: 'Langfuse public key',
  },
  {
    key: 'LANGFUSE_SECRET_KEY',
    category: 'observability',
    secret: true,
    description: 'Langfuse secret key',
  },
  {
    key: 'LANGSMITH_TRACING',
    category: 'observability',
    secret: false,
    description: 'LangSmith tracing enabled',
  },
  {
    key: 'LANGSMITH_ENDPOINT',
    category: 'observability',
    secret: false,
    description: 'LangSmith API endpoint',
  },
  {
    key: 'LANGSMITH_PROJECT',
    category: 'observability',
    secret: false,
    description: 'LangSmith project name',
  },
  {
    key: 'LANGSMITH_API_KEY',
    category: 'observability',
    secret: true,
    description: 'LangSmith API key',
  },

  // Services
  {
    key: 'ADMIN_PORT',
    category: 'services',
    secret: false,
    description: 'Admin frontend port',
  },
  {
    key: 'SERVER_PORT',
    category: 'services',
    secret: false,
    description: 'Backend server port',
  },
  {
    key: 'SKIP_DOCKER_DEPS',
    category: 'services',
    secret: false,
    description: 'Skip Docker dependencies (remote mode)',
  },
];

function maskValue(value: string): string {
  if (value.length <= 8) return '***';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

export async function getConfigTool(input: GetConfigInput): Promise<string> {
  const { category = 'all', showSecrets = false } = input;

  // Load environment variables
  const envResult = loadAllEnvironmentVariables();

  const lines: string[] = [];
  lines.push('# Workspace Configuration');
  lines.push('');

  // Show loaded env files
  lines.push('## Environment Sources');
  lines.push('');
  if (envResult.loadedFiles.length > 0) {
    lines.push('**Loaded files (in order of priority):**');
    for (const file of envResult.loadedFiles) {
      lines.push(`- ${file}`);
    }
  } else {
    lines.push('*No environment files loaded*');
  }
  if (envResult.errors.length > 0) {
    lines.push('');
    lines.push('**Errors:**');
    for (const err of envResult.errors) {
      lines.push(`- ${err}`);
    }
  }
  lines.push('');

  if (!showSecrets) {
    lines.push(
      '*Secret values are masked. Use `showSecrets: true` to reveal (use with caution).*'
    );
    lines.push('');
  }

  // Group by category
  const categories: CategoryType[] =
    category === 'all'
      ? ['database', 'auth', 'ai', 'observability', 'services']
      : [category as CategoryType];

  for (const cat of categories) {
    const vars = CONFIG_VARS.filter((v) => v.category === cat);
    if (vars.length === 0) continue;

    lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    lines.push('');

    for (const v of vars) {
      const value = process.env[v.key];
      let displayValue: string;

      if (!value) {
        displayValue = '(not set)';
      } else if (v.secret && !showSecrets) {
        displayValue = maskValue(value);
      } else {
        displayValue = value;
      }

      lines.push(`- **${v.key}**: ${displayValue}`);
      lines.push(`  - ${v.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
