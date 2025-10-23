<!-- AGENTS.md - Instructions for AI coding agents -->

# Build, Lint, and Test

- **Build:** `npm run build`
- **Lint:** `nx run admin:lint`
- **Test:**
  - `nx run admin:test`
  - `nx run server-nest:test`
  - `nx run server-nest:test-e2e`
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
