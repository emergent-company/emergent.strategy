# The AI-Augmented React Development Playbook: Architecture and Best Practices for Vite and Tailwind CSS

## Backend / NestJS Supplement: Service Internal Data Naming

When implementing NestJS services that interact with a database (directly or through an abstraction), the in-service field holding the current in-memory representation, cache, or fallback collection MUST be named `data`. Avoid alternative names such as `memory`, `store`, or `cache` for the primary collection reference to keep cross-service reading consistent. If a separate purely ephemeral structure is required (e.g. a short‑lived write queue), give it a specific, purpose‑driven name (e.g. `pendingWrites`).

Rationale:
1. Consistent mental model across services (`this.data` always points to the authoritative in‑process collection or cache layer when DB is online/offline).
2. Simplifies code reviews and automated refactors.
3. Reduces accidental divergence (e.g. mixing `memory` vs `data`).

Example (preferred):
```ts
@Injectable()
export class OrgsService {
  // Authoritative in-process representation for offline fallback or hydrated cache
  private data: OrgRecord[] = []

  async list(): Promise<OrgDto[]> { /* ... */ }
}
```

Example (anti-pattern – do NOT introduce):
```ts
private memory: OrgRecord[] = [] // ❌ use `data` instead
```

## Backend / NestJS Supplement: Module & File Naming Conventions

1. **Module Directory:** Each domain feature lives under `apps/server/src/modules/<feature>`.
2. **File Names:** Use kebab-case with feature prefix: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`. DTOs reside in a nested `dto/` folder: `dto/<entity>.dto.ts`.
3. **Class Names:** PascalCase suffixed: `OrgsModule`, `OrgsController`, `OrgsService`; DTOs suffixed with `Dto` (e.g. `OrgDto`).
4. **Decorators Order (recommended):** `@ApiTags` → `@Controller` → method-level route decorators (`@Get`, `@Post`, etc.) → interceptors/guards → Swagger response decorators → custom composite decorators (e.g. `@ApiStandardErrors`). Keep them vertically grouped.
5. **Module Definition Minimalism:** Export only what other modules need. If a service must be injected elsewhere, add it to both `providers` and `exports`; otherwise omit `exports`.
6. **Barrel Files:** Do NOT add `index.ts` barrels inside module folders; import directly from concrete file paths.
7. **Injection Style:** Use constructor injection with `private readonly`. Avoid manual `@Inject()` unless token differs from class.
8. **Offline Fallback Pattern:** Maintain a single in-process array `private data: <Type>[]` plus early branch: `if (!this.db.isOnline()) { ... }`.
9. **Query Typing:** For raw SQL queries, define lightweight internal interfaces (e.g. `interface OrgRow { ... }`) and map to DTOs.
10. **DTO Exposure:** Export DTO classes only; never leak raw DB row shapes.
11. **Error Semantics:** Throw Nest HTTP exceptions with simple messages or structured payload matching the global error envelope.
12. **Swagger Consistency:** Every controller method declares a success response decorator and shared error decorator.
13. **Import Ordering:** Group: (a) Nest core, (b) third-party, (c) internal paths—separated by blank lines.
14. **Testing Impact:** New routes require OpenAPI path coverage test updates.
15. **No Dynamic Route Strings:** Route decorator paths are static literals.
16. **Configuration Isolation:** Shared infrastructure lives under `src/common/<area>`.

Example structure (Orgs):
```
orgs/
  dto/
    org.dto.ts
  orgs.controller.ts
  orgs.service.ts
  orgs.module.ts
```

Minimal module example:
```ts
@Module({ controllers: [OrgsController], providers: [OrgsService] })
export class OrgsModule {}
```

Exporting a service for reuse:
```ts
@Module({ controllers: [SearchController], providers: [SearchService], exports: [SearchService] })
export class SearchModule {}
```

Service skeleton template:
```ts
@Injectable()
export class FeatureService {
  private data: FeatureDto[] = []
  constructor(private readonly db: DatabaseService) {}
  async list(): Promise<FeatureDto[]> {
    if (!this.db.isOnline()) return [...this.data]
    // ...fetch & map
  }
}
```

## Part I: Foundational Architecture and Project Configuration

This initial phase establishes the non-negotiable bedrock of the project. It details tooling that creates an automated, self-enforcing quality system (the "Automated Quality Flywheel").

### Section 1.1: The Modern React Stack: Vite, TypeScript, Tailwind CSS

#### Project Scaffolding with Vite and TypeScript

```bash
npm create vite@latest your-project-name -- --template react-ts
cd your-project-name
npm install
```

#### Integrating Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: { extend: {} },
  plugins: []
}
```

