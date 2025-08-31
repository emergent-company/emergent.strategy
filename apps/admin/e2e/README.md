# E2E Tests (Playwright)

Run locally (first time):

- npm run e2e:install
- npm run e2e

Headed UI runner:

- npm run e2e:ui

Against preview build:

- npm run build && npm run preview
- E2E_BASE_URL=http://localhost:4173 npm run e2e

Artifacts (on failure): trace, video, screenshot.
