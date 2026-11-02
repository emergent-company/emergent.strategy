# Change: Answering guidance carried by the outline

Give every client the rules for answering well from a company's strategy, and
give each company a place for its own rules, without the client having to fetch
a prompt or a skill.

Related: `add-bounded-section-reads` (the outline and reads this guidance rides
on), `add-keyword-search-without-memory` (the keyword search the rules ask for),
`add-instance-content-integrity` (framework content is never the company's
strategy).

## Why

Measured on a pilot instance with a bank of 68 management questions, answered
through the MCP tools, graded against gold answers, no guidance other than the
server instructions (two identical runs): 89 and 97 points of 136. Between two
identical runs 53 of 68 questions score the same; the difference between runs
has a standard deviation of about 4 points, so a gap under about 8 on one run
means nothing.

The failures were of a few kinds, not of retrieval:

- Internal codes in the body of the answer: 58 and 54 of 68 answers.
- Answers that stopped at a section cut for size, or said "not stated" without
  a keyword search.
- Rounded dates and counts, and statements that did not say what is undecided,
  who decides, or what the strategy rules out.
- For a question about a function (Technology, Customer Success), facts that sit
  under another track and never name the function.

A set of general rules for those kinds, given to the agent as a skill, scored
105 and 105 of 136 in two runs: +12 points on average (13%), 9 questions better
by a point or more and 1 worse, internal codes in the body down to 6 and 13,
zero scores down from 7 and 8 to 3, and 0 of 1,128 numbers unsupported. It cost
about 32% more per answer. The rules were written from this bank's failure
types and tested on the same bank, so the result is a development-set result.

A listing step before writing ("list every fact you read that bears on the
question, then check the draft against it") on the 12 function questions gave
6 and 10 missing facts against 10, and picked up 7 and 5 of the 10 gaps that
no earlier version closed (4 for the version without it). Points were 18 and 18
of 24 against 17, within noise. It over-included on a question about what
continues, so the rules also say to keep a fact only if it answers the question
asked.

Delivered the way a client would receive it (the general rules and a small
company pack in the outline, nothing injected), the same 68 questions scored
101 with the guidance after the outline listing and 103 with it before the
listing (one run each; the injected skill scored 105 twice, and the difference
between identical runs has a standard deviation of about 4). With it first,
missing facts were 54 (69 after the listing, 54 for the injected skill), zero
scores 3, internal codes in the body 8 of 68. Cost per answer was $0.080
against $0.066 without guidance. The company pack alone fixed two questions
that had failed in every earlier run on a forbidden word (4 points). On the 12
questions about a function the end-to-end runs scored 16 and 15 of 24 with 19
and 17 missing facts, against 17 and 10 for the injected skill: the research
steps (keyword search, collecting across tracks) are followed less when they
arrive in a tool result than in the prompt (0.56 keyword searches per answer
against 1.06). That gap is open.

The skill was injected into the prompt in the first runs. A client does not do that.
The server instructions are limited to 5,000 characters and reach only clients
that show them, and nothing tells an agent to fetch an installed skill. The
outline is the first call of every answer, so it is where the rules can be
delivered to any client.

Some rules are one company's own: audience, vocabulary it forbids, how it wants
decisions dated. They cannot be in the server. The server already installs
per-instance packs.

## What Changes

- `get_outline` for a whole instance carries `guidance`: `how_to_answer` (the
  general rules, embedded in the server) and `company_rules` (the prompt of the
  skill named `answering-rules` installed in the instance, when there is one,
  cut at 8,000 characters and flagged when cut).
- The per-artifact outline carries none.
- The server instructions gain one rule: follow the guidance in the outline.
- The objectives view's default budget is raised so one call returns every key
  result (separate fix, PR #149; the spec requirement is here so the two stay
  together).

## Impact

- Affected specs: `strategy-mcp`.
- Affected code: `internal/agent` (rules text, instructions), `internal/mcpserver`
  (outline), `domain/pack` (read one installed skill), `domain/strategy` (view
  default).
- No schema change, no migration. An instance without the pack gets the general
  rules only.
- Cost: the outline grows by about 4,000 characters (about 1,000 tokens) once per
  question; the answers read more and cost about a third more.

## Not in this change

- Rules for one company. They live in that company's pack.
- Held-out evaluation. The numbers above come from the bank the rules were
  derived from.
