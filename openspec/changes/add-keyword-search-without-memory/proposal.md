# Change: Keyword search over an instance's own strategy

Make `search_strategy` find things when Memory is not configured, is down, or
finds nothing, by searching the instance's authored artifacts directly.

Related: `add-bounded-section-reads` (hits point at `get_section`; this change
returns hits in the same shape), `add-instance-content-integrity` (framework
content is never returned), `fence-memory-graph-per-instance` (rewrites the
semantic read path; this change stays outside it).

## Why

`search_strategy` is the first tool a client reaches for, and it depends on
Memory. Without Memory it fails with "Semantic engine unavailable". Measured on
a pilot instance, with Memory off, over 72 runs of an evaluation:

- Every `search_strategy` call returned an error, in both builds, in every run
  that tried it.
- On a question about dated commitments (Q17), 4 of 6 runs on the new build
  missed the not-to-exceed ceiling on one customer order. The fact is one key result in the
  commercial track. The runs that read that whole section found it. The runs
  that opened key results by id, working from the execution plan, never saw it.
  A search for the customer name and the year would have returned it.
- After the error was made to say what to do instead (commit `674aabed`), models
  followed it to `get_outline`, but the Q17 score did not change. Over three
  runs each, the two conditions scored 5 and 3 points out of 6, as before.

So the fix for an unavailable search is not a better error. It is a search that
works. Memory can also be unavailable in production (outage, project change), and
an instance is small enough to search directly: the pilot instance's six
authored artifacts total about 440 KB. (The 2.2 MB the old read returned was
mostly canonical definitions and templates.)

## What Changes

- `search_strategy` gains an optional `mode`: `auto` (default), `semantic` or
  `keyword`.
- In `auto`, the semantic search runs when Memory is configured. The keyword
  search runs instead when semantic search is unavailable, fails, or returns no
  hit inside the instance's own authored content.
- Keyword search reads the instance's current, authored artifacts from the
  database, matches the query terms against text, and returns hits in the existing
  shape with a path that `get_section` accepts.
- Each hit says how it was found: `match: "keyword"` or `"semantic"`.
- Framework content (templates, canonical definitions, packaged defaults) and
  other instances' content are never searched.

## Impact

- Affected specs: `strategy-mcp`.
- Affected code: `apps/strategy-server/domain/strategyread` (pure matcher),
  `domain/strategy` (service method), `internal/mcpserver` (handler, description),
  `self-model.json`.
- No migration. No change to `epf-cli`.
- Response shape: an array, as today, with one added field per hit. The tool
  stops returning an error when Memory is not configured.

## Not in scope

- Ranking by meaning. Keyword search finds the words you used, not their
  synonyms. Semantic search stays the first choice when Memory is up.
- A Postgres full-text index. Design D2 says when to add one.
- Searching evidence, Memory graph relationships or other instances.
- Stemming and language analysis. Matching is by token and by prefix.

## Open questions

1. Are mixed English and Norwegian instances common enough that the small
   stop-word list needs a third language? Starting with English and Norwegian.
2. Should `auto` merge keyword hits into a non-empty semantic result when the
   query contains a number or a proper noun? Not now: it needs evidence that
   semantic search misses them.
