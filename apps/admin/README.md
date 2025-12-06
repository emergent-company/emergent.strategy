## Upgrading Plan

To upgrade your plan, send us your order ID to pouya@daisyui.com.
We will then provide you with a discount code so you won't have to pay the full price.

# Emergent - Admin Dashboard

## Package

Thank you for using Emergent Admin. I hope it's going to be helpful for you.
Please share your feedback by filling out [the form](https://forms.gle/UeX3jgsjFNFcZsq9A)

### Please refer [online documentation](https://nexus.daisyui.com/docs/) for full details

## How to run

### Using NPM

1. Install dependencies

```
npm install
```

2. Run the dev server

```
npm run dev
```

3. Or build and preview:

```
npm run build
npm run preview
```

### Using Yarn

1. Install dependencies

```
yarn
```

2. Run the dev server

```
yarn dev
```

3. Or build and preview:

```
yarn build
yarn preview
```

### Using Bun

1. Install dependencies

```
bun i
```

2. Run the dev server

```
bun run dev
```

3. Or build and preview:

```
bun run build
bun run preview
```

Note: It is compatible with all 3 major package managers (NPM, Yarn & Bun)
We recommended using bun for faster deps installation

## Local Auth (Zitadel) quickstart

Use the shared dev Zitadel stack for OAuth/OIDC during development.

1. Start Zitadel (from repo root):

```bash
docker compose -f docker/docker-compose.yml up -d db zitadel login
open http://localhost:8100/.well-known/openid-configuration
open http://localhost:8101/ui/v2/login
```

2. Configure Admin app issuer

- Copy `apps/admin/.env.example` to `apps/admin/.env` and set the issuer to:
  - `http://localhost:8100`

3. Run Admin app

```bash
npm run dev
```

Notes

- Dev admin account: admin@example.com / admin (password in `docker/zitadel.env`, default `admin12345`). Change before exposing beyond local.
- Troubleshooting and full guide: see `RUNBOOK.md` → "Local Auth (Zitadel)" and `docker/README-zitadel.md`.
