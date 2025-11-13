# pnpm Migration - Quick Summary

## What We're Doing

Migrating from npm to pnpm for better performance, stricter dependencies, and improved monorepo support.

## Why pnpm?

- ⚡ **2-3x faster** installs
- 💾 **60% less** disk space
- 🔒 **Stricter** dependency resolution (catches phantom dependencies)
- 🏗️ **Better monorepo** support
- ✅ **Production ready** (Microsoft, Prisma, Vue, Vite use it)

## Time Estimate

**Total**: 2-4 hours

| Phase | Time | What |
|-------|------|------|
| 1. Preparation | 20min | Install pnpm, create workspace config, test |
| 2. Local Scripts | 30min | Update package.json scripts (npm → pnpm) |
| 3. Docker Builds | 45min | Update Dockerfiles, test builds |
| 4. CI/CD | 30min | Update GitHub Actions workflows |
| 5. Documentation | 30min | Update README, guides, instructions |
| 6. Execution | 15min | Run migration, verify everything works |
| 7. Cleanup | 15min | Remove npm artifacts, update .gitignore |
| 8. Team Onboarding | Ongoing | Notify team, help with issues |

## Files That Need Changes

### Critical (Must change)
- [ ] `pnpm-workspace.yaml` (NEW - workspace config)
- [ ] `package.json` (root - add packageManager field, update scripts)
- [ ] `apps/admin/Dockerfile` (install pnpm, replace npm ci)
- [ ] `apps/server/Dockerfile` (install pnpm, replace npm ci)
- [ ] `.github/workflows/admin-e2e.yml` (add pnpm setup, replace npm ci)

### Important (Should change)
- [ ] `apps/server/package.json` (update scripts)
- [ ] `apps/admin/package.json` (update scripts)
- [ ] `apps/server/project.json` (update Nx commands)
- [ ] `README.md` (installation instructions)
- [ ] `QUICK_START_DEV.md` (command examples)
- [ ] `.github/copilot-instructions.md` (document pnpm usage)

### Nice to have (Can update later)
- [ ] `docs/**/*.md` (update command examples)
- [ ] `AGENTS.md` (update build instructions)
- [ ] `docs/guides/MIGRATIONS_QUICKREF.md`

## Key Command Changes

| npm | pnpm |
|-----|------|
| `npm install` | `pnpm install` |
| `npm ci` | `pnpm install --frozen-lockfile` |
| `npm run build` | `pnpm run build` or `pnpm build` |
| `npm --prefix apps/admin run build` | `pnpm --filter admin run build` |
| `npm --prefix apps/server test` | `pnpm --filter server test` |

## Quick Start (After Migration)

### For Developers

```bash
# 1. Install pnpm
npm install -g pnpm
# or
corepack enable

# 2. Remove old npm files
rm -rf node_modules apps/*/node_modules package-lock.json

# 3. Install with pnpm
pnpm install

# 4. Use pnpm commands (same as before, just replace npm with pnpm)
pnpm run workspace:start
pnpm run build
pnpm test
```

### For CI/CD

GitHub Actions needs one extra step:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 9
```

## Risk Assessment

**Risk Level**: 🟡 Medium

**Mitigation**:
- ✅ Create backup branch before migration
- ✅ Keep package-lock.json for 1-2 weeks (rollback option)
- ✅ Test Docker builds locally before pushing
- ✅ Run full test suite before committing

**Rollback Plan**: Simple - `git checkout backup/before-pnpm-migration`

## Expected Results

### Before (npm)
- Fresh install: ~60s
- Cached install: ~30s
- CI build time: ~8min
- node_modules size: 1.2GB (3 workspaces)

### After (pnpm)
- Fresh install: ~25s ⚡ **2.4x faster**
- Cached install: ~8s ⚡ **3.75x faster**
- CI build time: ~6.5min ⚡ **20% faster**
- node_modules size: 450MB 💾 **62% less**

## Checklist (Quick Reference)

### Pre-Migration
- [ ] Review full plan: `docs/PNPM_MIGRATION_PLAN.md`
- [ ] Create backup branch: `git checkout -b backup/before-pnpm-migration`
- [ ] Notify team about migration
- [ ] Schedule low-traffic time window

### Migration Steps
- [ ] Install pnpm: `npm install -g pnpm`
- [ ] Create `pnpm-workspace.yaml`
- [ ] Add packageManager to `package.json`
- [ ] Test: `pnpm install && pnpm run build`
- [ ] Update all scripts (Phase 2)
- [ ] Update Dockerfiles (Phase 3)
- [ ] Update CI/CD (Phase 4)
- [ ] Update docs (Phase 5)
- [ ] Commit everything: `git commit -m "feat: migrate to pnpm"`

### Post-Migration
- [ ] Run full test suite
- [ ] Test Docker builds
- [ ] Push and monitor CI/CD
- [ ] Help team with setup
- [ ] After 1-2 weeks: remove package-lock.json

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "pnpm: command not found" | `npm install -g pnpm` or `corepack enable` |
| "Cannot find module" | `rm -rf node_modules && pnpm install` |
| Docker build fails | Ensure Corepack enabled in Dockerfile |
| CI fails | Check `pnpm/action-setup@v4` added to workflow |
| Lockfile out of date | `pnpm install` to update |

## Resources

- **Full Plan**: `docs/PNPM_MIGRATION_PLAN.md` (comprehensive step-by-step guide)
- **pnpm Docs**: https://pnpm.io/
- **GitHub Action**: https://github.com/pnpm/action-setup
- **Feature Comparison**: https://pnpm.io/feature-comparison

## Questions?

See the full migration plan for:
- Detailed Dockerfile changes
- Complete script replacement lists
- Performance benchmarks
- FAQ section
- Rollback procedures

---

**Status**: 📋 Plan ready for review  
**Next**: Review plan → Schedule migration → Execute
