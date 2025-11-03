# Zitadel Token Delegation/Impersonation Setup Guide

This guide explains how to enable OIDC token delegation (impersonation) in Zitadel to match the working setup in huma-blueprint-ui.

## Understanding the Error

The error message:
```
level=ERROR msg="request error" status_code=500 
oidc_error.parent="...delegation not allowed, issuer and sub must be identical"
```

This occurs when:
1. An application attempts to exchange one user's token for another user's token
2. Zitadel's security policy rejects this because delegation/impersonation is not configured
3. The default rule is: you can only get tokens for yourself (issuer === subject)

## When Do You Need Token Delegation?

Token delegation (RFC 8693) is needed when:
- **Admin users** need to perform actions **on behalf of other users**
- Service accounts need to act as specific users
- Multi-tenant systems where admins manage user resources
- Customer support scenarios where staff need to "see as the user sees"

## Zitadel Configuration Steps

### 1. Enable Token Exchange in Your Application

In the Zitadel Console:

1. Navigate to **Projects** → Your Project → **Applications**
2. Click on your application (e.g., "Admin SPA")
3. Go to **Token Settings** or **Advanced Settings**
4. Enable **Token Exchange** grant type
5. **Save** changes

### 2. Configure Delegation Policy

For each user who should be allowed to impersonate others:

1. Navigate to **Users** in Zitadel Console
2. Find the admin user who needs impersonation rights
3. Go to **Permissions** or **Delegation** tab
4. Click **Add Delegation Permission**
5. Configure:
   - **Target User/Pattern**: Specific users or `*` for all users
   - **Scope**: What the impersonator can do
   - **Project**: Your project ID
6. **Save**

### 3. Create a Service Account with Delegation Rights

For backend services that need to impersonate users:

1. **Projects** → Your Project → **Service Accounts**
2. Click **New Service Account**
3. Name: `impersonation-service` (or similar)
4. Grant **Delegation** permissions
5. Download the **JSON key file** (contains private key)
6. Store securely in environment variable

### 4. Backend Implementation - Token Exchange

Add token exchange capability to your backend:

