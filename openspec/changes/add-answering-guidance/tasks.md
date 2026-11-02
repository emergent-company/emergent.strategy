# Tasks: Answering guidance carried by the outline

Baseline first: `cd apps/strategy-server && go test ./...` with Postgres up
(54 packages ok on `main` at `731f7097`). Write each test before the code it
covers and see it fail.

## 1. Rules text

- [x] 1.1 Test that the embedded rules state each rule that moved answers
      (`TestAnsweringRules_StateTheRulesThatMoveAnswers`) and stay under 6,000
      characters. Seen failing (no `AnsweringRules`).
- [x] 1.2 `internal/agent/answering_rules.md`, embedded, no company, customer or
      competitor named.
- [x] 1.3 Server instructions: rule 10, follow the guidance in the outline.
      Instructions stay under 5,000 characters.

## 2. Company rules

- [x] 2.1 `pack.Service.InstalledSkill`: one installed skill by name, never a
      canonical one.
- [x] 2.2 `get_outline` carries `guidance` for a whole-instance outline:
      `how_to_answer` always, `company_rules` when the `answering-rules` skill
      is installed, cut at 8,000 characters and flagged. Tests seen failing:
      no pack, other skill name, pack installed, long rules, per-artifact outline.
- [x] 2.3 Regenerate `self-model.json`.

## 3. Evaluation

- [x] 3.1 End to end on the pilot bank with no skill injected: the general rules
      from the outline and the company's own from an installed pack. 101 of 136
      with the guidance after the listing, 103 with it first (injected skill:
      105 twice; no guidance: 89 and 97). Function questions: 15 of 24, the
      open gap named in the proposal.
- [ ] 3.2 Held-out questions: write 10 to 15 new questions with gold answers
      that the rules were not derived from, and run them. Not done; the
      development-set caveat stands until then.

## 4. Spec

- [x] 4.1 Requirements in `specs/strategy-mcp/spec.md`.
- [x] 4.2 `openspec validate add-answering-guidance --strict`.
