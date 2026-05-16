# Design: Skill Pack System and Strategy App Platform

## Context

strategy-server has 65 MCP tools, a working embedded skill system, and a staged batch
pattern for all writes. This change adds two new layers on top:

1. A **pack system** for distributing and installing skill bundles per-instance
2. An **app platform** for HTTP microservice strategy apps with a web UI surface

The core embedded skills remain unchanged — they are the agent standard library. The
pack system and app platform are additive, not replacements for core skills.

Key constraints:
- epf-cli is frozen — no changes there
- All writes through staged batch (apps cannot write directly; they return staged mutations)
- App invocation must be safe for third-party apps — no DB credentials given to apps
- Web UI renders app cards from app manifests — no per-app UI code in strategy-server

## Goals / Non-Goals

**Goals:**
- Core skills remain built-in and always available to agents (no change)
- Generators resolve as core skills of `type: generation` (backward compat, no files deleted)
- Skill packs installable per-instance from YAML bundles
- Standard pack (`emergent-standard`) auto-installed on instance creation
- HTTP microservice apps installable per-instance, invoked by strategy-server
- Web UI can render an app grid from `list_apps` without per-app UI code
- Staged batch pattern preserved for any app-proposed mutations
- 10 new MCP tools

**Non-Goals:**
- Public registry/marketplace API (distribution is a separate product surface)
- WASM or container sandboxing (subprocess + HTTP is sufficient for Phase 1)
- Apps calling strategy-server's internal API directly (push model only)
- Write-capable script skills (all writes go through staged batch)
- `execution: inline` for installed skills (reserved for core embedded skills)
- Modifying `apps/epf-cli/`

## Decisions

### Decision 1: Two distinct skill tiers, not one unified model

**What:** Skills split into two non-overlapping tiers:

| Tier | Source | Resolution | UI | Management |
|---|---|---|---|---|
| **Core skills** | Binary embedded (`skills/`, `outputs/`) | Always first | Never shown as apps | Not managed via packs |
| **Installed skills** | `installed_skills` DB table | After core skills | May be shown as apps if `display.visible: true` | Managed via pack system |

Core skills are never listed by `list_installed_skills` and never uninstallable. Installed
skills are per-instance and fully managed. An agent asking for skill `balance-checker` gets
the core skill regardless of what packs are installed.

**Why:** Core skills are infrastructure — baking them into the binary guarantees they're
always available to agents regardless of what a user has done with their packs. Mixing
them into the pack system would make agent reliability dependent on user configuration.

**Alternatives considered:**
- Single unified tier with "system" flag — rejected; the resolution ordering becomes
  implicit and error-prone, and it conflates two different concerns
- Standard pack replaces core skills entirely — rejected; agents must always have their
  primitives available without depending on DB state

### Decision 2: Generators become core skills with `type: generation`

**What:** The `outputs/` embedded FS is retained. `embedded.ResolveSkill(name)` falls
through to `outputs/` after failing to find `name` in `skills/`, returning a `CoreSkill`
with `Type: "generation"` and `Source: "generator-alias"`. `ListGenerators` and
`GetGenerator` log a deprecation warning and delegate to the skill resolution path.

**Why:** Zero breaking change to existing consumers. The 5 generator names continue to
resolve. No files are deleted or moved. Agents and the `get_skill` MCP tool see generators
as skills transparently.

### Decision 3: Standard pack — canonical skills as a versioned installable pack

**What:** `emergent-standard@{server_version}` is a pack whose content is the canonical
embedded skills. It is not a file on disk — it is constructed at runtime from the embedded
FS and installed into new instances via the same `InstallPack` code path used for
community packs.

On instance creation:
1. `domain/pack.Service.EnsureStandardPack(ctx, instanceID)` is called
2. It checks if `emergent-standard` is already installed for the instance
3. If not, it constructs a `PackBundle` from the embedded `skills/` FS and installs it

The standard pack version equals the embedded `VERSION` string (e.g. `2.22.1`).
Upgrading the server binary does NOT auto-upgrade the standard pack in existing instances
— the user calls `install_pack` with `force: true` to upgrade.

