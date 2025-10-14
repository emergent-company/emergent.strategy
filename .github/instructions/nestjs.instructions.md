---
applyTo: '**/*.ts, **/*.js, **/*.json, **/*.spec.ts, **/*.e2e-spec.ts'
description: 'NestJS development standards and best practices for building scalable Node.js server-side applications'
---

# NestJS Development Best Practices

## Your Mission

As GitHub Copilot, you are an expert in NestJS development with deep knowledge of TypeScript, decorators, dependency injection, and modern Node.js patterns. Your goal is to guide developers in building scalable, maintainable, and well-architected server-side applications using NestJS framework principles and best practices.

## Core NestJS Principles

### **1. Dependency Injection (DI)**
- **Principle:** NestJS uses a powerful DI container that manages the instantiation and lifetime of providers.
- **Guidance for Copilot:**
  - Use `@Injectable()` decorator for services, repositories, and other providers
  - Inject dependencies through constructor parameters with proper typing
  - Prefer interface-based dependency injection for better testability
  - Use custom providers when you need specific instantiation logic

### **2. Modular Architecture**
- **Principle:** Organize code into feature modules that encapsulate related functionality.
- **Guidance for Copilot:**
  - Create feature modules with `@Module()` decorator
  - Import only necessary modules and avoid circular dependencies
  - Use `forRoot()` and `forFeature()` patterns for configurable modules
  - Implement shared modules for common functionality

### **3. Decorators and Metadata**
- **Principle:** Leverage decorators to define routes, middleware, guards, and other framework features.
- **Guidance for Copilot:**
  - Use appropriate decorators: `@Controller()`, `@Get()`, `@Post()`, `@Injectable()`
  - Apply validation decorators from `class-validator` library
  - Use custom decorators for cross-cutting concerns
  - Implement metadata reflection for advanced scenarios

## ⚠️ CRITICAL: API Endpoint Construction Rules

### **Architecture Overview**

This project uses a **proxy-based architecture** where the Vite development server strips the `/api` prefix before forwarding requests to the NestJS backend.

```
Browser Request Flow:
┌──────────┐  /api/notifications  ┌──────────┐  /notifications  ┌────────┐
│ Browser  │ ──────────────────> │   Vite   │ ───────────────> │ NestJS │
│          │                      │  Proxy   │  (strips /api)   │ Backend│
└──────────┘                      └──────────┘                  └────────┘
```

**Vite Proxy Configuration:**
```typescript
// apps/admin/vite.config.ts
proxy: {
    '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''), // ← Strips /api prefix
    },
}
```

### **✅ CORRECT: Controller Path Construction**

**Rule:** Controllers should use **direct paths WITHOUT any `/api` prefix**.

```typescript
// ✅ CORRECT - Direct path, no prefix
@Controller('notifications')
export class NotificationsController {
    @Get()
    async findAll() {
        // Handles: GET /notifications (after Vite strips /api)
    }
}

// ✅ CORRECT - Nested admin route
@Controller('admin/extraction-jobs')
export class ExtractionJobsController {
    @Get('projects/:projectId')
    async getJobs(@Param('projectId') projectId: string) {
        // Handles: GET /admin/extraction-jobs/projects/:projectId
    }
}

// ✅ CORRECT - Resource hierarchy
@Controller('integrations')
export class IntegrationsController {
    @Get('available')
    async listAvailable() {
        // Handles: GET /integrations/available
    }
    
    @Get(':name/test')
    async testConnection(@Param('name') name: string) {
        // Handles: POST /integrations/:name/test
    }
}
```

### **❌ WRONG: Common Mistakes**

```typescript
// ❌ WRONG - Including /api in controller path
@Controller('api/notifications')
export class NotificationsController {}
// Problem: Vite strips /api, backend receives /notifications, but controller expects /api/notifications

// ❌ WRONG - Including /api/v1 (versioning)
@Controller('api/v1/integrations')
export class IntegrationsController {}
// Problem: We don't use API versioning + double /api issue

// ❌ WRONG - Starting with slash
@Controller('/notifications')
export class NotificationsController {}
// Problem: Inconsistent with NestJS conventions

// ❌ WRONG - Using version numbers
@Controller('v1/integrations')
export class IntegrationsController {}
// Problem: We don't use API versioning in this project

// ❌ WRONG - Unclear hierarchy
@Controller('get-project-documents')
export class ProjectDocumentsController {}
// Problem: Should be nested route: projects/:id/documents
```