```typescript
// apps/server-nest/src/modules/auth/token-exchange.service.ts

import { Injectable, Logger } from '@nestjs/common';

export interface TokenExchangeRequest {
    subjectToken: string;        // Current user's token
    subjectTokenType: string;    // 'urn:ietf:params:oauth:token-type:access_token'
    actorToken?: string;         // Admin's token (who is performing the impersonation)
    actorTokenType?: string;     // Same as subject
    requestedTokenType: string;  // 'urn:ietf:params:oauth:token-type:access_token'
    audience?: string;
    scope?: string;
}

@Injectable()
export class TokenExchangeService {
    private readonly logger = new Logger(TokenExchangeService.name);
    private readonly tokenEndpoint: string;
    private readonly clientId: string;

    constructor() {
        const domain = process.env.ZITADEL_DOMAIN;
        this.tokenEndpoint = `https://${domain}/oauth/v2/token`;
        this.clientId = process.env.ZITADEL_CLIENT_ID || '';
    }

    /**
     * Exchange token using RFC 8693 Token Exchange
     * 
     * @param request - Token exchange parameters
     * @returns New access token for target user
     */
    async exchangeToken(request: TokenExchangeRequest): Promise<string> {
        const params = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token: request.subjectToken,
            subject_token_type: request.subjectTokenType,
            requested_token_type: request.requestedTokenType,
            client_id: this.clientId,
        });

        if (request.actorToken) {
            params.set('actor_token', request.actorToken);
            params.set('actor_token_type', request.actorTokenType || request.subjectTokenType);
        }

        if (request.audience) {
            params.set('audience', request.audience);
        }

        if (request.scope) {
            params.set('scope', request.scope);
        }

        try {
            this.logger.log('Requesting token exchange...');
            const response = await fetch(this.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`Token exchange failed (${response.status}): ${errorText}`);
                throw new Error(`Token exchange failed: ${response.status}`);
            }

            const data = await response.json();
            this.logger.log('Token exchange successful');
            return data.access_token;
        } catch (error) {
            this.logger.error(`Token exchange error: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Impersonate user - admin acting as another user
     * 
     * @param adminToken - Admin's access token
     * @param targetUserId - User to impersonate (sub claim)
     * @param scope - Requested scopes
     * @returns Token that represents target user
     */
    async impersonateUser(
        adminToken: string,
        targetUserId: string,
        scope?: string
    ): Promise<string> {
        // For impersonation, you typically need to:
        // 1. Verify admin has impersonation rights (check permissions)
        // 2. Create a token exchange request
        // 3. The actor_token is the admin's token
        // 4. The subject_token can be a placeholder or service token for the target user

        // Note: Implementation depends on your Zitadel setup
        // Some setups require getting a "subject token" for the target user first
        // using service account credentials

        throw new Error('Not yet implemented - requires service account integration');
    }
}
```

### 5. Frontend Implementation - Impersonation Button

Add UI to trigger impersonation:

```typescript
// apps/admin/src/components/ImpersonateUserButton.tsx

import { useState } from 'react';
import { useAuth } from '@/contexts/auth';

interface ImpersonateButtonProps {
    targetUserId: string;
    targetUserName: string;
}

export function ImpersonateUserButton({ targetUserId, targetUserName }: ImpersonateButtonProps) {
    const { getAccessToken } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleImpersonate = async () => {
        setLoading(true);
        setError(null);

        try {
            const adminToken = getAccessToken();
            if (!adminToken) {
                throw new Error('Not authenticated');
            }

            // Call backend endpoint that performs token exchange
            const response = await fetch('/api/auth/impersonate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`,
                },
                body: JSON.stringify({
                    target_user_id: targetUserId,
                }),
            });

            if (!response.ok) {
                throw new Error('Impersonation failed');
            }

            const { access_token } = await response.json();

            // Store impersonation state
            sessionStorage.setItem('impersonation_token', access_token);
            sessionStorage.setItem('impersonation_user', targetUserName);
            sessionStorage.setItem('original_token', adminToken);

            // Reload to use new token
            window.location.reload();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <button
                onClick={handleImpersonate}
                disabled={loading}
                className="btn btn-warning btn-sm"
            >
                {loading ? 'Impersonating...' : `Act as ${targetUserName}`}
            </button>
            {error && (
                <div className="alert alert-error mt-2">
                    {error}
                </div>
            )}
        </div>
    );
}
```

### 6. Backend Endpoint for Impersonation

```typescript
// apps/server-nest/src/modules/auth/auth.controller.ts

import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { TokenExchangeService } from './token-exchange.service';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly tokenExchangeService: TokenExchangeService
    ) {}

    @Post('impersonate')
    @UseGuards(AuthGuard)
    async impersonate(
        @Req() req: Request,
        @Body() body: { target_user_id: string; scope?: string }
    ) {
        // Extract admin token from request
        const adminToken = req.headers.authorization?.replace('Bearer ', '');
        if (!adminToken) {
            throw new Error('No authorization token');
        }

        // Check if user has impersonation permission
        // (You'll need to implement this based on your permission system)
        const user = (req as any).user;
        const hasPermission = await this.checkImpersonationPermission(user);
        if (!hasPermission) {
            throw new Error('Insufficient permissions for impersonation');
        }

        // Perform token exchange
        const impersonatedToken = await this.tokenExchangeService.impersonateUser(
            adminToken,
            body.target_user_id,
            body.scope
        );

        return {
            access_token: impersonatedToken,
            token_type: 'Bearer',
        };
    }

    private async checkImpersonationPermission(user: any): Promise<boolean> {
        // Implement your permission check logic
        // For example, check if user has 'admin' role or specific permission
        return user?.roles?.includes('admin') || false;
    }
}
```

## Environment Variables

Add to your `.env`:

```bash
# Zitadel Token Exchange Configuration
ZITADEL_DOMAIN=localhost:8080
ZITADEL_CLIENT_ID=your_client_id
ZITADEL_ENABLE_TOKEN_EXCHANGE=true

