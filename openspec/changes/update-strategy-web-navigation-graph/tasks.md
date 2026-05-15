## 1. Spec Update

- [ ] 1.1 Replace flat navigation table in `strategy-web/spec.md` with navigation graph reference
- [ ] 1.2 Add persona-based reachability requirements
- [ ] 1.3 Add guard-aware navigation rendering requirement
- [ ] 1.4 Add journey scenario validation requirement
- [ ] 1.5 Validate the change with `openspec validate`

## 2. Navigation Graph Maintenance

- [ ] 2.1 Ensure `FIRE/navigation_graph.yaml` stays in sync as strategy-web screens evolve
- [ ] 2.2 Add `properties.url` to remaining contexts that don't have URL hints yet
- [ ] 2.3 Verify the graph validates against `navigation_graph_schema.json` via `epf-cli validate`

## 3. Strategy-Scenarios Alignment

- [ ] 3.1 Verify all 9 strategy-scenarios are expressible as journey runs against the graph
- [ ] 3.2 Add journey scenario YAML files for each strategy-scenario (for `epf_journey_run`)
