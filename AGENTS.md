<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

<!-- AGENTS.md - Instructions for AI coding agents -->

# Build, Lint, and Test

- **Build:** `npm run build`
- **Lint:** `nx run admin:lint`
- **Test:**
  - `nx run admin:test`
  - `nx run server:test`
  - `nx run server:test-e2e`
- **Run a single test:** `nx test admin --testFile=path/to/your/test-file.spec.ts`

# Code Style Guidelines

- **Formatting:** We use Prettier with `singleQuote: true`. Run `npx prettier --write .` to format.
- **Imports:** Use ES6 module imports.
- **Types:** Use TypeScript for static typing.
- **Naming Conventions:** Follow standard TypeScript naming conventions (e.g., `camelCase` for variables and functions, `PascalCase` for classes and interfaces).
- **Error Handling:** Handle errors gracefully and provide meaningful error messages.
- **General:** Adhere to the existing code style and conventions in the repository.

# Nx Monorepo

- Use `nx` to run tasks on projects (e.g., `nx build admin`).
- Refer to `.github/copilot-instructions.md` for more on workspace interaction.


<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors


<!-- nx configuration end-->