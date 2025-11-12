import { Pool } from 'pg';

/**
 * Meeting & Decision Management Template Pack Seed
 *
 * This seed creates a comprehensive template pack for managing meetings,
 * decisions, action items, and questions.
 */

const PACK_ID = '9f8d7e6c-5b4a-4c2d-8e0f-9a8b7c6d5e4f';

const objectTypeSchemas = {
  Meeting: {
    type: 'object',
    description:
      'A specific meeting event with attendees, agenda, and outcomes',
    required: ['title', 'meeting_type', 'status'],
    properties: {
      title: {
        type: 'string',
        description: 'Meeting title or topic',
        minLength: 5,
      },
      meeting_type: {
        type: 'string',
        enum: [
          'standup',
          'planning',
          'retrospective',
          'review',
          'one-on-one',
          'team-sync',
          'stakeholder-review',
          'board-meeting',
          'workshop',
          'brainstorming',
          'decision-making',
          'other',
        ],
        description: 'Type of meeting',
      },
      status: {
        type: 'string',
        enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
        description: 'Current status of the meeting',
      },
      scheduled_start: {
        type: 'string',
        format: 'date-time',
        description: 'When the meeting is scheduled to start',
      },
      scheduled_end: {
        type: 'string',
        format: 'date-time',
        description: 'When the meeting is scheduled to end',
      },
      actual_start: {
        type: 'string',
        format: 'date-time',
        description: 'When the meeting actually started',
      },
      actual_end: {
        type: 'string',
        format: 'date-time',
        description: 'When the meeting actually ended',
      },
      location: {
        type: 'string',
        description: 'Physical location or video conference link',
      },
      agenda: {
        type: 'string',
        description: 'Meeting agenda and topics to cover',
      },
      notes: {
        type: 'string',
        description: 'Meeting notes and discussion points',
      },
      recording_url: {
        type: 'string',
        format: 'uri',
        description: 'Link to meeting recording if available',
      },
      transcript_url: {
        type: 'string',
        format: 'uri',
        description: 'Link to meeting transcript if available',
      },
      preparation_required: {
        type: 'boolean',
        description: 'Whether attendees need to prepare',
      },
      preparation_notes: {
        type: 'string',
        description: 'What attendees should prepare',
      },
      recurring_pattern: {
        type: 'string',
        description: 'If recurring, pattern description',
      },
    },
  },
  MeetingSeries: {
    type: 'object',
    description: 'A recurring meeting series or meeting category',
    required: ['name', 'is_active'],
    properties: {
      name: {
        type: 'string',
        description: 'Series name (e.g., "Weekly Standup")',
        minLength: 3,
      },
      description: {
        type: 'string',
        description: 'Purpose and scope of the series',
      },
      recurrence_pattern: {
        type: 'string',
        description: 'How often meetings occur',
      },
      is_active: {
        type: 'boolean',
        description: 'Whether the series is currently active',
      },
      start_date: {
        type: 'string',
        format: 'date',
        description: 'When the series started',
      },
      end_date: {
        type: 'string',
        format: 'date',
        description: 'When the series ended (if applicable)',
      },
    },
  },
  Decision: {
    type: 'object',
    description: 'A decision made during or outside of meetings',
    required: ['title', 'decision_type', 'status'],
    properties: {
      title: {
        type: 'string',
        description: 'Brief decision summary',
        minLength: 5,
      },
      description: {
        type: 'string',
        description: 'Detailed decision description',
      },
      rationale: {
        type: 'string',
        description: 'Why this decision was made',
      },
      decision_type: {
        type: 'string',
        enum: [
          'strategic',
          'tactical',
          'technical',
          'organizational',
          'process',
          'product',
          'other',
        ],
        description: 'Type of decision',
      },
      status: {
        type: 'string',
        enum: [
          'proposed',
          'under-review',
          'approved',
          'rejected',
          'implemented',
          'reversed',
        ],
        description: 'Current status of the decision',
      },
      decision_date: {
        type: 'string',
        format: 'date',
        description: 'When the decision was made',
      },
      effective_date: {
        type: 'string',
        format: 'date',
        description: 'When the decision takes effect',
      },
      review_date: {
        type: 'string',
        format: 'date',
        description: 'When to review this decision',
      },
      priority: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        description: 'Decision priority',
      },
      reversible: {
        type: 'boolean',
        description: 'Whether this decision can be easily reversed',
      },
      impact_scope: {
        type: 'string',
        enum: ['team', 'department', 'organization', 'company-wide'],
        description: 'Scope of decision impact',
      },
      alternatives_considered: {
        type: 'string',
        description: 'Other options that were evaluated',
      },
      success_criteria: {
        type: 'string',
        description: 'How to measure if this was the right decision',
      },
    },
  },
  ActionItem: {
    type: 'object',
    description: 'A task or action item assigned during a meeting',
    required: ['title', 'status', 'priority'],
    properties: {
      title: {
        type: 'string',
        description: 'Action item description',
        minLength: 5,
      },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done',
      },
      status: {
        type: 'string',
        enum: [
          'not-started',
          'in-progress',
          'blocked',
          'completed',
          'cancelled',
        ],
        description: 'Current status of the action',
      },
      priority: {
        type: 'string',
        enum: ['urgent', 'high', 'medium', 'low'],
        description: 'Action priority',
      },
      due_date: {
        type: 'string',
        format: 'date',
        description: 'When the action is due',
      },
      completed_date: {
        type: 'string',
        format: 'date',
        description: 'When the action was completed',
      },
      estimated_effort: {
        type: 'string',
        description: 'Estimated time/effort (e.g., "2 hours", "1 day")',
      },
      actual_effort: {
        type: 'string',
        description: 'Actual time/effort spent',
      },
      blocking_reason: {
        type: 'string',
        description: 'Why this is blocked (if status is blocked)',
      },
    },
  },
  Question: {
    type: 'object',
    description: 'A question raised during a meeting or discussion',
    required: ['question', 'question_type', 'status'],
    properties: {
      question: {
        type: 'string',
        description: 'The question being asked',
        minLength: 10,
      },
      context: {
        type: 'string',
        description: 'Background/context for the question',
      },
      question_type: {
        type: 'string',
        enum: [
          'clarification',
          'technical',
          'strategic',
          'process',
          'decision-support',
          'blocker',
          'other',
        ],
        description: 'Type of question',
      },
      status: {
        type: 'string',
        enum: [
          'open',
          'under-investigation',
          'answered',
          'deferred',
          'no-longer-relevant',
        ],
        description: 'Current status of the question',
      },
      priority: {
        type: 'string',
        enum: ['urgent', 'high', 'medium', 'low'],
        description: 'Question priority',
      },
      raised_date: {
        type: 'string',
        format: 'date',
        description: 'When the question was raised',
      },
      answered_date: {
        type: 'string',
        format: 'date',
        description: 'When the question was answered',
      },
      answer: {
        type: 'string',
        description: 'The answer/resolution',
      },
      defer_reason: {
        type: 'string',
        description: 'Why the question was deferred',
      },
      defer_until: {
        type: 'string',
        format: 'date',
        description: 'When to revisit if deferred',
      },
    },
  },
};

