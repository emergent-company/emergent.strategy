#!/usr/bin/env npx tsx
/**
 * Seed TOGAF Enterprise Architecture Template Pack
 * Creates a comprehensive template pack with TOGAF-aligned types for IT enterprise architecture
 * 
 * Usage: npx tsx scripts/seed-togaf-template.ts
 */

import { config } from 'dotenv';
import { Client } from 'pg';
import { exit } from 'process';
import { validateEnvVars, DB_REQUIREMENTS, getDbConfig } from './lib/env-validator.js';

// Load environment variables
config();

interface CreateTemplatePackDto {
    name: string;
    version: string;
    description?: string;
    author?: string;
    license?: string;
    repository_url?: string;
    documentation_url?: string;
    object_type_schemas: Record<string, any>;
    relationship_type_schemas?: Record<string, any>;
    ui_configs?: Record<string, any>;
    extraction_prompts?: Record<string, any>;
    sql_views?: any[];
}

/**
 * TOGAF-aligned template pack definition
 * Based on TOGAF Architecture Development Method (ADM) and Content Metamodel
 */
const TOGAF_TEMPLATE_PACK: CreateTemplatePackDto = {
    name: 'TOGAF Enterprise Architecture',
    version: '1.0.0',
    description: 'Comprehensive TOGAF-aligned template pack for IT enterprise architecture modeling and documentation',
    author: 'Enterprise Architecture Team',
    license: 'Internal Use',
    documentation_url: 'https://www.opengroup.org/togaf',

    // Core TOGAF object type schemas
    object_type_schemas: {
        // ========================================
        // BUSINESS ARCHITECTURE TYPES
        // ========================================

        BusinessCapability: {
            type: 'object',
            required: ['name', 'level', 'category'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Business capability name',
                    examples: ['Customer Management', 'Financial Reporting', 'Supply Chain Management']
                },
                description: {
                    type: 'string',
                    description: 'Detailed description of the business capability'
                },
                level: {
                    type: 'string',
                    enum: ['L0', 'L1', 'L2', 'L3', 'L4'],
                    description: 'Capability decomposition level (L0=Strategic, L1=Domain, L2=Functional, L3=Subfunctional, L4=Activity)'
                },
                category: {
                    type: 'string',
                    enum: ['Core', 'Supporting', 'Management'],
                    description: 'Business capability category'
                },
                parent_capability: {
                    type: 'string',
                    description: 'Parent capability ID for hierarchical modeling'
                },
                maturity_level: {
                    type: 'string',
                    enum: ['Initial', 'Repeatable', 'Defined', 'Managed', 'Optimized'],
                    description: 'Current maturity level of the capability'
                },
                strategic_importance: {
                    type: 'string',
                    enum: ['Critical', 'Important', 'Useful', 'Nice-to-Have'],
                    description: 'Strategic importance to the organization'
                },
                business_value: {
                    type: 'string',
                    enum: ['High', 'Medium', 'Low'],
                    description: 'Expected business value delivery'
                }
            }
        },

        BusinessProcess: {
            type: 'object',
            required: ['name', 'type', 'owner'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Business process name',
                    examples: ['Order Processing', 'Invoice Generation', 'Employee Onboarding']
                },
                description: {
                    type: 'string',
                    description: 'Detailed process description'
                },
                type: {
                    type: 'string',
                    enum: ['Core', 'Support', 'Management', 'Governance'],
                    description: 'Process type classification'
                },
                owner: {
                    type: 'string',
                    description: 'Business process owner (role or person)'
                },
                maturity: {
                    type: 'string',
                    enum: ['Ad-hoc', 'Managed', 'Standardized', 'Predictable', 'Optimizing'],
                    description: 'Process maturity level'
                },
                automation_level: {
                    type: 'string',
                    enum: ['Manual', 'Semi-Automated', 'Automated', 'Fully-Automated'],
                    description: 'Current automation level'
                },
                frequency: {
                    type: 'string',
                    enum: ['Continuous', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Event-Driven'],
                    description: 'Process execution frequency'
                },
                complexity: {
                    type: 'string',
                    enum: ['Simple', 'Moderate', 'Complex', 'Very Complex'],
                    description: 'Process complexity assessment'
                }
            }
        },

        BusinessService: {
            type: 'object',
            required: ['name', 'service_type', 'provider'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Business service name',
                    examples: ['Customer Support', 'Financial Advisory', 'Technical Consulting']
                },
                description: {
                    type: 'string',
                    description: 'Service description and value proposition'
                },
                service_type: {
                    type: 'string',
                    enum: ['Internal', 'External', 'Shared', 'Outsourced'],
                    description: 'Type of business service'
                },
                provider: {
                    type: 'string',
                    description: 'Service provider (department, team, or external vendor)'
                },
                consumers: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of service consumers'
                },
                sla_requirements: {
                    type: 'string',
                    description: 'Service level agreement requirements'
                },
                availability: {
                    type: 'string',
                    enum: ['24/7', 'Business Hours', 'Extended Hours', 'On-Demand'],
                    description: 'Service availability requirements'
                }
            }
        },

        // ========================================
        // APPLICATION ARCHITECTURE TYPES
        // ========================================

        Application: {
            type: 'object',
            required: ['name', 'type', 'status', 'criticality'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Application name',
                    examples: ['CRM System', 'ERP Platform', 'Data Warehouse', 'Mobile App']
                },
                description: {
                    type: 'string',
                    description: 'Application description and purpose'
                },
                type: {
                    type: 'string',
                    enum: ['COTS', 'Custom', 'SaaS', 'Open Source', 'Legacy', 'Cloud Native'],
                    description: 'Application type classification'
                },
                status: {
                    type: 'string',
                    enum: ['Production', 'Development', 'Testing', 'Staging', 'Retired', 'Planned'],
                    description: 'Current application status'
                },
                criticality: {
                    type: 'string',
                    enum: ['Mission Critical', 'Business Critical', 'Important', 'Utility'],
                    description: 'Business criticality level'
                },
                vendor: {
                    type: 'string',
                    description: 'Application vendor or supplier'
                },
                version: {
                    type: 'string',
                    description: 'Current application version'
                },
                license_type: {
                    type: 'string',
                    enum: ['Commercial', 'Open Source', 'Freemium', 'Subscription', 'Enterprise'],
                    description: 'Software license type'
                },
                hosting_model: {
                    type: 'string',
                    enum: ['On-Premise', 'Cloud', 'Hybrid', 'SaaS', 'Managed'],
                    description: 'Application hosting model'
                },
                technology_stack: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Technology stack components'
                },
                data_classification: {
                    type: 'string',
                    enum: ['Public', 'Internal', 'Confidential', 'Restricted'],
                    description: 'Data classification level handled by application'
                }
            }
        },

        ApplicationComponent: {
            type: 'object',
            required: ['name', 'component_type', 'parent_application'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Application component name',
                    examples: ['User Interface', 'Business Logic Layer', 'Data Access Layer', 'API Gateway']
                },
                description: {
                    type: 'string',
                    description: 'Component description and functionality'
                },
                component_type: {
                    type: 'string',
                    enum: ['Presentation', 'Business Logic', 'Data', 'Integration', 'Security', 'Infrastructure'],
                    description: 'Type of application component'
                },
                parent_application: {
                    type: 'string',
                    description: 'Parent application ID'
                },
                technology: {
                    type: 'string',
                    description: 'Primary technology used'
                },
                interfaces: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'External interfaces provided or consumed'
                }
            }
        },

        API: {
            type: 'object',
            required: ['name', 'type', 'protocol', 'status'],
            properties: {
                name: {
                    type: 'string',
                    description: 'API name',
                    examples: ['Customer API', 'Payment Gateway API', 'Inventory Management API']
                },
                description: {
                    type: 'string',
                    description: 'API description and capabilities'
                },
                type: {
                    type: 'string',
                    enum: ['REST', 'GraphQL', 'SOAP', 'gRPC', 'WebSocket', 'Event-Driven'],
                    description: 'API type and architectural style'
                },
                protocol: {
                    type: 'string',
                    enum: ['HTTP/HTTPS', 'TCP', 'UDP', 'Message Queue', 'Event Stream'],
                    description: 'Communication protocol'
                },
                status: {
                    type: 'string',
                    enum: ['Active', 'Deprecated', 'Beta', 'Alpha', 'Planned', 'Retired'],
                    description: 'API lifecycle status'
                },
                version: {
                    type: 'string',
                    description: 'API version'
                },
                base_url: {
                    type: 'string',
                    description: 'API base URL or endpoint'
                },
                authentication: {
                    type: 'string',
                    enum: ['None', 'API Key', 'OAuth 2.0', 'JWT', 'Basic Auth', 'Certificate'],
                    description: 'Authentication mechanism'
                },
                rate_limit: {
                    type: 'string',
                    description: 'API rate limiting policy'
                },
                documentation_url: {
                    type: 'string',
                    description: 'Link to API documentation'
                }
            }
        },

        // ========================================
        // DATA ARCHITECTURE TYPES
        // ========================================

        Database: {
            type: 'object',
            required: ['name', 'type', 'engine', 'purpose'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Database name',
                    examples: ['Customer Database', 'Transaction Data Warehouse', 'Configuration Store']
                },
                description: {
                    type: 'string',
                    description: 'Database description and purpose'
                },
                type: {
                    type: 'string',
                    enum: ['OLTP', 'OLAP', 'Data Warehouse', 'Data Lake', 'Cache', 'Configuration', 'Log Store'],
                    description: 'Database type classification'
                },
                engine: {
                    type: 'string',
                    enum: ['PostgreSQL', 'MySQL', 'Oracle', 'SQL Server', 'MongoDB', 'Redis', 'Cassandra', 'Elasticsearch'],
                    description: 'Database engine or technology'
                },
                purpose: {
                    type: 'string',
                    enum: ['Operational', 'Analytical', 'Archive', 'Backup', 'Staging', 'Development'],
                    description: 'Primary database purpose'
                },
                size_gb: {
                    type: 'number',
                    description: 'Database size in gigabytes'
                },
                retention_policy: {
                    type: 'string',
                    description: 'Data retention policy'
                },
                backup_frequency: {
                    type: 'string',
                    enum: ['Real-time', 'Hourly', 'Daily', 'Weekly', 'Monthly'],
                    description: 'Backup frequency'
                },
                encryption: {
                    type: 'boolean',
                    description: 'Whether data is encrypted at rest'
                },
                compliance_requirements: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Applicable compliance requirements (GDPR, HIPAA, etc.)'
                }
            }
        },

        DataEntity: {
            type: 'object',
            required: ['name', 'entity_type', 'classification'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Data entity name',
                    examples: ['Customer', 'Order', 'Product', 'Invoice', 'Employee']
                },
                description: {
                    type: 'string',
                    description: 'Data entity description'
                },
                entity_type: {
                    type: 'string',
                    enum: ['Master Data', 'Reference Data', 'Transaction Data', 'Analytical Data', 'Metadata'],
                    description: 'Type of data entity'
                },
                classification: {
                    type: 'string',
                    enum: ['Public', 'Internal', 'Confidential', 'Restricted'],
                    description: 'Data classification level'
                },
                attributes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            required: { type: 'boolean' },
                            sensitive: { type: 'boolean' }
                        }
                    },
                    description: 'Data entity attributes'
                },
                steward: {
                    type: 'string',
                    description: 'Data steward responsible for this entity'
                },
                source_systems: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Systems that create or update this data'
                },
                quality_rules: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Data quality rules and constraints'
                }
            }
        },

        // ========================================
        // TECHNOLOGY ARCHITECTURE TYPES
        // ========================================

        Infrastructure: {
            type: 'object',
            required: ['name', 'type', 'category', 'status'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Infrastructure component name',
                    examples: ['Web Server Cluster', 'Load Balancer', 'Firewall', 'Storage Array']
                },
                description: {
                    type: 'string',
                    description: 'Infrastructure component description'
                },
                type: {
                    type: 'string',
                    enum: ['Physical', 'Virtual', 'Cloud', 'Container', 'Serverless'],
                    description: 'Infrastructure type'
                },
                category: {
                    type: 'string',
                    enum: ['Compute', 'Storage', 'Network', 'Security', 'Monitoring', 'Backup'],
                    description: 'Infrastructure category'
                },
                status: {
                    type: 'string',
                    enum: ['Active', 'Maintenance', 'Planned', 'Decommissioned', 'Emergency'],
                    description: 'Current operational status'
                },
                location: {
                    type: 'string',
                    description: 'Physical or logical location'
                },
                vendor: {
                    type: 'string',
                    description: 'Infrastructure vendor or provider'
                },
                model: {
                    type: 'string',
                    description: 'Model or SKU information'
                },
                capacity: {
                    type: 'string',
                    description: 'Capacity specifications'
                },
                cost_center: {
                    type: 'string',
                    description: 'Cost center or budget allocation'
                },
                support_level: {
                    type: 'string',
                    enum: ['Gold', 'Silver', 'Bronze', 'Basic', 'Extended'],
                    description: 'Support level agreement'
                },
                maintenance_schedule: {
                    type: 'string',
                    description: 'Maintenance schedule and windows'
                }
            }
        },

        TechnologyStandard: {
            type: 'object',
            required: ['name', 'category', 'status', 'compliance_level'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Technology standard name',
                    examples: ['Java Development Standard', 'API Design Standard', 'Security Standard']
                },
                description: {
                    type: 'string',
                    description: 'Standard description and scope'
                },
                category: {
                    type: 'string',
                    enum: ['Development', 'Integration', 'Security', 'Infrastructure', 'Data', 'UI/UX'],
                    description: 'Standard category'
                },
                status: {
                    type: 'string',
                    enum: ['Active', 'Draft', 'Under Review', 'Deprecated', 'Superseded'],
                    description: 'Standard lifecycle status'
                },
                compliance_level: {
                    type: 'string',
                    enum: ['Mandatory', 'Recommended', 'Optional', 'Discouraged', 'Prohibited'],
                    description: 'Compliance requirement level'
                },
                version: {
                    type: 'string',
                    description: 'Standard version'
                },
                owner: {
                    type: 'string',
                    description: 'Standard owner or governance body'
                },
                effective_date: {
                    type: 'string',
                    format: 'date',
                    description: 'Effective date of the standard'
                },
                review_date: {
                    type: 'string',
                    format: 'date',
                    description: 'Next review date'
                },
                document_url: {
                    type: 'string',
                    description: 'Link to standard documentation'
                }
            }
        },

        // ========================================
        // PROJECT AND GOVERNANCE TYPES
        // ========================================

        Project: {
            type: 'object',
            required: ['name', 'type', 'status', 'priority'],
            properties: {
                name: {
                    type: 'string',
                    description: 'Project name',
                    examples: ['Digital Transformation Initiative', 'Cloud Migration', 'System Integration']
                },
                description: {
                    type: 'string',
                    description: 'Project description and objectives'
                },
                type: {
                    type: 'string',
                    enum: ['Strategic', 'Operational', 'Compliance', 'Innovation', 'Maintenance'],
                    description: 'Project type classification'
                },
                status: {
                    type: 'string',
                    enum: ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'],
                    description: 'Current project status'
                },
                priority: {
                    type: 'string',
                    enum: ['Critical', 'High', 'Medium', 'Low'],
                    description: 'Project priority level'
                },
                start_date: {
                    type: 'string',
                    format: 'date',
                    description: 'Project start date'
                },
                end_date: {
                    type: 'string',
                    format: 'date',
                    description: 'Project planned end date'
                },
                budget: {
                    type: 'number',
                    description: 'Project budget amount'
                },
                sponsor: {
                    type: 'string',
                    description: 'Project sponsor'
                },
                manager: {
                    type: 'string',
                    description: 'Project manager'
                },
                stakeholders: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key project stakeholders'
                },
                success_criteria: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Project success criteria'
                }
            }
        },

        Requirement: {
            type: 'object',
            required: ['title', 'type', 'priority', 'status'],
            properties: {
                title: {
                    type: 'string',
                    description: 'Requirement title',
                    examples: ['User Authentication', 'Data Encryption', 'System Performance']
                },
                description: {
                    type: 'string',
                    description: 'Detailed requirement description'
                },
                type: {
                    type: 'string',
                    enum: ['Functional', 'Non-Functional', 'Business', 'Technical', 'Compliance', 'Security'],
                    description: 'Requirement type classification'
                },
                priority: {
                    type: 'string',
                    enum: ['Must Have', 'Should Have', 'Could Have', 'Won\'t Have'],
                    description: 'Requirement priority (MoSCoW method)'
                },
                status: {
                    type: 'string',
                    enum: ['Draft', 'Approved', 'In Development', 'Testing', 'Implemented', 'Rejected'],
                    description: 'Current requirement status'
                },
                source: {
                    type: 'string',
                    description: 'Requirement source or stakeholder'
                },
                acceptance_criteria: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Acceptance criteria for the requirement'
                },
                business_justification: {
                    type: 'string',
                    description: 'Business justification for the requirement'
                },
                effort_estimate: {
                    type: 'string',
                    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
                    description: 'Development effort estimate'
                },
                risk_level: {
                    type: 'string',
                    enum: ['Low', 'Medium', 'High', 'Critical'],
                    description: 'Implementation risk level'
                }
            }
        },

        Document: {
            type: 'object',
            required: ['title', 'type', 'status'],
            properties: {
                title: {
                    type: 'string',
                    description: 'Document title',
                    examples: ['Architecture Decision Record', 'System Design Specification', 'User Manual']
                },
                description: {
                    type: 'string',
                    description: 'Document description and purpose'
                },
                type: {
                    type: 'string',
                    enum: ['Architecture', 'Design', 'Requirements', 'Process', 'Policy', 'Manual', 'Standard'],
                    description: 'Document type classification'
                },
                status: {
                    type: 'string',
                    enum: ['Draft', 'Under Review', 'Approved', 'Published', 'Archived', 'Superseded'],
                    description: 'Document lifecycle status'
                },
                version: {
                    type: 'string',
                    description: 'Document version'
                },
                author: {
                    type: 'string',
                    description: 'Document author'
                },
                reviewer: {
                    type: 'string',
                    description: 'Document reviewer or approver'
                },
                created_date: {
                    type: 'string',
                    format: 'date',
                    description: 'Document creation date'
                },
                last_updated: {
                    type: 'string',
                    format: 'date',
                    description: 'Last update date'
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Document tags for categorization'
                },
                file_url: {
                    type: 'string',
                    description: 'Link to document file'
                },
                confidentiality: {
                    type: 'string',
                    enum: ['Public', 'Internal', 'Confidential', 'Restricted'],
                    description: 'Document confidentiality level'
                }
            }
        }
    },

    // Relationship type schemas for connecting TOGAF entities
    relationship_type_schemas: {
        'supports': {
            type: 'object',
            properties: {
                strength: {
                    type: 'string',
                    enum: ['Strong', 'Medium', 'Weak'],
                    description: 'Strength of the support relationship'
                },
                criticality: {
                    type: 'string',
                    enum: ['Critical', 'Important', 'Optional'],
                    description: 'Criticality of the support'
                }
            }
        },
        'implements': {
            type: 'object',
            properties: {
                implementation_status: {
                    type: 'string',
                    enum: ['Planned', 'In Progress', 'Complete', 'Partial'],
                    description: 'Implementation status'
                },
                compliance_level: {
                    type: 'string',
                    enum: ['Full', 'Partial', 'Minimal'],
                    description: 'Level of compliance with requirement'
                }
            }
        },
        'depends_on': {
            type: 'object',
            properties: {
                dependency_type: {
                    type: 'string',
                    enum: ['Technical', 'Business', 'Data', 'Timing'],
                    description: 'Type of dependency'
                },
                criticality: {
                    type: 'string',
                    enum: ['Blocking', 'High', 'Medium', 'Low'],
                    description: 'Criticality of the dependency'
                }
            }
        },
        'communicates_with': {
            type: 'object',
            properties: {
                protocol: {
                    type: 'string',
                    description: 'Communication protocol used'
                },
                frequency: {
                    type: 'string',
                    enum: ['Real-time', 'Batch', 'On-demand', 'Scheduled'],
                    description: 'Communication frequency'
                },
                data_volume: {
                    type: 'string',
                    enum: ['Low', 'Medium', 'High', 'Very High'],
                    description: 'Volume of data exchanged'
                }
            }
        }
    },

    // UI configurations for better visualization
    ui_configs: {
        // Business Architecture
        BusinessCapability: {
            icon: 'building-storefront',
            color: '#3B82F6', // Blue
            category: 'Business Architecture'
        },
        BusinessProcess: {
            icon: 'arrow-path',
            color: '#10B981', // Green
            category: 'Business Architecture'
        },
        BusinessService: {
            icon: 'handshake',
            color: '#6366F1', // Indigo
            category: 'Business Architecture'
        },

        // Application Architecture
        Application: {
            icon: 'computer-desktop',
            color: '#8B5CF6', // Purple
            category: 'Application Architecture'
        },
        ApplicationComponent: {
            icon: 'puzzle-piece',
            color: '#A855F7', // Light purple
            category: 'Application Architecture'
        },
        API: {
            icon: 'link',
            color: '#06B6D4', // Cyan
            category: 'Application Architecture'
        },

        // Data Architecture
        Database: {
            icon: 'circle-stack',
            color: '#059669', // Emerald
            category: 'Data Architecture'
        },
        DataEntity: {
            icon: 'table-cells',
            color: '#0891B2', // Light blue
            category: 'Data Architecture'
        },

        // Technology Architecture
        Infrastructure: {
            icon: 'server',
            color: '#DC2626', // Red
            category: 'Technology Architecture'
        },
        TechnologyStandard: {
            icon: 'shield-check',
            color: '#7C2D12', // Brown
            category: 'Technology Architecture'
        },

        // Project and Governance
        Project: {
            icon: 'briefcase',
            color: '#EA580C', // Orange
            category: 'Project & Governance'
        },
        Requirement: {
            icon: 'clipboard-document-list',
            color: '#F59E0B', // Amber
            category: 'Project & Governance'
        },
        Document: {
            icon: 'document-text',
            color: '#6B7280', // Gray
            category: 'Project & Governance'
        }
    },

    // AI extraction prompts for each type
    extraction_prompts: {
        Application: {
            prompt: "Extract application information including name, type (COTS/Custom/SaaS), criticality level, hosting model, and technology stack. Look for vendor information, version details, and any compliance requirements.",
            examples: ["CRM system", "ERP platform", "mobile application", "web portal", "database application"]
        },
        API: {
            prompt: "Identify API definitions including REST/SOAP/GraphQL types, endpoints, authentication methods, and version information. Extract rate limiting and documentation references.",
            examples: ["REST API", "GraphQL endpoint", "SOAP service", "microservice API", "webhook endpoint"]
        },
        Database: {
            prompt: "Extract database information including engine type, purpose (OLTP/OLAP/Data Warehouse), size, retention policies, and compliance requirements.",
            examples: ["PostgreSQL database", "data warehouse", "cache store", "configuration database"]
        },
        Requirement: {
            prompt: "Identify functional and non-functional requirements with priority levels, acceptance criteria, and implementation status. Look for business justification and effort estimates.",
            examples: ["user authentication requirement", "performance requirement", "security requirement", "compliance requirement"]
        },
        BusinessCapability: {
            prompt: "Extract business capabilities with hierarchy levels, maturity assessments, and strategic importance. Identify capability categories and business value.",
            examples: ["customer management", "financial reporting", "supply chain", "human resources"]
        },
        Infrastructure: {
            prompt: "Identify infrastructure components including compute, storage, network, and security elements. Extract capacity, location, vendor, and support information.",
            examples: ["web server", "load balancer", "firewall", "storage array", "network switch"]
        }
    },

    // SQL views for common reporting needs
    sql_views: [
        {
            name: 'application_portfolio_view',
            description: 'Comprehensive view of application portfolio with criticality and technology information',
            sql: `
                SELECT 
                    o.id,
                    o.title as application_name,
                    (o.properties->>'type') as application_type,
                    (o.properties->>'criticality') as criticality,
                    (o.properties->>'status') as status,
                    (o.properties->>'vendor') as vendor,
                    (o.properties->>'hosting_model') as hosting_model,
                    o.created_at
                FROM kb.graph_objects o 
                WHERE o.type = 'Application' AND o.deleted_at IS NULL
                ORDER BY 
                    CASE (o.properties->>'criticality')
                        WHEN 'Mission Critical' THEN 1
                        WHEN 'Business Critical' THEN 2
                        WHEN 'Important' THEN 3
                        ELSE 4
                    END,
                    o.title
            `
        },
        {
            name: 'capability_maturity_view',
            description: 'Business capability maturity assessment view',
            sql: `
                SELECT 
                    o.id,
                    o.title as capability_name,
                    (o.properties->>'level') as capability_level,
                    (o.properties->>'category') as category,
                    (o.properties->>'maturity_level') as maturity_level,
                    (o.properties->>'strategic_importance') as strategic_importance,
                    (o.properties->>'business_value') as business_value
                FROM kb.graph_objects o 
                WHERE o.type = 'BusinessCapability' AND o.deleted_at IS NULL
                ORDER BY (o.properties->>'level'), o.title
            `
        }
    ]
};

