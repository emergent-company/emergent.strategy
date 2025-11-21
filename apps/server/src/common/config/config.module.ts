import { Global, Module } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs';
import dotenv from 'dotenv';
import { AppConfigService } from './config.service';
import { EnvVariables, validate } from './config.schema';

// Load environment variables in layered order (root then app overrides) so that
// starting the monorepo from the repository root still picks up `apps/server/.env`.
// This runs once on module import and is idempotent relative to already loaded keys.
(() => {
  const cwd = process.cwd();

  // Detect monorepo root vs app directory execution.
  const isMonorepoRoot = fs.existsSync(
    path.join(cwd, 'apps', 'server', 'package.json')
  );

  // Compose candidate paths in LOW -> HIGH precedence order.
  // Later files override earlier ones (mirroring common .env layering conventions).
  const candidatePaths: string[] = [];

  // 1. Root .env (if running from root or app dir's parent)
  if (isMonorepoRoot) {
    candidatePaths.push(path.join(cwd, '.env'));
    candidatePaths.push(path.join(cwd, '.env.local'));
    // 2. App specific .env inside monorepo
    candidatePaths.push(path.join(cwd, 'apps', 'server', '.env'));
    candidatePaths.push(path.join(cwd, 'apps', 'server', '.env.local'));
  } else {
    // Running inside the app directory itself
    candidatePaths.push(path.join(cwd, '.env'));
    candidatePaths.push(path.join(cwd, '.env.local'));
    // Fallback to parent root (monorepo) if present
    candidatePaths.push(path.join(cwd, '..', '.env'));
    candidatePaths.push(path.join(cwd, '..', '.env.local'));
  }

  const loaded: string[] = [];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      console.log(`[DEBUG] Loading env from: ${p}`);
      console.log(
        `[DEBUG] GCP_PROJECT_ID before loading: ${process.env.GCP_PROJECT_ID}`
      );
      // Use override: true to ensure .env files take precedence
      dotenv.config({ path: p, override: true });
      console.log(
        `[DEBUG] GCP_PROJECT_ID after loading: ${process.env.GCP_PROJECT_ID}`
      );
      loaded.push(p);
    }
  }

  if (process.env.DEBUG_ENV_LOAD === '1') {
    // eslint-disable-next-line no-console
    console.log('[config] Loaded env files (in order):', loaded.join(', '));
  }
})();

const envProvider = {
  provide: EnvVariables,
  useFactory: (): EnvVariables => {
    // Load process.env directly (dotenv already loaded at root if needed)
    console.log(
      '[DEBUG] process.env.GCP_PROJECT_ID at validate:',
      process.env.GCP_PROJECT_ID
    );
    console.log(
      '[DEBUG] process.env.VERTEX_AI_PROJECT_ID at validate:',
      process.env.VERTEX_AI_PROJECT_ID
    );
    return validate(process.env as Record<string, unknown>);
  },
};

@Global()
@Module({
  providers: [envProvider, AppConfigService],
  exports: [AppConfigService, EnvVariables],
})
export class AppConfigModule {}