const relationshipTypeSchemas = {
  ORGANIZED_BY: {
    description: 'Meeting is organized by a person',
    sourceTypes: ['Meeting'],
    targetTypes: ['Person'],
    cardinality: 'many-to-one',
  },
  ATTENDED_BY: {
    description: 'Person attended a meeting',
    sourceTypes: ['Meeting'],
    targetTypes: ['Person'],
    cardinality: 'many-to-many',
    attributes: {
      attendance_status: {
        type: 'string',
        enum: ['confirmed', 'tentative', 'declined', 'attended', 'no-show'],
      },
      role: {
        type: 'string',
        enum: [
          'organizer',
          'required',
          'optional',
          'facilitator',
          'note-taker',
          'presenter',
        ],
      },
      response_date: {
        type: 'string',
        format: 'date-time',
      },
      joined_at: {
        type: 'string',
        format: 'date-time',
      },
      left_at: {
        type: 'string',
        format: 'date-time',
      },
      notes: {
        type: 'string',
      },
    },
  },
  PART_OF_SERIES: {
    description: 'Meeting is part of a recurring series',
    sourceTypes: ['Meeting'],
    targetTypes: ['MeetingSeries'],
    cardinality: 'many-to-one',
  },
  HAS_MEETING: {
    description: 'Series contains individual meetings',
    sourceTypes: ['MeetingSeries'],
    targetTypes: ['Meeting'],
    cardinality: 'one-to-many',
  },
  DISCUSSES: {
    description: 'Meeting discusses decisions',
    sourceTypes: ['Meeting'],
    targetTypes: ['Decision'],
    cardinality: 'many-to-many',
  },
  GENERATES: {
    description: 'Meeting generates action items',
    sourceTypes: ['Meeting'],
    targetTypes: ['ActionItem'],
    cardinality: 'one-to-many',
  },
  RAISES: {
    description: 'Meeting raises questions',
    sourceTypes: ['Meeting'],
    targetTypes: ['Question'],
    cardinality: 'one-to-many',
  },
  FOLLOWS_UP: {
    description: 'Meeting follows up on previous meeting',
    sourceTypes: ['Meeting'],
    targetTypes: ['Meeting'],
    cardinality: 'many-to-one',
  },
  MADE_BY: {
    description: 'Decision made by person(s)',
    sourceTypes: ['Decision'],
    targetTypes: ['Person'],
    cardinality: 'many-to-many',
  },
  MADE_IN: {
    description: 'Decision made in meeting',
    sourceTypes: ['Decision'],
    targetTypes: ['Meeting'],
    cardinality: 'many-to-one',
  },
  REQUIRES: {
    description: 'Decision requires action items',
    sourceTypes: ['Decision'],
    targetTypes: ['ActionItem'],
    cardinality: 'one-to-many',
  },
  SUPERSEDES: {
    description: 'Decision supersedes previous decision',
    sourceTypes: ['Decision'],
    targetTypes: ['Decision'],
    cardinality: 'many-to-one',
  },
  INFORMED_BY: {
    description: 'Decision informed by questions',
    sourceTypes: ['Decision'],
    targetTypes: ['Question'],
    cardinality: 'many-to-many',
  },
  ASSIGNED_TO: {
    description: 'Action item or question assigned to person',
    sourceTypes: ['ActionItem', 'Question'],
    targetTypes: ['Person'],
    cardinality: 'many-to-many',
  },
  CREATED_IN: {
    description: 'Action item created in meeting',
    sourceTypes: ['ActionItem'],
    targetTypes: ['Meeting'],
    cardinality: 'many-to-one',
  },
  CREATED_BY: {
    description: 'Action item created by person',
    sourceTypes: ['ActionItem'],
    targetTypes: ['Person'],
    cardinality: 'many-to-one',
  },
  BLOCKS: {
    description: 'Action item blocks another action item',
    sourceTypes: ['ActionItem'],
    targetTypes: ['ActionItem'],
    cardinality: 'many-to-many',
  },
  BLOCKED_BY: {
    description: 'Action item blocked by another action item',
    sourceTypes: ['ActionItem'],
    targetTypes: ['ActionItem'],
    cardinality: 'many-to-many',
  },
  RAISED_BY: {
    description: 'Question raised by person',
    sourceTypes: ['Question'],
    targetTypes: ['Person'],
    cardinality: 'many-to-one',
  },
  RAISED_IN: {
    description: 'Question raised in meeting',
    sourceTypes: ['Question'],
    targetTypes: ['Meeting'],
    cardinality: 'many-to-one',
  },
  ANSWERED_BY: {
    description: 'Question answered by person',
    sourceTypes: ['Question'],
    targetTypes: ['Person'],
    cardinality: 'many-to-one',
  },
  LEADS_TO_DECISION: {
    description: 'Question leads to decision',
    sourceTypes: ['Question'],
    targetTypes: ['Decision'],
    cardinality: 'one-to-many',
  },
  LEADS_TO_ACTION: {
    description: 'Question leads to action item',
    sourceTypes: ['Question'],
    targetTypes: ['ActionItem'],
    cardinality: 'one-to-many',
  },
  RELATES_TO: {
    description: 'Item relates to other domain objects',
    sourceTypes: ['Meeting', 'Decision', 'Question', 'ActionItem'],
    targetTypes: ['*'], // Can relate to any type
    cardinality: 'many-to-many',
  },
  OWNED_BY: {
    description: 'Series owned by person',
    sourceTypes: ['MeetingSeries'],
    targetTypes: ['Person'],
    cardinality: 'many-to-one',
  },
  DEFAULT_ATTENDEE: {
    description: 'Person is default attendee of series',
    sourceTypes: ['MeetingSeries'],
    targetTypes: ['Person'],
    cardinality: 'many-to-many',
  },
  PART_OF: {
    description: 'Action item is part of larger work',
    sourceTypes: ['ActionItem'],
    targetTypes: ['*'], // Can be part of projects, epics, etc.
    cardinality: 'many-to-many',
  },
  AFFECTS: {
    description: 'Decision affects other items',
    sourceTypes: ['Decision'],
    targetTypes: ['*'], // Can affect projects, systems, teams, etc.
    cardinality: 'many-to-many',
  },
};

