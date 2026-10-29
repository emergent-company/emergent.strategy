# Design: Bounded, question-shaped, self-describing reads

## Context

Measured on a pilot instance through the MCP, the read tools return a 1 KB
snippet or between 18 KB and 2.2 MB of payload. The answer to a typical question
is a 1 to 21 KB slice of one to three files. The section vocabulary is already
shared: the EPF schemas name the paths (`mission.boundaries`, `trade_offs`,
`competitive_moat.vs_competitors`, `tracks.<track>.okrs`).

Existing facts from the code:

- Single-artifact reads return the raw payload text. `get_strategy_context`
  returns every non-archived artifact despite its description. A payload is
  wrapped in a root key (`north_star`, `strategy`, `roadmap`).
- A new tool defaults to `AccessWrite` in the access map unless it is listed.
- `core` is the set visible without a filter call. The filter is per session and
  is not a security boundary.
- Tool lists change through `tools/list_changed`. Whether a client re-lists is a
  client behaviour that this server cannot rely on.

## Goals / Non-goals

Goals:
- Any answer-sized slice is reachable in at most two calls, within budget.
- A client can tell what is defined, where a fact came from, and how big
  something is before reading it.
- The first tools a client sees are the right ones.

Non-goals:
- Replacing the structured write tools or the semantic tools.
- Summarising or rewriting content. The reads return stored content.
- A security boundary. Visibility is a hint to the model.

## Decisions

### D1. Paths

A path is dot-separated keys. Array items are selected by position `[2]`, by id
`[id=okr-c-001]` or by name `[name=Acme]`. The artifact is addressed by type
(`north_star`, `strategy_formula`, `roadmap_recipe`, `insight_analyses`,
`strategy_foundations`, `insight_opportunity`), and the root wrapper key is
transparent, so callers write `mission.boundaries`, not `north_star.mission.boundaries`.
An unknown path returns `defined: false` with the nearest valid children, never an
error and never a guess.

### D2. Outline

`get_outline(instance_id, artifact?)` returns, per artifact: whether it is
defined (and the integrity class when it is not authored), its top-level
sections with size in characters and a one-line gist (the first of `title`,
`name`, `statement`, `description`, truncated), and the tool and path to read
each. The whole instance fits in a few KB. With an artifact, it descends one
level.

### D3. Section reads and the budget

`get_section(instance_id, artifact, path, max_chars?)`. Default budget 12,000
characters (about 3k tokens), hard cap 40,000. The budget applies to the
serialised content.

- If the subtree fits, return it.
- If it does not and it is an object, return its children with sizes and gists,
  and `truncated: true`.
- If it does not and it is an array, return whole items that fit, `next_index`
  and the remaining count. Never cut an item.
- A single item larger than the cap returns its children as for an object.

Response fields: `defined`, `defined_reason`, `source` (instance, artifact type,
artifact key, path), `size_chars`, `truncated`, `content`, `children`,
`cite_as`, `labels`, `hints`. This is a read envelope, separate from the
validation verdict envelope, which is not extended.

### D4. Views

`get_view(instance_id, view, args)` resolves a question-shaped answer across
files, by composing sections with the same budget. Initial views, chosen from the
most-cited question locations:

| View | Composes |
|---|---|
| `competitor` (name) | the formula's per-competitor positioning and the positioning statement, plus the insights landscape entry |
| `objectives` (track?) | objective ids, text and key-result ids per track, as an outline |
| `key_result` (id) | one key result with its objective, assumptions and dependencies |
| `personas` | the insights file's `target_users`, with the note when the personas are thin |

A view lists its parts, each with its own `defined`. A missing part is reported,
not skipped. Views are defined in code against the shared schema vocabulary, and
a test asserts that every path a view reads exists in the embedded schema.

### D5. Existing tools

- `get_personas` reads `target_users` from the insights artifact. This is a bug
  fix.
- `get_competitive_position` adds the formula's per-competitor positioning.
- `get_strategy_context`, `list_artifacts` and `get_roadmap` default to an
  outline. A `full` argument returns payloads, subject to the hard cap with
  explicit truncation. `list_artifacts` also paginates.
- Descriptions say what is returned and point to the new reads.

### D6. Search hits

Each hit gains `artifact_type`, `path`, `section_size_chars` and `read_with`
(the tool and arguments that read it). The fence change adds `instance_id`,
`layer` and `source_artifact`. Until both land the new fields are filled from the
artifact key where it is derivable and omitted where it is not.

### D7. Labels and citations

`cite_as` is a human label built from the artifact and path ("Strategy formula,
trade-offs"). `labels` maps identifiers that appear in the returned content to a
readable name taken from the same instance: objectives from their objective text,
key results from their description, assumptions from their statement,
definitions from their name. Identifiers without a source in the instance are
not invented. Decision numbers that appear only inside prose are out of scope.

### D8. Visibility

`get_outline`, `get_section` and `get_view` join `core` and are added to the read
access map. The set of read tools in `core` becomes the first thing a client
sees. Sessions authenticated with a read-only token list only read tools in
`tools/list` by default, because the write tools are refused anyway and listing
them invites attempts. The filter remains a presentation aid, and calls are still
checked by the access gate.

`get_agent_for_task` routes "what does the strategy say about", "who are our",
"what is our", dates and figures to the new reads.

### D9. Tests

- A path and budget unit suite (selectors, root wrapper, arrays, oversize items,
  unknown paths, never mid-item).
- A contract test on a fixture sized like the pilot (over 1 MB): no read tool
  returns more than the cap unless asked for full, and truncation is always
  flagged.
- An acceptance table built from the question bank: every recorded location is
  reachable in at most two calls, each within budget, and returns the fact the
  gold answer needs.
- Output schemas published and validated, as for the verdict tools.

## Risks

- **Changing defaults breaks a caller.** Mitigate with the explicit full flag,
  a release note and finding the callers first.
- **Section vocabulary drift** when a schema changes. Mitigate with the schema
  test for views and a clear `defined: false` for an unknown path.
- **Models still choose search first.** Mitigate with descriptions, routing and
  the `read_with` hint, and measure it in the evaluation.
- **Label glossary grows large.** Cap it, and omit labels for identifiers not in
  the returned content.

## Open questions

1. Default budget: 12,000 characters is derived from the measured section sizes,
   not from a client limit. Confirm against a real client.
2. Who calls `get_strategy_context`, `list_artifacts` and `get_roadmap` today
   (the harness, the web UI, other agents)? Find them before the default
   changes.
3. Does the target client inject the MCP `instructions`, and does it re-list
   tools after `tools/list_changed`? Test with a real session. The design does not
   depend on either, which is the point of putting the reads in `core`.
4. Should read-only visibility key on the token scope or be a session option?
5. Are more views worth adding after the first measurement (trade-offs and
   constraints are 8 to 21 KB and may need item-level reads)?
