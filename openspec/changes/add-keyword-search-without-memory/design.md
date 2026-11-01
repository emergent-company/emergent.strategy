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

Weighting terms by rarity was tried and left out: on the pilot data it did not
improve the question-bank acceptance set (task 4.2).

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
- `auto`: run keyword search and, when Memory is configured and the instance has
  a graph, semantic search. Return up to `limit` hits (at most 25), keyword hits
  first, then semantic ones, keeping a fifth of the limit (at least one, for a
  limit of two or more) for semantic hits. A side with less than its share gives
  the room to the other. A section found both ways is listed once, as the keyword
  hit. Without Memory, with an error, or without a graph, return keyword hits
  alone.

The fallback on an error is logged at warn level, with the cause, so an outage
is visible to an operator even though the client sees a normal result.

**Why keyword first (revised after the pilot's question bank).** The first
version ran semantic search first and used keyword search only as a fallback,
because semantic search ranks by meaning. Replayed against the 59-question bank
of a real instance, on one search per question with the question as the query:
semantic search put the section the bank names in its top 10 for 5 of 49 key
results (list-style questions excluded), keyword search for 26. Reaching the
right artifact among the top 10: 45 of 57 (semantic), 53 (keyword), 55
(keyword 8 + semantic 2). A fifteen-question paraphrase set that avoids the
strategy's own wording: 11 of 15 (semantic), 11 (keyword), 12 (keyword 8 +
semantic 2). Rank fusion and interleaving were measured too: weighting the fusion
toward keyword gave the keyword-only numbers, because semantic hits then never
reach the top 10; an even interleave scored 19 of 49. The 80/20 split was picked
from these runs, a single instance, so it is a judgement; what the numbers do
support is that keyword-heavy beats semantic-first on every measure. Semantic
hits keep a share because they find what the query's words do not.

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
