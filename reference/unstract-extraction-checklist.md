# Unstract Extraction Checklist

Purpose: Focused guidance for selectively studying and re-implementing patterns from the Unstract reference (`reference/unstract`) without direct runtime imports.

## 1. Scope & Principles
- Read-only: never import runtime code from `reference/unstract`.
- Attribution: When copying small snippets (≤ ~20 LOC) include header comment: `// Derived from Unstract <path> (Apache-2.0)`.
- Re-implement using our NestJS modules, TypeScript strict types, and existing telemetry utilities.

## 2. High-Value Pattern Areas
| Area | Rationale | Our Target Abstraction |
|------|-----------|------------------------|
| Prompt Studio style schema-driven extraction configs | Guides authoring UX for structured outputs | Future `/graph/templates` + extraction config forms |
| Multi-provider LLM / Embedding selection | Shows provider normalization approach | `llm` provider interface + strategy registry |
| Connector lifecycle (ETL sources/destinations) | Patterns for pluggable IO | Connector module with per-tenant credentials & secret vault |
| Human-In-The-Loop review diff/highlighting | UX for validation | Admin UI review pane component (atoms + molecules) |
| Deployment scripts / compose orchestration | Ops reference for dev bootstrap | Internal `docker/` simplification & local env parity |
| Monitoring / quality metrics surfaces | Telemetry taxonomy inspiration | Extend `graph.search.*` + extraction metrics |

## 3. Extraction Workflow
1. Identify feature/pattern.
2. Trace minimal dependency graph (files, helpers) inside Unstract folder.
3. Draft a small design note in `docs/decisions/` if adaptation non-trivial.
4. Implement minimal interface in our codebase (avoid premature generalization).
5. Add unit tests (Vitest) and where UI, Storybook stories.
6. Add telemetry (latency, error counts, success ratio) if runtime feature.
7. Update spec sections referencing new capability.

## 4. Example: Multi-Provider LLM Abstraction
- Goal: Uniform call surface for OpenAI / Vertex / Anthropic / Ollama.
- Interface sketch:
```ts
export interface LLMProvider {
  readonly name: string;
  complete(input: { prompt: string; maxTokens?: number; temperature?: number }): Promise<{ text: string; usage: TokenUsage }>; 
  embeddings?(input: { texts: string[] }): Promise<number[][]>; // optional
}
```
- Registration: DI token `LLM_REGISTRY`; providers self-register.
- Selection: Config-driven or per-request override.
- Telemetry: `llm.call` event with model, latency_ms, tokens_in/out.

## 5. Human Review UI Pattern
- Key elements: side-by-side original document chunk vs extracted JSON fields; highlight mismatches; approval CTA.
- Atomic design mapping:
  - Atoms: `DiffBadge`, `FieldConfidenceBar`.
  - Molecules: `ExtractionFieldRow`.
  - Organism: `ReviewPanel`.

## 6. Risk Controls
| Risk | Mitigation |
|------|-----------|
| Over-generalization early | Define MVP interfaces; expand only with second use case |
| Copying large swaths of code | Enforce snippet size & re-implementation rule |
| License attribution omission | Pre-commit check (future) scanning for `Derived from Unstract` tag |

## 7. Done Definition (Per Pattern)
- [ ] Design note (if complex) written
- [ ] Interface defined & typed
- [ ] Implementation merged & lint clean
- [ ] Tests &/or stories added
- [ ] Telemetry (if service layer)
- [ ] Spec docs updated
- [ ] Attribution comments present

## 8. Backlog Candidates
- Deterministic extraction test harness
- Reranker integration test scenarios (post-search rerank flows)
- Connector secret rotation workflow
- Evaluation dashboards (embedding coverage, rerank lift, extraction accuracy)

---
Maintainers: Append new pattern entries here as discovery evolves.
