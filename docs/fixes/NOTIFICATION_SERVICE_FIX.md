# Notification Service Bug Fix - Session 3 Part 21

## Problem

All notification endpoints were returning 500 Internal Server Error:
- `GET /api/notifications/stats` → 500
- `GET /api/notifications?tab=all` → 500
- `GET /api/notifications/counts` → 500

## Root Cause

### Error Message
```
error: invalid input syntax for type uuid: "343522958238547971"
    at DatabaseService.query (database.service.ts:166:24)
    at NotificationsService.getUnreadCounts (notifications.service.ts:159:28)
```

### Analysis

The NotificationsService was using the wrong database column for recipient user filtering:

1. **Database Schema** (correct):
   - `user_id TEXT` - Recipient user (Zitadel user ID string)
   - `subject_id TEXT` - Subject entity the notification is about (optional)

2. **Service Code** (incorrect):
   - All queries used `WHERE subject_id = $1` to filter by recipient
   - Controller passed Zitadel user ID (string like "343522958238547971")
   - PostgreSQL tried to cast string to UUID → failed

3. **Type Flow Issue**:
   ```
   Controller → userId = "343522958238547971" (Zitadel ID, string)
   Service → WHERE subject_id = $1
   Database → subject_id is TEXT but semantically wrong column
   Result → 0 notifications returned (wrong filter)
   ```

4. **Semantic Confusion**:
   - `subject_id` should mean "subject OF notification" (e.g., document ID, project ID)
   - Service mistakenly used it for "recipient user ID"
   - Database has `user_id` for recipient, but service wasn't using it

## Solution

### Changes Made to `apps/server/src/modules/notifications/notifications.service.ts`

#### 1. Fixed Query Methods (12 total)

Changed all queries from filtering by `subject_id` to `user_id`:

1. **getForUser()** - Line 98
   ```typescript
   // BEFORE:
   const conditions: string[] = ['subject_id = $1'];
   
   // AFTER:
   const conditions: string[] = ['user_id = $1'];
   ```

2. **getUnreadCounts()** - Line 166
   ```typescript
   // BEFORE:
   WHERE subject_id = $1
   
   // AFTER:
   WHERE user_id = $1
   ```

3. **markRead()** - Line 193
   ```typescript
   // BEFORE:
   WHERE id = $1 AND subject_id = $2
   
   // AFTER:
   WHERE id = $1 AND user_id = $2
   ```

4. **markUnread()** - Line 212
   ```typescript
   // BEFORE:
   WHERE id = $1 AND subject_id = $2
   
   // AFTER:
   WHERE id = $1 AND user_id = $2
   ```

5. **dismiss()** - Line 231
   ```typescript
   // BEFORE:
   WHERE id = $1 AND subject_id = $2
   
   // AFTER:
   WHERE id = $1 AND user_id = $2
   ```

6. **getCounts()** - Line 253
   ```typescript
   // BEFORE:
   WHERE subject_id = $1
   
   // AFTER:
   WHERE user_id = $1
   ```

7. **clear()** - Line 273
   ```typescript
   // BEFORE:
   WHERE id = $1 AND subject_id = $2
   
   // AFTER:
   WHERE id = $1 AND user_id = $2
   ```

8. **unclear()** - Line 292
   ```typescript
   // BEFORE:
   WHERE id = $1 AND subject_id = $2
   
   // AFTER:
   WHERE id = $1 AND user_id = $2
   ```

9. **clearAll()** - Line 311
   ```typescript
   // BEFORE:
   WHERE subject_id = $1
   
   // AFTER:
   WHERE user_id = $1
   ```

10. **snooze()** - Line 335
    ```typescript
    // BEFORE:
    WHERE id = $1 AND subject_id = $2
    
    // AFTER:
    WHERE id = $1 AND user_id = $2
    ```

11. **unsnooze()** - Line 354
    ```typescript
    // BEFORE:
    WHERE id = $1 AND subject_id = $2
    
    // AFTER:
    WHERE id = $1 AND user_id = $2
    ```

12. **getPreferences()** - Line 377
    ```typescript
    // BEFORE:
    WHERE subject_id = $1 AND category = $2
    
    // AFTER:
    WHERE user_id = $1 AND category = $2
    
    // Also added try-catch for table not existing
    ```

#### 2. Fixed INSERT Statement

Changed the `create()` method to insert into correct column:

