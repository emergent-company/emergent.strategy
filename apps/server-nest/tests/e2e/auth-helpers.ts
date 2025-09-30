export function authHeader(scopeVariant: 'default' | 'none' | 'all' | 'graph-read' = 'default', userSuffix?: string): Record<string, string> {
    let token = 'with-scope';
    if (scopeVariant === 'none') token = 'no-scope';
    if (scopeVariant === 'all') {
        token = userSuffix ? `e2e-${userSuffix}` : 'e2e-all';
    }
    if (scopeVariant === 'graph-read') token = 'graph-read';
    return { Authorization: `Bearer ${token}` };
}
