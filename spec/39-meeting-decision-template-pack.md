# Meeting & Decision Management Template Pack

## Overview

The Meeting & Decision Management Template Pack provides a structured framework for capturing meeting information, documenting decisions, tracking action items, and recording questions raised during meetings. This pack is designed to improve meeting effectiveness, decision transparency, and accountability.

## Version

**Version:** 1.0.0  
**Author:** Spec Server Team  
**Published:** 2025-10-04

## Use Cases

1. **Meeting Documentation**: Capture comprehensive meeting records with attendees, agenda, and outcomes
2. **Decision Tracking**: Document strategic and operational decisions with context and rationale
3. **Action Item Management**: Track action items assigned during meetings with owners and due dates
4. **Question Management**: Record questions raised, track answers, and ensure follow-through
5. **Participant Management**: Link people to meetings and track their roles and contributions
6. **Meeting Series**: Group related meetings (e.g., sprint retrospectives, board meetings)
7. **Decision Impact Analysis**: Understand which decisions affect which projects or systems

## Object Types

### 1. Meeting

Represents a specific meeting event.

**Fields:**
- `title` (string, required): Meeting title or topic
- `meeting_type` (enum): 
  - `standup`, `planning`, `retrospective`, `review`, `one-on-one`, `team-sync`, `stakeholder-review`, `board-meeting`, `workshop`, `brainstorming`, `decision-making`, `other`
- `status` (enum): `scheduled`, `in-progress`, `completed`, `cancelled`
- `scheduled_start` (datetime): When the meeting is scheduled to start
- `scheduled_end` (datetime): When the meeting is scheduled to end
- `actual_start` (datetime): When the meeting actually started
- `actual_end` (datetime): When the meeting actually ended
- `location` (string): Physical location or video conference link
- `agenda` (text): Meeting agenda/topics to cover
- `notes` (text): Meeting notes and discussion points
- `recording_url` (url): Link to meeting recording if available
- `transcript_url` (url): Link to meeting transcript if available
- `preparation_required` (boolean): Whether attendees need to prepare
- `preparation_notes` (text): What attendees should prepare
- `recurring_pattern` (string): If recurring, pattern description (e.g., "Weekly on Mondays")
- `tags` (string[]): Custom tags for categorization

**Relationships:**
- `ORGANIZED_BY` → Person: Who organized/scheduled the meeting
- `ATTENDED_BY` → Person: Who attended (with attendance status)
- `PART_OF_SERIES` → MeetingSeries: Optional series this meeting belongs to
- `DISCUSSES` → Decision: Decisions discussed or made
- `GENERATES` → ActionItem: Action items created during meeting
- `RAISES` → Question: Questions raised during meeting
- `RELATES_TO` → Project/Feature/Epic: What the meeting is about
- `FOLLOWS_UP` → Meeting: Previous meeting this follows up on

**UI Config:**
- Icon: `lucide--calendar`
- Color: `#3b82f6` (blue)
- List view: Show title, type, date, attendee count
- Card view: Show agenda preview, upcoming/past indicator

### 2. MeetingSeries

Represents a recurring meeting series or meeting category.

**Fields:**
- `name` (string, required): Series name (e.g., "Weekly Standup", "Monthly All-Hands")
- `description` (text): Purpose and scope of the series
- `recurrence_pattern` (string): How often meetings occur
- `is_active` (boolean): Whether the series is currently active
- `start_date` (date): When the series started
- `end_date` (date): When the series ended (if applicable)
- `tags` (string[]): Custom tags

**Relationships:**
- `HAS_MEETING` → Meeting: Individual meetings in the series
- `OWNED_BY` → Person: Person responsible for the series
- `DEFAULT_ATTENDEES` → Person: People who typically attend

**UI Config:**
- Icon: `lucide--calendar-range`
- Color: `#3b82f6` (blue)
- List view: Show name, active status, meeting count

### 3. Decision

Represents a decision made during or outside of meetings.

**Fields:**
- `title` (string, required): Brief decision summary
- `description` (text): Detailed decision description
- `rationale` (text): Why this decision was made
- `decision_type` (enum): 
  - `strategic`, `tactical`, `technical`, `organizational`, `process`, `product`, `other`
- `status` (enum): `proposed`, `under-review`, `approved`, `rejected`, `implemented`, `reversed`
- `decision_date` (date): When the decision was made
- `effective_date` (date): When the decision takes effect
- `review_date` (date): When to review this decision
- `priority` (enum): `critical`, `high`, `medium`, `low`
- `reversible` (boolean): Whether this decision can be easily reversed
- `impact_scope` (enum): `team`, `department`, `organization`, `company-wide`
- `alternatives_considered` (text): Other options that were evaluated
- `success_criteria` (text): How to measure if this was the right decision
- `tags` (string[]): Custom tags