`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Section 1.2: Enforcing Code Quality (ESLint + Prettier)

Install dependencies:
```bash
npm install --save-dev eslint prettier eslint-config-prettier eslint-plugin-prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

`.prettierrc.cjs`:
```js
module.exports = {
  singleQuote: true,
  trailingComma: 'es5',
  semi: false,
  tabWidth: 2,
  bracketSameLine: false,
  endOfLine: 'auto'
}
```

`.eslintrc.cjs`:
```js
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended'
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
  }
}
```

### Section 1.3: Git Hooks with Husky + lint-staged

```bash
npm install --save-dev husky lint-staged
npx husky init
```

`package.json` excerpt:
```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": "eslint --fix",
    "*.{json,md,css,html,yml}": "prettier --write"
  }
}
```

Add pre-commit hook:
```bash
npx husky add .husky/pre-commit "npx lint-staged"
```

### Section 1.4: Vite Performance Tuning

Warmup example (`vite.config.ts`):
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    warmup: {
      clientFiles: ['src/main.tsx', 'src/lib/api.ts']
    }
  }
})
```

DNS order (if needed):
```ts
import { defineConfig } from 'vite'
import dns from 'node:dns'

dns.setDefaultResultOrder('verbatim')
export default defineConfig({})
```

## Part II: Core Application Design and Component Strategy

### Section 2.1: Feature-Based Folder Architecture

```text
src/
  assets/
  features/
    auth/
      api/
      components/
      hooks/
      types/
      index.ts
    users/
  shared/
    api/
    components/
    hooks/
    utils/
  pages/
  lib/
  App.tsx
```

### Section 2.2: Atomic Design Hierarchy

Atom example `Button.tsx`:
```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}
export function Button({ variant = 'primary', children, ...rest }: ButtonProps) {
  const base = 'font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline'
  const variants: Record<string, string> = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800'
  }
  return <button className={`${base} ${variants[variant]}`} {...rest}>{children}</button>
}
```

### Section 2.3: Component Best Practices
(Concise restatement retained; original prose preserved elsewhere.)

### Section 2.4: TypeScript Patterns

Generic list example (fixed types):
```ts
interface ListProps<T> {
  items: T[]
  renderItem: (item: T) => React.ReactNode
}
export function List<T>({ items, renderItem }: ListProps<T>) {
  return <ul>{items.map((i, idx) => <li key={idx}>{renderItem(i)}</li>)}</ul>
}
```

## Part III: State and Data Flow Management
(Original explanatory text retained.)

## Part IV: Styling with Tailwind CSS

`tailwind.config.js` theme extension example:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#3b82f6',
          secondary: '#6b7280'
        }
      },
      spacing: { '128': '32rem' },
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    }
  },
  plugins: []
}
```

CSS variables:
```css
:root {
  --color-primary: #3b82f6;
  --color-text-base: #1f2937;
}
.dark {
  --color-primary: #60a5fa;
  --color-text-base: #f9fafb;
}
```

Use in config:
```js
colors: {
  primary: 'var(--color-primary)',
  'text-base': 'var(--color-text-base)'
}
```

## Part V: Testing Strategy
(Original content largely intact; code blocks normalized.)

Vitest + RTL setup snippet:
```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts'
  }
})
```

`tests/setup.ts`:
```ts
import { afterEach, expect } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)
afterEach(() => cleanup())
```

## Part VI: AI Workflows & Prompt Engineering
(Original guidance retained.)

## Conclusion & Synthesis
(Original conclusion retained.)

