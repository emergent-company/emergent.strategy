# Change: Bounded, question-shaped, self-describing reads

Give clients reads that return the slice of strategy a question needs, within a
size budget, with provenance and plain-language labels, and make those reads the
tools a client sees first.

Related: `add-instance-content-integrity` (framework content is excluded from
these reads by its classification) and `fence-memory-graph-per-instance`
(provenance fields on search hits, scoped reads).

## Why

On a pilot instance the read tools were measured through the MCP (sizes in
characters; tokens are characters divided by four, approximate):

| Tool | Result |
|---|---|
| `get_strategy_context`, described as "vision, personas, competitive position" | 2.2 MB, about 550k tokens. It returns every artifact. |
| `list_artifacts` | The same 2.2 MB. Full payloads, no pagination. |
| `get_competitive_position` | 118 KB. Returns the insights file only. The per-competitor positioning is in the strategy formula and is not included. |
| `get_roadmap` | 69 KB, of which 59 KB is the `tracks` block |
| `get_personas` | 62 KB from the strategy-foundations file, which has no personas. They are in the insights file. |
| `get_product_vision` | 18 KB |
| `search_strategy` | 1.4 KB for ten hits. Snippets only. |

The surface is either a snippet or a dump. Nothing returns a question-sized
slice. Meanwhile the questions a team asks need between 1 and 21 KB:
of 59 recorded management questions, 26 are answered from one file, 20 from two,
10 from three and 1 from four, and 32 sit inside a file over 100 KB. The most
cited sections are small and named (boundaries, trade-offs, one competitor's
entry, one key result).

Consequences, from reading the code and from test runs:

- A client that cannot take 550k tokens truncates, fails or guesses. A client
  that gets the wrong file concludes a part does not exist. Both are wrong
  answers about the company.
- The structured reads sit behind `set_tool_filter`. Only `search_strategy` is
  visible at first, and it returns snippets. A client that does not re-list tools
  after the filter changes never sees the structured reads.
- Answers leak internal codes (`kr-c-002`, `okr-p-001`) because the content is
  full of them and nothing supplies a readable label.
- `core` lists `commit_batch`, `discard_batch` and `describe_batch`, so a
  read-only session is shown write tools it cannot use.

## What Changes

- **New reads, always visible:** `get_outline` (what is defined, in what
  sections, how big), `get_section` (the subtree at a path, within a budget, with
  children when it is too big) and `get_view` (a few multi-file answers such as
  positioning against one competitor, the objectives, one key result, the
  personas).
- **Every response is self-describing:** `defined` and the reason when it is
  not, source artifact and path, size, `truncated`, a ready-to-use `cite_as`
  label, and a `labels` glossary that maps identifiers in the content to readable
  names. Nothing is truncated silently.
- **Existing reads fixed in place:**
  - `get_personas` returns the insights file's `target_users`.
  - `get_competitive_position` includes the per-competitor positioning.
  - `get_strategy_context`, `list_artifacts` and `get_roadmap` return an outline
    by default, with an explicit flag for full payloads.
- **Search points onward:** each hit carries artifact, path and section size, and
  names the tool that reads it.
- **Visibility:** the new reads are in `core` and in the read-access map.
  Read-only sessions do not list write tools by default. This shapes
  `tools/list` only. It is not a security boundary.
- **Budgets enforced by test:** a default response budget, a hard cap, and an
  acceptance table built from the question bank.

Not in this change: the client skill (answer discipline, citation format, "my
reading" marking), which is delivered as client configuration, and content
authoring.

**BREAKING (behavioural):** the default output of `get_strategy_context`,
`list_artifacts` and `get_roadmap` changes from full payload to outline. Callers
that need the full payload pass the explicit flag. Callers are to be identified
before merge (design open question 2). The `get_personas` change is a bug fix.

## Impact

- Affected specs: `strategy-mcp` (new read tools, bounded defaults, visibility)
  and `strategy-authoring` (read strategy context).
- Affected code: `domain/strategy` (path resolution, budgeting, outline, labels),
  `internal/mcpserver` (new tools, changed defaults, `tool_filter.go`,
  `write_gate.go`, descriptions, output schemas), `internal/agent/knowledge.go`
  (routing keywords), `domain/semantic` (search hit fields), `self-model.json`.
- No migration.
- Depends on `add-instance-content-integrity` for excluding framework content,
  and on the fence change's provenance fields for search. Both can land later
  without blocking: the reads work without them and gain behaviour when they
  arrive.
