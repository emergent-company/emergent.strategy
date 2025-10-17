#!/usr/bin/env node

/**
 * @fileoverview
 * Legacy wrapper retained for backwards compatibility. Delegates to the
 * workspace CLI logs command and warns users about the new entry point.
 */

console.error('collect-service-logs has been retired. Use the Workspace CLI logging commands (e.g., "nx run workspace-cli:workspace:logs") to gather service output.');
process.exit(1);