**Why:** This makes the skill system consistent and transparent. Users see exactly what
skills they have, where they came from, and can choose not to have them. The auto-install
on creation means no friction for the 99% case while preserving full control.

**Alternatives considered:**
- Auto-upgrade standard pack on server upgrade — rejected; would silently change agent
  behaviour for existing instances; users should opt in to upgrades
- Never auto-install — rejected; forces every user through an explicit install step for
  basic functionality

### Decision 4: Strategy apps are HTTP microservices, not subprocesses

**What:** Strategy apps expose a minimal HTTP interface:
- `GET /health` → `{"status": "ok"}`
- `POST /run` ← `{instance_id, artifacts[], relationships[], params{}}` → `{document, staged_mutations?}`
- `GET /manifest` → full `app.yaml` content as JSON (for runtime discovery)

strategy-server registers apps by URL. On invocation, it fetches the relevant artifacts,
calls `POST {app_url}/run`, and handles the response.

Apps have no DB credentials and no direct access to strategy-server's internal state. All
data they need is pushed to them on invocation.

**Why:** HTTP microservices can run anywhere (same host, container, cloud function, remote
server). The contract is language-agnostic and version-stable. Subprocess model would
require the app binary to be present on the strategy-server host — impractical for
distributed teams or hosted instances.

**The push model (strategy-server pushes artifacts):** On invocation, strategy-server
loads the artifacts declared in `app.yaml` `requires.artifacts` and POSTs them. The app
doesn't need its own query capability. If an app needs more data than the initial push
provides, it declares additional `requires.artifacts` entries — strategy-server sends all
of them.

**Alternatives considered:**
- App pulls via REST API — gives apps more flexibility but requires strategy-server to
  expose a stable app-facing API, manage per-instance tokens, and handle authentication;
  adds significant surface area. Push is simpler and sufficient for the initial model.
- WASM — more portable isolation but major implementation complexity; revisit later.

### Decision 5: App manifest drives UI rendering

**What:** The web UI's "Strategy Apps" screen renders entirely from `list_apps` output.
No per-app UI code exists in strategy-server or the frontend. The manifest's `display`
block provides card metadata; the `inputs[]` block is a typed form schema that the
frontend renders generically.

```yaml
display:
  name: "Investor Memo"
  description: "..."
  icon: "document-text"   # maps to an icon library identifier
  category: "investor-relations"
  tags: [investor, document]

inputs:
  - name: tone
    type: enum
    label: "Tone"
    options: [formal, conversational]
    default: formal
  - name: focus_features
    type: feature-select   # UI renders a feature picker from list_features
    label: "Focus on specific features"
    multiple: true
    required: false
```

Supported input types: `string`, `text` (multiline), `enum`, `boolean`, `date`,
`feature-select`, `artifact-select` (generic, with `artifact_type` filter).

**Why:** Generic form rendering means any app installed from a marketplace immediately
has a functional UI without a frontend deploy. The icon and category fields let the UI
organise apps into a coherent grid without per-app configuration.

### Decision 6: Staged mutations from apps follow existing batch pattern

**What:** If an app's `/run` response includes `staged_mutations`, strategy-server:
1. Calls `strategy.Service.Stage(ctx, params)` for each mutation
2. Groups them under a single `batch_id`
3. Sets `agent_id` to the app name, `batch_description` to the app-generated description
4. Returns the `batch_id` in the `run_app` MCP response

The user then sees the staged batch in `list_pending_batches` and commits or discards via
the existing `commit_batch`/`discard_batch` tools — exactly the same flow as agent-staged
mutations.

**Why:** Reusing the staged batch pattern means zero new approval UI for app-proposed
mutations. The existing human-in-the-loop review flow works for app output too.

### Decision 7: `installed_skills` and `strategy_apps` are separate tables

**What:** Two tables, one per track:

```sql
-- Track 2a: Skill packs
CREATE TABLE installed_skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   UUID NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  pack_name     TEXT NOT NULL,
  pack_version  TEXT NOT NULL,
  skill_name    TEXT NOT NULL,
  skill_yaml    TEXT NOT NULL,
  prompt_md     TEXT,
  script_src    TEXT,
  script_lang   TEXT,           -- py | sh | ts | js
  trusted       BOOLEAN NOT NULL DEFAULT false,
  installed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  installed_by  TEXT NOT NULL,
  UNIQUE (instance_id, pack_name, skill_name)
);

-- Track 2b: App packs
CREATE TABLE strategy_apps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   UUID NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  pack_name     TEXT NOT NULL,
  pack_version  TEXT NOT NULL,
  app_name      TEXT NOT NULL,
  app_url       TEXT NOT NULL,
  manifest_yaml TEXT NOT NULL,  -- full app.yaml content
  status        TEXT NOT NULL DEFAULT 'active',  -- active | degraded | disabled
  trusted       BOOLEAN NOT NULL DEFAULT false,
  installed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  installed_by  TEXT NOT NULL,
  last_health_at TIMESTAMPTZ,
  UNIQUE (instance_id, pack_name, app_name)
);
```

**Why:** Skills and apps have fundamentally different fields and lifecycle operations.
A combined table would have many nullable columns and make queries awkward.

### Decision 8: Push payload size cap and per-call timeout are hard limits

**What:** `RunApp` enforces two hard limits before sending data to an app:

1. **Payload size cap** — the serialised request body is capped at **2 MB** (configurable
   via `APP_PUSH_MAX_BYTES` env var). If the artifact set for the required types exceeds
   this limit, `run_app` returns an error immediately: `push payload exceeds 2 MB limit
   (actual: X MB); reduce requires.artifacts or archive stale artifacts`.
2. **HTTP call timeout** — the entire round-trip to `{app_url}/run` is bounded at **30s**
   (configurable via `APP_CALL_TIMEOUT_S` env var). The HTTP client is constructed with
   this timeout explicitly set; the default Go client (no timeout) is never used.

Both limits apply regardless of app `trusted` status.

**Why:** Without a payload cap, a large instance (hundreds of features with large JSONB
payloads) will produce multi-MB POST bodies and potential OOM in the pushing goroutine.
Without a call timeout, a slow or hung app blocks the MCP handler indefinitely — there
is no ambient timeout in the MCP request path.

**Alternatives considered:**
- Per-artifact-type count limits instead of byte budget — harder to reason about; a
  small number of features with embedded binary content would still blow the limit.
- Streaming the push — adds significant protocol complexity; 2 MB is generous for any
  realistic strategy context and the cap can be raised per-deployment via env var.

---

### Decision 9: HMAC request signing for app invocation

**What:** Each `strategy_apps` row stores a `signing_secret TEXT NOT NULL` column,
generated at install time as a cryptographically random 32-byte hex string. On every
`POST {app_url}/run`, strategy-server adds the header:

```
X-Strategy-Signature: sha256=<HMAC-SHA256(signing_secret, raw_body)>
```

Apps that wish to verify the push is legitimate compute the same HMAC over the raw
request body and compare. The header is always present; verification is opt-in on the
app side. The secret is never returned in any MCP tool response — it is write-only from
the perspective of external callers.

**Why:** Without signing, a malicious actor who knows an app's `/run` URL can push
arbitrary artifact data to it. This matters even for self-hosted internal apps because
the sensitive data being pushed (competitive positioning, financial projections) warrants
a verifiable origin. HMAC is simple to implement in any language, requires no PKI, and
is the established pattern (GitHub webhooks, Stripe webhooks).

**Alternatives considered:**
- mTLS — stronger but requires certificate management on both sides; too much friction
  for app developers.
- Per-instance bearer token in Authorization header — simpler than HMAC but does not
  bind the signature to the request body, so a replayed or tampered body looks valid.
- No signing, rely on `trusted` flag — `trusted` is a UI label, not an enforcement
  mechanism; rejected for any data-carrying call.

---

### Decision 10: Standard pack version skew is surfaced as a health warning

