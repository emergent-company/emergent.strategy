# Unified Project Graph – Human Friendly Overview

Our platform quietly builds a living "map" of your project as you work. Every requirement, document, ticket, decision, and relationship becomes a versioned node or edge in a single graph so AI (and humans) can ask richer questions than plain search.

> TL;DR: It’s a living, searchable map of everything in your project—with memory, links, and change history—so answers are contextual, current, and trustworthy.

## What It Does (Plain Words)
- Capture Things: We store project “things” (requirements, docs, meetings, code refs) as objects.
- Connect Them: Links (relationships) express how things influence or depend on each other (e.g. *"Spec A references Ticket 42"*).
- Remember Change: Instead of overwriting, every update creates a new version—giving an instant timeline of evolution.
- Branch Safely: Experiment on a branch (a sandbox of the graph) without touching the main truth, then merge later (planned feature).
- Explain Deltas: Each change stores a compact summary of what really changed (added / removed / updated fields).
- Search Smart: Hybrid search (keywords + embeddings) finds candidates; the graph adds structure (e.g. “show docs linked to accepted requirements touched last week”).

## Key Superpowers
| Feature | Why it Matters (Non‑technical) |
|---------|--------------------------------|
| Versioned objects & relationships | You can always answer “What changed?” and “When did this link appear?” |
| Structured + semantic search | Combines meaning + exact terms—fewer dead results. |
| Diff summaries on every update | Surfaces meaningful change instead of forcing manual comparison. |
| Content hashing | Detects no-op or duplicate submissions—avoids noise. |
| Idempotent relationship create | Re‑sending the same link doesn’t clutter history. |
| Branch isolation | Safely model alternative futures or proposals (merging roadmap). |
| Traversal & expansion APIs | Let AI walk context neighborhoods, not just fetch flat lists. |
| Fine-grained history & soft delete | Recover mistakes and audit decisions. |

## Mental Model
Think of a continuously growing **timeline of facts**. Every node and link has a “canonical id” (its identity) and a list of versions (its story). The latest version is the *head*. Older versions never disappear—they power history, diffing, and audit trails.

```
Project Requirement R1 (canonical)
  v1: { status: "draft", title: "Auth Flow" }
  v2: { status: "approved", title: "Auth Flow" }  ← head

Relationship: (Doc D7) --REFERENCES--> (Requirement R1)
  v1: { rationale: "Implements login UX" } ← head
```

If the same relationship is proposed again with identical properties, we simply return the existing head—no duplicate clutter.

## Example: A Day in the Graph
1. You upload a meeting note mentioning “Payment Retry Logic”.
2. The system creates an object (type: `Note`).
3. An embedding + keyword pass links it to an existing `Requirement` and `Incident` via scored relationships.
4. A product manager edits the requirement → new version v3 with a diff noting `status` changed `pending → approved`.
5. An AI assistant asks: “Show me all approved requirements linked to incidents in the last 14 days.” The graph answers immediately—no reprocessing.

## Why This Beats a Pile of Files
Traditional search treats each document as an island. Our graph treats your project as a **living network**—so context, lineage, and impact are first-class. That’s what lets downstream AI generate safer plans, detect ripple effects, and trace rationale.

## Built‑In Guardrails
- Consistent project + branch alignment enforced on relationships.
- Immutable history; destructive actions create *new* states (soft delete versions) instead of erasing.
- Lightweight hashing + diffing prevents version spam.

## What’s Coming Next
- Branch merge with conflict surfacing (e.g., “field changed differently in two branches”).
- Impact analysis queries ("what will this requirement change affect?").
- Knowledge freshness scoring using version cadence.

---
*Use it as infrastructure, not a UI burden—the graph quietly raises the quality of every AI answer.*
