# Tasks: Keyword search over an instance's own strategy

Baseline first: `cd apps/strategy-server && go test ./...` with Postgres up
(`task dev-deps`). Record what passes. Write each test before the code it covers
and see it fail.

## 1. Matcher (pure, `domain/strategyread`)

- [x] 1.1 Tokeniser: letters and digits, lowercase, diacritics folded. Table tests:
      `2027-05-31`, `Kvalitetssikring`, `Æble`, mixed punctuation, empty input.
- [x] 1.2 Query terms: drop one-character terms and the stop words (English and
      Norwegian). Table tests, including a query of only stop words.
- [x] 1.3 `Search(artifactType, payload, query)`: walk the payload, find the
      smallest object whose own text contains a term, build its path (`[id=..]`
      when the item's `id` is a string unique in its array, `[n]` otherwise),
      score by the share of distinct terms plus the gist-field bonus, tie-break by
      size. Tests: a nested key result; an array of strings owned by an object;
      duplicate ids fall back to an index; a path from every hit resolves through
      `Read`.
- [x] 1.4 Snippet: at most 240 characters around the first match in the best field.

## 2. Service (`domain/strategy`)

- [x] 2.1 `SearchAuthored(ctx, instanceID, query, limit)`: current rows of the
      instance, framework classes excluded in the query, decode, match, merge,
      rank, cap at 25 (default 10). Integration tests on a seeded instance: a
      template with the word and an authored file without it returns nothing; a
      second instance with the same word returns nothing for the first.
- [x] 2.2 Fill `section_size_chars` and `read_with` from the existing helpers.

## 3. MCP

- [x] 3.1 `mode` parameter on `search_strategy` (`auto`, `semantic`, `keyword`);
      an unknown value is a bad-request error that names the valid values.
- [x] 3.2 `auto` orchestration (design D6), first version: semantic first, fall back
      on error or on no in-scope hit, warn-log the cause, straight to keyword when
      Memory is not configured. (Superseded by 3.5.) Tests through the MCP handler: Memory not configured; Memory
      returning an error; Memory returning only framework and foreign hits; `mode`
      `semantic` with no Memory still errors; `mode` `keyword` ignores Memory.
- [x] 3.3 Add `match` to the hit. Update the tool description (keyword fallback,
      empty is not silence) and the server instructions where they mention search.
      Replace the test added in `674aabed`, which expects the unavailable error in
      `auto` mode, with the `semantic` mode test. (Done. Two older tests that
      asserted the error without Memory, `TestMCP_SemanticToolsUnavailable` and
      `TestMCP_Scenario_SemanticSearch`, now assert the new contract.)
- [x] 3.4 Regenerate `self-model.json`; the staleness test must pass.
- [x] 3.5 `auto` returns keyword hits first and keeps a fifth of the limit for
      semantic hits (design D6, "Why keyword first"). Tests through the MCP handler,
      written first and seen to fail: 8 + 2 at a limit of 10; the split at limits 5,
      20 and 25; backfill from the other side in both directions; a section found
      both ways listed once as the keyword hit; keyword alone without a graph. The
      tool and mode descriptions say what `auto` returns; `self-model.json`
      regenerated. `TestMCP_SemanticSearch_WithMemory`, which relied on semantic
      being the default, now asks for `mode: semantic`.

## 4. Evidence

- [x] 4.1 Benchmark on a fixture of the pilot's shape (six artifacts, about
      440 KB) and a 2 MB variant. Record the time per query. If the 2 MB variant is
      over 100 ms, record that and open the full-text follow-up (design D2).
      Result, on the real pilot data (six artifacts, 379 KB of JSON), decoding the
      payloads and matching, 162 queries: median 9 ms, p95 11 ms, max 18 ms. On a
      5x copy (1.9 MB): median 44 ms, p95 59 ms, max 108 ms, one query over the
      target. Not measured: the database read of the payloads.