**What:** `strategy_instances` gains a `standard_pack_version TEXT` column (nullable),
set to the installed version string when `EnsureStandardPack` runs successfully. The
`health_check` MCP tool includes a `standard_pack_status` field in its response:

```json
{
  "standard_pack_status": {
    "installed_version": "2.22.1",
    "server_version":    "2.30.0",
    "up_to_date":        false,
    "upgrade_hint":      "run install_pack with force: true to upgrade to 2.30.0"
  }
}
```

`list_packs` also includes an `up_to_date` boolean per pack when the pack name is
`emergent-standard`.

**Why:** Without surfacing the skew, an agent that calls `list_skills` (canonical,
server version) and an agent that calls `list_installed_skills` (installed, possibly
older version) get different answers with no indication of why. The health check is
already the canonical place to surface instance state problems; adding pack skew there
is consistent and discoverable.

**Alternatives considered:**
- Auto-upgrade standard pack on server start — rejected (Decision 3); silently changes
  agent behaviour for existing instances.
- Warn only on explicit `list_packs` call — too easy to miss; agents that never call
  `list_packs` would never see the warning.

**Schema addition:**
```sql
ALTER TABLE strategy_instances
  ADD COLUMN standard_pack_version TEXT;
```
Added to migration `003_installed_skills.sql` as a separate statement (no new migration
file needed; migration 003 creates the table and adds this column in one pass).

---

### Decision 11: Push contract is versioned via Content-Type header

**What:** strategy-server sends the following header on every `POST {app_url}/run`:

```
Content-Type: application/vnd.strategy-app-request+json; version=1
```

Apps that support multiple contract versions inspect this header to select the correct
parser. The current contract is `version=1`. When a breaking change to the push schema
is required, the version increments; old apps continue to receive `version=1` calls
until they declare `min_contract_version: 2` in their manifest, at which point
strategy-server uses the new schema.

The `app.yaml` manifest gains an optional `min_contract_version: 1` field (default 1).
strategy-server rejects install of an app declaring a `min_contract_version` higher than
the server supports, with a clear error.

