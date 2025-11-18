// Central list of routes for smoke coverage. Extend thoughtfully – keep fast, high-value paths.
export const ROUTES: string[] = [
    '/',
    '/landing',
    '/auth/login',
    '/admin/apps/documents',
    '/admin/apps/chunks',
    '/admin/objects',
    '/admin/chat',
    '/admin/profile',
    '/admin/settings/ai/prompts',
];

// Convenience: addRoute for dynamic extension inside a spec (not typical; prefer editing source).
export function addRoute(path: string) { if (!ROUTES.includes(path)) ROUTES.push(path); }