/**
 * Initialize database connection
 */
async function createDbConnection(): Promise<Client> {
    // Validate required environment variables with helpful error messages
    validateEnvVars(DB_REQUIREMENTS);

    // Use validated env vars with no fallbacks
    const dbConfig = getDbConfig();
    const client = new Client({
        ...dbConfig,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });

    await client.connect();
    return client;
}

/**
 * Check if TOGAF template pack already exists
 */
async function checkExistingTemplatePack(client: Client): Promise<boolean> {
    const result = await client.query(
        'SELECT id FROM kb.graph_template_packs WHERE name = $1 AND version = $2',
        [TOGAF_TEMPLATE_PACK.name, TOGAF_TEMPLATE_PACK.version]
    );
    return result.rows.length > 0;
}

/**
 * Create TOGAF template pack
 */
async function createTogafTemplatePack(client: Client): Promise<string> {
    const result = await client.query(
        `INSERT INTO kb.graph_template_packs (
            name, version, description, author, license,
            documentation_url, object_type_schemas, relationship_type_schemas,
            ui_configs, extraction_prompts, sql_views, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
            TOGAF_TEMPLATE_PACK.name,
            TOGAF_TEMPLATE_PACK.version,
            TOGAF_TEMPLATE_PACK.description,
            TOGAF_TEMPLATE_PACK.author,
            TOGAF_TEMPLATE_PACK.license,
            TOGAF_TEMPLATE_PACK.documentation_url,
            JSON.stringify(TOGAF_TEMPLATE_PACK.object_type_schemas),
            JSON.stringify(TOGAF_TEMPLATE_PACK.relationship_type_schemas),
            JSON.stringify(TOGAF_TEMPLATE_PACK.ui_configs),
            JSON.stringify(TOGAF_TEMPLATE_PACK.extraction_prompts),
            JSON.stringify(TOGAF_TEMPLATE_PACK.sql_views),
            'system' // Mark as built-in/system template pack
        ]
    );

    return result.rows[0].id;
}

/**
 * Main execution function
 */
async function main() {
    console.log('🏛️  Starting TOGAF Template Pack Seeding...');

    let client: Client | null = null;

    try {
        // Connect to database
        client = await createDbConnection();
        console.log('✅ Connected to database');

        // Check if template pack already exists
        const exists = await checkExistingTemplatePack(client);
        if (exists) {
            console.log('⚠️  TOGAF template pack already exists - skipping creation');
            console.log('   Use the admin interface to update or create a new version');
            return;
        }

        // Create the template pack
        const templatePackId = await createTogafTemplatePack(client);
        console.log(`✅ Created TOGAF template pack with ID: ${templatePackId}`);

        // Summary information
        const typeCount = Object.keys(TOGAF_TEMPLATE_PACK.object_type_schemas).length;
        const relationshipCount = Object.keys(TOGAF_TEMPLATE_PACK.relationship_type_schemas || {}).length;
        const viewCount = TOGAF_TEMPLATE_PACK.sql_views?.length || 0;

        console.log('\n📊 Template Pack Summary:');
        console.log(`   Name: ${TOGAF_TEMPLATE_PACK.name}`);
        console.log(`   Version: ${TOGAF_TEMPLATE_PACK.version}`);
        console.log(`   Object Types: ${typeCount}`);
        console.log(`   Relationship Types: ${relationshipCount}`);
        console.log(`   SQL Views: ${viewCount}`);

        console.log('\n🎯 Object Types Created:');
        Object.entries(TOGAF_TEMPLATE_PACK.ui_configs || {}).forEach(([type, config]) => {
            console.log(`   • ${type} (${(config as any).category})`);
        });

        console.log('\n🔗 Relationship Types:');
        Object.keys(TOGAF_TEMPLATE_PACK.relationship_type_schemas || {}).forEach(relType => {
            console.log(`   • ${relType}`);
        });

        console.log('\n🏁 TOGAF Template Pack seeding completed successfully!');
        console.log('   You can now assign this template pack to projects via the admin interface.');

    } catch (error) {
        console.error('❌ Error seeding TOGAF template pack:', error);
        exit(1);
    } finally {
        if (client) {
            await client.end();
            console.log('📝 Database connection closed');
        }
    }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export default main;