### **🚫 NO API VERSIONING POLICY**

**This project does NOT use API versioning** (`/v1`, `/v2`, etc.).

**Rationale:**
- API versioning was introduced without a clear reason
- Adds unnecessary complexity to routing configuration
- Not needed for internal admin tools and controlled deployments
- Breaking changes should be handled through:
  - Feature flags and gradual rollout
  - Backward-compatible changes with deprecation warnings
  - Database migrations for schema changes
  - Clear communication with frontend team

**If you find version prefixes:**
```typescript
// ❌ Remove this:
@Controller('api/v1/integrations')

// ✅ Change to:
@Controller('integrations')
```

### **Route Construction Best Practices**

#### **1. Use Semantic, Resource-Based Paths**

```typescript
// ✅ GOOD - Clear, RESTful resource names
@Controller('projects')
@Controller('documents')
@Controller('notifications')
@Controller('integrations')

// ❌ BAD - Verb-based or unclear names
@Controller('get-projects')
@Controller('manage-docs')
@Controller('notif')
```

#### **2. Use Nested Routes for Relationships**

```typescript
// ✅ GOOD - Shows clear hierarchy
@Controller('projects/:projectId/documents')
export class ProjectDocumentsController {}

@Controller('template-packs/projects/:projectId')
export class TemplatePackProjectsController {
    @Get('available')  // → /template-packs/projects/:projectId/available
    @Get('installed')  // → /template-packs/projects/:projectId/installed
}

// ❌ BAD - Flat structure loses relationship context
@Controller('project-documents')
@Controller('available-template-packs-for-project')
```

#### **3. Separate Admin Routes with Prefix**

```typescript
// ✅ GOOD - Clear admin namespace
@Controller('admin/extraction-jobs')
@Controller('admin/users')
@Controller('admin/settings')

// Public/user-facing equivalents
@Controller('extraction-jobs')
@Controller('users')
```

#### **4. Follow RESTful Conventions**

```typescript
@Controller('notifications')
export class NotificationsController {
    @Get()              // GET /notifications - List all
    @Get(':id')         // GET /notifications/:id - Get one
    @Post()             // POST /notifications - Create
    @Put(':id')         // PUT /notifications/:id - Full update
    @Patch(':id')       // PATCH /notifications/:id - Partial update
    @Delete(':id')      // DELETE /notifications/:id - Delete
}
```

### **Frontend Integration Requirements**

When creating a new backend endpoint, the frontend **MUST** use the `/api/` prefix:

```typescript
// ✅ CORRECT Frontend Call
const response = await fetch(`${apiBase}/api/notifications`);
//                                      ^^^^^^^ Must include /api/

// Backend receives (after Vite strips /api)
// → /notifications

// Backend Controller
@Controller('notifications')
```

**Complete Request Flow Example:**

```typescript
// 1. Frontend code (React/TypeScript)
const data = await fetchJson(`${apiBase}/api/notifications?tab=all`);

// 2. Browser makes request
// → http://localhost:5175/api/notifications?tab=all

// 3. Vite proxy intercepts and transforms
// → http://localhost:3001/notifications?tab=all (strips /api)

// 4. NestJS backend receives
// → GET /notifications?tab=all

// 5. Controller handles
@Controller('notifications')
export class NotificationsController {
    @Get() // Matches /notifications
    async findAll(@Query('tab') tab: string) {
        return this.service.findAll(tab);
    }
}
```

### **Path Parameters vs Query Parameters**

#### **Use Path Parameters for Resource Identity**

```typescript
// ✅ GOOD - Resource ID in path (RESTful, cacheable)
@Get('integrations/:name')
getIntegration(@Param('name') name: string) {}

@Get('notifications/:id')
getNotification(@Param('id') id: string) {}

// ❌ BAD - ID in query string
@Get('integrations')
getIntegration(@Query('name') name: string) {} // Harder to cache, less RESTful
```

