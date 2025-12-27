## 1. Database Schema

- [ ] 1.1 Create migration for `kb.email_template_partials` table

  - `id` (UUID, PK)
  - `name` (string, unique) - partial identifier matching file name
  - `description` (text) - human-readable description
  - `current_version_id` (UUID, FK to versions table, nullable)
  - `is_customized` (boolean, default false)
  - `created_at`, `updated_at` timestamps

- [ ] 1.2 Create migration for `kb.email_template_partial_versions` table

  - `id` (UUID, PK)
  - `partial_id` (UUID, FK to partials table)
  - `version_number` (integer)
  - `content` (text) - MJML content
  - `change_summary` (text, nullable)
  - `created_by` (UUID, FK to users)
  - `created_at` timestamp

- [ ] 1.3 Create seed data for existing file-based partials
  - footer.mjml.hbs
  - header.mjml.hbs
  - button.mjml.hbs
  - (any other discovered partials)

## 2. Backend Entity & Service

- [ ] 2.1 Create `EmailTemplatePartial` entity
- [ ] 2.2 Create `EmailTemplatePartialVersion` entity
- [ ] 2.3 Add partial loading to `EmailTemplateService.registerPartials()`
  - Check DB for customized partials
  - Fall back to file-based for non-customized
  - Cache partials with invalidation on save

## 3. Superadmin API

- [ ] 3.1 Create `EmailPartialsController`

  - `GET /superadmin/email-partials`
  - `GET /superadmin/email-partials/:name`
  - `PUT /superadmin/email-partials/:name`
  - `POST /superadmin/email-partials/:name/preview`
  - `GET /superadmin/email-partials/:name/versions`
  - `POST /superadmin/email-partials/:name/rollback`
  - `POST /superadmin/email-partials/:name/reset`

- [ ] 3.2 Create DTOs for all endpoints
- [ ] 3.3 Add route guards for superadmin access
- [ ] 3.4 Add OpenAPI documentation

## 4. Admin UI

- [ ] 4.1 Create partial list page (`/admin/superadmin/email-partials`)

  - Table with Name, Description, Status, Last Updated
  - Click to edit
  - Add link in superadmin sidebar

- [ ] 4.2 Create partial editor page (`/admin/superadmin/email-partial-editor/:name`)

  - Monaco Editor with MJML syntax
  - Live preview in template context
  - Save button
  - Version history sidebar
  - Reset to Default button

- [ ] 4.3 Add API hooks for partial management

  - `useEmailPartials()`
  - `useEmailPartial(name)`
  - `useUpdateEmailPartial()`
  - `useRollbackEmailPartial()`

- [ ] 4.4 Add routes to admin router
- [ ] 4.5 Add navigation link in superadmin sidebar

## 5. Testing

- [ ] 5.1 Unit tests for partial service methods
- [ ] 5.2 Integration tests for partial API endpoints
- [ ] 5.3 E2E tests for partial editor UI workflow

## 6. Documentation

- [ ] 6.1 Update superadmin guide with partial management instructions
- [ ] 6.2 Document partial schema and usage
