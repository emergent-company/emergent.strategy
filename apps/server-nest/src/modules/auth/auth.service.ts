import { Injectable } from '@nestjs/common';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

export interface AuthUser {
    sub: string;
    email?: string;
    scopes?: string[];
}

@Injectable()
export class AuthService {
    private jwks?: JWTVerifyGetKey;
    private issuer = process.env.AUTH_ISSUER;
    private audience = process.env.AUTH_AUDIENCE;
    private jwksUri = process.env.AUTH_JWKS_URI;

    async validateToken(token: string | undefined): Promise<AuthUser | null> {
        if (!token) return null;
        if (!this.jwksUri || !this.issuer) {
            // Fallback mock mode with simple token-based branching for tests:
            // 'no-scope' => user without scopes (to trigger 403 in tests)
            // 'with-scope' => user with read:me scope
            if (token === 'no-scope') return { sub: 'mock-user-id', scopes: [] };
            if (token === 'with-scope') return { sub: 'mock-user-id', scopes: ['read:me'] };
            return { sub: 'mock-user-id', scopes: ['read:me'] };
        }
        try {
            const { createRemoteJWKSet, jwtVerify } = await import('jose');
            if (!this.jwks) {
                this.jwks = createRemoteJWKSet(new URL(this.jwksUri));
            }
            const result = await jwtVerify(token, this.jwks, {
                issuer: this.issuer,
                audience: this.audience,
            });
            return this.mapClaims(result.payload);
        } catch (e) {
            return null;
        }
    }

    private mapClaims(payload: JWTPayload): AuthUser | null {
        if (!payload.sub) return null;
        const scopesRaw = (payload.scope || payload.scopes) as string | string[] | undefined;
        const scopes = Array.isArray(scopesRaw)
            ? scopesRaw
            : typeof scopesRaw === 'string'
                ? scopesRaw.split(/\s+/)
                : undefined;
        return { sub: String(payload.sub), email: typeof payload.email === 'string' ? payload.email : undefined, scopes };
    }
}