**Relationships:**
- `MADE_BY` → Person: Who made the decision
- `MADE_IN` → Meeting: Meeting where decision was made
- `AFFECTS` → Project/System/Team: What this decision impacts
- `REQUIRES` → ActionItem: Actions needed to implement
- `SUPERSEDES` → Decision: Previous decision this replaces
- `RELATED_TO` → Decision: Related decisions
- `INFORMED_BY` → Question: Questions that led to this decision

**UI Config:**
- Icon: `lucide--check-circle`
- Color: `#10b981` (green)
- List view: Show title, type, status, date
- Card view: Show rationale preview, impact scope

### 4. ActionItem

Represents a task or action item assigned during a meeting.

**Fields:**
- `title` (string, required): Action item description
- `description` (text): Detailed description of what needs to be done
- `status` (enum): `not-started`, `in-progress`, `blocked`, `completed`, `cancelled`
- `priority` (enum): `urgent`, `high`, `medium`, `low`
- `due_date` (date): When the action is due
- `completed_date` (date): When the action was completed
- `estimated_effort` (string): Estimated time/effort (e.g., "2 hours", "1 day")
- `actual_effort` (string): Actual time/effort spent
- `blocking_reason` (text): Why this is blocked (if status is blocked)
- `tags` (string[]): Custom tags

**Relationships:**
- `ASSIGNED_TO` → Person: Who is responsible (can have multiple)
- `CREATED_IN` → Meeting: Meeting where action was created
- `CREATED_BY` → Person: Who created the action item
- `RELATES_TO` → Decision: Decision this action implements
- `BLOCKS` → ActionItem: Other actions blocked by this one
- `BLOCKED_BY` → ActionItem: Actions blocking this one
- `PART_OF` → Project/Epic: Larger work this action belongs to

**UI Config:**
- Icon: `lucide--check-square`
- Color: `#f59e0b` (amber)
- List view: Show title, assignee, due date, status
- Card view: Show description preview, priority indicator

### 5. Question

Represents a question raised during a meeting or discussion.

**Fields:**
- `question` (text, required): The question being asked
- `context` (text): Background/context for the question
- `question_type` (enum): 
  - `clarification`, `technical`, `strategic`, `process`, `decision-support`, `blocker`, `other`
- `status` (enum): `open`, `under-investigation`, `answered`, `deferred`, `no-longer-relevant`
- `priority` (enum): `urgent`, `high`, `medium`, `low`
- `raised_date` (date): When the question was raised
- `answered_date` (date): When the question was answered
- `answer` (text): The answer/resolution
- `defer_reason` (text): Why the question was deferred
- `defer_until` (date): When to revisit if deferred
- `tags` (string[]): Custom tags

**Relationships:**
- `RAISED_BY` → Person: Who asked the question
- `RAISED_IN` → Meeting: Meeting where question was raised
- `ASSIGNED_TO` → Person: Who should answer/investigate
- `ANSWERED_BY` → Person: Who provided the answer
- `RELATES_TO` → Project/Feature/System: What the question is about
- `LEADS_TO` → Decision: Decisions made based on this question
- `LEADS_TO` → ActionItem: Actions created to answer the question
- `RELATED_TO` → Question: Related questions

**UI Config:**
- Icon: `lucide--help-circle`
- Color: `#8b5cf6` (purple)
- List view: Show question preview, status, assignee
- Card view: Show full question, context, answer

### 6. MeetingAttendee (Relationship with attributes)

Represents a person's attendance at a meeting with additional details.

**Attributes:**
- `attendance_status` (enum): `confirmed`, `tentative`, `declined`, `attended`, `no-show`
- `role` (enum): `organizer`, `required`, `optional`, `facilitator`, `note-taker`, `presenter`
- `response_date` (datetime): When they responded to invitation
- `joined_at` (datetime): When they joined the meeting
- `left_at` (datetime): When they left the meeting
- `notes` (text): Any notes about their participation

## Relationship Types

### Core Meeting Relationships
1. **ORGANIZED_BY**: Meeting → Person
   - Who organized/scheduled the meeting
   - Cardinality: Many-to-One

2. **ATTENDED_BY**: Meeting → Person (with MeetingAttendee attributes)
   - Who attended the meeting
   - Cardinality: Many-to-Many
   - Attributes: attendance_status, role, joined_at, left_at

