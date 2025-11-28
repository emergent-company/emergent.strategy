# Environment Setup Documentation Design

## Context

The project supports four distinct environments with different infrastructure patterns:

1. **Local (developer PC)**: Dependencies in Docker, applications run on host via workspace CLI
2. **Dev**: Dependencies and applications run within dev environment infrastructure
3. **Staging**: Full Docker Compose deployment with staging domains
4. **Production**: Full Docker Compose deployment with production domains and security

The project currently has setup information scattered across multiple files:

- SETUP.md: General setup overview (doesn't distinguish environments)
- QUICK_START_DEV.md: Workspace CLI quick reference (local focus)
- scripts/bootstrap-zitadel-fully-automated.sh: Automated bootstrap script with 1696 lines
- docker-compose.dev.yml: Docker infrastructure configuration (local focus)
- docker-compose.staging.yml: Staging deployment configuration
- docker-compose.yml: Production deployment configuration
- .env.example files: Environment variable templates

Developers and operators face challenges:

- No single source of truth for setup across all four environments
- Unclear which instructions apply to which environment
- Infrastructure differences not clearly documented (Docker on local PC vs full Docker)
- Environment-specific domains and connection strings not clearly explained
- Bootstrap process needs environment-specific guidance (local PAT vs secure remote PAT)
- Troubleshooting guidance doesn't account for environment differences
- Dev environment setup (dependencies within environment) not documented

## Goals / Non-Goals

**Goals:**

- Create comprehensive environment setup guide covering all four environments (local, dev, staging, production)
- Clearly distinguish infrastructure patterns between environments
- Document complete setup workflow for each environment type
- Clarify environment variable configuration with environment-specific domains
- Explain Zitadel bootstrap for all environments with appropriate security
- Provide environment-specific troubleshooting guidance
- Create visual diagrams showing infrastructure differences

**Non-Goals:**

- Modify existing scripts or code (documentation only)
- Create new automation or tooling
- Change bootstrap process or workflow
- Optimize or refactor existing setup mechanisms
- Unify environments (they serve different purposes and have appropriate differences)

## Decisions

### Decision 1: Create New Multi-Environment Capability Specification

**Choice:** Create new `environment-setup` capability specification covering all four environments

**Rationale:**

- Setup workflow is a distinct capability that varies by environment
- Requirements-driven approach ensures completeness across environments
- Scenarios provide concrete examples for each environment type
- Specification can be referenced by both development and operations documentation
- Clear distinction between infrastructure patterns prevents confusion

**Alternatives Considered:**

- Update existing SETUP.md only: Lacks structured requirements and environment distinctions
- Create separate guides per environment: Causes duplication and inconsistency
- Focus only on local development: Doesn't help operators with staging/production
- Scatter documentation across feature docs: Makes finding setup info difficult

### Decision 2: Document Multi-Environment Architecture Explicitly

**Choice:** Create clear requirement distinguishing four environment types and their infrastructure patterns

**Rationale:**

- Critical difference: Local runs dependencies in Docker but apps on host; others vary
- Dev environment uses hosted dependencies (not Docker on local PC)
- Staging/production use full Docker Compose (all services in containers)
- Confusion about where services run causes setup failures
- Environment selection affects which instructions to follow
- Infrastructure patterns determine troubleshooting approaches

**Trade-offs:**

- Adds complexity to documentation
- Requires maintaining separate workflows per environment
- More validation work (test setup on each environment type)
- Benefits: Accurate guidance, fewer setup failures, appropriate security per environment

### Decision 3: Single Comprehensive Guide with Environment Sections

**Choice:** Create single environment setup guide (docs/guides/ENVIRONMENT_SETUP.md) with distinct sections per environment

**Rationale:**

- Overview section helps user choose correct environment workflow
- Common concepts documented once (Zitadel bootstrap, dual SA pattern)
- Environment-specific details clearly separated
- Easier to maintain consistency across environments
- Can cross-reference between environments for comparison
- Better for finding information (one guide vs four separate guides)

**Alternatives Considered:**

- Four separate guides (one per environment): Causes duplication, harder to maintain consistency
- Update existing scattered docs: Doesn't solve fragmentation or environment confusion
- Environment-agnostic guide: Loses critical environment-specific details

### Decision 4: Document Existing Behavior Only

**Choice:** Document the current setup process for all environments without proposing changes

**Rationale:**

- Reduces scope and risk
- Existing process works when followed correctly for each environment
- Changes to process should be separate proposals
- Documentation value is immediate
- Allows team to understand current state before improving

**Trade-offs:**

- May document complexity that could be simplified
- Doesn't address potential bootstrap script improvements
- Some steps may be more manual than ideal
- Different environments have different complexity (accepted trade-off)

### Decision 5: Include Environment-Specific Security Guidance

**Choice:** Document appropriate security practices per environment

**Rationale:**

- Local: Can use .env files, local Docker volumes (development convenience)
- Dev: Shared environment requires some security but not production-grade
- Staging: Should mirror production security for accurate testing
- Production: Requires full security (SSL, secrets management, access controls)
- Security requirements differ by environment purpose
- Documentation guides operators to appropriate practices

**Trade-offs:**

- Adds complexity to guide
- Requires security expertise to validate
- Benefits: Prevents insecure production setups, guides security decisions

## Architecture

### Multi-Environment Infrastructure Patterns

```
LOCAL ENVIRONMENT (Developer PC)
┌─────────────────────────────────────────┐
│           Developer's PC                │
│                                         │
│  ┌─────────────────┐                   │
│  │  Docker Engine  │                   │
│  │  ┌───────────┐  │                   │
│  │  │PostgreSQL │  │                   │
│  │  │ :5432     │  │                   │
│  │  └───────────┘  │                   │
│  │  ┌───────────┐  │                   │
│  │  │ Zitadel   │  │                   │
│  │  │ :8200     │  │                   │
│  │  └───────────┘  │                   │
│  └─────────────────┘                   │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Host Machine (via workspace CLI)│  │
│  │  ┌────────┐      ┌───────┐       │  │
│  │  │ admin  │      │server │       │  │
│  │  │ :5176  │      │ :3002 │       │  │
│  │  └────────┘      └───────┘       │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
Domain: localhost

DEV ENVIRONMENT (Shared Dev Infrastructure)
┌─────────────────────────────────────────┐
│      Dev Environment Infrastructure     │
│                                         │
│  ┌───────────┐  ┌────────┐  ┌───────┐  │
│  │PostgreSQL │  │ admin  │  │server │  │
│  │(hosted)   │  │(hosted)│  │(hosted)│  │
│  └───────────┘  └────────┘  └───────┘  │
│  ┌───────────┐                          │
│  │ Zitadel   │                          │
│  │(hosted)   │                          │
│  └───────────┘                          │
└─────────────────────────────────────────┘
Domain: dev.example.com

STAGING/PRODUCTION (Full Docker Compose)
┌─────────────────────────────────────────┐
│           Server                        │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      Docker Compose Network     │   │
│  │  ┌───────────┐  ┌───────────┐   │   │
│  │  │PostgreSQL │  │  Zitadel  │   │   │
│  │  │ container │  │ container │   │   │
│  │  └───────────┘  └───────────┘   │   │
│  │  ┌───────────┐  ┌───────────┐   │   │
│  │  │   admin   │  │  server   │   │   │
│  │  │ container │  │ container │   │   │
│  │  └───────────┘  └───────────┘   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
Domain: staging.example.com / app.example.com
```

### Documentation Structure

```
docs/guides/ENVIRONMENT_SETUP.md
├── Prerequisites (per environment)
├── Overview: Environment Selection Guide
│   ├── Infrastructure comparison table
│   ├── When to use which environment
│   └── Environment architecture diagrams
├── SECTION 1: Local Environment Setup
│   ├── Prerequisites (Docker, Node.js, optional Infisical)
│   ├── Infrastructure pattern (Docker deps, host apps)
│   ├── Step 1: Start Docker dependencies
│   ├── Step 2: Configure environment (localhost)
│   ├── Step 3: Bootstrap Zitadel (local)
│   ├── Step 4: Start applications (workspace CLI)
│   ├── Step 5: Verify setup
│   └── Troubleshooting (local-specific)
├── SECTION 2: Dev Environment Setup
│   ├── Prerequisites (dev access, Infisical)
│   ├── Infrastructure pattern (hosted dependencies)
│   ├── Step 1: Verify dev dependencies
│   ├── Step 2: Configure environment (dev domains)
│   ├── Step 3: Bootstrap Zitadel (dev)
│   ├── Step 4: Start applications
│   ├── Step 5: Verify setup
│   └── Troubleshooting (dev-specific)
├── SECTION 3: Staging Deployment
│   ├── Prerequisites (server access, Docker Compose, Infisical)
│   ├── Infrastructure pattern (full Docker Compose)
│   ├── Step 1: Bootstrap Zitadel (staging)
│   ├── Step 2: Configure deployment (staging domains, SSL)
│   ├── Step 3: Deploy with Docker Compose
│   ├── Step 4: Verify deployment
│   └── Troubleshooting (staging-specific)
├── SECTION 4: Production Deployment
│   ├── Prerequisites (production access, security requirements)
│   ├── Infrastructure pattern (full Docker Compose + security)
│   ├── Step 1: Bootstrap Zitadel (production)
│   ├── Step 2: Configure deployment (production domains, SSL, secrets)
│   ├── Step 3: Deploy with Docker Compose
│   ├── Step 4: Verify deployment
│   ├── Step 5: Configure monitoring, backups, alerts
│   └── Troubleshooting (production-specific)
├── Bootstrap Script Reference (all environments)
│   ├── Modes: provision, status, verify, test, regenerate
│   ├── Environment parameter (--env)
│   ├── Local usage
│   ├── Dev usage
│   ├── Staging usage
│   └── Production usage
├── Environment Variable Reference
│   ├── Comparison table (local/dev/staging/production)
│   ├── Workspace variables
│   ├── Server variables
│   ├── Admin variables
│   └── Infisical usage per environment
├── Troubleshooting Matrix
│   ├── By issue type (Docker, Zitadel, OAuth, etc.)
│   ├── By environment (local vs dev vs staging vs production)
│   └── Common vs environment-specific issues
└── References
    ├── SETUP.md
    ├── QUICK_START_DEV.md
    ├── RUNBOOK.md
    └── Bootstrap script help
    └── Bootstrap script help
```

### Workflow Sequences by Environment

#### Local Environment (Developer PC)

```
1. Prerequisites Check
   └─> Node.js >= 20.19, Docker, Infisical CLI (recommended)

2. Install Dependencies
   └─> npm install

3. Configure Infisical (recommended)
   └─> infisical login
   └─> Select project and local environment

4. Start Docker Dependencies on Local PC
   └─> npm run workspace:deps:start
   └─> Docker runs: PostgreSQL (localhost:5432), Zitadel (localhost:8200)
   └─> Wait for health checks

5. Bootstrap Zitadel (Local)
   └─> ./scripts/bootstrap-zitadel-fully-automated.sh provision
   └─> Load config from Infisical (env: local) or .env
   └─> Domain: localhost:8200
   └─> PAT: Auto-load from Docker volume or manual entry
   └─> Redirect URIs: localhost:5176, localhost:3002
   └─> Output: bootstrap results to console

6. Update Infisical with Bootstrap Output (Primary Method)
   └─> infisical secrets set ZITADEL_ORG_ID=<value> --env local
   └─> infisical secrets set ZITADEL_PROJECT_ID=<value> --env local
   └─> infisical secrets set ZITADEL_OAUTH_CLIENT_ID=<value> --env local
   └─> OR use Infisical dashboard to update secrets
   └─> FALLBACK: Copy to .env files if Infisical not available

7. Start Applications on Host (workspace CLI)
   └─> npm run workspace:start
   └─> Apps load config from Infisical (or .env fallback)
   └─> admin runs on host :5176, server runs on host :3002
   └─> Wait for health checks

8. Verify Local Setup
   └─> npm run workspace:status
   └─> Check logs for "Dual service account mode active"
   └─> Open http://localhost:5176
   └─> Login with TEST_USER
```

#### Dev Environment

```
1. Prerequisites Check
   └─> Dev environment access, Infisical CLI (required)

2. Install Dependencies
   └─> npm install

3. Configure Infisical for Dev
   └─> infisical login
   └─> Select project and dev environment

4. Verify Dev Dependencies (Hosted)
   └─> PostgreSQL accessible within dev environment
   └─> Zitadel accessible at dev domain (e.g., auth-dev.example.com)
   └─> No Docker on local PC

5. Bootstrap Zitadel (Dev)
   └─> ./scripts/bootstrap-zitadel-fully-automated.sh provision --env dev
   └─> Load config from Infisical (env: dev)
   └─> Domain: auth-dev.example.com
   └─> PAT: Manual entry or secure storage
   └─> Redirect URIs: app-dev.example.com, api-dev.example.com
   └─> Output: dev bootstrap results to console

6. Update Infisical with Bootstrap Output (Required)
   └─> infisical secrets set ZITADEL_ORG_ID=<value> --env dev
   └─> infisical secrets set ZITADEL_PROJECT_ID=<value> --env dev
   └─> infisical secrets set ZITADEL_OAUTH_CLIENT_ID=<value> --env dev
   └─> OR use Infisical dashboard to update secrets

7. Start Applications in Dev Environment
   └─> npm run workspace:start (or dev-specific start command)
   └─> Applications load config from Infisical
   └─> Applications connect to dev dependencies

8. Verify Dev Setup
   └─> npm run workspace:status
   └─> Open https://app-dev.example.com
   └─> Login with dev user
```

#### Staging/Production Deployment

```
1. Prerequisites Check
   └─> Server access, Docker Compose, Infisical CLI (required)
   └─> Production: Additional security requirements

2. Configure Infisical for Staging/Production
   └─> infisical login
   └─> Select project and staging|production environment
   └─> Verify permissions and access controls

3. Bootstrap Zitadel (Staging/Production)
   └─> ./scripts/bootstrap-zitadel-fully-automated.sh provision --env staging|production
   └─> Load config from Infisical (env: staging|production)
   └─> Domain: auth-staging.example.com | auth.example.com
   └─> PAT: Secure storage (not Docker volume)
   └─> Redirect URIs: app-staging.example.com | app.example.com
   └─> Output: staging/production bootstrap results

4. Update Infisical with Bootstrap Output (Required, Secure Workflow)
   └─> infisical secrets set ZITADEL_ORG_ID=<value> --env staging|production
   └─> infisical secrets set ZITADEL_PROJECT_ID=<value> --env staging|production
   └─> infisical secrets set ZITADEL_OAUTH_CLIENT_ID=<value> --env staging|production
   └─> Review and validate all secrets before deployment
   └─> NO .env fallback allowed for staging/production

5. Configure Deployment
   └─> Verify Infisical secrets are complete
   └─> Configure SSL certificates
   └─> Production: Configure secrets rotation policies
   └─> Configure monitoring and logging

6. Deploy with Docker Compose
   └─> docker compose -f docker-compose.staging.yml up -d
   └─> OR: docker compose up -d (production)
   └─> ALL services in containers load config from Infisical
   └─> Wait for all container health checks

7. Verify Deployment
   └─> docker compose ps (check all containers healthy)
   └─> curl https://auth-staging.example.com/debug/healthz
   └─> Open https://app-staging.example.com
   └─> Login with staging/production user
   └─> Production: Verify monitoring, backups, alerts
```

### Bootstrap Script Modes

```
provision:  Full setup (create org, project, apps, SAs, users)
status:     Show current configuration and connectivity
verify:     Comprehensive verification (7 checks)
test:       Automated test suite (10 tests)
regenerate: Regenerate service account JWT keys
```

### Environment Variable Flow by Environment

```
LOCAL ENVIRONMENT:
Infisical (optional, env: local)
  ├─> /workspace → NAMESPACE, ADMIN_PORT, SERVER_PORT, ZITADEL_DOMAIN
  └─> /docker → ZITADEL_EXTERNALDOMAIN, VITE_ZITADEL_ISSUER
       ↓
  Bootstrap Script (localhost:8200)
       ↓
  Output → Copy to .env files
       ↓
  ├─> .env (workspace) → localhost domains
  ├─> apps/server/.env → POSTGRES_HOST=localhost
  └─> apps/admin/.env → localhost redirect URIs
       ↓
  Services Load Config (host + Docker)

DEV ENVIRONMENT:
Infisical (env: dev)
  ├─> /workspace → dev-specific ports/namespace
  └─> /docker → dev domain configuration
       ↓
  Bootstrap Script (auth-dev.example.com)
       ↓
  Output → Copy to .env files
       ↓
  ├─> .env (workspace) → dev domains
  ├─> apps/server/.env → dev PostgreSQL hostname
  └─> apps/admin/.env → dev redirect URIs
       ↓
  Services Load Config (hosted within dev environment)

STAGING/PRODUCTION:
Infisical (env: staging|production)
  ├─> /workspace → staging/production config
  └─> /docker → staging/production domains
       ↓
  Bootstrap Script (auth-staging.example.com | auth.example.com)
       ↓
  Output → Deployment configuration
       ↓
  Docker Compose Environment Variables
       ↓
  ├─> PostgreSQL container
  ├─> Zitadel container
  ├─> Admin container
  └─> Server container
       ↓
  All Services in Docker Network
```

## Risks / Trade-offs

### Risk: Documentation Drift

**Risk:** Documentation becomes outdated as scripts and processes change across environments

**Mitigation:**

- Use specification requirements to track changes
- Update docs alongside code changes for all affected environments
- Add CI checks for broken links/commands
- Review documentation in PR process
- Test setup workflows periodically on each environment

### Risk: Multi-Environment Complexity Overwhelming Users

**Risk:** Guide covering four environments may be too long, confusing, or intimidating

**Mitigation:**

- Start with clear environment selection guide at top
- Use visual diagrams to show infrastructure differences
- Separate each environment into distinct sections
- Include TL;DR for each environment type
- Provide comparison tables for quick reference
- Cross-link common concepts (explained once, referenced elsewhere)
- Make it clear users only need to follow ONE environment section

### Risk: Environment-Specific Issues Not Documented

**Risk:** Setup steps may have environment-specific gotchas not captured in documentation

**Mitigation:**

- Test setup workflow on actual instances of each environment
- Collect feedback from developers and operators
- Document troubleshooting section per environment
- Include environment-specific verification criteria
- Update docs as new issues are discovered

### Risk: Security Guidance Insufficient

**Risk:** Production deployment guidance may not cover all security requirements

**Mitigation:**

- Work with security team to validate production section
- Document security best practices explicitly
- Reference external security documentation
- Require security review before production deployment
- Clearly distinguish development conveniences from production requirements

### Risk: Platform-Specific Issues

**Risk:** Setup steps may differ on macOS/Linux/Windows (especially for local environment)

**Mitigation:**

- Document primarily for macOS/Linux (most common)
- Note Windows-specific differences where relevant
- Recommend WSL for Windows users
- Test on multiple platforms during validation
- Local environment most affected (dev/staging/production are server-based)

## Migration Plan

N/A - Documentation only change, no migration required.

## Open Questions

1. **Should we create a setup verification checklist?**

   - Could provide printable/checkable list of steps
   - May help ensure nothing is missed
   - Decision: Yes, include at end of guide

2. **Should we document remote/production setup?**

   - Current focus is local development only
   - Remote setup involves Coolify, different domains, etc.
   - Decision: No, keep scope to local development. Reference COOLIFY_DEV_SETUP.md for remote

3. **Should we include video/screencast?**

   - Could help visual learners
   - Requires recording and hosting
   - May become outdated quickly
   - Decision: Not in initial version, consider for future

4. **Should we automate verification steps?**
   - Bootstrap script already has verify/test modes
   - Could create additional health check script
   - Decision: Document existing verify/test modes, don't create new automation

## Script and Documentation Audit Approach

### Script Audit Criteria

**Active Scripts** (Document and maintain):

- Used in current documented workflows
- Required for environment setup or daily development
- Referenced by CI/CD or automation
- Examples: `bootstrap-zitadel-fully-automated.sh`, workspace CLI scripts

**Superseded Scripts** (Archive to scripts/archive-old/):

- Replaced by newer versions with improved functionality
- May be historically significant for understanding evolution
- Archive with README explaining what replaced them
- Examples: `bootstrap-zitadel.sh` (superseded by fully-automated version)

**Obsolete Scripts** (Remove after verification):

- No longer applicable to current architecture
- Not referenced by any documentation or code
- Migration complete scripts that are no longer needed
- Remove only after confirming no hidden dependencies

### Documentation Audit Criteria

**Current Documentation** (Keep and reference):

- Valid information for current setup process
- Referenced by other docs or code
- Contains unique content not duplicated elsewhere
- Examples: SETUP.md, QUICK_START_DEV.md, RUNBOOK.md

**Historical Documentation** (Archive to docs/migrations/completed/ or docs/investigations/):

- Migration complete documents (INFISICAL_MIGRATION_COMPLETE.md)
- Investigation findings (ZITADEL_INVESTIGATION_FINDINGS.md)
- Issue resolutions (LOCALSTORAGE_RESOLUTION.md)
- Keep for historical context and learning

**Superseded Documentation** (Consolidate or archive):

- Content replaced by newer, more comprehensive docs
- Multiple quick reference docs that can be consolidated
- Intermediate migration checklists that are no longer needed
- Extract still-relevant content before archiving

**Obsolete Documentation** (Archive or remove):

- No longer applicable to current architecture
- Duplicates information available in other docs
- Outdated information that could cause confusion
- Archive if historically significant, otherwise remove

### Archive Directory Structure

```
docs/
├── migrations/
│   └── completed/
│       ├── README.md (explains historical context)
│       ├── infisical-migration.md
│       ├── organization-id-migration.md
│       └── [other completed migrations]
├── investigations/
│   ├── README.md (explains investigation history)
│   ├── zitadel-investigation.md
│   ├── localstorage-resolution.md
│   └── [other historical investigations]
└── archive/
    ├── README.md (general archive for superseded docs)
    └── [superseded documentation]

scripts/
├── archive-old/
│   ├── README.md (explains what superseded these scripts)
│   ├── bootstrap-zitadel.sh (superseded by fully-automated version)
│   └── [other superseded scripts]
└── [active scripts]
```

### Verification Criteria Design

**Every Setup Step Must Include:**

1. **Expected State/Output**: What should be true after this step
2. **Verification Command**: Specific command to check success
3. **Expected Result**: Exact output or condition to verify
4. **Failure Indicators**: What to look for if step failed
5. **Troubleshooting Link**: Reference to troubleshooting section

**Example Format:**

```markdown
### Step 3: Start Docker Dependencies

1. Run: `npm run workspace:deps:start`
2. Wait for health checks to complete

**Verify Success:**

- Command: `npm run workspace:status`
- Expected: Both `postgres-dependency` and `zitadel-dependency` show "online"
- Expected: Uptime > 0 seconds
- Command: `curl http://localhost:8200/debug/healthz`
- Expected: HTTP 200 response
- If failed: See [Docker Dependency Troubleshooting](#docker-troubleshooting)
```

**Benefits:**

- Enables manual verification during setup
- Provides clear success/failure criteria
- Foundation for future automation scripts
- Helps troubleshoot issues quickly
- Makes setup process more confident and less error-prone