const uiConfigs = {
  Meeting: {
    icon: 'lucide--calendar',
    color: '#3b82f6',
    defaultView: 'card',
    listFields: ['title', 'meeting_type', 'scheduled_start', 'status'],
    cardFields: [
      'title',
      'meeting_type',
      'scheduled_start',
      'agenda',
      'status',
    ],
  },
  MeetingSeries: {
    icon: 'lucide--calendar-range',
    color: '#3b82f6',
    defaultView: 'list',
    listFields: ['name', 'is_active', 'recurrence_pattern'],
    cardFields: ['name', 'description', 'is_active', 'recurrence_pattern'],
  },
  Decision: {
    icon: 'lucide--check-circle',
    color: '#10b981',
    defaultView: 'card',
    listFields: [
      'title',
      'decision_type',
      'status',
      'decision_date',
      'priority',
    ],
    cardFields: [
      'title',
      'decision_type',
      'rationale',
      'status',
      'impact_scope',
    ],
  },
  ActionItem: {
    icon: 'lucide--check-square',
    color: '#f59e0b',
    defaultView: 'list',
    listFields: ['title', 'status', 'priority', 'due_date'],
    cardFields: ['title', 'description', 'status', 'priority', 'due_date'],
  },
  Question: {
    icon: 'lucide--help-circle',
    color: '#8b5cf6',
    defaultView: 'list',
    listFields: ['question', 'status', 'priority', 'raised_date'],
    cardFields: ['question', 'context', 'status', 'answer'],
  },
};