**Why:** Without versioning, any change to the push payload schema silently breaks
installed apps. Apps are independently deployed microservices — coordinated deploys are
not always possible. The Content-Type versioning pattern is zero-friction to implement
(it's a header) and gives apps a reliable way to detect breaking changes.

**Alternatives considered:**
- Version field in the JSON body — workable but requires parsing before routing; header
  is more conventional and inspectable at the HTTP layer.
- URL versioning (`/run/v1`) — means app manifests must declare versioned URLs; fragile
  when the app handles versioning internally.
- Semantic versioning of the whole app platform — too coarse; individual tool fields can
  change without breaking most apps.

---

### Decision 12: `EnsureStandardPack` runs outside the instance creation transaction

**What:** Instance creation in `domain/instance/service.go` proceeds in two steps:

1. **Transaction:** insert the `strategy_instances` row and commit. Instance creation
   succeeds or fails atomically on its own.
2. **Best-effort post-commit:** call `pack.Service.EnsureStandardPack(ctx, instanceID)`
   outside the transaction. If this fails, a structured warning is logged
   (`level=warn msg="standard pack install failed" instance_id=... err=...`) and the
   instance remains usable — agents can still operate using core embedded skills. The
   `standard_pack_version` column on the instance remains NULL, which `health_check`
   surfaces as `standard_pack_status.installed_version: null`.

**Why:** If `EnsureStandardPack` runs inside the instance creation transaction and fails
(DB contention, constraint violation, slow FS iteration), the entire instance creation
rolls back. The user gets an error and no instance. This is a disproportionate failure —
the standard pack is a convenience layer, not a prerequisite for a usable instance.
Separating the steps means creation is always fast and reliable; pack install failure is
recoverable (the user can call `install_pack` manually or retry via `health_check`).

**Alternatives considered:**
- Async background goroutine — avoids blocking the creation response entirely, but
  creates a window where the instance exists with no pack and no clear indication that
  pack install is pending. The synchronous best-effort call is simpler: either it
  succeeds immediately (99% case) or it fails visibly in the same request cycle.
- Retry loop inside `EnsureStandardPack` — adds complexity without changing the failure
  mode; the root cause (DB issue) is better addressed at the infrastructure level.

### Decision 13: Skill authoring is built in — `skill-importer` core skill + `scaffold_skill` MCP tool

**What:** Two new built-in capabilities for creating and importing skills, delivered via
different mechanisms because they have different reliability requirements:

#### `scaffold_skill` — deterministic MCP tool (tool count: 75 → 76)

A new MCP tool that generates a validated `skill.yaml` + `prompt.md` skeleton from
structured inputs. It is deterministic — the server constructs the files from a template,
not via LLM inference — so the output is always schema-valid and ready to pass directly
to `install_pack`.

Inputs:
```
name          string   required — kebab-case skill name
type          enum     required — creation | review | generation | analysis
execution     enum     required — prompt | script
description   string   required — one-sentence description
phase         enum     optional — READY | FIRE | AIM (default: FIRE)
requires      object   optional — {artifacts: [], tools: []}
script_lang   enum     optional (script mode only) — py | sh | ts | js (default: sh)
```

Output: `{skill_yaml: "...", prompt_md: "...", pack_yaml: "..."}` — three files, ready
to pass to `install_pack` as a single-skill pack. The prompt skeleton is pre-populated
with phase-appropriate section headers and placeholder text that the agent (or user) fills
in. The pack_yaml wraps the skill in a minimal pack manifest so `install_pack` can
consume the output directly.

**Why a tool, not a skill:** A prompt-delivery skill that generates YAML relies on the
LLM to produce schema-valid output on every invocation. YAML generation is brittle — a
single off-by-one indent or missing required field produces an invalid skill. Making this
deterministic (server generates the skeleton from a known template) eliminates an entire
class of errors. The agent's job is to fill in the content, not to guess the schema.

#### `skill-importer` — core prompt-delivery skill

A skill (embedded in `skills/skill-importer/`) whose prompt instructs an agent to:

1. Accept one of three source formats:
   - **Raw YAML** — the user pastes a `skill.yaml` (e.g. from epf-cli or another server)
   - **URL** — agent fetches the YAML from the URL (using its tool access)
   - **epf-cli skill name** — agent calls `get_skill` to retrieve the canonical embedded
     version from the current server (epf-cli is not invoked directly; the MCP tool reads
     from the same embedded FS)

2. Normalise the source to strategy-server's `skill.yaml` schema:
   - Map epf-cli-specific fields (`capability.class`, `scope.preferred_tools`,
     `scope.avoid_tools`) to strategy-server equivalents or drop gracefully
   - Preserve `execution` mode, `type`, `phase`, `requires.artifacts`, `description`
   - Strip fields that are only meaningful in the epf-cli context (e.g. `inline.handler`
     — inline execution is reserved for core skills and cannot be imported)
   - If `execution: inline` is present in the source, rewrite to `execution: prompt` and
     note in the prompt skeleton that the handler logic must be re-expressed as instructions

3. Call `scaffold_skill` with the normalised metadata to get a validated skeleton

4. Present the skeleton to the user for review and content completion

5. Call `install_pack` when the user approves

The skill does not auto-install without user confirmation. It is a guided workflow, not
a one-shot importer.

**Why a skill, not a tool, for the import step:** Import requires judgment — deciding
which fields to preserve, how to re-express inline handler logic as instructions, whether
the source is trustworthy. These are LLM-appropriate decisions. The deterministic
scaffolding (`scaffold_skill`) handles the schema-correct output layer; the skill handles
the semantic mapping layer.

#### Long-term vision: self-extending strategy

The design principle behind both capabilities is **self-reference**: the strategy platform
should eventually be able to apply its own strategic reasoning to improve its own skills.
Concretely, this means:

- A strategy instance can house skills that describe how to improve strategy-server's
  own skill library
- The `skill-importer` + `scaffold_skill` workflow is the seed of a skill authoring loop
  that can be driven by agents operating on the strategy graph itself
- Future phases (not in this change) will allow agents to propose new skills as
  `staged_mutations` in the same batch pattern used for artifact changes — a skill
  proposal would be reviewed and committed like any other artifact change

This direction is captured here as intent, not implementation. The current change lays
the foundation (import + scaffold primitives) without over-engineering toward a future
that has not yet been validated.

**Alternatives considered:**
- Import as an MCP tool (fully deterministic) — rejected; the semantic mapping from
  epf-cli's schema to strategy-server's schema requires judgment that varies by source.
  A tool can only handle what it can enumerate; the skill handles the long tail.
- Scaffold as a core skill (LLM generates the YAML) — rejected; LLM-generated YAML is
  unreliable. Schema compliance is non-negotiable for `install_pack` to succeed. The
  deterministic tool approach guarantees a valid starting point every time.
- Combined single "skill builder" tool/skill — the two concerns (deterministic schema
  generation vs. semantic import mapping) have different reliability requirements. Mixing
  them produces a tool that is too smart for scaffolding and too rigid for importing.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| App URL is unreachable at invocation time | `run_app` returns clear error; app marked `degraded` after three consecutive failures |
| Push payload exceeds 2 MB | Hard error returned before HTTP call; user prompted to archive stale artifacts (Decision 8) |
| App call hangs | 30s HTTP timeout, configurable via env var (Decision 8) |
| Artifact data intercepted in transit | HMAC-SHA256 request signing; apps verify origin (Decision 9) |
| Standard pack version skew | Surfaced in `health_check` and `list_packs`; upgrade hint provided (Decision 10) |
| Push schema breaks installed apps | Content-Type versioning; `min_contract_version` in manifest blocks incompatible installs (Decision 11) |
| Instance creation blocked by pack install | `EnsureStandardPack` runs post-commit; failure is a warning, not a rollback (Decision 12) |
| Skill script interpreter not on server | Startup warning log; `run_skill` returns clear error naming the missing interpreter |
| `staged_mutations` from app bypass review | They go through `Stage()` creating a pending batch; `commit_batch` still requires explicit human action |
| UI input type coverage | Generic types cover 90% of cases; apps use `text` for free-form input as fallback |
| App status oscillates between healthy/degraded | Degraded only set after three consecutive health check failures; active restored after one success |
| Imported skill has `execution: inline` | `skill-importer` skill rewrites to `execution: prompt`; notes in output that handler logic must be re-expressed |
| `scaffold_skill` output requires LLM to fill in prompts | Skeleton is schema-valid but content-empty; the agent completes it with the user before calling `install_pack` |

## Migration Plan

1. Add `003_installed_skills.sql` migration: `installed_skills` table +
   `ALTER TABLE strategy_instances ADD COLUMN standard_pack_version TEXT`
2. Add `004_strategy_apps.sql` migration: `strategy_apps` table with
   `signing_secret TEXT NOT NULL` column
3. Extend `embedded.ResolveSkill` with generator alias fallback
4. Implement `domain/pack/service.go` — `InstallPack`, `UninstallPack`, `ListPacks`,
   `ResolveInstalledSkill`, `ListInstalledSkills`, `EnsureStandardPack`
5. Implement `domain/app/service.go` — `InstallApp`, `UninstallApp`, `ListApps`,
   `RunApp` with payload cap (Decision 8), HMAC signing (Decision 9),
   Content-Type versioning (Decision 11)
6. Implement `internal/skillrunner/runner.go` — subprocess runtime for script skills
7. Hook `EnsureStandardPack` post-commit in instance creation (Decision 12)
8. Extend `health_check` tool with `standard_pack_status` block (Decision 10)
9. Add `skills/skill-importer/` embedded directory with `skill.yaml` + `prompt.md`
10. Register 11 new MCP tools (10 existing + `scaffold_skill`)
11. Write integration tests for full install → run → uninstall cycles (both tracks),
    including payload cap enforcement, HMAC header presence, skew surfacing,
    `scaffold_skill` output validity, and `skill-importer` prompt delivery

## Open Questions

None — all decisions resolved above.
