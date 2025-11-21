# Reorganize Environment Variables

## Problem

Environment variables are currently scattered inconsistently across multiple `.env` files:

- Root `.env` contains a mix of workspace, server, and admin variables
- `apps/server/.env` duplicates some root variables and adds server-specific ones
- `apps/admin/.env` contains frontend-specific variables
- No clear separation of concerns makes it difficult to understand which variables affect which applications

This causes:

1. **Confusion** - Developers unsure where to set variables
2. **Duplication** - Same variables in multiple files with potential conflicts
3. **Maintenance burden** - Changes require updating multiple files
4. **Unclear ownership** - Hard to determine if a variable affects server, admin, or both

## Solution

Organize environment variables by moving them to appropriate locations based on actual usage:

**Root `.env`** - Workspace/shared variables used by:

- `tools/workspace-cli` (PM2 process management)
- Bootstrap/provisioning scripts
- Multiple applications

**`apps/server/.env`** - Server-only variables used by:

- NestJS backend application
- Database connections
- LLM/AI services
- Authentication backend configuration

**`apps/admin/.env`** - Admin frontend variables used by:

- React/Vite frontend application
- Frontend authentication (OIDC PKCE)
- API connection settings

## Affected Capabilities

- **environment-configuration** (MODIFIED) - Changes how environment variables are organized and loaded

## Benefits

1. **Clear separation of concerns** - Easy to see which variables affect which application
2. **Reduced duplication** - Each variable has one canonical location
3. **Better maintainability** - Changes only need to happen in one place
4. **Improved developer experience** - Clear documentation of variable scope
5. **Easier deployment** - Clear understanding of what each service needs

## Risks & Mitigation

### Risk: Breaking existing deployments

**Mitigation**:

- Provide migration guide in documentation
- Update all example files (`.env.example`) with clear comments
- Maintain backward compatibility where possible (server can still read root variables as fallback)

### Risk: Developer confusion during transition

**Mitigation**:

- Clear documentation in each `.env.example` file
- Update AGENTS.md and developer guides
- Add validation checks to detect misconfigured variables

## Implementation Approach

1. **Audit phase** - Create comprehensive list of all variables and their actual usage
2. **Documentation phase** - Update all `.env.example` files with proper categorization and comments
3. **Migration phase** - Move variables to appropriate locations
4. **Validation phase** - Test all applications work with new structure
5. **Cleanup phase** - Remove duplicates and update documentation

## Dependencies

None - this is a configuration reorganization that doesn't affect runtime behavior.

## Timeline

- **Audit & planning**: 1 hour
- **Implementation**: 2-3 hours
- **Testing & validation**: 1 hour
- **Documentation updates**: 1 hour

**Total**: ~5-6 hours
