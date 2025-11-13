import { Test, TestingModule } from '@nestjs/testing';
import { ConfidenceScorerService } from '../../../src/modules/extraction-jobs/confidence-scorer.service';
import { ExtractedEntity } from '../../../src/modules/extraction-jobs/llm/llm-provider.interface';

describe('ConfidenceScorerService', () => {
    let service: ConfidenceScorerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ConfidenceScorerService],
        }).compile();

        service = module.get<ConfidenceScorerService>(ConfidenceScorerService);
    });

    describe('calculateConfidence', () => {
        it('should score high-quality entity with all fields populated', () => {
            const entity: ExtractedEntity = {
                type_name: 'Application Component',
                name: 'User Authentication Service',
                description: 'A comprehensive authentication service that handles user login, registration, password reset, and session management. Implements OAuth 2.0 and supports multiple authentication providers including Google, Facebook, and enterprise SSO.',
                confidence: 0.95,
                properties: {
                    technology_stack: 'Node.js, Express, Passport.js',
                    deployment_environment: 'AWS ECS',
                    api_version: '2.1.0',
                    supported_protocols: ['OAuth2', 'SAML', 'OpenID Connect'],
                    active_users: 125000,
                    uptime_sla: '99.9%',
                    last_updated: '2024-10-01',
                    security_compliance: 'SOC2, ISO27001',
                },
            };

            const score = service.calculateConfidence(entity);

            // High quality should score > 0.85
            expect(score).toBeGreaterThan(0.85);
            expect(score).toBeLessThanOrEqual(1.0);
        });

        it('should score medium-quality entity with minimal fields', () => {
            const entity: ExtractedEntity = {
                type_name: 'Business Process',
                name: 'Invoice Processing',
                description: 'Process for handling invoices',
                properties: {
                    owner: 'Finance Team',
                    frequency: 'Daily',
                    status: 'Active',
                },
            };

            const score = service.calculateConfidence(entity);

            // Medium quality should score 0.5-0.75
            expect(score).toBeGreaterThan(0.4);
            expect(score).toBeLessThan(0.8);
        });

        it('should score low for entity with missing required fields', () => {
            const entity: ExtractedEntity = {
                type_name: '',
                name: 'Test',
                description: '',
            };

            const score = service.calculateConfidence(entity);

            // Missing critical fields should score low (< 0.5)
            expect(score).toBeLessThan(0.5);
        });

        it('should score low for entity with empty/null properties', () => {
            const entity: ExtractedEntity = {
                type_name: 'Data Store',
                name: 'Cache Layer',
                description: 'Redis cache',
                properties: {
                    field1: null,
                    field2: undefined,
                    field3: '',
                    field4: 'N/A',
                },
            };

            const score = service.calculateConfidence(entity);

            // Poor property quality should reduce score
            expect(score).toBeLessThan(0.7);
        });

        it('should handle entity without properties', () => {
            const entity: ExtractedEntity = {
                type_name: 'Component',
                name: 'Test Component',
                description: 'A component for testing purposes',
            };

            const score = service.calculateConfidence(entity);

            // Should still calculate (baseline score)
            expect(score).toBeGreaterThan(0.0);
            expect(score).toBeLessThanOrEqual(1.0);
        });

        it('should validate type against allowed types', () => {
            const entity: ExtractedEntity = {
                type_name: 'Unknown Type',
                name: 'Test Entity',
                description: 'An entity with an unknown type',
                properties: { key: 'value' },
            };

            const allowedTypes = ['Application Component', 'Business Process', 'Data Store'];
            const score = service.calculateConfidence(entity, allowedTypes);

            // Invalid type should reduce score
            expect(score).toBeLessThan(0.7);
        });

        it('should accept valid type from allowed types', () => {
            const entity: ExtractedEntity = {
                type_name: 'Application Component',
                name: 'Test Service',
                description: 'A valid application component for testing',
                properties: {
                    technology: 'TypeScript',
                    version: '1.0.0',
                },
            };

            const allowedTypes = ['Application Component', 'Business Process', 'Data Store'];
            const score = service.calculateConfidence(entity, allowedTypes);

            // Valid type should not reduce score
            expect(score).toBeGreaterThan(0.5);
        });

        it('should use LLM confidence when provided', () => {
            const highConfidenceEntity: ExtractedEntity = {
                type_name: 'Service',
                name: 'API Gateway',
                description: 'Main API gateway for the platform',
                confidence: 0.95,
                properties: { port: 8080 },
            };

            const lowConfidenceEntity: ExtractedEntity = {
                ...highConfidenceEntity,
                confidence: 0.3,
            };

            const highScore = service.calculateConfidence(highConfidenceEntity);
            const lowScore = service.calculateConfidence(lowConfidenceEntity);

            // LLM confidence should affect total score
            expect(highScore).toBeGreaterThan(lowScore);
        });

        it('should handle very short descriptions', () => {
            const entity: ExtractedEntity = {
                type_name: 'Service',
                name: 'Test',
                description: 'Short',
                properties: {},
            };

            const score = service.calculateConfidence(entity);

            // Short description should reduce evidence quality score
            expect(score).toBeLessThan(0.6);
        });

        it('should reward rich property sets', () => {
            const sparseEntity: ExtractedEntity = {
                type_name: 'Component',
                name: 'Sparse Component',
                description: 'Component with minimal properties',
                properties: {
                    status: 'Active',
                },
            };

            const richEntity: ExtractedEntity = {
                type_name: 'Component',
                name: 'Rich Component',
                description: 'Component with many well-defined properties',
                properties: {
                    status: 'Active',
                    version: '2.1.0',
                    owner: 'Platform Team',
                    technology: 'TypeScript',
                    deployment_env: 'Production',
                    criticality: 'High',
                    compliance: 'SOC2',
                    documentation_url: 'https://docs.example.com',
                    support_team: 'DevOps',
                    maintenance_window: 'Sundays 2-4 AM UTC',
                },
            };

            const sparseScore = service.calculateConfidence(sparseEntity);
            const richScore = service.calculateConfidence(richEntity);

            // Rich properties should score higher
            expect(richScore).toBeGreaterThan(sparseScore);
        });

        it('should handle error gracefully and return conservative score', () => {
            // Create entity that could cause errors
            const problematicEntity = {
                type_name: 'Test',
                name: 'Error Test',
            } as ExtractedEntity;

            // Mock error scenario by passing invalid data
            const score = service.calculateConfidence(problematicEntity);

            // Should return a valid score even on error
            expect(score).toBeGreaterThanOrEqual(0.0);
            expect(score).toBeLessThanOrEqual(1.0);
        });

        it('should score different value types appropriately', () => {
            const entity: ExtractedEntity = {
                type_name: 'Configuration',
                name: 'System Config',
                description: 'System configuration with various value types',
                properties: {
                    string_value: 'This is a detailed string value with good content',
                    number_value: 42,
                    boolean_value: true,
                    array_value: ['item1', 'item2', 'item3'],
                    object_value: { nested: 'data', count: 5 },
                    empty_string: '',
                    short_string: 'OK',
                    null_value: null,
                },
            };

            const score = service.calculateConfidence(entity);

            // Mixed quality properties should give moderate score
            expect(score).toBeGreaterThan(0.5);
            expect(score).toBeLessThan(0.9);
        });
    });

    describe('getConfidenceBreakdown', () => {
        it('should return detailed breakdown with all components', () => {
            const entity: ExtractedEntity = {
                type_name: 'Service',
                name: 'Test Service',
                description: 'A test service for breakdown analysis',
                confidence: 0.8,
                properties: {
                    version: '1.0.0',
                    status: 'Active',
                },
            };

            const breakdown = service.getConfidenceBreakdown(entity);

            expect(breakdown).toHaveProperty('total');
            expect(breakdown).toHaveProperty('components');
            expect(breakdown).toHaveProperty('weights');

            expect(breakdown.components).toHaveProperty('llmConfidence');
            expect(breakdown.components).toHaveProperty('schemaCompleteness');
            expect(breakdown.components).toHaveProperty('evidenceQuality');
            expect(breakdown.components).toHaveProperty('propertyQuality');

            // All components should be in valid range
            expect(breakdown.components.llmConfidence).toBeGreaterThanOrEqual(0);
            expect(breakdown.components.llmConfidence).toBeLessThanOrEqual(1);
            expect(breakdown.components.schemaCompleteness).toBeGreaterThanOrEqual(0);
            expect(breakdown.components.schemaCompleteness).toBeLessThanOrEqual(1);
            expect(breakdown.components.evidenceQuality).toBeGreaterThanOrEqual(0);
            expect(breakdown.components.evidenceQuality).toBeLessThanOrEqual(1);
            expect(breakdown.components.propertyQuality).toBeGreaterThanOrEqual(0);
            expect(breakdown.components.propertyQuality).toBeLessThanOrEqual(1);

            // Total should be in valid range
            expect(breakdown.total).toBeGreaterThanOrEqual(0);
            expect(breakdown.total).toBeLessThanOrEqual(1);
        });

        it('should show low schema completeness for missing fields', () => {
            const entity: ExtractedEntity = {
                type_name: '',
                name: '',
                description: '',
            };

            const breakdown = service.getConfidenceBreakdown(entity);

            // Schema completeness should be low when required fields are missing
            expect(breakdown.components.schemaCompleteness).toBeLessThan(0.5);
        });

        it('should show weights sum to 1.0', () => {
            const entity: ExtractedEntity = {
                type_name: 'Test',
                name: 'Test',
                description: 'Test',
            };

            const breakdown = service.getConfidenceBreakdown(entity);

            const weightSum =
                breakdown.weights.llmConfidence +
                breakdown.weights.schemaCompleteness +
                breakdown.weights.evidenceQuality +
                breakdown.weights.propertyQuality;

            expect(weightSum).toBeCloseTo(1.0, 5);
        });

        it('should match calculateConfidence result', () => {
            const entity: ExtractedEntity = {
                type_name: 'Component',
                name: 'Test Component',
                description: 'A component with good properties',
                confidence: 0.85,
                properties: {
                    version: '2.0.0',
                    status: 'Production',
                    team: 'Platform Engineering',
                },
            };

            const directScore = service.calculateConfidence(entity);
            const breakdown = service.getConfidenceBreakdown(entity);

            // Breakdown total should match direct calculation
            expect(breakdown.total).toBeCloseTo(directScore, 5);
        });
    });
});
