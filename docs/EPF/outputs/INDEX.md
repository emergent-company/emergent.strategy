# EPF Output Generators - Documentation Index

**Quick navigation for AI agents and developers**

---

## 📚 Documentation Hierarchy

### Getting Started
1. **[README.md](./README.md)** - Start here: Overview, directory structure, architecture principles
2. **[QUICK_START.md](./QUICK_START.md)** - 5-minute guide to generating your first output

### Building Generators (v1.0)
3. **[GENERATOR_GUIDE.md](./GENERATOR_GUIDE.md)** - **📖 Complete v1.0 development guide** (39 KB)
   - Mandatory 4-component architecture
   - Component-by-component templates
   - Best practices from skattefunn
   - Testing checklist
   - **Reference this when building NEW generators**

### Enhancing Generators (v2.0)
4. **[GENERATOR_ENHANCEMENTS.md](./GENERATOR_ENHANCEMENTS.md)** - **📍 Single source of truth for v2.0** (70+ KB)
   - Complete v2.0 specification (Phase 0.4, 0.6, 6, 7)
   - Bash implementation examples (NOT Python!)
   - 4-milestone implementation roadmap (8-10 weeks)
   - Testing checklist and success criteria
   - **Reference this when implementing v2.0 features**

### Technical Details
5. **[VALIDATION_README.md](./VALIDATION_README.md)** - Validation system overview
6. **[STRUCTURE.md](./STRUCTURE.md)** - Directory structure reference

---

## 🎯 Quick Answers for AI Agents

### "I want to build a NEW generator"
→ Read: **[GENERATOR_GUIDE.md](./GENERATOR_GUIDE.md)**  
→ Copy: `skattefunn-application/` as template  
→ Mandatory: schema.json, wizard.instructions.md, validator.sh, README.md

### "I want to implement v2.0 enhancements"
→ Read: **[GENERATOR_ENHANCEMENTS.md](./GENERATOR_ENHANCEMENTS.md)**  
→ Start: Milestone 1 (Phase 0.4 in investor-memo)  
→ Examples: Bash code in "Implementation Note" section  
→ Status: v1.0 complete, v2.0 optional enhancement

### "I want to fix a validator"
→ Pattern: Remove `set -e`, collect ALL errors  
→ Reference: `skattefunn-application/validator.sh` (canonical example)  
→ Status: ✅ All validators fixed (2026-01-03)

### "I want to add a README to a generator"
→ Template: `skattefunn-application/README.md`  
→ Include: Quick start, validation layers, common issues, env vars  
→ Status: ✅ All generators have README (2026-01-03)

### "Where is the [X] specification?"

| What | Where |
|------|-------|
| v1.0 architecture | [GENERATOR_GUIDE.md](./GENERATOR_GUIDE.md) |
| v2.0 enhancements | [GENERATOR_ENHANCEMENTS.md](./GENERATOR_ENHANCEMENTS.md) |
| Validation system | [VALIDATION_README.md](./VALIDATION_README.md) |
| Directory structure | [STRUCTURE.md](./STRUCTURE.md) |
| Generator status | [STRUCTURE.md](./STRUCTURE.md) (status table) |
| Bash examples | [GENERATOR_ENHANCEMENTS.md](./GENERATOR_ENHANCEMENTS.md) (Phase 0.4, 0.6, 6) |
| Implementation roadmap | [GENERATOR_ENHANCEMENTS.md](./GENERATOR_ENHANCEMENTS.md) (4 milestones) |
| Testing checklist | [GENERATOR_ENHANCEMENTS.md](./GENERATOR_ENHANCEMENTS.md) (end of roadmap) |

---

## 🗂️ Generator-Specific Documentation

Each generator has its own README.md with quick start, common issues, and environment variables:

- **[context-sheet/README.md](./context-sheet/README.md)** - AI context sheet generator
- **[investor-memo/README.md](./investor-memo/README.md)** - Investor materials generator
- **[skattefunn-application/README.md](./skattefunn-application/README.md)** - SkatteFUNN R&D tax application generator (canonical reference)

---

## 📁 Working Documents (Session Notes)

Historical context and analysis (in `.epf-work/` directory):

- **`generator-standardization-session-2026-01-03.md`** - v1.0 standardization history
  - What we accomplished (README.md added, validators fixed)
  - Current status (all generators at v1.0)
  - Future tasks (v2.0 enhancements)

- **`notebooklm-studio-comparison-2026-01-03.md`** - NotebookLM analysis
  - 10 enhancement categories
  - Feature comparison
  - Inspiration for v2.0

- **`validator-fix-action-plan-2026-01-03.md`** - Validator standardization
  - Remove `set -e` pattern
  - Error collection implementation
  - ✅ Completed (2026-01-03)

**Note:** These are historical context. For current work, use the main documentation files above.

---

## 🎓 Standards Enforced

### Mandatory Components (All Generators)
1. **schema.json** - Input validation
2. **wizard.instructions.md** - Generation logic
3. **validator.sh** - Output validation (must collect ALL errors, no `set -e`)
4. **README.md** - Quick reference with common issues

### Optional Components
5. **template.md** - For outputs with fixed structure (e.g., skattefunn)
6. **Phase 0.0** - For collecting non-EPF input (e.g., skattefunn)
7. **Domain utilities** - e.g., `trim-violations.sh` in skattefunn

### Validator Requirements
- ❌ NEVER use `set -e` (would exit on first error)
- ✅ ALWAYS collect ALL errors across all layers
- ✅ Use error/warning counters
- ✅ Return exit code based on total count
- ✅ Color-coded output (RED errors, YELLOW warnings, GREEN success)

---

## 🔄 Version History

### v2.0.0 (2026-01-03) - Documentation Consolidation
- Created INDEX.md as single navigation point
- Consolidated v2.0 roadmap in GENERATOR_ENHANCEMENTS.md
- Added clear "For Future AI Sessions" sections
- Established single source of truth for each topic

### v1.0.0 (2026-01-03) - Standardization Complete
- All generators have schema + wizard + validator + README
- All validators fixed (removed `set -e`, collect all errors)
- GENERATOR_GUIDE.md created (39 KB)
- GENERATOR_ENHANCEMENTS.md created with bash examples
- Individual READMEs added to all generators

---

## 🚀 For Future AI Sessions

**Start here when continuing work:**

1. Read **[INDEX.md](./INDEX.md)** (this file) - Understand documentation structure
2. Read **[GENERATOR_ENHANCEMENTS.md](./GENERATOR_ENHANCEMENTS.md)** - Complete v2.0 spec
3. Check **`.epf-work/generator-standardization-session-2026-01-03.md`** - Current status
4. Follow **Milestone 1 in GENERATOR_ENHANCEMENTS.md** - Implement Phase 0.4 in investor-memo

**Everything you need is in these 2 files:**
- **GENERATOR_GUIDE.md** (v1.0 architecture)
- **GENERATOR_ENHANCEMENTS.md** (v2.0 enhancements)

No need to search through multiple documents or session notes. These are the authoritative sources.
