## Summary
Describe the change. What feature/bug does this address?

## Type of Change
- [ ] Feature
- [ ] Bug Fix
- [ ] Refactor / Cleanup
- [ ] Docs / Benchmark / Tooling
- [ ] Other (specify)

## Graph / FakeGraphDb Checklist
If you touched graph logic or tests:
- [ ] Added/updated SQL pattern(s) in `apps/server/tests/helpers/fake-graph-db.ts`
- [ ] Updated helper README if new pattern class added
- [ ] Verified head selection semantics (DISTINCT ON then outer tombstone filter) preserved
- [ ] Multiplicity logic unchanged OR new tests added

## Tests
- [ ] Unit tests added / updated
- [ ] All affected test suites passing locally (`vitest run -t 'GraphService'` patterns as needed)
- [ ] (Optional) Ran relationship micro benchmark `npm run bench:graph:relationships`

## Benchmark (Optional)
Paste output if run:
```json
{
  "benchmark": "graph.relationships.create+patch",
  "iterations": 2000,
  "operations": 4000,
  "elapsed_ms": 0,
  "ops_per_sec": 0,
  "avg_ms_per_op": 0,
  "versions_written": 0,
  "node": ""
}
```

## Docs
- [ ] Added / updated documentation where appropriate

## Risk & Rollback Plan
Briefly describe potential risk and how to rollback if needed.

## Additional Notes
Anything else reviewers should know.