#### **Use Query Parameters for Filtering, Pagination, Context**

```typescript
// ✅ GOOD - Filters and context in query
@Get('documents')
listDocuments(
    @Query('project_id') projectId: string,
    @Query('org_id') orgId: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('search') search?: string,
) {}

// ✅ GOOD - Tab-based filtering
@Get('notifications')
getNotifications(@Query('tab') tab: 'all' | 'important' | 'other') {}
```

### **⚠️ CRITICAL: Org and Project Context via Headers**

**This system uses HTTP headers for org/project context, NOT query parameters.**

#### **Why Headers?**

1. **Security:** Org/Project IDs not exposed in URLs (logs, browser history)
2. **Consistency:** Centralized context injection via middleware
3. **Cleaner URLs:** Business data in params/body, context in headers
4. **Automatic:** Frontend automatically adds headers via `use-api` hook

#### **System Architecture:**

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (apps/admin/src/hooks/use-api.ts)                  │
│ ──────────────────────────────────────────────────────────── │
│ const buildHeaders = () => {                                 │
│     const h: Record<string, string> = {};                    │
│     if (activeOrgId) h["X-Org-ID"] = activeOrgId;           │
│     if (activeProjectId) h["X-Project-ID"] = activeProjectId;│
│     return h;                                                 │
│ };                                                            │
└──────────────────────────────────────────────────────────────┘
                            ↓
                 Request with headers:
                 X-Org-ID: 57db09de-b7b4-425d-976a-959a0b3f9b62
                 X-Project-ID: 11b1e87c-a86a-4a8f-bdb0-c15c6e06b591
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Backend Controller (NestJS)                                  │
│ ──────────────────────────────────────────────────────────── │
│ @Get()                                                        │
│ async listItems(@Req() req: Request) {                       │
│     const orgId = req.headers['x-org-id'] as string;        │
│     const projectId = req.headers['x-project-id'] as string; │
│     return this.service.listItems(projectId, orgId);         │
│ }                                                             │
└──────────────────────────────────────────────────────────────┘
```

#### **✅ CORRECT: Read from Headers**

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';

@Controller('integrations')
export class IntegrationsController {
    /**
     * List all integrations for the current project
     * 
     * GET /integrations
     * Headers: X-Project-ID, X-Org-ID
     */
    @Get()
    async listIntegrations(
        @Req() req: Request,
        @Query() filters: ListIntegrationsDto
    ): Promise<IntegrationDto[]> {
        const projectId = req.headers['x-project-id'] as string;
        const orgId = req.headers['x-org-id'] as string;
        return this.integrationsService.listIntegrations(projectId, orgId, filters);
    }

    /**
     * Get a specific integration by name
     * 
     * GET /integrations/:name
     * Headers: X-Project-ID, X-Org-ID
     */
    @Get(':name')
    async getIntegration(
        @Req() req: Request,
        @Param('name') name: string
    ): Promise<IntegrationDto> {
        const projectId = req.headers['x-project-id'] as string;
        const orgId = req.headers['x-org-id'] as string;
        return this.integrationsService.getIntegration(name, projectId, orgId);
    }

    /**
     * Update an integration
     * 
     * PUT /integrations/:name
     * Headers: X-Project-ID, X-Org-ID
     */
    @Put(':name')
    async updateIntegration(
        @Req() req: Request,
        @Param('name') name: string,
        @Body() dto: UpdateIntegrationDto
    ): Promise<IntegrationDto> {
        const projectId = req.headers['x-project-id'] as string;
        const orgId = req.headers['x-org-id'] as string;
        return this.integrationsService.updateIntegration(name, projectId, orgId, dto);
    }

    /**
     * Delete an integration
     * 
     * DELETE /integrations/:name
     * Headers: X-Project-ID, X-Org-ID
     */
    @Delete(':name')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteIntegration(
        @Req() req: Request,
        @Param('name') name: string
    ): Promise<void> {
        const projectId = req.headers['x-project-id'] as string;
        const orgId = req.headers['x-org-id'] as string;
        return this.integrationsService.deleteIntegration(name, projectId, orgId);
    }
}
```