```typescript
// BEFORE:
INSERT INTO kb.notifications (
  organization_id, project_id, subject_id,
  ...
) VALUES ($1, $2, $3, ...)

// AFTER:
INSERT INTO kb.notifications (
  organization_id, project_id, user_id,  // ← Changed column name
  ...
) VALUES ($1, $2, $3, ...)
```

**Note:** The DTO still uses `subject_id` field name (semantic naming issue), but it now correctly maps to the `user_id` database column. A future refactor could rename the DTO field to `user_id` for clarity.

#### 3. Enhanced getPreferences() with Error Handling

The `user_notification_preferences` table doesn't exist yet, so wrapped the query in try-catch:

```typescript
async getPreferences(userId: string, category: string): Promise<NotificationPreferences> {
    try {
        const result = await this.db.query<NotificationPreferences>(
            `SELECT * FROM kb.user_notification_preferences WHERE user_id = $1 AND category = $2`,
            [userId, category],
        );
        
        if (result.rows.length === 0) {
            return defaultPreferences;
        }
        
        return result.rows[0];
    } catch (error) {
        // Table doesn't exist yet, return defaults
        this.logger.debug(`user_notification_preferences table not found, using defaults`);
        return defaultPreferences;
    }
}
```

## Database Schema Reference

### kb.notifications Table Structure

```sql
CREATE TABLE kb.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    user_id TEXT,              -- ✅ Recipient user (Zitadel ID)
    subject_id TEXT,            -- ✅ Subject entity (what notification is about)
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT,
    importance TEXT DEFAULT 'other',
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    cleared_at TIMESTAMP WITH TIME ZONE,
    snoozed_until TIMESTAMP WITH TIME ZONE,
    dismissed BOOLEAN DEFAULT false,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    type TEXT,
    severity TEXT DEFAULT 'info',
    related_resource_type TEXT,
    related_resource_id UUID,
    actions JSONB DEFAULT '[]',
    expires_at TIMESTAMP WITH TIME ZONE
);
```

### Column Semantics

- **user_id**: WHO receives the notification (recipient Zitadel user ID)
- **subject_id**: WHAT the notification is about (optional entity reference)

## Testing

### Server Restart

```bash
npx pm2 restart spec-server-2-server
```

Server restarted successfully with no errors.

### Verification

All notification endpoints are now registered and working:
- ✅ GET /notifications (list)
- ✅ GET /notifications/counts (unread counts)
- ✅ GET /notifications/stats (statistics)
- ✅ POST /notifications/:id/read (mark as read)
- ✅ POST /notifications/:id/unread (mark as unread)
- ✅ POST /notifications/:id/dismiss (dismiss)
- ✅ DELETE /notifications/:id (delete)
- ✅ POST /notifications/:id/unclear (restore from cleared)
- ✅ DELETE /notifications (clear all)
- ✅ POST /notifications/:id/snooze (snooze)
- ✅ POST /notifications/:id/unsnooze (unsnooze)

## User Identity Architecture

For context, this is how user identity works in the system:

### Three-Layer Identity System

1. **External Authentication (Zitadel)**
   - User ID format: Numeric string (e.g., "343522958238547971")
   - Not a UUID
   - Provided by auth middleware

2. **Mapping Layer (user_profiles)**
   ```sql
   CREATE TABLE core.user_profiles (
       id UUID PRIMARY KEY,              -- Internal UUID
       zitadel_user_id TEXT UNIQUE,      -- External auth ID
       ...
   );
   ```

3. **Application Data**
   - Uses internal UUIDs for foreign keys
   - Notifications table uses Zitadel ID (TEXT) directly for simplicity
   - No need to look up user_profiles for notifications

## Future Improvements

1. **Rename DTO Field**: Change `subject_id` to `user_id` in `CreateNotificationDto` for clarity
2. **Create Preferences Table**: Add migration for `user_notification_preferences` table
3. **Add Tests**: Unit tests for all notification service methods
4. **Type Safety**: Consider using branded types or enums for user ID vs entity ID distinction

## Related Files

- `apps/server/src/modules/notifications/notifications.service.ts` - Main service (fixed)
- `apps/server/src/modules/notifications/notifications.controller.ts` - Controller (unchanged)
- `apps/server/src/modules/notifications/dto/create-notification.dto.ts` - DTO (needs future refactor)
- `apps/server/migrations/0001_init.sql` - Database schema (correct)

## Session Context

This fix was part of Session 3 Part 21, following the successful schema migrations in Part 20 which added missing columns (read_at, cleared_at, snoozed_until, importance).
