import process from 'node:process';
import { WorkspaceCliError } from '../errors.js';

/**
 * Validates that a namespace is set and is not an invalid value.
 *
 * Invalid namespaces:
 * - undefined or empty string
 * - 'default' (PM2's default namespace, which causes conflicts)
 * - Strings containing only whitespace
 *
 * @throws {WorkspaceCliError} If namespace is invalid
 */
export function validateNamespace(
  namespace: string | undefined,
  context: string
): asserts namespace is string {
  if (!namespace || namespace.trim() === '') {
    throw new WorkspaceCliError(
      'NAMESPACE_NOT_SET',
      `Namespace is required but not set. Cannot ${context}.`,
      {
        context,
        recommendation:
          'Set NAMESPACE environment variable in your .env file (e.g., NAMESPACE=spec-server-2)',
      }
    );
  }

  if (namespace.toLowerCase() === 'default') {
    throw new WorkspaceCliError(
      'NAMESPACE_INVALID',
      `Namespace cannot be 'default' as this is PM2's default namespace and will cause conflicts.`,
      {
        context,
        namespace,
        recommendation:
          'Set a unique NAMESPACE in your .env file (e.g., NAMESPACE=spec-server-2)',
      }
    );
  }

  // Additional validation: no special characters that could cause issues
  if (!/^[a-zA-Z0-9_-]+$/.test(namespace)) {
    throw new WorkspaceCliError(
      'NAMESPACE_INVALID_FORMAT',
      `Namespace '${namespace}' contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed.`,
      {
        context,
        namespace,
        recommendation:
          'Use only letters, numbers, hyphens, and underscores in NAMESPACE',
      }
    );
  }
}

/**
 * Gets and validates the application namespace from environment.
 *
 * @param context - Description of where this is being called from (for error messages)
 * @returns Validated namespace string
 * @throws {WorkspaceCliError} If namespace is invalid
 */
export function getValidatedApplicationNamespace(context: string): string {
  const namespace = process.env.NAMESPACE;
  validateNamespace(namespace, context);
  return namespace;
}

/**
 * Gets and validates the dependency namespace from environment.
 * Dependency namespace is the application namespace with '-deps' suffix.
 *
 * @param context - Description of where this is being called from (for error messages)
 * @returns Validated dependency namespace string
 * @throws {WorkspaceCliError} If namespace is invalid
 */
export function getValidatedDependencyNamespace(context: string): string {
  const appNamespace = getValidatedApplicationNamespace(context);
  return `${appNamespace}-deps`;
}

/**
 * Validates an ecosystem entry's namespace against the expected namespace.
 * Throws an error if they don't match.
 *
 * @param ecosystemNamespace - Namespace from the ecosystem configuration
 * @param expectedNamespace - Expected namespace value
 * @param processName - Name of the process (for error messages)
 * @param context - Description of the operation being performed
 * @throws {WorkspaceCliError} If namespaces don't match
 */
export function validateEcosystemNamespace(
  ecosystemNamespace: string | undefined,
  expectedNamespace: string,
  processName: string,
  context: string
): void {
  if (!ecosystemNamespace) {
    throw new WorkspaceCliError(
      'ECOSYSTEM_NAMESPACE_MISSING',
      `Process ${processName} has no namespace defined in ecosystem configuration.`,
      {
        context,
        processName,
        expectedNamespace,
        recommendation:
          'Check ecosystem.apps.cjs or ecosystem.dependencies.cjs configuration',
      }
    );
  }

  if (ecosystemNamespace !== expectedNamespace) {
    throw new WorkspaceCliError(
      'ECOSYSTEM_NAMESPACE_MISMATCH',
      `Process ${processName} ecosystem namespace '${ecosystemNamespace}' does not match expected namespace '${expectedNamespace}'.`,
      {
        context,
        processName,
        ecosystemNamespace,
        expectedNamespace,
        recommendation:
          'Ensure NAMESPACE environment variable is set correctly before loading ecosystem files',
      }
    );
  }
}
