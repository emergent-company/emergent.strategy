export function authHeader(scopeVariant: 'default' | 'none' | 'all' = 'default', userSuffix?: string): Record<string, string> {
    let token = 'with-scope';
    if (scopeVariant === 'none') token = 'no-scope';
    if (scopeVariant === 'all') {
        token = userSuffix ? `e2e-${userSuffix}` : 'e2e-all';
    }
    return { Authorization: `Bearer ${token}` };
}
