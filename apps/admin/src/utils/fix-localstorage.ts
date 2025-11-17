/**
 * Utility to validate and fix localStorage on app startup
 * This runs before React components mount to ensure clean state
 */

export function validateAndFixLocalStorage() {
  try {
    const stored = localStorage.getItem('spec-server');
    if (!stored) return;

    const config = JSON.parse(stored);
    const { activeOrgId, activeProjectId } = config;

    // If we have stored IDs, they might be stale
    // We'll let SetupGuard validate against API, but log for debugging
    if (activeOrgId || activeProjectId) {
      console.log('[localStorage] Found stored IDs:', {
        activeOrgId,
        activeProjectId,
      });
      console.log('[localStorage] Will validate against API and auto-correct if needed');
    }
  } catch (e) {
    console.error('[localStorage] Failed to parse:', e);
    // Clear corrupted localStorage
    localStorage.removeItem('spec-server');
  }
}

/**
 * Force clear org/project from localStorage
 * Useful for testing or when we know they're invalid
 */
export function clearOrgProjectFromLocalStorage() {
  try {
    const stored = localStorage.getItem('spec-server');
    if (!stored) return;

    const config = JSON.parse(stored);
    delete config.activeOrgId;
    delete config.activeOrgName;
    delete config.activeProjectId;
    delete config.activeProjectName;

    localStorage.setItem('spec-server', JSON.stringify(config));
    console.log('[localStorage] Cleared org/project IDs');
  } catch (e) {
    console.error('[localStorage] Failed to clear:', e);
  }
}
