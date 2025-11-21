# Tasks: Add Chat Schema Awareness

- [ ] 1. Update Graph Service for Advanced Filtering

  - [ ] 1.1 Modify `GraphService.searchObjects` to accept `properties` (with operators) and `related_to_id`.
  - [ ] 1.2 Implement SQL logic for property comparison operators (`$gt`, `$lt`, etc.) and relationship join.
  - [ ] 1.3 Verify filtering logic with unit tests.

- [ ] 2. Implement Schema Tool

  - [ ] 2.1 Create `apps/server/src/modules/chat-sdk/tools/schema.tool.ts`.
  - [ ] 2.2 Implement `get_database_schema` using `TypeRegistryService`.
  - [ ] 2.3 Register tool in `ChatSdkModule`.

- [ ] 3. Implement Object Query Tool

  - [ ] 3.1 Create `apps/server/src/modules/chat-sdk/tools/object-query.tool.ts`.
  - [ ] 3.2 Implement `query_graph_objects` wrapping the updated `GraphService.searchObjects`.
  - [ ] 3.3 Expose `properties` (with operator schema) and `related_to_id` in the tool input schema.
  - [ ] 3.4 Register tool in `ChatSdkModule`.

- [ ] 4. Integration & Validation
  - [ ] 4.1 Test tools via manual interaction or unit tests.
