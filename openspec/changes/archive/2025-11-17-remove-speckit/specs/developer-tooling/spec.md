# Developer Tooling Spec Deltas

## REMOVED Requirements

### Requirement: Speckit Command System

**Reason**: Speckit has been superseded by OpenSpec for all spec-driven development workflows. Maintaining two parallel systems creates confusion and unnecessary maintenance burden.

**Migration**: All speckit commands have OpenSpec equivalents:
- `/speckit.specify` → Use OpenSpec proposal creation workflow
- `/speckit.plan` → Create `design.md` in change proposals
- `/speckit.tasks` → Create `tasks.md` in change proposals
- `/speckit.implement` → Follow `tasks.md` checklist
- `/speckit.analyze` → Manual code review + OpenSpec validation
- `/speckit.clarify` → Ask clarifying questions before creating proposal
- `/speckit.checklist` → Use `tasks.md` with checkboxes
- `/speckit.constitution` → Document principles in `openspec/project.md`

#### Scenario: Developer creates new feature specification
- **GIVEN** a developer needs to create a feature specification
- **WHEN** they previously used `/speckit.specify <description>`
- **THEN** they SHALL now use the OpenSpec workflow:
  1. Create proposal in `openspec/changes/<id>/proposal.md`
  2. Create task list in `openspec/changes/<id>/tasks.md`
  3. Create spec deltas in `openspec/changes/<id>/specs/<capability>/spec.md`
  4. Run `openspec validate <id> --strict` before starting implementation

#### Scenario: Developer plans feature implementation
- **GIVEN** a developer needs implementation guidance
- **WHEN** they previously used `/speckit.plan`
- **THEN** they SHALL now create `design.md` in their OpenSpec change proposal
- **AND** include technical decisions, alternatives, and migration plans
- **AND** the design document SHALL follow OpenSpec design.md conventions

#### Scenario: Developer tracks implementation tasks
- **GIVEN** a developer needs to track implementation progress
- **WHEN** they previously used `/speckit.tasks`
- **THEN** they SHALL now create `tasks.md` in their OpenSpec change proposal
- **AND** use markdown checkboxes `- [ ]` to track completion
- **AND** organize tasks sequentially with clear validation criteria

### Requirement: Speckit VSCode Integration

**Reason**: VSCode prompt file recommendations for speckit commands are obsolete after removal of speckit prompt files.

**Migration**: VSCode will continue to work with OpenSpec prompt files in `.github/prompts/openspec-*.prompt.md`.

#### Scenario: AI assistant accesses prompts in VSCode
- **GIVEN** an AI assistant is invoked in VSCode
- **WHEN** prompt files are needed for spec-driven development
- **THEN** the assistant SHALL use OpenSpec prompts:
  - `openspec-proposal.prompt.md` for creating change proposals
  - `openspec-apply.prompt.md` for implementing changes
  - `openspec-archive.prompt.md` for archiving completed changes
- **AND** no speckit prompt files SHALL be available

### Requirement: Speckit Template System

**Reason**: Template files in `.specify/templates/` duplicate OpenSpec's built-in conventions and are no longer maintained.

**Migration**: OpenSpec uses convention-based file structures documented in `openspec/AGENTS.md`.

#### Scenario: Developer needs template for new spec
- **GIVEN** a developer needs to know the format for specifications
- **WHEN** they previously referenced `.specify/templates/spec-template.md`
- **THEN** they SHALL now reference `openspec/AGENTS.md` for spec format conventions
- **AND** use existing change proposals in `openspec/changes/` as examples
- **AND** follow the requirement and scenario format documented in OpenSpec

#### Scenario: Developer needs template for tasks
- **GIVEN** a developer needs to know the format for task lists
- **WHEN** they previously referenced `.specify/templates/tasks-template.md`
- **THEN** they SHALL now reference `openspec/AGENTS.md` for tasks.md conventions
- **AND** use existing change proposals in `openspec/changes/` as examples
- **AND** organize tasks with clear checkboxes, dependencies, and validation criteria

### Requirement: Speckit Shell Scripts

**Reason**: Bash scripts in `.specify/scripts/bash/` implement speckit-specific workflows that are replaced by the `openspec` CLI.

**Migration**: All speckit script functionality is available through `openspec` commands.

#### Scenario: Developer initializes new feature branch
- **GIVEN** a developer wants to start a new feature
- **WHEN** they previously used `.specify/scripts/bash/create-new-feature.sh`
- **THEN** they SHALL now:
  1. Create a git branch with descriptive name
  2. Create change directory: `openspec/changes/<id>/`
  3. Create required files: `proposal.md`, `tasks.md`, spec deltas
  4. Run `openspec validate <id> --strict` to ensure correctness

#### Scenario: Developer validates feature prerequisites
- **GIVEN** a developer wants to check if feature is ready for implementation
- **WHEN** they previously used `.specify/scripts/bash/check-prerequisites.sh`
- **THEN** they SHALL now run `openspec validate <id> --strict`
- **AND** manually verify all tasks in `tasks.md` have clear acceptance criteria
- **AND** ensure proposal.md explains why, what, and impact of the change
