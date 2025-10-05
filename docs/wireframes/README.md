# Wireframes Index

## Conventions
- Naming: `Feature – Mode – State`
- States: `default | loading | empty | error | bulk | streaming`
- Greyscale palette only. Use semantic Tailwind/daisyUI neutrals (e.g. `bg-base-200`, `text-base-content/70`).
- Accent placeholder: outline-only (`border-primary`) – avoid filled brand colors at wireframe stage.
- Icons: placeholder shapes (`rounded bg-base-300 h-4 w-4`). Lucide classes can be added later.
- Spacing scale: 4 / 8 / 12 / 16 / 24.
- Each frame annotated with interaction hotspots (tooltip text outside frame).

## Design Reference
- **Notification Inbox**: Exact ClickUp layout pattern (single-column, horizontal tabs, time grouping)
- Layout verified against ClickUp screenshot (October 2025)

## Feature Coverage
- Object Browser
  - Table: default, loading, empty, bulk, error
  - Cards: default, empty *(planned)*
  - Filter Drawer: default, many-filters overflow *(planned)*
- Notification Inbox ✅ **Matches ClickUp design**
  - Single-column full-width list
  - Horizontal tabs: All, Important (count), Other (count), Snoozed, Cleared
  - Time-grouped sections: Today, Yesterday, Last 7 days
  - Row structure: unread dot, title, preview text, timestamp + reaction counts
  - States: default, loading, empty
- Chat (Object References)
  - Message streaming (partial mentions pulsing)
  - Message resolved (all mentions enriched)
- ClickUp Integration
  - Space not selected
  - Mapping preview baseline
  - Sync in progress (activity log entry streaming)

## Change Log
- 2025-10-03: Initial scaffold (README, planned story states)
- 2025-10-03: Updated Notification Inbox to match ClickUp's exact layout (single-column, horizontal tabs, time grouping)

## Next Steps
1. ~~Implement Storybook wireframe components under `apps/admin/src/components/wireframes/`.~~ ✅
2. ~~Add stories mirroring states above.~~ ✅
3. Review with stakeholders - verify layout patterns match requirements
4. Add Card view & Filter Drawer wireframes for Object Browser
5. Link exported PNGs once Figma baseline locked (optional)
6. Begin mid-fi pass: add icons, real content samples, interaction states