#### **❌ WRONG: Using Query Parameters**

```typescript
// ❌ WRONG - Using @Query decorators for org/project
@Get()
async listIntegrations(
    @Query('project_id') projectId: string,  // ❌ Wrong! Use headers
    @Query('org_id') orgId: string,          // ❌ Wrong! Use headers
    @Query() filters: ListIntegrationsDto
): Promise<IntegrationDto[]> {
    return this.integrationsService.listIntegrations(projectId, orgId, filters);
}

// Problem: Frontend doesn't send these query params - it sends headers!
// Result: projectId and orgId will be undefined, breaking the endpoint
```

#### **Header Pattern for All Controllers**

**Standard imports needed:**
```typescript
import { Controller, Get, Post, Put, Delete, Req } from '@nestjs/common';
import { Request } from 'express';
```

**Standard parameter pattern:**
```typescript
async controllerMethod(
    @Req() req: Request,  // ← Always first parameter
    // ... other parameters (Param, Body, Query)
) {
    const projectId = req.headers['x-project-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    
    // Pass to service
    return this.service.someMethod(projectId, orgId, ...otherArgs);
}
```

#### **Examples from Existing Controllers**

**Documents Controller:**
```typescript
@Controller('documents')
export class DocumentsController {
    @Get()
    async listDocuments(@Req() req: Request) {
        const orgId = req.headers['x-org-id'] as string | undefined;
        const projectId = req.headers['x-project-id'] as string | undefined;
        if (!projectId) {
            throw new BadRequestException('x-project-id required');
        }
        return this.documentsService.listDocuments(projectId, orgId);
    }
}
```

**Template Packs Controller:**
```typescript
@Controller('template-packs')
export class TemplatePackController {
    @Get('available')
    async listAvailable(@Req() req: Request) {
        const orgId = req.headers['x-org-id'] as string | undefined;
        return this.templatePackService.listAvailable(orgId);
    }
}
```

**Type Registry Controller:**
```typescript
@Controller('type-registry')
export class TypeRegistryController {
    @Get('object-types')
    async listObjectTypes(
        @Req() req: Request,
        @Query('org_id') orgIdParam?: string
    ) {
        // Fallback: header takes precedence, query param as backup
        const orgId = orgIdParam || (req.headers['x-org-id'] as string | undefined);
        return this.typeRegistryService.listObjectTypes(orgId);
    }
}
```

#### **When Headers Are Missing**

**Add validation when org/project is required:**

```typescript
@Get()
async listItems(@Req() req: Request): Promise<ItemDto[]> {
    const projectId = req.headers['x-project-id'] as string | undefined;
    const orgId = req.headers['x-org-id'] as string | undefined;

    if (!projectId) {
        throw new BadRequestException({
            error: { 
                code: 'bad-request', 
                message: 'x-project-id header required' 
            }
        });
    }

    if (!orgId) {
        throw new BadRequestException({
            error: { 
                code: 'bad-request', 
                message: 'x-org-id header required' 
            }
        });
    }

    return this.service.listItems(projectId, orgId);
}
```

#### **Frontend Never Manually Adds Headers**

**Frontend developers should NEVER manually add these headers:**

```typescript
// ❌ WRONG - Manual header addition
const response = await fetch(`${apiBase}/api/integrations`, {
    headers: {
        'X-Org-ID': activeOrgId,        // ❌ Don't do this!
        'X-Project-ID': activeProjectId, // ❌ Don't do this!
    }
});

// ✅ CORRECT - use-api hook adds headers automatically
const { fetchJson } = useApi();  // Hook adds headers via buildHeaders()
const data = await fetchJson(`${apiBase}/api/integrations`);
```

The `use-api` hook's `fetchJson` function automatically calls `buildHeaders()` which adds `X-Org-ID` and `X-Project-ID` from the global config context.

#### **Migration Checklist**

If you find a controller using query parameters for org/project:

1. ✅ Add imports: `import { Req } from '@nestjs/common';` and `import { Request } from 'express';`
2. ✅ Add `@Req() req: Request` as first parameter to each method
3. ✅ Extract headers: `const projectId = req.headers['x-project-id'] as string;`
4. ✅ Remove `@Query('project_id')` and `@Query('org_id')` decorators
5. ✅ Update JSDoc comments: Change `?project_id=xxx&org_id=yyy` to `Headers: X-Project-ID, X-Org-ID`
6. ✅ Update controller class documentation to mention header-based context
7. ✅ Verify no frontend changes needed (headers already sent automatically)
8. ✅ Test the endpoint to ensure org/project filtering works correctly

### **Controller Documentation Requirements**

**Every controller MUST have comprehensive documentation:**

```typescript
/**
 * Notifications Controller
 * 
 * API endpoints for managing user notifications and alerts
 * 
 * Base path: /notifications (proxied from /api/notifications)
 * 
 * Architecture:
 * - Frontend calls: ${apiBase}/api/notifications
 * - Vite proxy strips /api prefix
 * - Backend receives: /notifications
 * 
 * Security:
 * - All endpoints require authentication via JWT
 * - Org and project context provided via HTTP headers (X-Org-ID, X-Project-ID)
 * - Rate limiting: 100 requests per minute per user
 * 
 * Example Usage:
 * ```typescript
 * // Frontend
 * const notifications = await fetch(`${apiBase}/api/notifications?tab=all`);
 * 
 * // Backend handles
 * GET /notifications?tab=all
 * ```
 */
@ApiTags('Notifications')
@Controller('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    /**
     * Get filtered notifications
     * 
     * Returns a list of notifications with optional filtering by tab and search term.
     * 
     * @param tab - Filter by notification category (all, important, other, snoozed, cleared)
     * @param search - Optional search term to filter notifications
     * @returns Array of notifications matching the filters
     */
    @Get()
    @ApiOperation({
        summary: 'List notifications',
        description: 'Get filtered list of notifications for authenticated user'
    })
    @ApiResponse({ 
        status: 200, 
        description: 'Notifications retrieved successfully',
        type: [NotificationDto]
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Missing or invalid JWT token' })
    @ApiResponse({ status: 400, description: 'Bad Request - Invalid filter parameters' })
    async findAll(
        @Query('tab') tab?: string,
        @Query('search') search?: string,
    ): Promise<Notification[]> {
        return this.notificationsService.findAll({ tab, search });
    }
}
```

### **Testing Your Routes**

#### **1. Verify Backend Receives Correct Path**

```bash
# Check NestJS logs for incoming requests
# Should show: GET /notifications?tab=all
# NOT: GET /api/notifications?tab=all
```

#### **2. Test Frontend Integration**

```javascript
// In browser DevTools console:
fetch('http://localhost:5175/api/notifications')
    .then(r => r.json())
    .then(console.log);

// Check Network tab:
// - Request URL should show: http://localhost:5175/api/notifications
// - Vite proxy should forward to: http://localhost:3001/notifications
```

#### **3. Verify Proxy Configuration**

```bash
# Vite terminal should show proxy logs:
# [vite] http proxy: /api/notifications -> http://localhost:3001/notifications
```

### **Migration Checklist for Existing Endpoints**

If updating an endpoint that used `/api` or `/v1` prefix:

- [ ] Remove `/api` prefix from `@Controller()` decorator
- [ ] Remove any `/v1` or version prefixes
- [ ] Update all JSDoc comments referencing the path
- [ ] Update OpenAPI documentation (`@ApiOperation` descriptions)
- [ ] Verify frontend calls include `/api/` prefix (e.g., `${apiBase}/api/notifications`)
- [ ] Update integration tests to use correct paths
- [ ] Test the full request flow in browser
- [ ] Update any API documentation or README files
- [ ] Verify Swagger/OpenAPI spec reflects correct paths

### **Common Debugging Scenarios**

#### **Problem: 404 Not Found**

```
Frontend Error: GET http://localhost:5175/api/notifications 404
```

**Causes:**
1. Controller path includes `/api`: `@Controller('api/notifications')` ❌
2. Frontend forgot `/api` prefix: `fetch('/notifications')` ❌  
3. Module not imported in `AppModule`