3. **PART_OF_SERIES**: Meeting → MeetingSeries
   - Meeting is part of a recurring series
   - Cardinality: Many-to-One

### Meeting Content Relationships
4. **DISCUSSES**: Meeting → Decision
   - Decisions discussed or made in meeting
   - Cardinality: Many-to-Many

5. **GENERATES**: Meeting → ActionItem
   - Action items created during meeting
   - Cardinality: One-to-Many

6. **RAISES**: Meeting → Question
   - Questions raised during meeting
   - Cardinality: One-to-Many

7. **FOLLOWS_UP**: Meeting → Meeting
   - This meeting follows up on a previous meeting
   - Cardinality: Many-to-One

### Decision Relationships
8. **MADE_BY**: Decision → Person
   - Who made the decision
   - Cardinality: Many-to-One (or Many-to-Many for group decisions)

9. **MADE_IN**: Decision → Meeting
   - Meeting where decision was made
   - Cardinality: Many-to-One

10. **REQUIRES**: Decision → ActionItem
    - Actions needed to implement decision
    - Cardinality: One-to-Many

11. **SUPERSEDES**: Decision → Decision
    - This decision replaces a previous one
    - Cardinality: Many-to-One

12. **INFORMED_BY**: Decision → Question
    - Questions that influenced the decision
    - Cardinality: Many-to-Many

### Action Item Relationships
13. **ASSIGNED_TO**: ActionItem → Person
    - Who is responsible for the action
    - Cardinality: Many-to-Many

14. **CREATED_IN**: ActionItem → Meeting
    - Meeting where action was created
    - Cardinality: Many-to-One

15. **CREATED_BY**: ActionItem → Person
    - Who created the action item
    - Cardinality: Many-to-One

16. **BLOCKS**: ActionItem → ActionItem
    - This action blocks another action
    - Cardinality: Many-to-Many

### Question Relationships
17. **RAISED_BY**: Question → Person
    - Who asked the question
    - Cardinality: Many-to-One

18. **RAISED_IN**: Question → Meeting
    - Meeting where question was raised
    - Cardinality: Many-to-One

19. **ASSIGNED_TO**: Question → Person
    - Who should answer the question
    - Cardinality: Many-to-One

20. **ANSWERED_BY**: Question → Person
    - Who provided the answer
    - Cardinality: Many-to-One

21. **LEADS_TO**: Question → Decision
    - Decisions made based on this question
    - Cardinality: One-to-Many

### Cross-Domain Relationships
22. **RELATES_TO**: Meeting/Decision/Question/ActionItem → Project/Feature/Epic/System
    - What the item relates to
    - Cardinality: Many-to-Many

## Sample Data Structure

```json
{
  "meeting": {
    "id": "mtg-001",
    "title": "Q4 Product Planning Meeting",
    "meeting_type": "planning",
    "status": "completed",
    "scheduled_start": "2025-10-01T14:00:00Z",
    "scheduled_end": "2025-10-01T15:30:00Z",
    "actual_start": "2025-10-01T14:05:00Z",
    "actual_end": "2025-10-01T15:45:00Z",
    "location": "https://zoom.us/j/123456789",
    "agenda": "1. Review Q3 outcomes\n2. Discuss Q4 priorities\n3. Resource allocation",
    "notes": "Strong alignment on focusing on mobile experience...",
    "recording_url": "https://zoom.us/rec/share/abc123",
    "relationships": {
      "ORGANIZED_BY": ["person-001"],
      "ATTENDED_BY": [
        { "personId": "person-001", "role": "organizer", "attendance_status": "attended" },
        { "personId": "person-002", "role": "required", "attendance_status": "attended" },
        { "personId": "person-003", "role": "optional", "attendance_status": "declined" }
      ],
      "DISCUSSES": ["decision-001", "decision-002"],
      "GENERATES": ["action-001", "action-002", "action-003"],
      "RAISES": ["question-001", "question-002"]
    }
  },
  "decision": {
    "id": "decision-001",
    "title": "Prioritize mobile app development for Q4",
    "description": "Focus engineering resources on improving mobile experience",
    "rationale": "Mobile users represent 60% of traffic but have 40% lower conversion",
    "decision_type": "strategic",
    "status": "approved",
    "decision_date": "2025-10-01",
    "priority": "high",
    "impact_scope": "organization",
    "reversible": true,
    "alternatives_considered": "1. Continue desktop focus\n2. Split resources 50/50",
    "success_criteria": "Increase mobile conversion by 25% by EOY",
    "relationships": {
      "MADE_BY": ["person-001", "person-002"],
      "MADE_IN": ["mtg-001"],
      "REQUIRES": ["action-001", "action-002"],
      "AFFECTS": ["project-mobile-app"]
    }
  },
  "actionItem": {
    "id": "action-001",
    "title": "Create mobile development roadmap",
    "description": "Outline features, timeline, and resource needs for Q4 mobile work",
    "status": "in-progress",
    "priority": "high",
    "due_date": "2025-10-15",
    "estimated_effort": "2 days",
    "relationships": {
      "ASSIGNED_TO": ["person-002"],
      "CREATED_IN": ["mtg-001"],
      "CREATED_BY": ["person-001"],
      "RELATES_TO": ["decision-001"],
      "PART_OF": ["project-mobile-app"]
    }
  },
  "question": {
    "id": "question-001",
    "question": "What is the budget allocated for mobile development in Q4?",
    "context": "Need to understand constraints before finalizing roadmap",
    "question_type": "clarification",
    "status": "answered",
    "priority": "high",
    "raised_date": "2025-10-01",
    "answered_date": "2025-10-02",
    "answer": "$500K allocated, with potential for additional $200K if needed",
    "relationships": {
      "RAISED_BY": ["person-002"],
      "RAISED_IN": ["mtg-001"],
      "ASSIGNED_TO": ["person-004"],
      "ANSWERED_BY": ["person-004"],
      "RELATES_TO": ["project-mobile-app"],
      "LEADS_TO": ["decision-001"]
    }
  }
}
```