- [x] 4.2 Acceptance on real data: from the question bank, take every question whose
      answer location is recorded and use its natural wording as the query. Report
      how many return the recorded location in the first 5 hits. State the result
      as k of n.
      Result, with each question's full wording as the query: a recorded location
      is in the top 5 hits for 23 of 54 questions (43%) and in the top 10 for 30 of
      54 (56%); every recorded location of a question is in the top 5 for 9 of 54.
      Many of the misses are questions that name a section, not its content ("What
      are our core beliefs?", "Who are our target users?"): the words are field
      names, which are not searched, and `get_outline` is the tool for those. Others
      use words the data does not use (win rates, cash position, MRR). So keyword
      search is not a general answer finder; it finds names, numbers and dates.
      Short queries of the kind a model writes do better: for the Q17 key results,
      "Acme ceiling 2027" ranks the ceiling key result 2nd, "Acme Beta
      2027" ranks it 5th, and "Acme 2027 dates" does not return it in
      the top 10.
      Tried and rejected: weighting terms by rarity (ln(1 + units/df), df counted
      across artifacts). Top 5 went from 23 to 24 of 54, top 10 stayed at 30, and
      one Q17 query got worse. It was reverted: no measured gain for the added
      code. The patch is not kept in the repository.
- [x] 4.3 Replay Q17 on a scratch server without Memory: three runs per condition,
      same judge and harness as the earlier evaluation. Report k of n, and the
      earlier scores next to it. Do not claim an improvement the runs do not show.
      Result (Q17, no Memory, model `claude-opus-5-5`, judge `gemini-3.1-pro-preview`,
      scale 0 to 2): `new` 2/2/2 and `new+instr` 2/2/2. Before: `new` 2/1/2 and
      `new+instr` 1/1/1; with the error hint only (`674aabed`): `new` 2/2/1 and
      `new+instr` 1/1/1. In all six runs the model searched for the customer names
      and the year, then read the key results the hits named, including the one
      with the ceiling. Caveat: all six runs made the same 11 calls with the same
      queries, so this is one trajectory reproduced, not six independent samples.
      Q17 is also the question the change was written for. Regression check, the
      other seven questions on `new+instr`, 3 runs each: 38 of 42 points, as before
      (Q07 1/1/1, Q08 2/2/2, Q10 2/2/2, Q16 2/2/2, Q33 2/1/2, Q38 2/2/2, Q53 2/2/2).
      Judge flags over all 27 runs: 1 invented-fact flag (the judge compares to the
      gold text, so it also fires on true facts the gold text omits), no
      framework-as-strategy, no must-not violation. 12 of 27 runs called search,
      none got an empty or error result.
- [x] 4.4 `openspec validate add-keyword-search-without-memory --strict`.
- [x] 4.5 Replay the pilot instance's question bank (59 questions, gold locations
      from the bank), one search per question, question text as the query, same
      server and index for every strategy. Key results of the bank's gold answers
      in the top 10, of 49 (list-style questions excluded): semantic first 5,
      keyword only 26, keyword 8 + semantic 2: 25, rank fusion 18, even interleave
      19. Artifact reached in the top 10, of 57: 45, 53, 55. Paraphrases that avoid
      the strategy's wording, of 15: 11, 11, 12. Limits: one instance, one query per
      question (a lower bound for an agent that rewrites queries or reads the
      outline first), key results and assumptions only, 15 hand-written
      paraphrases, and the strategy was picked from the same runs it is reported
      on. No framework content was served for any of the 59 questions in any mode.
- [x] 4.6 End-to-end check of 3.5, same 59 questions: Claude Sonnet 5.5 answers each
      through the server (OpenCode with an isolated configuration, the strategy
      server's tools only, no management skill), Gemini 4 grades the answer against
      the bank's gold answer and Must-not list on a 0 to 2 scale for facts only
      (grader controls: the gold text scores 2, an empty answer, an answer to another
      question and the framework-template Must-not answer score 0, 4 of 4). Q56 is
      excluded because it needs an attached plan the harness did not send, leaving
      58 questions. Score 2 / 1 / 0 and points of 116: before 3.5 (semantic first)
      27 / 26 / 5 = 80; after 3.5, run 1 27 / 26 / 5 = 80 and run 2 28 / 25 / 5 = 81.
      Run to run, 47 of 58 questions score the same and all are within one point, so
      differences under about 2 points are noise. Per question, after against before:
      better on 7 and 9, worse on 7. **3.5 has no measurable effect on end-to-end
      answers with this model.** The agent reaches the data through the outline,
      search and section reads whichever search mode is the default: 91% of the
      identifiers the bank names (81 of 89) were in tool output the agent received,
      and the score was the same whether all of them were or not (mean 1.35 and
      1.38). The retrieval gain in 4.5 holds for a client that searches once; it
      does not show up in the final answers here, and should not be cited as an
      improvement in answers. Other results of the same runs (Sonnet, 58 questions):
      no answer presents framework content as the company's (0 of 58); 742 of 743
      numbers in the answers appear in the strategy text (the one that does not is
      the framework version in "2.32.1") and every checked name does too; 47 of 59
      answers put internal codes in the body, which is the baseline without the
      management skill. Of the 5 answers scoring 0, two use the word the bank
      forbids until a replacement exists (it is the strategy's own term), and three
      are composition errors (Q03, Q48, Q55); the points lost elsewhere are
      specific figures, dates and qualifiers inside large sections, not whole
      topics. Limits: one answering model, a grader that is itself a model and
      compares only with the gold answers (written by Claude, reviewed by the
      customer), two runs, and seven "Waiting" questions whose gold answers are
      provisional.