**Solution:**
```typescript
// Backend
@Controller('notifications') // ✅ No /api prefix

// Frontend  
fetch(`${apiBase}/api/notifications`) // ✅ Include /api prefix
```

#### **Problem: HTML Response Instead of JSON**

```
SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```

**Cause:** Frontend calling path without `/api/` prefix
- Request goes to Vite dev server directly
- Vite serves `index.html` (SPA fallback)
- Frontend tries to parse HTML as JSON

**Solution:**
```typescript
// ❌ WRONG
fetch(`${apiBase}/notifications`)

// ✅ CORRECT
fetch(`${apiBase}/api/notifications`)
```

#### **Problem: Backend Not Receiving Requests**

**Check:**
1. Backend running on correct port (3001 by default)
2. Vite proxy configured correctly in `vite.config.ts`
3. Controller registered in module's `controllers` array
4. Module imported in `AppModule.imports`

### **Environment Configuration**

**Default Ports:**
- Backend (NestJS): `3001`
- Frontend (Vite): `5175`
- Vite proxies `/api/*` → `http://localhost:3001`

**If changing backend port:**

1. Update `.env` or environment variables:
   ```bash
   PORT=3001
   ```

2. Update Vite proxy target in `apps/admin/vite.config.ts`:
   ```typescript
   proxy: {
       '/api': {
           target: 'http://localhost:3001', // ← Update port here
           // ...
       }
   }
   ```

## Project Structure Best Practices

### **Recommended Directory Structure**
```
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── pipes/
│   └── interfaces/
├── config/
├── modules/
│   ├── auth/
│   ├── users/
│   └── products/
└── shared/
    ├── services/
    └── constants/
```

### **File Naming Conventions**
- **Controllers:** `*.controller.ts` (e.g., `users.controller.ts`)
- **Services:** `*.service.ts` (e.g., `users.service.ts`)
- **Modules:** `*.module.ts` (e.g., `users.module.ts`)
- **DTOs:** `*.dto.ts` (e.g., `create-user.dto.ts`)
- **Entities:** `*.entity.ts` (e.g., `user.entity.ts`)
- **Guards:** `*.guard.ts` (e.g., `auth.guard.ts`)
- **Interceptors:** `*.interceptor.ts` (e.g., `logging.interceptor.ts`)
- **Pipes:** `*.pipe.ts` (e.g., `validation.pipe.ts`)
- **Filters:** `*.filter.ts` (e.g., `http-exception.filter.ts`)

## API Development Patterns

### **1. Controllers**
- Keep controllers thin - delegate business logic to services
- Use proper HTTP methods and status codes
- Implement comprehensive input validation with DTOs
- Apply guards and interceptors at the appropriate level

```typescript
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseInterceptors(TransformInterceptor)
  async findAll(@Query() query: GetUsersDto): Promise<User[]> {
    return this.usersService.findAll(query);
  }

  @Post()
  @UsePipes(ValidationPipe)
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }
}
```

### **2. Services**
- Implement business logic in services, not controllers
- Use constructor-based dependency injection
- Create focused, single-responsibility services
- Handle errors appropriately and let filters catch them

```typescript
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly emailService: EmailService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(createUserDto);
    const savedUser = await this.userRepository.save(user);
    await this.emailService.sendWelcomeEmail(savedUser.email);
    return savedUser;
  }
}
```

### **3. DTOs and Validation**
- Use class-validator decorators for input validation
- Create separate DTOs for different operations (create, update, query)
- Implement proper transformation with class-transformer

```typescript
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase and number',
  })
  password: string;
}
```

## Database Integration

### **TypeORM Integration**
- Use TypeORM as the primary ORM for database operations
- Define entities with proper decorators and relationships
- Implement repository pattern for data access
- Use migrations for database schema changes

```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ select: false })
  password: string;

  @OneToMany(() => Post, post => post.author)
  posts: Post[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### **Custom Repositories**
- Extend base repository functionality when needed
- Implement complex queries in repository methods
- Use query builders for dynamic queries

## Authentication and Authorization

### **JWT Authentication**
- Implement JWT-based authentication with Passport
- Use guards to protect routes
- Create custom decorators for user context

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
```

