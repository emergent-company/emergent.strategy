/**
 * Vite Plugin: Environment Loader
 *
 * Loads environment variables from .env and .env.local at build time
 * and injects VITE_* vars into the Vite config.
 *
 * Usage:
 *   import { envPlugin } from './vite-env-plugin';
 *
 *   export default defineConfig(async () => {
 *     const secrets = await envPlugin();
 *     return {
 *       plugins: [...],
 *       define: secrets
 *     };
 *   });
 */
export declare function envPlugin(): Promise<Record<string, string>>;