## Common Queries

### 1. Upcoming Meetings for a Person
```cypher
MATCH (p:Person {id: $personId})<-[:ORGANIZED_BY|ATTENDED_BY]-(m:Meeting)
WHERE m.scheduled_start > datetime()
  AND m.status = 'scheduled'
RETURN m
ORDER BY m.scheduled_start
```

### 2. Open Action Items from Recent Meetings
```cypher
MATCH (m:Meeting)-[:GENERATES]->(a:ActionItem)-[:ASSIGNED_TO]->(p:Person {id: $personId})
WHERE m.actual_start > datetime() - duration({days: 30})
  AND a.status IN ['not-started', 'in-progress']
RETURN a, m
ORDER BY a.due_date
```

### 3. Decisions Made in a Meeting with Context
```cypher
MATCH (m:Meeting {id: $meetingId})-[:DISCUSSES]->(d:Decision)
OPTIONAL MATCH (d)-[:REQUIRES]->(a:ActionItem)
OPTIONAL MATCH (d)-[:INFORMED_BY]->(q:Question)
RETURN d, collect(DISTINCT a) as actions, collect(DISTINCT q) as questions
```

### 4. Unanswered Questions Assigned to a Person
```cypher
MATCH (q:Question)-[:ASSIGNED_TO]->(p:Person {id: $personId})
WHERE q.status IN ['open', 'under-investigation']
OPTIONAL MATCH (q)-[:RAISED_IN]->(m:Meeting)
RETURN q, m
ORDER BY q.priority DESC, q.raised_date
```

### 5. Meeting Series Effectiveness
```cypher
MATCH (ms:MeetingSeries)-[:HAS_MEETING]->(m:Meeting)
OPTIONAL MATCH (m)-[:GENERATES]->(a:ActionItem)
OPTIONAL MATCH (m)-[:DISCUSSES]->(d:Decision)
WHERE m.actual_start > datetime() - duration({months: 3})
RETURN ms.name,
       count(DISTINCT m) as meeting_count,
       count(DISTINCT a) as action_count,
       count(DISTINCT d) as decision_count,
       avg(duration.between(m.scheduled_start, m.actual_end).minutes) as avg_duration
```

### 6. Decision Impact Analysis
```cypher
MATCH (d:Decision {id: $decisionId})
OPTIONAL MATCH (d)-[:AFFECTS]->(affected)
OPTIONAL MATCH (d)-[:REQUIRES]->(a:ActionItem)
OPTIONAL MATCH (d)-[:INFORMED_BY]->(q:Question)
OPTIONAL MATCH (d)-[:MADE_BY]->(maker:Person)
RETURN d, 
       collect(DISTINCT affected) as impacted_items,
       collect(DISTINCT a) as required_actions,
       collect(DISTINCT q) as related_questions,
       collect(DISTINCT maker) as decision_makers
```

### 7. Person's Meeting Load
```cypher
MATCH (p:Person {id: $personId})<-[att:ATTENDED_BY]-(m:Meeting)
WHERE m.scheduled_start > datetime() - duration({weeks: 4})
  AND m.scheduled_start < datetime()
RETURN count(m) as meeting_count,
       sum(duration.between(m.actual_start, m.actual_end).hours) as total_hours,
       collect({
         meeting: m.title,
         role: att.role,
         duration: duration.between(m.actual_start, m.actual_end).minutes
       }) as meetings
```

