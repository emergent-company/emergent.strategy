# Implementation Tasks

## 1. Investigation & Verification

- [ ] 1.1 Install dbdocs CLI globally (`npm install -g dbdocs`)
- [ ] 1.2 Test db2dbml extraction from local PostgreSQL database
- [ ] 1.3 Verify pgvector extension columns are captured correctly
- [ ] 1.4 Verify all schemas (kb, public) are included
- [ ] 1.5 Check DBML quality for graph_objects, graph_relationships, template_packs tables
- [ ] 1.6 Test dbdocs validate command on generated DBML
- [ ] 1.7 Document findings, limitations, and recommendations

## 2. Repository Integration

- [ ] 2.1 Create `docs/database/` directory
- [ ] 2.2 Generate initial `docs/database/schema.dbml` from development database
- [ ] 2.3 Enhance DBML with project-level documentation (Project block with Note)
- [ ] 2.4 Add table notes for key entities (graph_objects, graph_relationships, template_packs)
- [ ] 2.5 Update `.gitignore` if needed (typically want to commit DBML files)

## 3. Tooling & Scripts

- [ ] 3.1 Add npm scripts to package.json:
  - [ ] `db:docs:generate` - Extract DBML from database
  - [ ] `db:docs:validate` - Validate DBML syntax
  - [ ] `db:docs:local` - Generate and validate in one step
- [ ] 3.2 Test all npm scripts work correctly
- [ ] 3.3 Update nx.json or relevant configs if needed for workspace integration

## 4. Documentation

- [ ] 4.1 Create `docs/guides/database-documentation.md` with:
  - [ ] Overview of dbdocs and DBML
  - [ ] Local workflow (generation, validation)
  - [ ] DBML enhancement and annotation guide
  - [ ] Troubleshooting section
- [ ] 4.2 Update `docs/technical/DATABASE_MIGRATIONS.md` to mention DBML regeneration after migrations
- [ ] 4.3 Add dbdocs section to `README.md` or `QUICK_START_DEV.md`
- [ ] 4.4 Add dbdocs to project tech stack documentation

## 5. Optional Enhancements (Future Work)

- [ ] 5.1 Add workspace-cli integration (`workspace:db:docs` command)
- [ ] 5.2 Investigate pre-commit hook for DBML validation
- [ ] 5.3 Explore dbdiagram.io integration for visual schema design
- [ ] 5.4 Add DBML drift detection (compare generated vs committed)
- [ ] 5.5 Create TypeScript types generation from DBML (if useful)

## Validation

### Manual Testing

- [ ] Generate DBML from clean database (after migrations)
- [ ] Verify all tables are documented
- [ ] Verify relationships are captured correctly
- [ ] Verify indexes and constraints are included
- [ ] Test dbdocs validate passes without errors
- [ ] Test DBML is readable and understandable

### Documentation Review

- [ ] Verify developer guide is clear and complete
- [ ] Verify examples work as documented
- [ ] Verify security considerations are addressed
- [ ] Get team feedback on proposed workflow

### Code Review

- [ ] Verify npm scripts follow project conventions
- [ ] Verify DBML file location is appropriate
- [ ] Verify git tracking of DBML files is correct
- [ ] Verify no secrets or sensitive data in DBML annotations
