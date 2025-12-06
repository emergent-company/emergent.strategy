import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { ExtractionSourceType } from '../../src/modules/extraction-jobs/dto/extraction-job.dto';

/**
 * Relationship Extraction E2E Tests
 *
 * Tests the complete relationship extraction pipeline:
 * 1. Template Pack creation with relationship_type_schemas
 * 2. Document creation with relational content
 * 3. Extraction job creation and processing (mocked LLM)
 * 4. Verification of created entities and relationships
 *
 * Note: These tests validate the API and data flow.
 * Full LLM integration testing should be done in staging with GOOGLE_API_KEY.
 */

let ctx: E2EContext;

describe('Relationship Extraction E2E', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('relationship-extraction');

    // Configure extraction worker
    process.env.EXTRACTION_WORKER_ENABLED = 'true';
    process.env.VERTEX_AI_PROJECT_ID = 'test-project';
    process.env.VERTEX_AI_LOCATION = 'us-central1';
    process.env.VERTEX_AI_MODEL = 'gemini-1.5-pro';

    // Set conservative rate limits for testing
    process.env.EXTRACTION_RATE_LIMIT_RPM = '10';
    process.env.EXTRACTION_RATE_LIMIT_TPM = '10000';

    // Configure entity linking
    process.env.EXTRACTION_ENTITY_LINKING_STRATEGY = 'always_new';
    process.env.EXTRACTION_CONFIDENCE_THRESHOLD_MIN = '0.0';
    process.env.EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW = '0.7';
    process.env.EXTRACTION_CONFIDENCE_THRESHOLD_AUTO_CREATE = '0.85';
  });

  const makeHeaders = (options?: {
    contentType?: boolean;
    userSuffix?: string;
    projectId?: string;
    orgId?: string;
    extra?: Record<string, string>;
  }) => {
    const {
      contentType = false,
      userSuffix = 'relationship-extraction',
      projectId = ctx.projectId,
      orgId = ctx.orgId,
      extra = {},
    } = options ?? {};

    const base: Record<string, string> = {
      ...authHeader('all', userSuffix),
      'x-org-id': orgId,
      'x-project-id': projectId,
    };

    if (contentType) {
      base['Content-Type'] = 'application/json';
    }

    return { ...base, ...extra };
  };

  beforeEach(async () => {
    await ctx.cleanup();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('Template Pack with Relationship Schemas', () => {
    it('should create a template pack with relationship_type_schemas', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create a template pack with both object and relationship schemas
      const packRes = await fetch(`${ctx.baseUrl}/template-packs`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          name: 'Relationship Extraction Test Pack',
          version: '1.0.0',
          description: 'Test pack with relationship type schemas',
          object_type_schemas: {
            Person: {
              type: 'object',
              required: ['name'],
              properties: {
                name: {
                  type: 'string',
                  description: 'Full name of the person',
                },
                role: { type: 'string', description: 'Job role or title' },
                department: {
                  type: 'string',
                  description: 'Department they work in',
                },
              },
            },
            Organization: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'Organization name' },
                type: {
                  type: 'string',
                  enum: ['Company', 'Department', 'Team'],
                  description: 'Type of organization',
                },
                location: { type: 'string', description: 'Primary location' },
              },
            },
            Project: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'Project name' },
                status: {
                  type: 'string',
                  enum: ['Planning', 'Active', 'Completed', 'On Hold'],
                  description: 'Project status',
                },
                description: {
                  type: 'string',
                  description: 'Project description',
                },
              },
            },
          },
          relationship_type_schemas: {
            works_for: {
              type: 'object',
              description:
                'Employment relationship between a person and organization',
              source_types: ['Person'],
              target_types: ['Organization'],
              properties: {
                role: {
                  type: 'string',
                  description: 'Role in the organization',
                },
                start_date: {
                  type: 'string',
                  description: 'Employment start date',
                },
              },
            },
            manages: {
              type: 'object',
              description: 'Management relationship between two people',
              source_types: ['Person'],
              target_types: ['Person'],
              properties: {
                direct_report: {
                  type: 'boolean',
                  description:
                    'Whether this is a direct reporting relationship',
                },
              },
            },
            leads: {
              type: 'object',
              description: 'Project leadership relationship',
              source_types: ['Person'],
              target_types: ['Project'],
              properties: {
                role: {
                  type: 'string',
                  enum: ['Lead', 'Co-Lead', 'Sponsor'],
                  description: 'Leadership role',
                },
              },
            },
            works_on: {
              type: 'object',
              description: 'Person working on a project',
              source_types: ['Person'],
              target_types: ['Project'],
              properties: {
                contribution: {
                  type: 'string',
                  description: 'Type of contribution',
                },
              },
            },
            part_of: {
              type: 'object',
              description: 'Organizational hierarchy',
              source_types: ['Organization', 'Project'],
              target_types: ['Organization'],
              properties: {},
            },
          },
          extraction_prompts: {
            extraction:
              'Extract all people, organizations, and projects from the text. Also identify relationships between them including employment, management, and project involvement.',
          },
        }),
      });

      expect(packRes.status).toBe(201);
      const pack = await packRes.json();

      expect(pack.id).toBeDefined();
      expect(pack.name).toBe('Relationship Extraction Test Pack');
      expect(pack.object_type_schemas).toBeDefined();
      expect(pack.relationship_type_schemas).toBeDefined();

      // Verify relationship schemas were stored correctly
      expect(pack.relationship_type_schemas.works_for).toBeDefined();
      expect(pack.relationship_type_schemas.manages).toBeDefined();
      expect(pack.relationship_type_schemas.leads).toBeDefined();
      expect(pack.relationship_type_schemas.works_on).toBeDefined();
      expect(pack.relationship_type_schemas.part_of).toBeDefined();

      // Verify source/target type constraints
      expect(pack.relationship_type_schemas.works_for.source_types).toContain(
        'Person'
      );
      expect(pack.relationship_type_schemas.works_for.target_types).toContain(
        'Organization'
      );
    });

    it('should install template pack with relationships on project', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create template pack
      const packRes = await fetch(`${ctx.baseUrl}/template-packs`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          name: 'Install Test Pack',
          version: '1.0.0',
          object_type_schemas: {
            Person: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
          relationship_type_schemas: {
            knows: {
              type: 'object',
              source_types: ['Person'],
              target_types: ['Person'],
              properties: {},
            },
          },
        }),
      });
      expect(packRes.status).toBe(201);
      const pack = await packRes.json();

      // Install on project
      const installRes = await fetch(
        `${ctx.baseUrl}/template-packs/projects/${ctx.projectId}/assign`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            template_pack_id: pack.id,
          }),
        }
      );
      expect(installRes.status).toBe(201);

      // Verify installation
      const listRes = await fetch(
        `${ctx.baseUrl}/template-packs/projects/${ctx.projectId}/installed`,
        { headers: makeHeaders() }
      );
      expect(listRes.status).toBe(200);
      const installed = await listRes.json();

      // Should have at least one template pack installed
      expect(Array.isArray(installed)).toBe(true);
      const installedPack = installed.find(
        (p: any) =>
          p.template_pack?.id === pack.id || p.template_pack_id === pack.id
      );
      expect(installedPack).toBeDefined();
    });
  });

  describe('Extraction Job with Relationships', () => {
    it('should create extraction job for document with relational content', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create template pack with relationship schemas
      const packRes = await fetch(`${ctx.baseUrl}/template-packs`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          name: 'Org Chart Pack',
          version: '1.0.0',
          object_type_schemas: {
            Person: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                title: { type: 'string' },
              },
            },
            Organization: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
              },
            },
          },
          relationship_type_schemas: {
            works_for: {
              type: 'object',
              source_types: ['Person'],
              target_types: ['Organization'],
              properties: {},
            },
            reports_to: {
              type: 'object',
              source_types: ['Person'],
              target_types: ['Person'],
              properties: {},
            },
          },
          extraction_prompts: {
            extraction:
              'Extract people and organizations with their relationships.',
          },
        }),
      });
      expect(packRes.status).toBe(201);
      const pack = await packRes.json();

      // Install pack on project
      const installRes = await fetch(
        `${ctx.baseUrl}/template-packs/projects/${ctx.projectId}/assign`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ template_pack_id: pack.id }),
        }
      );
      expect(installRes.status).toBe(201);

      // Create document with relational content
      const docRes = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: ctx.projectId,
          name: 'Company Org Structure',
          type: 'text/plain',
          content: `
            TechCorp Organization Structure

            John Smith is the CEO of TechCorp. He oversees all operations.

            Sarah Johnson is the VP of Engineering. She reports to John Smith.
            Sarah leads the engineering department which has 50 engineers.

            Mike Chen is a Senior Engineer who works for TechCorp.
            He reports to Sarah Johnson and focuses on backend development.

            Lisa Wang is the VP of Product. She also reports to John Smith.
            She manages the product team and works closely with engineering.

            TechCorp is headquartered in San Francisco and was founded in 2015.
          `,
          metadata: { source: 'test-org-chart' },
        }),
      });

      expect(docRes.status).toBe(201);
      const doc = await docRes.json();
      const documentId = doc.id;

      // Create extraction job with all types
      const jobRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: ctx.projectId,
          source_type: ExtractionSourceType.DOCUMENT,
          source_id: documentId,
          extraction_config: {
            allowed_types: ['Person', 'Organization'],
            target_types: ['Person', 'Organization'],
            auto_create_types: true,
          },
        }),
      });

      expect(jobRes.status).toBe(201);
      const job = await jobRes.json();

      expect(job.id).toBeDefined();
      expect(job.project_id).toBe(ctx.projectId);
      expect(job.status).toBe('pending');
      expect(job.source_type).toBe('document');
      expect(job.source_id).toBe(documentId);
    });

    it('should fetch job details with relationship extraction metadata', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create document
      const docRes = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: ctx.projectId,
          name: 'Test Document',
          type: 'text/plain',
          content: 'Alice works for Acme Corp.',
        }),
      });
      const doc = await docRes.json();

      // Create extraction job
      const jobRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: ctx.projectId,
          source_type: ExtractionSourceType.DOCUMENT,
          source_id: doc.id,
          extraction_config: {
            allowed_types: ['Person', 'Organization'],
            target_types: ['Person', 'Organization'],
            auto_create_types: true,
          },
        }),
      });
      const job = await jobRes.json();

      // Fetch job details
      const detailsRes = await fetch(
        `${ctx.baseUrl}/admin/extraction-jobs/${job.id}`,
        { headers: makeHeaders() }
      );

      expect(detailsRes.status).toBe(200);
      const details = await detailsRes.json();

      expect(details.id).toBe(job.id);
      expect(details.project_id).toBe(ctx.projectId);
      expect(details.extraction_config).toBeDefined();
      expect(details.extraction_config.allowed_types).toContain('Person');
      expect(details.extraction_config.allowed_types).toContain('Organization');
    });
  });

  describe('Graph Object and Relationship Verification', () => {
    it('should create graph objects via API (simulating extraction result)', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create source object (Person)
      const personRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'Person',
          key: 'john-smith-ceo',
          properties: {
            name: 'John Smith',
            title: 'CEO',
          },
        }),
      });

      expect(personRes.status).toBe(201);
      const person = await personRes.json();
      expect(person.id).toBeDefined();
      expect(person.type).toBe('Person');
      expect(person.properties.name).toBe('John Smith');

      // Create target object (Organization)
      const orgRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'Organization',
          key: 'techcorp-company',
          properties: {
            name: 'TechCorp',
            type: 'Company',
          },
        }),
      });

      expect(orgRes.status).toBe(201);
      const org = await orgRes.json();
      expect(org.id).toBeDefined();
      expect(org.type).toBe('Organization');
    });

    it('should create relationships between graph objects', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create Person
      const personRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'Person',
          key: 'alice-developer',
          properties: { name: 'Alice Developer' },
        }),
      });
      const person = await personRes.json();

      // Create Organization
      const orgRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'Organization',
          key: 'devcorp-org',
          properties: { name: 'DevCorp' },
        }),
      });
      const org = await orgRes.json();

      // Create relationship
      const relRes = await fetch(`${ctx.baseUrl}/graph/relationships`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'works_for',
          src_id: person.id,
          dst_id: org.id,
          properties: {
            role: 'Software Engineer',
            start_date: '2023-01-15',
            _extraction_source: 'test',
          },
        }),
      });

      expect(relRes.status).toBe(201);
      const relationship = await relRes.json();

      expect(relationship.id).toBeDefined();
      expect(relationship.type).toBe('works_for');
      expect(relationship.src_id).toBe(person.id);
      expect(relationship.dst_id).toBe(org.id);
      expect(relationship.properties.role).toBe('Software Engineer');
    });

    it('should prevent self-loop relationships', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create Person
      const personRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'Person',
          key: 'self-referential',
          properties: { name: 'Self Referential' },
        }),
      });
      const person = await personRes.json();

      // Try to create self-loop relationship
      const relRes = await fetch(`${ctx.baseUrl}/graph/relationships`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'knows',
          src_id: person.id,
          dst_id: person.id, // Same as source
          properties: {},
        }),
      });

      expect(relRes.status).toBe(400);
      const error = await relRes.json();
      // Handle different error response formats
      const errorMessage =
        error.message || error.error?.message || JSON.stringify(error);
      expect(errorMessage).toContain('self_loop');
    });

    it('should handle relationship between non-existent objects', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      const fakeId1 = '00000000-0000-0000-0000-000000000001';
      const fakeId2 = '00000000-0000-0000-0000-000000000002';

      // Try to create relationship with non-existent objects
      const relRes = await fetch(`${ctx.baseUrl}/graph/relationships`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'works_for',
          src_id: fakeId1,
          dst_id: fakeId2,
          properties: {},
        }),
      });

      expect(relRes.status).toBe(404);
    });

    it('should create multiple relationships from same source', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create Person (manager)
      const managerRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'Person',
          key: 'manager-bob',
          properties: { name: 'Manager Bob' },
        }),
      });
      const manager = await managerRes.json();

      // Create two direct reports
      const report1Res = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'Person',
          key: 'report-alice',
          properties: { name: 'Report Alice' },
        }),
      });
      const report1 = await report1Res.json();

      const report2Res = await fetch(`${ctx.baseUrl}/graph/objects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'Person',
          key: 'report-charlie',
          properties: { name: 'Report Charlie' },
        }),
      });
      const report2 = await report2Res.json();

      // Create management relationships
      const rel1Res = await fetch(`${ctx.baseUrl}/graph/relationships`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'manages',
          src_id: manager.id,
          dst_id: report1.id,
          properties: { direct_report: true },
        }),
      });
      expect(rel1Res.status).toBe(201);

      const rel2Res = await fetch(`${ctx.baseUrl}/graph/relationships`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'manages',
          src_id: manager.id,
          dst_id: report2.id,
          properties: { direct_report: true },
        }),
      });
      expect(rel2Res.status).toBe(201);

      // Both relationships should exist
      const rel1 = await rel1Res.json();
      const rel2 = await rel2Res.json();

      expect(rel1.src_id).toBe(manager.id);
      expect(rel2.src_id).toBe(manager.id);
      expect(rel1.dst_id).toBe(report1.id);
      expect(rel2.dst_id).toBe(report2.id);
    });
  });

  describe('Extraction Config Loading with Relationships', () => {
    it('should load relationship schemas from installed template packs', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create and install template pack
      const packRes = await fetch(`${ctx.baseUrl}/template-packs`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          name: 'Schema Loading Test Pack',
          version: '1.0.0',
          object_type_schemas: {
            Meeting: {
              type: 'object',
              properties: { title: { type: 'string' } },
            },
            Decision: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
          relationship_type_schemas: {
            made_during: {
              type: 'object',
              description: 'Decision made during a meeting',
              source_types: ['Decision'],
              target_types: ['Meeting'],
              properties: {},
            },
            follows_up: {
              type: 'object',
              description: 'Follow-up relationship between decisions',
              source_types: ['Decision'],
              target_types: ['Decision'],
              properties: {},
            },
          },
        }),
      });
      const pack = await packRes.json();

      // Install on project
      await fetch(
        `${ctx.baseUrl}/template-packs/projects/${ctx.projectId}/assign`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ template_pack_id: pack.id }),
        }
      );

      // Verify pack is installed
      const listRes = await fetch(
        `${ctx.baseUrl}/template-packs/projects/${ctx.projectId}/installed`,
        { headers: makeHeaders() }
      );
      expect(listRes.status).toBe(200);
      const installed = await listRes.json();

      const installedPack = installed.find(
        (p: any) =>
          p.template_pack?.id === pack.id || p.template_pack_id === pack.id
      );
      expect(installedPack).toBeDefined();
      // Access relationship schemas from the nested template_pack object
      const schemas =
        installedPack.template_pack?.relationship_type_schemas ||
        installedPack.relationship_type_schemas;
      expect(schemas).toBeDefined();
      expect(schemas.made_during).toBeDefined();
      expect(schemas.follows_up).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty relationship_type_schemas in template pack', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create template pack without relationship schemas
      const packRes = await fetch(`${ctx.baseUrl}/template-packs`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          name: 'No Relationships Pack',
          version: '1.0.0',
          object_type_schemas: {
            Note: { type: 'object', properties: { text: { type: 'string' } } },
          },
          // No relationship_type_schemas
        }),
      });

      expect(packRes.status).toBe(201);
      const pack = await packRes.json();

      // relationship_type_schemas should default to empty object
      expect(pack.relationship_type_schemas).toBeDefined();
      expect(Object.keys(pack.relationship_type_schemas || {}).length).toBe(0);
    });

    it('should allow extraction job creation without relationship schemas', async () => {
      const jsonHeaders = makeHeaders({ contentType: true });

      // Create document
      const docRes = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: ctx.projectId,
          name: 'Simple Document',
          type: 'text/plain',
          content: 'This is a simple document with no relationships.',
        }),
      });
      const doc = await docRes.json();

      // Create extraction job (no template pack with relationships installed)
      const jobRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: ctx.projectId,
          source_type: ExtractionSourceType.DOCUMENT,
          source_id: doc.id,
          extraction_config: {
            allowed_types: ['Note'],
            target_types: ['Note'],
            auto_create_types: true,
          },
        }),
      });

      expect(jobRes.status).toBe(201);
      const job = await jobRes.json();
      expect(job.status).toBe('queued');
    });
  });
});