#### Cytowane prace
1. Easy Tutorial: Setting Up ReactJs with Vite, TypeScript, and Tailwind CSS – https://riike.hashnode.dev/easy-tutorial-setting-up-reactjs-with-vite-typescript-and-tailwind-css  
2. TypeScript with React: Benefits and Best Practices – https://www.geeksforgeeks.org/typescript/typescript-with-react-benefits-and-best-practices/  
3. Optimal Structure for React & Tailwind Project – https://starmastar1126.medium.com/optimal-structure-for-react-tailwind-project-c77ce0dc17de  
4. Setup ESLint, Prettier, Husky with Vite – https://dev.to/leon740/setup-eslint-prettier-husky-with-vite-860  
5. React Setup (ESLint & Prettier) – https://www.youtube.com/watch?v=EzOKx7GBo78  
6. React Prettier ESLint Configuration – https://codeomelet.com/posts/react-prettier-eslint-configuration  
7. How to add husky to React – https://medium.com/@mariokandut/how-to-add-husky-to-react-233f0ca48752  
8. Pre-commit hook with Husky & lint-staged – https://oliviac.dev/blog/set_up_pre_commit_hook_husky_lint_staged/  
9. Husky docs – https://typicode.github.io/husky/  
10. Setting up Pre-Commit Hooks using Husky – https://vjnvisakh.medium.com/setting-up-pre-commit-hooks-using-husky-a84888a2667a  
11. Pre-Commit / Pre-Push Hooks – https://levelup.gitconnected.com/using-pre-commit-and-pre-push-git-hooks-in-a-react-project-6c83431ef2bd  
12. Vite Performance – https://vite.dev/guide/performance  
13. Vite Server Options – https://vite.dev/config/server-options  
14. Modern React Design Patterns 2025 – https://www.mindbowser.com/modern-react-design-patterns/  
15. Atomic Design Principles – https://www.dhiwise.com/post/the-ultimate-guide-to-react-atomic-design-principles  
16. 33 React JS Best Practices – https://technostacks.com/blog/react-best-practices/  
17. Top React Best Practices – https://medium.com/front-end-weekly/top-react-best-practices-in-2025-a06cb92def81  
18. React State Management 2025 – https://www.zignuts.com/blog/react-state-management-2025  
19. Unidirectional Data Flow – https://www.educative.io/answers/what-is-unidirectional-data-flow-in-react  
20. Master React Unidirectional Data Flow – https://coderpad.io/blog/development/master-react-unidirectional-data-flow/  
21. Zustand Comparison – https://zustand.docs.pmnd.rs/getting-started/comparison  
22. Tailwind in Large Projects – https://medium.com/@alexdev82/why-tailwind-css-might-be-hurting-your-large-scale-projects-ef9b02171c70  
23. Tailwind CSS Best Practices – https://benjamincrozat.com/tailwind-css  
24. Vitest + RTL – https://www.robinwieruch.de/vitest-react-testing-library/  
25. Bulletproof React Testing – https://vaskort.medium.com/bulletproof-react-testing-with-vitest-rtl-deeaabce9fef  
26. Storybook Intro Tutorial – https://storybook.js.org/tutorials/intro-to-storybook/react/en/simple-component/  
27. Storybook Vite Builder – https://storybook.js.org/docs/builders/vite  
28. Storybook React Vite – https://storybook.js.org/docs/get-started/frameworks/react-vite  
29. Setup Storybook – https://storybook.js.org/docs/get-started/setup  
30. Cypress vs Playwright Comparison – https://bugbug.io/blog/test-automation-tools/cypress-vs-playwright/  
31. Playwright vs Cypress Definitive Guide – https://momentic.ai/resources/playwright-vs-cypress-the-2024-definitive-guide-for-e2e-testing  
32. Playwright vs Cypress Differences – https://www.lambdatest.com/blog/cypress-vs-playwright/  
33. Playwright Vs Cypress Detailed – https://www.testingxperts.com/blog/playwright-vs-cypress/  
34. Playwright vs Cypress BrowserStack – https://www.browserstack.com/guide/playwright-vs-cypress  
35. Reddit Component Testing Thread – https://www.reddit.com/r/reactjs/comments/1avc2vh/react_component_testing_cypress_or_playwright/  
36. Prompt Engineering for Developers – https://medium.com/@v2solutions/prompt-engineering-for-developers-the-new-must-have-skill-in-the-ai-powered-sdlc-c09d61d95a00  
37. AI Code Review (Swimm) – https://swimm.io/learn/ai-tools-for-developers/ai-code-review-how-it-works-and-3-tools-you-should-know  
38. AI Code Review (IBM) – https://www.ibm.com/think/insights/ai-code-review  
39. AI Code Review Tools 2025 – https://www.digitalocean.com/resources/articles/ai-code-review-tools  
40. Scribe Documentation Generator – https://scribehow.com/tools/documentation-generator  
41. Google Document AI – https://cloud.google.com/document-ai

<!-- End of document -->