## UI Components

### Meeting Calendar View
- Monthly/weekly calendar showing scheduled meetings
- Color-coded by meeting type
- Click to see meeting details
- Quick actions: Join, Edit, Cancel

### Decision Log
- Filterable list of decisions
- Group by status, type, or date
- Show related actions and questions
- Timeline view showing decision evolution

### Action Item Board
- Kanban-style board (Not Started, In Progress, Blocked, Completed)
- Filter by assignee, meeting, due date
- Drag-and-drop to update status
- Highlight overdue items

### Question Tracker
- List view with status indicators
- Filter by status, priority, assignee
- Show related decisions and actions
- Quick answer input

### Meeting Dashboard
- Upcoming meetings for the week
- Outstanding action items from past meetings
- Unanswered questions
- Recent decisions
- Meeting effectiveness metrics

## Validation Rules

### Meeting
- `scheduled_end` must be after `scheduled_start`
- `actual_end` must be after `actual_start`
- At least one organizer required
- Title must be at least 5 characters

### Decision
- Must have at least one decision maker
- `effective_date` cannot be before `decision_date`
- Status transitions must follow logical flow (proposed → under-review → approved → implemented)

### ActionItem
- Must have at least one assignee
- `completed_date` required when status is 'completed'
- `due_date` should not be in the past when creating new item
- `blocking_reason` required when status is 'blocked'

### Question
- `answer` required when status is 'answered'
- `answered_date` and `answered_by` required when status is 'answered'
- `defer_reason` and `defer_until` required when status is 'deferred'

## Integration Points

### Calendar Integration
- Sync with Google Calendar, Outlook, etc.
- Import meetings automatically
- Update meeting status based on calendar events

### Video Conferencing
- Extract meeting metadata from Zoom/Teams
- Link recordings automatically
- Import transcripts and generate notes

### Project Management
- Link action items to tasks in Jira/ClickUp
- Sync status updates
- Show project context in meetings

### Notification System
- Remind about upcoming meetings
- Alert about overdue action items
- Notify when questions are answered
- Alert decision stakeholders

## Metrics & Analytics

### Meeting Metrics
- Total meeting time per person/team
- Average meeting duration by type
- Meeting frequency trends
- Attendance rates
- Preparation compliance

### Decision Metrics
- Decision velocity (time from proposal to implementation)
- Decision reversal rate
- Implementation success rate
- Decision impact scope distribution

### Action Item Metrics
- Completion rate
- Average time to completion
- Overdue rate
- Action items per meeting

### Question Metrics
- Time to answer
- Question resolution rate
- Question types distribution
- Questions leading to decisions

## Export Formats

### Meeting Summary
- PDF with attendees, agenda, notes, decisions, actions
- Markdown for documentation
- Email summary template

### Decision Document
- Formal decision record (ADR format)
- PDF with full context
- Changelog format

### Action Item Report
- CSV export for project management tools
- Weekly digest email
- Sprint planning format

## Best Practices

1. **Meeting Hygiene**
   - Always set clear agenda before meeting
   - Document decisions explicitly
   - Create action items with owners and due dates
   - Send summary within 24 hours

2. **Decision Documentation**
   - Record rationale, not just the decision
   - Document alternatives considered
   - Set review dates for important decisions
   - Link to supporting materials

3. **Action Item Management**
   - One owner per action (can have multiple assignees)
   - Specific and actionable titles
   - Realistic due dates
   - Regular status updates

4. **Question Tracking**
   - Don't let questions fall through cracks
   - Assign owner for investigation
   - Set expected answer date
   - Close loop when answered

## Future Enhancements

### Phase 2
- AI-generated meeting summaries from transcripts
- Automatic action item extraction from notes
- Decision pattern analysis
- Meeting effectiveness scoring
- Resource utilization optimization

### Phase 3
- Real-time meeting notes collaboration
- Voting mechanism for decisions
- Meeting cost calculator
- Conflict detection (over-scheduled people)
- Meeting quality feedback loop

## Installation Notes

When this template pack is installed:
1. Creates all 6 object types in the project registry
2. Registers all relationship types
3. Adds meeting-specific UI components
4. Sets up default views and dashboards
5. Configures validation rules
6. Enables calendar integration hooks

## Compatibility

- Requires: Spec Server v0.1.0+
- Compatible with: TOGAF pack, Agile pack (if installed)
- Extends: Person type with meeting-related attributes

## License

MIT License - Free to use and modify
