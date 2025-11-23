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
export declare function infisicalPlugin(): Promise<Record<string, string>>;
