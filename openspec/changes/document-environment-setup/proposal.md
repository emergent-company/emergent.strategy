# Change: Document Environment Setup Process

**Status:** ✅ IMPLEMENTED (2025-11-24)

## Why

Developers need a clear, step-by-step guide for setting up the development environment from scratch. Currently, setup information is scattered across multiple files (SETUP.md, QUICK_START_DEV.md, bootstrap scripts, docker-compose files) and lacks a single authoritative source that covers the complete workflow including:

- Docker dependencies (PostgreSQL, Zitadel) startup and health checks
- Zitadel bootstrapping (organization, projects, service accounts, OAuth apps, users)
- Environment variable configuration across workspace, server, and admin apps
- Service startup sequence and verification
- Common troubleshooting scenarios

This fragmentation makes onboarding difficult and increases the risk of configuration errors.

## What Changes

- Create a new `environment-setup` capability specification documenting the complete environment setup workflow
- Define clear requirements for setup steps, bootstrapping process, and verification
- Establish patterns for:
  - Dependency startup order and health checks
  - Zitadel bootstrapping with Infisical integration
  - Environment variable management across .env files
  - Service account and OAuth application creation
  - User creation (admin, test, e2e test users)
  - Service startup and health verification
  - Restart procedures after bootstrap

## Impact

- Affected specs: NEW capability `environment-setup`
- Affected code: Documentation only - no code changes
- Improves: Developer onboarding, reduces setup errors, provides troubleshooting guidance
- Documentation files involved:
  - SETUP.md (root)
  - QUICK_START_DEV.md (root)
  - scripts/bootstrap-zitadel-fully-automated.sh
  - docker-compose.dev.yml
  - .env.example files

## Scope

This is a documentation-only change that captures existing setup behavior. It does not modify any code, scripts, or configuration. The goal is to create a single source of truth for the setup process.

## Implementation Summary

**Delivered (2025-11-24):**

1. **Comprehensive Environment Guide** (`docs/guides/ENVIRONMENT_SETUP.md` - 2,280 lines)

   - Multi-environment coverage: local, dev, staging, production
   - Environment-specific architecture patterns and workflows
   - 150+ environment variables documented with environment-specific mappings
   - Infisical configuration guide (154 lines)
   - Troubleshooting guide (245 lines) with environment-specific scenarios

2. **Automation Scripts**

   - `scripts/env-init.sh` - Initialize Infisical from .env.example files
   - `scripts/env-export.sh` - Export Infisical secrets to .env (local fallback)
   - npm scripts added: `env:init`, `env:export`, per-environment variants

3. **Cross-References Updated**
   - README.md - Added environment setup guide link
   - SETUP.md - Referenced comprehensive environment guide
   - QUICK_START_DEV.md - Added environment guide reference
   - RUNBOOK.md - Added environment setup reference

**Key Decisions:**

- Infisical-first workflow for all environments (local has .env fallback)
- Four distinct infrastructure patterns clearly documented
- Post-bootstrap workflow: Bootstrap → Update Infisical → Restart services
- Environment variable organization: /workspace, /docker, /server, /admin paths

**Outcome:** Developers now have a single, authoritative, multi-environment setup guide that covers all scenarios from local development to production deployment.
