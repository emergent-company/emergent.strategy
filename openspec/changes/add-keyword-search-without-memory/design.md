# Design: Keyword search over an instance's own strategy

## Context

`search_strategy` calls Memory. With no Memory configured it returns an error.
Authored artifacts are stored as JSON payloads in `strategy_artifacts`, one
current row per artifact, with an `integrity_class` that marks unmodified
framework content. `domain/strategyread` already walks payloads and produces
paths that `get_section` accepts, including `[id=..]` selectors.

## Goals and non-goals

Goals: a search that works with no Memory; hits that point at a section the
client can read and cite; no framework content; no content from another instance.

Non-goals: semantic ranking, stemming, a new index, searching anything but
authored artifacts.

## Decisions

### D1. Where the code lives

A pure matcher in `domain/strategyread` (`Search(artifactType, payload, query)`),
a service method in `domain/strategy` that selects the rows and calls it, and the
MCP handler, which decides between semantic and keyword. The matcher has no
database or Memory dependency, so it is tested with plain payloads.

The handler composes two calls. It does not change `SearchStrategyScoped`. The
fence change rewrites that function (its Track B), and this change must not
conflict with it.

### D2. No index; scan the authored artifacts per query

The service loads the instance's current artifacts that are not framework
content, decodes each payload, and matches in memory.

Reasons: no migration, no write path to keep in step, exact results, and the
data is small (about 440 KB for the pilot instance's six artifacts).

Measure before shipping: a benchmark on a fixture of the pilot's shape (six
artifacts, about 440 KB, and a 2 MB variant). Target under 100 ms per query on
a laptop. If the 2 MB variant exceeds it, add a Postgres full-text column in a
follow-up change rather than caching decoded payloads in the process.

### D3. The unit of a hit

A hit is the deepest object whose own text fields contain a match. For a match
inside an array of strings, the unit is the object that owns the array. This
makes a hit a key result, an objective, a risk or one competitor entry, which is
the size a client needs, not a whole artifact.

The hit's path uses `[id=value]` when the array item has a string `id` that is
unique in its array, and `[n]` otherwise. Both are accepted by `get_section`.

### D4. Matching

Tokens are runs of letters and digits, lowercased, with diacritics folded
(`golang.org/x/text`, already a dependency). `2027-05-31` yields `2027`, `05`
and `31`, so a year finds a date.

A query term matches a token when they are equal, or when the term has at least
four characters and the token starts with it (`kvalitet` finds `kvalitetssikring`).
There is no stemming: `dates` does not find `date`. Documented as a limitation.

Terms of one character, and a small stop-word list for English and Norwegian,
are dropped. A query that is empty after this returns no hits.

Any term may match. A unit's score is the share of distinct query terms it
contains, plus a bonus when a match is in a field the outline uses as the unit's
gist (`title`, `name`, `statement`, and so on). Ties go to the smaller unit.

### D5. Result shape and limits

The hit has the existing fields: `artifact_type`, `artifact_key`, `snippet`,
`score`, `artifact`, `path`, `section_size_chars`, `read_with`. It gains
`match`, with the value `keyword` or `semantic`.

The snippet is at most 240 characters around the first match in the best field.
Default limit 10, hard cap 25. The response stays a plain array.

### D6. Orchestration

`mode` is `auto`, `semantic` or `keyword`.

- `keyword`: keyword search only.
- `semantic`: today's behaviour, including the error when Memory is unavailable.
- `auto`: semantic search first when Memory is configured. Fall back to keyword
  search when semantic search returns an error, or returns no hit left after
  framework and other-instance filtering. When Memory is not configured, go
  straight to keyword.

The fallback on an error is logged at warn level, with the cause, so an outage
is visible to an operator even though the client sees a normal result.

### D7. Scope

The service selects by `instance_id` and excludes framework classes in the query.
Another instance's content cannot be returned, because it is never loaded. This
is a stronger guarantee than the Memory path has today.

Evidence, and artifacts that are not current, are not searched.

## Risks

- **Ranking quality.** Any-term matching with a simple score can rank a long
  generic unit above a short exact one. Mitigation: the Q17 and the other
  question-bank locations are the acceptance set (task 4), and the score is
  tested on them, not assumed.
- **Latency.** See D2. The benchmark is a task, not an assumption.
- **A fallback hides an outage.** The warn log in D6 is the signal. The
  `match` field tells the client.
- **A different answer depending on Memory.** Semantic and keyword search return
  different hits for the same query. Both point at readable sections, and the
  tool description tells the client that a search is discovery and to confirm
  with `get_section`.
