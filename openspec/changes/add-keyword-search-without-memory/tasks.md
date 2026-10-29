# Tasks: Keyword search over an instance's own strategy

Baseline first: `cd apps/strategy-server && go test ./...` with Postgres up
(`task dev-deps`). Record what passes. Write each test before the code it covers
and see it fail.

## 1. Matcher (pure, `domain/strategyread`)

- [ ] 1.1 Tokeniser: letters and digits, lowercase, diacritics folded. Table tests:
      `2027-05-31`, `Kvalitetssikring`, `Æble`, mixed punctuation, empty input.
- [ ] 1.2 Query terms: drop one-character terms and the stop words (English and
      Norwegian). Table tests, including a query of only stop words.
- [ ] 1.3 `Search(artifactType, payload, query)`: walk the payload, find the
      smallest object whose own text contains a term, build its path (`[id=..]`
      when the item's `id` is a string unique in its array, `[n]` otherwise),
      score by the share of distinct terms plus the gist-field bonus, tie-break by
      size. Tests: a nested key result; an array of strings owned by an object;
      duplicate ids fall back to an index; a path from every hit resolves through
      `Read`.
- [ ] 1.4 Snippet: at most 240 characters around the first match in the best field.

## 2. Service (`domain/strategy`)

- [ ] 2.1 `SearchAuthored(ctx, instanceID, query, limit)`: current rows of the
      instance, framework classes excluded in the query, decode, match, merge,
      rank, cap at 25 (default 10). Integration tests on a seeded instance: a
      template with the word and an authored file without it returns nothing; a
      second instance with the same word returns nothing for the first.
- [ ] 2.2 Fill `section_size_chars` and `read_with` from the existing helpers.

## 3. MCP

- [ ] 3.1 `mode` parameter on `search_strategy` (`auto`, `semantic`, `keyword`);
      an unknown value is a bad-request error that names the valid values.
- [ ] 3.2 `auto` orchestration (design D6): semantic first, fall back on error or on
      no in-scope hit, warn-log the cause, straight to keyword when Memory is not
      configured. Tests through the MCP handler: Memory not configured; Memory
      returning an error; Memory returning only framework and foreign hits; `mode`
      `semantic` with no Memory still errors; `mode` `keyword` ignores Memory.
- [ ] 3.3 Add `match` to the hit. Update the tool description (keyword fallback,
      empty is not silence) and the server instructions where they mention search.
      Replace the test added in `674aabed`, which expects the unavailable error in
      `auto` mode, with the `semantic` mode test.
- [ ] 3.4 Regenerate `self-model.json`; the staleness test must pass.

## 4. Evidence

- [ ] 4.1 Benchmark on a fixture of the pilot's shape (six artifacts, about
      440 KB) and a 2 MB variant. Record the time per query. If the 2 MB variant is
      over 100 ms, record that and open the full-text follow-up (design D2).
- [ ] 4.2 Acceptance on real data: from the question bank, take every question whose
      answer location is recorded and use its natural wording as the query. Report
      how many return the recorded location in the first 5 hits. State the result
      as k of n.
- [ ] 4.3 Replay Q17 on a scratch server without Memory: three runs per condition,
      same judge and harness as the earlier evaluation. Report k of n, and the
      earlier scores next to it. Do not claim an improvement the runs do not show.
- [ ] 4.4 `openspec validate add-keyword-search-without-memory --strict`.
