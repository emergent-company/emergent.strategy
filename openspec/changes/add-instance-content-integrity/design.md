# Design: Instance content integrity

## Context

Two checkers exist and both are blind to this problem for opposite reasons.

- `epf-cli` walks every YAML file for placeholder patterns, then drops canonical
  definitions from scoring on purpose (`checks/instance.go`, "don't affect
  score"). Health exits 0 on warnings. `validate` prints template warnings only
  in AI-friendly output and never changes its exit code. The pattern lists omit
  `Your Organization Name`, `e.g.,`, `20XX` and `[FILL`, although the distributed
  `AGENTS.md` claims they are detected. `IsCanonicalArtifact` looks for
  `strategy_value_model` and so misses the real `strategy.value_model.yaml`.
- `strategy-server` validates against schema (templates pass) and scores
  readiness only for features. Nothing records where an artifact came from.
  `strategy_artifacts.status` is overloaded with the payload's own status.

Both are fed by the same canonical content (`sync-embedded`), so the same
detection rules can be defined once and implemented twice.

## Goals / Non-goals

Goals:
- One classification and one rule vocabulary, identical in both apps.
- Works on instances that already exist (the pilot) without editing the repo.
- Advisory by default. Strict mode is opt-in.
- Answer-facing reads never present framework content as the company's strategy.

Non-goals:
- Judging content quality or detecting generic prose.
- Deleting or rewriting anything automatically.
- Replacing the fence change. Search scoping and provenance fields stay there.

## Decisions

### D1. Classes and severities

| Class | Meaning | Severity |
|---|---|---|
| `canonical_reference` | An unmodified canonical definition (`sd-*`, `pd-*`, `cd-*`) | info, one aggregated finding per track |
| `unmodified_template` | A READY, AIM or product value-model template, unmodified | warning |
| `packaged_default` | Value model with `packaged_default: true` or `status: placeholder` | warning for the product track, info for canonical tracks |
| `template_values` | An authored artifact containing known placeholder values | warning, per path, capped |
| `near_canonical` | Same id or type as a canonical item, most leaves identical | info, labelled "older release or lightly edited" |

Canonical definitions are info because the existing `epf-cli-mcp` requirement
says they are expected and must not dominate health output. They are classed so
that reads can exclude them, not to scold the author.

### D2. Matching

Compare normalised parsed content, not file bytes: parse YAML, round-trip through
JSON (as `jsonb` does), sort keys, hash with SHA-256. This ignores comments,
whitespace and key order, and works for content that arrived through three
different parsers (`epfimport`, scaffold, the definitions installer).

Match against `integrity-manifest.json`, generated in canonical-epf per release
(path to hash, for every release tag) and synced into both apps with the other
embedded content. Current-embedded-only matching gives false negatives: an
existing instance had 127 of 131 definitions identical to the current release,
3 differing only in `contributes_to`, and all value models differing.

Near-match: same `id` (definitions) or same file type (READY, AIM, value model)
and at least 90 percent identical leaf values. The threshold is a named constant.

If the manifest is absent, fall back to the current embedded content and report
that in the summary, so a missing manifest is visible and not silent.

### D3. Where strategy-server computes and stores it

Compute in `deriveIndex` (`domain/strategy`), which every import path already
reaches through `CommitBatch`, `CommitAuto` or `BackfillIndex`. Store in new
nullable columns on `strategy_artifacts`: `integrity_class` and `integrity_ref`
(for example `pd-031@2.31.0`). Null means authored or unknown. Do not reuse
`status`.

Writers that bypass `deriveIndex` call the classifier explicitly: `restore_version`,
`scaffold_instance` (which also does not run `BackfillIndex` today), and the
direct seed paths. Tests assert that every writer listed in design appendix A
leaves the column set.

A reclassify step recomputes the class when the manifest changes. It runs on
startup for instances whose stored manifest version differs, and on demand.

Adoption override: an instance that deliberately uses an unmodified definition as
its policy lists its id under `adopted_canonical` in the anchor. Such an artifact
is treated as authored.

### D4. Answer-facing reads

| Read | Behaviour |
|---|---|
| Structured lists (`get_strategy_context`, `list_artifacts`) | Exclude `canonical_reference` and `unmodified_template` by default. A new option includes them. Export, ripple, watchdog, align and versioning use include-all, so GitHub push and safety PRs still carry every file. |
| Single-artifact reads (`get_product_vision` and similar) | For an `unmodified_template` return a structured "not defined" result with the reason, never the template content. |
| Semantic search | Memory objects carry property `integrity_class` and label `integrity:<class>`. The scoped read helper from the fence change excludes them by default. Until it lands, `SearchStrategy` over-fetches and filters on the property. |
| `get_definition`, `list_definitions` | Unchanged. They serve framework content, and their descriptions say so. |

Flagged artifacts are labelled and excluded at read, not skipped at ingest,
because definitions create `contributes_to` edges that coverage analysis uses.

### D5. Findings and verdicts

Extend the existing readiness check instead of adding a tool, in both apps.

- Server: `check_content_readiness` scans all current artifacts, not only
  features. Its summary no longer reports a score for zero features (today:
  "average readiness 0/100 across 0 features" with `ok: true`). Rule ids are
  `integrity.canonical_reference`, `integrity.unmodified_template`,
  `integrity.packaged_default`, `integrity.template_values` and
  `integrity.near_canonical`. Findings are warning or info, so `ok` is unchanged,
  matching the readiness precedent. `health_check` gains a `content_integrity`
  block with counts per class. It has no verdict, as before.
- `epf-cli`: an additive `ContentIntegrity` struct on `ContentReadinessResult`.
  All four consumers (health, report and two MCP handlers) already carry that
  struct. Health prints it. Exit code is unchanged by default. `--strict-integrity`
  turns `unmodified_template` and `template_values` into errors. The MCP health
  response adds a `required_next_tool_calls` suggestion naming the files.

The two implementations share fixtures: a directory of cases (input artifact,
expected class, expected rule id) that both apps run, so the vocabularies cannot
drift.

### D6. Server framing

The MCP `instructions` (`internal/agent/knowledge.go`) gain rules that say:
structured reads are authoritative; search is discovery over the instance's own
content; definitions and templates are framework content, not the company's
strategy; if a part is not defined or only a template exists, say it is not
defined and do not fill it in; cite the artifact for each claim. Tool
descriptions for `search_strategy`, `get_definition`, `list_definitions` and
`get_template` are rewritten to match. A test asserts the instruction text
contains each rule and that descriptions name their authority.

### D7. Authoring prevention

- `epf init --no-definitions` and the matching `epf_init_instance` parameter skip
  copying definitions. Default unchanged now. Flip the default after the overlap
  period, as a separate decision.
- The anchor gains `canonical_definitions: installed | omitted`. When `omitted`,
  `sync-canonical` does not offer to re-add and `aim-canonical-incomplete` is
  suppressed. Today deleting the files triggers both.
- Fix `canonical.go` to match dot-named value-model files, add the missing
  patterns to both pattern lists, and remove the shadowed `^example:` pattern
  problem.
- Route "populate", "import" and "from documents" tasks to the `draft-*` skills
  in the wizard keyword map, because those carry the "mark gaps honestly" rule.

### D8. Canonical companion

In canonical-epf: the manifest generator, the anchor schema field,
`not_defined` in place of sample values (`Example Product Objective`, `TBD`,
`Your Organization Name`) in shipped templates, and authoring rules in the
distributed `AGENTS.md`: cite a source per claim, use `PLACEHOLDER:` for unknowns,
ask rather than fill in, and prune files you do not use. Schema and template
changes belong there per the constitution, then sync to both apps.

## Risks

- **False positives from normalisation** (YAML date and number typing). Mitigate
  with the round-trip and fixtures taken from real instances.
- **Hiding something adopted on purpose.** Mitigate with `adopted_canonical`.
- **Stale manifest** after a canonical release. Mitigate with the visible
  fallback and the reclassify step.
- **AIM templates reach AIM calculations.** Classification marks them, but the
  `aim` domain still reads them. See open question 2.
- **`epf-cli` scope creep.** Mitigate by keeping every change additive with the
  current behaviour as the default.

## Migration

One additive migration for the two columns and a partial index. The next free
number is chosen at merge, because the fence change uses 045. Existing instances
are classified by the reclassify step on first start. No data is deleted.

## Open questions

1. When should `init` stop copying definitions by default? After the overlap,
   to be set with the owners.
2. Should the `aim` domain ignore `unmodified_template` assessment reports and
   calibration memos? Likely yes. Needs a read of `domain/aim` before deciding.
3. Should strict mode be the default for CI pipelines that run `epf-cli health`?

## Appendix A: writers that must set the class

`deriveIndex` (covers `CommitBatch`, `CommitAuto`, `BackfillIndex`, CLI import,
GitHub import, install-definitions), `restore_version`, `scaffold_instance`,
`align`, `aim` and `skillexec` direct writes, and evidence writes.
