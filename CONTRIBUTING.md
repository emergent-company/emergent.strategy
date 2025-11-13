# Contributing to Spec Server 2

Thank you for your interest in contributing to Spec Server 2! This guide will help you understand our development practices, coding standards, and architectural patterns.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Database Patterns](#database-patterns)
4. [Code Style Guidelines](#code-style-guidelines)
5. [Testing](#testing)
6. [Documentation](#documentation)
7. [Pull Request Process](#pull-request-process)

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL 16+ (via Docker)
- Git

### Initial Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-org/spec-server-2.git
   cd spec-server-2
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment:**

   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Start services:**

   ```bash
   # Start Docker dependencies (PostgreSQL, Zitadel)
   docker compose -f docker/docker-compose.yml up -d

   # Bootstrap Zitadel authentication
   bash scripts/bootstrap-zitadel-fully-automated.sh provision

   # Start application services
   npm run workspace:start
   ```

5. **Verify setup:**

   ```bash
   # Check logs
   npm run workspace:logs

   # Access services
   # - Admin UI: http://localhost:3000
   # - API: http://localhost:3002
   # - Zitadel: http://localhost:8080
   ```

See `QUICK_START_DEV.md` for complete setup instructions.

---

## Development Workflow

### Running Services

We use the Workspace CLI for managing services:

```bash
# Start all services
npm run workspace:start

# Stop all services
npm run workspace:stop

# Restart all services
npm run workspace:restart

# View logs (default: admin + server)
npm run workspace:logs

# View logs for specific service
npm run workspace:logs -- --service=server

# Follow logs in real-time
npm run workspace:logs -- --follow
```

### Building and Testing

```bash
# Build all projects
npm run build

# Lint a specific project
nx run admin:lint
nx run server-nest:lint

# Test a specific project
nx run admin:test
nx run server-nest:test

# Run E2E tests
nx run server-nest:test-e2e

# Run a single test file
nx test admin --testFile=path/to/test.spec.ts
```

### Database Migrations

```bash
# Run pending migrations
npm run db:migrate

# Revert last migration
npm run db:migrate:revert

# Generate new migration
npm run db:migration:generate -- -n MigrationName

# Regenerate schema documentation
npm run db:docs:generate
```

After applying migrations, always regenerate the schema documentation to keep it in sync.

---

## Database Patterns

Spec Server 2 uses a **hybrid approach** to database operations: TypeORM for standard CRUD operations and Strategic SQL for PostgreSQL-specific features.

### Quick Decision Tree

```
Does the operation require PostgreSQL-specific features?
├─ Yes → Use Strategic SQL
│   ├─ Advisory locks → Strategic SQL
│   ├─ Recursive CTEs → Strategic SQL
│   ├─ Full-text search (ts_rank) → Strategic SQL
│   ├─ Vector search (pgvector) → Strategic SQL
│   ├─ Window functions → Strategic SQL
│   ├─ COUNT FILTER → Strategic SQL
│   ├─ LATERAL joins → Strategic SQL
│   ├─ pgcrypto functions → Strategic SQL
│   └─ FOR UPDATE SKIP LOCKED → Strategic SQL
│
└─ No → Does it need complex filtering or JOINs?
    ├─ Yes → Use TypeORM QueryBuilder
    │   ├─ Multiple WHERE conditions → QueryBuilder
    │   ├─ Dynamic filtering → QueryBuilder
    │   ├─ JOINs across relations → QueryBuilder
    │   ├─ Complex sorting → QueryBuilder
    │   └─ Pagination → QueryBuilder
    │
    └─ No → Does it need a transaction?
        ├─ Yes → Use TypeORM QueryRunner
        │   ├─ Multi-step atomic operations → QueryRunner
        │   ├─ Validation between steps → QueryRunner
        │   └─ Complex business logic → QueryRunner
        │
        └─ No → Use TypeORM Repository
            ├─ Create entity → Repository.save()
            ├─ Read by ID → Repository.findOne()
            ├─ Update entity → Repository.update()
            ├─ Delete entity → Repository.softDelete()
            └─ Simple queries → Repository.find()
```

### When to Use TypeORM

Use **TypeORM** when:

- ✅ **Basic CRUD operations** - Create, Read, Update, Delete
- ✅ **Simple filtering** - WHERE clauses with standard operators (=, >, <, IN, LIKE)
- ✅ **Relation loading** - JOIN operations with predefined entity relations
- ✅ **Type safety is important** - Compile-time type checking for entities
- ✅ **Standard SQL operations** - Operations supported across multiple databases

**Example: Simple CRUD with Repository**

```typescript
@Injectable()
export class UserProfileService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>
  ) {}

  async create(data: Partial<UserProfile>): Promise<UserProfile> {
    const profile = this.userProfileRepository.create(data);
    return await this.userProfileRepository.save(profile);
  }

  async getById(id: string): Promise<UserProfile | null> {
    return await this.userProfileRepository.findOne({
      where: { id },
    });
  }

  async update(id: string, data: Partial<UserProfile>): Promise<UserProfile> {
    await this.userProfileRepository.update(id, data);
    return await this.getById(id);
  }
}
```

### When to Use Strategic SQL

Use **Strategic SQL** when:

- ✅ **PostgreSQL-specific features** - Advisory locks, recursive CTEs, full-text search
- ✅ **Performance-critical operations** - 10x-100x faster than ORM equivalent
- ✅ **Complex aggregations** - Window functions, COUNT FILTER, advanced GROUP BY
- ✅ **Database extensions** - pgvector, pgcrypto, custom functions
- ✅ **Batch processing** - LATERAL joins, bulk operations

**Example: Advisory Lock for Duplicate Prevention**

```typescript
async create(projectId: string, name: string): Promise<Tag> {
  const lockKey = hashtext(`tag:${projectId}:${name}`);

  const result = await this.db.query(
    `
    -- Acquire advisory lock (released at transaction end)
    SELECT pg_advisory_xact_lock($1);

    -- Check if tag exists
    SELECT * FROM graph.tags
    WHERE project_id = $2 AND name = $3;
    `,
    [lockKey, projectId, name],
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Tag doesn't exist - create it
  return await this.db.query(
    `
    INSERT INTO graph.tags (project_id, name)
    VALUES ($1, $2)
    RETURNING *;
    `,
    [projectId, name],
  );
}
```

### Decision Matrix

| Requirement          | Use Strategic SQL | Use TypeORM     |
| -------------------- | ----------------- | --------------- |
| Simple CRUD          | ❌                | ✅ Repository   |
| Complex filtering    | ❌                | ✅ QueryBuilder |
| PostgreSQL-specific  | ✅ Raw SQL        | ❌              |
| Performance-critical | ✅ Raw SQL        | ❌              |
| Transactions         | ❌                | ✅ QueryRunner  |
| Portability needed   | ❌                | ✅ TypeORM      |

### Pattern Documentation

For comprehensive guides with examples from actual services, see:

- **[TypeORM Patterns Guide](./docs/patterns/TYPEORM_PATTERNS.md)** - 9 core TypeORM patterns with detailed examples
- **[Strategic SQL Patterns Guide](./docs/patterns/STRATEGIC_SQL_PATTERNS.md)** - 12 PostgreSQL-specific patterns

### Best Practices

1. **Document why Strategic SQL is used** - Add comments explaining why TypeORM wasn't sufficient
2. **Use parameterized queries** - Always use `$1, $2, $3` placeholders to prevent SQL injection
3. **Test against real database** - Integration tests should use actual PostgreSQL, not mocks
4. **Monitor performance** - Use `EXPLAIN ANALYZE` for slow queries
5. **Prefer soft deletes** - Use `deleted_at` timestamps instead of hard deletes
6. **Handle backward compatibility** - Support zero-downtime migrations

---

## Code Style Guidelines

### Formatting

We use **Prettier** with `singleQuote: true`:

```bash
# Format all files
npx prettier --write .

# Check formatting
npx prettier --check .
```

### TypeScript Conventions

- **Imports**: Use ES6 module imports
- **Types**: Use TypeScript for static typing (prefer `interface` over `type` for objects)
- **Naming**:
  - `camelCase` for variables and functions
  - `PascalCase` for classes and interfaces
  - `UPPER_SNAKE_CASE` for constants
  - Private class members prefixed with `_` (e.g., `_privateMethod()`)

### Error Handling

Always handle errors gracefully:

```typescript
// ✅ Good: Specific error handling
try {
  await this.repository.save(entity);
} catch (error) {
  if (error.code === '23505') {
    throw new ConflictException('Entity already exists');
  }
  throw new InternalServerException('Failed to save entity', error);
}

// ❌ Bad: Generic error handling
try {
  await this.repository.save(entity);
} catch (error) {
  throw error;
}
```

### Service Layer Patterns

- Use dependency injection via constructor
- Keep services focused on single responsibility
- Use DTOs for input validation
- Return domain entities, not database records

```typescript
@Injectable()
export class ExampleService {
  constructor(
    @InjectRepository(Entity)
    private readonly repository: Repository<Entity>,
    private readonly logger: Logger
  ) {}

  async create(dto: CreateEntityDto): Promise<Entity> {
    this.logger.debug(`Creating entity with data: ${JSON.stringify(dto)}`);

    const entity = this.repository.create(dto);
    return await this.repository.save(entity);
  }
}
```

---

## Testing

### Test Structure

We use Jest for unit and integration tests:

```typescript
describe('ExampleService', () => {
  let service: ExampleService;
  let repository: Repository<Entity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExampleService,
        {
          provide: getRepositoryToken(Entity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExampleService>(ExampleService);
    repository = module.get<Repository<Entity>>(getRepositoryToken(Entity));
  });

  it('should create an entity', async () => {
    const dto = { name: 'Test' };
    const entity = { id: '1', ...dto };

    jest.spyOn(repository, 'create').mockReturnValue(entity as any);
    jest.spyOn(repository, 'save').mockResolvedValue(entity as any);

    const result = await service.create(dto);

    expect(result).toEqual(entity);
    expect(repository.create).toHaveBeenCalledWith(dto);
    expect(repository.save).toHaveBeenCalledWith(entity);
  });
});
```

### Integration Tests

For Strategic SQL patterns, use integration tests against real PostgreSQL:

```typescript
describe('TagService (Integration)', () => {
  let service: TagService;
  let db: DatabaseService;

  beforeAll(async () => {
    // Set up test database connection
    db = await setupTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  it('should prevent duplicate tag creation with advisory lock', async () => {
    const projectId = 'project-1';
    const name = 'test-tag';

    // Create tag concurrently
    const [tag1, tag2] = await Promise.all([
      service.create(projectId, name),
      service.create(projectId, name),
    ]);

    // Both should return the same tag (no duplicates)
    expect(tag1.id).toBe(tag2.id);
  });
});
```

### Test Coverage

Aim for:

- **Unit tests**: 80%+ coverage
- **Integration tests**: Critical paths and Strategic SQL patterns
- **E2E tests**: Happy path and error scenarios for user flows

---

## Documentation

### Code Documentation

- Use JSDoc comments for public APIs
- Document complex algorithms and business logic
- Explain **why**, not just **what**

```typescript
/**
 * Creates a new tag with duplicate prevention using PostgreSQL advisory locks.
 *
 * We use advisory locks instead of UNIQUE constraints because:
 * 1. Tags can be soft-deleted and recreated
 * 2. Case-insensitive duplicate checking is required
 * 3. Prevents race conditions in high-concurrency scenarios
 *
 * @param projectId - The project ID to create the tag in
 * @param name - The tag name (case-insensitive)
 * @returns The created or existing tag
 */
async create(projectId: string, name: string): Promise<Tag> {
  // Implementation...
}
```

### Project Documentation

Keep documentation in the `/docs` directory:

- `/docs/setup` - Setup and installation guides
- `/docs/guides` - How-to guides and quick references
- `/docs/features` - Feature documentation
- `/docs/technical` - Architecture and technical details
- `/docs/patterns` - Database and code patterns
- `/docs/migrations` - TypeORM migration tracking

### README Files

Each app/library should have a README:

- Brief description
- Usage examples
- API reference (for libraries)
- Testing instructions

---

## Pull Request Process

### Before Submitting

1. **Run linter**: `nx run <project>:lint`
2. **Run tests**: `nx run <project>:test`
3. **Format code**: `npx prettier --write .`
4. **Update documentation**: If you changed APIs or patterns
5. **Update CHANGELOG.md**: For notable changes

### PR Guidelines

- **Title**: Use conventional commits format (e.g., `feat: add user profile service`)
- **Description**: Explain what changed and why
- **Link issues**: Reference related issues (e.g., `Closes #123`)
- **Screenshots**: Include UI screenshots for frontend changes
- **Tests**: Add tests for new functionality
- **Documentation**: Update docs for API changes

### Conventional Commits

We use conventional commits for clear changelog generation:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build/tooling changes
- `perf:` - Performance improvements

**Examples:**

```
feat(auth): add OAuth2 password grant support
fix(graph): resolve N+1 query in relationship loading
docs(patterns): add Strategic SQL patterns guide
refactor(user): migrate UserService to TypeORM
test(invites): add integration tests for bulk invite creation
```

### Review Process

1. **Automated checks**: CI runs linter, tests, and build
2. **Code review**: At least one approval required
3. **Address feedback**: Respond to review comments
4. **Merge**: Squash and merge with conventional commit message

---

## Additional Resources

- **[QUICK_START_DEV.md](./QUICK_START_DEV.md)** - Development quickstart
- **[SETUP.md](./SETUP.md)** - Complete setup guide
- **[RUNBOOK.md](./RUNBOOK.md)** - Operational guide
- **[SECURITY_SCOPES.md](./SECURITY_SCOPES.md)** - Authorization scopes
- **[CHANGELOG.md](./CHANGELOG.md)** - Notable changes
- **[TypeORM Patterns](./docs/patterns/TYPEORM_PATTERNS.md)** - TypeORM guide
- **[Strategic SQL Patterns](./docs/patterns/STRATEGIC_SQL_PATTERNS.md)** - PostgreSQL patterns

---

## Questions or Issues?

- **Bugs**: Open an issue on GitHub
- **Feature requests**: Open an issue with `[Feature]` prefix
- **Questions**: Check existing documentation or ask in discussions

Thank you for contributing to Spec Server 2! 🚀