# Service Account for Impersonation (if using backend delegation)
ZITADEL_SERVICE_ACCOUNT_KEY_ID=your_key_id
ZITADEL_SERVICE_ACCOUNT_KEY=your_private_key_here
```

## Security Considerations

### 1. Audit Logging
Always log impersonation events:

```typescript
this.logger.log(`User ${adminUserId} impersonated ${targetUserId} at ${new Date().toISOString()}`);
```

### 2. Limited Scope
Request minimal scopes during impersonation:

```typescript
const scope = 'openid profile email'; // Don't include admin scopes
```

### 3. Time Limits
Set short expiration on impersonation tokens:

```typescript
// Request tokens with 1-hour expiration
params.set('expires_in', '3600');
```

### 4. Visual Indicators
Show clear UI when in impersonation mode:

```tsx
{isImpersonating && (
    <div className="alert alert-warning">
        <Icon icon="lucide--user-shield" />
        <span>Acting as: {impersonatedUserName}</span>
        <button onClick={exitImpersonation}>Exit Impersonation</button>
    </div>
)}
```

### 5. Permission Checks
Always verify admin has permission before allowing impersonation:

```typescript
// In Zitadel, create a custom permission/role
const IMPERSONATION_PERMISSION = 'zitadel.user.impersonate';

async canImpersonate(userId: string): Promise<boolean> {
    const userGrants = await this.zitadelService.getUserGrants(userId);
    return userGrants.some(grant => 
        grant.roles.includes(IMPERSONATION_PERMISSION)
    );
}
```

## Testing Token Exchange

### Test with curl:

```bash
# Get admin token first
ADMIN_TOKEN="your_admin_token_here"
TARGET_USER="target_user_id_here"

# Attempt token exchange
curl -X POST "https://localhost:8080/oauth/v2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=${ADMIN_TOKEN}" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "client_id=your_client_id" \
  -d "audience=your_audience"
```

Expected success response:
```json
{
  "access_token": "new_token_here",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Expected error (if not configured):
```json
{
  "error": "invalid_request",
  "error_description": "delegation not allowed, issuer and sub must be identical"
}
```

## Comparison with Standard Flow

### Standard OIDC Flow (Current):
```
User → Login → Zitadel → Token (for that user) → Backend
```

### Token Exchange Flow (Impersonation):
```
Admin → Login → Zitadel → Admin Token
  ↓
Admin Token + Target User ID → Zitadel Token Exchange
  ↓
Token (for target user, issued to admin) → Backend (acting as target user)
```

## Alternative: Service Account Pattern

If Zitadel doesn't support user-to-user delegation, use service account pattern:

```typescript
// Backend creates tokens on behalf of users using service account
const serviceToken = await this.zitadelService.getAccessToken(); // Service account token

// Use service account to perform actions for user
// This is NOT the same as getting a user token, but achieves similar result
async function actAsUser(userId: string, action: () => Promise<any>) {
    // Set context to user
    const originalUser = getCurrentUser();
    setCurrentUser({ id: userId });
    
    try {
        return await action();
    } finally {
        setCurrentUser(originalUser);
    }
}
```

## Troubleshooting

### Error: "delegation not allowed"
- **Cause**: Token exchange not enabled or delegation policy not configured
- **Fix**: Follow steps 1-2 above to enable in Zitadel

### Error: "invalid_client"
- **Cause**: Client ID mismatch or client not configured for token exchange
- **Fix**: Verify `ZITADEL_CLIENT_ID` matches application in Zitadel

### Error: "insufficient_scope"
- **Cause**: Admin user lacks required permissions
- **Fix**: Grant delegation permission to admin user in Zitadel

### No error but impersonation doesn't work
- **Cause**: Frontend not using the exchanged token
- **Fix**: Ensure you store and use the new token from exchange response

## Next Steps

1. **Enable token exchange** in your Zitadel application settings
2. **Configure delegation policies** for admin users
3. **Implement backend exchange endpoint** using the code above
4. **Add frontend impersonation UI** where needed (user management, support)
5. **Add audit logging** for all impersonation events
6. **Test thoroughly** in development before deploying to production

## References

- [RFC 8693 - OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [Zitadel Token Exchange Documentation](https://zitadel.com/docs/apis/openidoauth/grant-types#token-exchange)
- [OIDC Impersonation Best Practices](https://openid.net/specs/openid-connect-core-1_0.html)

## Related Files

- `/apps/server-nest/src/modules/auth/auth.service.ts` - Current auth implementation
- `/apps/server-nest/src/modules/auth/zitadel.service.ts` - Zitadel integration
- `/apps/admin/src/auth/oidc.ts` - Frontend OIDC implementation
- `/apps/admin/src/contexts/auth.tsx` - Auth context and token management