### **Role-Based Access Control**
- Implement RBAC using custom guards and decorators
- Use metadata to define required roles
- Create flexible permission systems

```typescript
@SetMetadata('roles', ['admin'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Delete(':id')
async remove(@Param('id') id: string): Promise<void> {
  return this.usersService.remove(id);
}
```

## Error Handling and Logging

### **Exception Filters**
- Create global exception filters for consistent error responses
- Handle different types of exceptions appropriately
- Log errors with proper context

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException 
      ? exception.getStatus() 
      : HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error(`${request.method} ${request.url}`, exception);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception instanceof HttpException 
        ? exception.message 
        : 'Internal server error',
    });
  }
}
```

### **Logging**
- Use built-in Logger class for consistent logging
- Implement proper log levels (error, warn, log, debug, verbose)
- Add contextual information to logs

## Testing Strategies

### **Unit Testing**
- Test services independently using mocks
- Use Jest as the testing framework
- Create comprehensive test suites for business logic

```typescript
describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should create a user', async () => {
    const createUserDto = { name: 'John', email: 'john@example.com' };
    const user = { id: '1', ...createUserDto };

    jest.spyOn(repository, 'create').mockReturnValue(user as User);
    jest.spyOn(repository, 'save').mockResolvedValue(user as User);

    expect(await service.create(createUserDto)).toEqual(user);
  });
});
```

### **Integration Testing**
- Use TestingModule for integration tests
- Test complete request/response cycles
- Mock external dependencies appropriately

### **E2E Testing**
- Test complete application flows
- Use supertest for HTTP testing
- Test authentication and authorization flows

## Performance and Security

### **Performance Optimization**
- Implement caching strategies with Redis
- Use interceptors for response transformation
- Optimize database queries with proper indexing
- Implement pagination for large datasets

### **Security Best Practices**
- Validate all inputs using class-validator
- Implement rate limiting to prevent abuse
- Use CORS appropriately for cross-origin requests
- Sanitize outputs to prevent XSS attacks
- Use environment variables for sensitive configuration

```typescript
// Rate limiting example
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  @Post('login')
  @Throttle(5, 60) // 5 requests per minute
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
```

## Configuration Management

### **Environment Configuration**
- Use @nestjs/config for configuration management
- Validate configuration at startup
- Use different configs for different environments

```typescript
@Injectable()
export class ConfigService {
  constructor(
    @Inject(CONFIGURATION_TOKEN)
    private readonly config: Configuration,
  ) {}

  get databaseUrl(): string {
    return this.config.database.url;
  }

  get jwtSecret(): string {
    return this.config.jwt.secret;
  }
}
```

## Common Pitfalls to Avoid

- **Circular Dependencies:** Avoid importing modules that create circular references
- **Heavy Controllers:** Don't put business logic in controllers
- **Missing Error Handling:** Always handle errors appropriately
- **Improper DI Usage:** Don't create instances manually when DI can handle it
- **Missing Validation:** Always validate input data
- **Synchronous Operations:** Use async/await for database and external API calls
- **Memory Leaks:** Properly dispose of subscriptions and event listeners

## Development Workflow

### **Development Setup**
1. Use NestJS CLI for scaffolding: `nest generate module users`
2. Follow consistent file organization
3. Use TypeScript strict mode
4. Implement comprehensive linting with ESLint
5. Use Prettier for code formatting

### **Code Review Checklist**
- [ ] Proper use of decorators and dependency injection
- [ ] Input validation with DTOs and class-validator
- [ ] Appropriate error handling and exception filters
- [ ] Consistent naming conventions
- [ ] Proper module organization and imports
- [ ] Security considerations (authentication, authorization, input sanitization)
- [ ] Performance considerations (caching, database optimization)
- [ ] Comprehensive testing coverage

## Conclusion

NestJS provides a powerful, opinionated framework for building scalable Node.js applications. By following these best practices, you can create maintainable, testable, and efficient server-side applications that leverage the full power of TypeScript and modern development patterns.

---

<!-- End of NestJS Instructions -->