const extractionPrompts = {
  Meeting: {
    system:
      'Extract meeting information from text including title, type, date, attendees, agenda, and notes.',
    user: 'Given this text about a meeting, extract structured meeting information.',
  },
  Decision: {
    system:
      'Extract decision information including title, rationale, type, and alternatives considered.',
    user: 'Given this text about a decision, extract structured decision information.',
  },
  ActionItem: {
    system:
      'Extract action items including what needs to be done, who is responsible, and when it is due.',
    user: 'Given this text, extract any action items mentioned.',
  },
  Question: {
    system:
      'Extract questions raised including the question itself, context, and any answers provided.',
    user: 'Given this text, extract any questions mentioned.',
  },
};

async function seedMeetingDecisionPack(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Starting Meeting & Decision Management pack seed...');

    // Check if pack already exists
    const existing = await client.query(
      'SELECT id FROM kb.graph_template_packs WHERE id = $1',
      [PACK_ID]
    );

    if (existing.rows.length > 0) {
      console.log(
        'Meeting & Decision Management pack already exists. Updating...'
      );

      await client.query(
        `UPDATE kb.graph_template_packs 
         SET name = $1,
             version = $2,
             description = $3,
             author = $4,
             object_type_schemas = $5,
             relationship_type_schemas = $6,
             ui_configs = $7,
             extraction_prompts = $8,
             published_at = now(),
             deprecated_at = NULL
         WHERE id = $9`,
        [
          'Meeting & Decision Management',
          '1.0.0',
          'Comprehensive template pack for managing meetings, decisions, action items, and questions. Track meeting outcomes, document decisions with rationale, manage action items, and ensure questions are answered.',
          'Spec Server Team',
          JSON.stringify(objectTypeSchemas),
          JSON.stringify(relationshipTypeSchemas),
          JSON.stringify(uiConfigs),
          JSON.stringify(extractionPrompts),
          PACK_ID,
        ]
      );

      console.log('✓ Updated existing Meeting & Decision Management pack');
    } else {
      await client.query(
        `INSERT INTO kb.graph_template_packs (
          id, name, version, description, author,
          object_type_schemas, relationship_type_schemas,
          ui_configs, extraction_prompts, published_at, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)`,
        [
          PACK_ID,
          'Meeting & Decision Management',
          '1.0.0',
          'Comprehensive template pack for managing meetings, decisions, action items, and questions. Track meeting outcomes, document decisions with rationale, manage action items, and ensure questions are answered.',
          'Spec Server Team',
          JSON.stringify(objectTypeSchemas),
          JSON.stringify(relationshipTypeSchemas),
          JSON.stringify(uiConfigs),
          JSON.stringify(extractionPrompts),
          'system', // Mark as built-in/system template pack
        ]
      );

      console.log('✓ Created Meeting & Decision Management pack');
    }

    console.log('\nTemplate Pack Summary:');
    console.log(
      '- 5 Object Types: Meeting, MeetingSeries, Decision, ActionItem, Question'
    );
    console.log('- 25 Relationship Types');
    console.log('- UI configurations for all types');
    console.log('- Extraction prompts for AI-assisted data entry');
  } catch (error) {
    console.error('Error seeding Meeting & Decision Management pack:', error);
    throw error;
  } finally {
    client.release();
  }
}

export { seedMeetingDecisionPack };

// Main execution when run directly
if (require.main === module) {
  const { Pool } = require('pg');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'spec',
    user: process.env.DB_USER || 'mcj',
    // Don't include password if not set - will use peer authentication
    ...(process.env.DB_PASSWORD && { password: process.env.DB_PASSWORD }),
  });

  seedMeetingDecisionPack(pool)
    .then(() => {
      console.log('\n✓ Meeting & Decision Management pack seeded successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Failed to seed pack:', error);
      process.exit(1);
    });
}
