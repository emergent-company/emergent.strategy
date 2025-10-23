# Zitadel Setup for spec-2 Instance

This guide walks you through setting up OAuth/OIDC authentication for your spec-2 instance.

## Quick Reference

- **Zitadel Console**: http://localhost:8200
- **Login UI**: http://localhost:8201/ui/v2/login
- **Admin UI**: http://localhost:5176
- **API Server**: http://localhost:3002

## Setup Steps

### 1. Access Zitadel Console

Open http://localhost:8200 in your browser.

If this is your first time accessing Zitadel:
- You'll be guided through the initial setup wizard
- Create your first admin account
- Remember these credentials for future access

### 2. Create a Project

1. In the Zitadel Console, navigate to **Projects**
2. Click "**New Project**"
3. Enter a project name (e.g., "Spec Server 2" or "Knowledge Base")
4. Click "**Save**"

### 3. Create the OIDC Application

Inside your project:

1. Click "**New Application**"
2. **Name**: Admin SPA (or your preference)
3. **Type**: Select "**USER AGENT**" (for Single Page Applications with PKCE)
4. Click "**Continue**"

#### Configure Application Settings:

**Redirect URIs** (must match exactly):
```
http://localhost:5176/auth/callback
```

**Post Logout Redirect URIs**:
```
http://localhost:5176/
```

**Allowed Origins (CORS)**:
```
http://localhost:5176
```

**Grant Types** (ensure these are enabled):
- ✅ Authorization Code
- ✅ Refresh Token (optional, for offline access)

**Authentication Method**:
- Select: **PKCE** (Proof Key for Code Exchange)

5. Click "**Save**"

### 4. Copy Client ID

After saving, Zitadel displays the **Client ID** (a long numeric string like `335516384895238147`).

**Copy this Client ID** - you'll need it in the next step.

### 5. Update Configuration Files

#### Update apps/admin/.env.local

Replace `YOUR_NEW_CLIENT_ID_HERE` with the Client ID you copied:

```bash
VITE_ZITADEL_CLIENT_ID=<paste-your-client-id-here>
```

#### Update apps/admin/.env

Do the same in this file:

```bash
VITE_ZITADEL_CLIENT_ID=<paste-your-client-id-here>
```

### 6. Restart Admin Service

After updating the configuration:

```bash
npx pm2 restart admin --update-env
```

Or if you stopped everything:

```bash
npm run workspace:start
```

### 7. Test Authentication

1. Open http://localhost:5176
2. Click "Login"
3. You should be redirected to http://localhost:8200 (Zitadel)
4. Then to http://localhost:8201 (Login UI)
5. After successful login, redirected back to http://localhost:5176/auth/callback
6. Then automatically redirected to http://localhost:5176/admin

If you get "Errors.App.NotFound", verify:
- The Client ID matches exactly what Zitadel shows
- Redirect URIs match exactly (including port 5176)
- The application is enabled in Zitadel

## Troubleshooting

### "Errors.App.NotFound"
- **Cause**: Client ID doesn't exist in Zitadel or is incorrect
- **Solution**: Verify Client ID matches exactly, check application is enabled

### "invalid_redirect_uri"
- **Cause**: Redirect URI doesn't match what's configured in Zitadel
- **Solution**: Ensure redirect URIs match exactly, including port number

### Port Conflicts
- **Cause**: Another application using the same ports
- **Solution**: Verify ports are available:
  ```bash
  lsof -i :5176 -i :8200 -i :8201
  ```

### Clearing Browser Cache
If you see old redirect URLs or stale data:
1. Open browser DevTools (F12)
2. Right-click refresh button → "Empty Cache and Hard Reload"
3. Or clear browser data for localhost

## Configuration Summary

| Component | Port | URL |
|-----------|------|-----|
| PostgreSQL | 5437 | localhost:5437 |
| Zitadel API/Console | 8200 | http://localhost:8200 |
| Zitadel Login UI | 8201 | http://localhost:8201 |
| Admin Frontend | 5176 | http://localhost:5176 |
| API Backend | 3002 | http://localhost:3002 |

## Next Steps

After authentication is working:

1. Create your first organization and project in the Admin UI
2. Test document ingestion
3. Set up integrations (ClickUp, GitHub, etc.)

## References

- Main Setup Guide: [SETUP.md](./SETUP.md)
- Zitadel Documentation: [docker/README-zitadel.md](./docker/README-zitadel.md)
- Development Runbook: [RUNBOOK.md](./RUNBOOK.md)
