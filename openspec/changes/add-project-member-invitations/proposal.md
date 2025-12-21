# Change: Add Project Member Invitations

## Why

Users need the ability to invite collaborators to their projects and manage project membership. Currently, the backend supports invitations but there's no UI for users to invite others, view pending invitations, or manage project members. This feature enables team collaboration within projects.

## What Changes

- **Redesign project settings layout**: Replace horizontal tabs with an always-visible sidebar navigation, grouped by category
- **Invite existing users to projects**: Project admins can search for existing users (by email) and invite them to join a project
- **Pending invitations inbox**: Users see project invitations they've received in the inbox and can accept or decline them
- **Project member management**: View current project members with roles and remove members from projects
- **Automatic organization membership**: When invited to a project, users are automatically added to the organization with access limited to that specific project

## Impact

- Affected specs: New `project-member-invitations` capability
- Affected code:
  - `apps/server/src/modules/invites/` - Extend existing invite service
  - `apps/admin/src/pages/admin/pages/settings/` - Redesign settings layout with sidebar
  - `apps/admin/src/pages/admin/pages/settings/project/` - New members page
  - `apps/admin/src/pages/admin/inbox/` - Extend for invitation notifications
  - `apps/admin/src/router/register.tsx` - New routes

## Settings Sidebar Structure

```
Project Settings (always-visible sidebar)
├── General
│   ├── Templates
│   └── Template Studio
│
├── AI & Extraction
│   ├── Auto-extraction
│   ├── LLM Settings
│   ├── Chunking
│   └── Prompts
│
└── Team
    └── Members (NEW)
```

**Note:** Profile settings remain under the avatar menu, not in project settings.

## Constraints

- **Existing users only**: Initial implementation targets users who already have Zitadel accounts (no email invitation flow)
- **Project-level only**: Organization-level invitations (full access to all projects) are out of scope for this change
- **No email notifications**: Email gateway integration is deferred to a future change

## Future Considerations

- Organization-level invitations granting access to all projects
- Organization-level settings (separate from project settings)
- Email invitation flow for new users (requires email gateway)
- Bulk invitation capabilities
- Invitation link sharing
