## Phase A: Generator Consolidation

- [x] A.1 Extend `embedded.GetSkill` resolution to fall through to `outputs/` FS as a
      generator alias (returns skill with `type: generation`, `source: generator-alias`)
- [x] A.2 Add deprecation log warning to `ListGenerators` and `GetGenerator` accessors
- [x] A.3 Update `embedded_test.go` to verify generator alias resolution via `GetSkill`
- [x] A.4 Confirm all 5 generators resolve correctly as skills

## Phase B: Database Migrations

- [x] B.1 Write `003_installed_skills.sql` migration:
      `installed_skills` table with columns:
      `id`, `instance_id`, `pack_name`, `pack_version`, `skill_name`,
      `skill_yaml`, `prompt_md`, `script_src`, `script_lang`,
      `trusted`, `installed_at`, `installed_by`
      Indexes: `(instance_id, skill_name)`, `(instance_id, pack_name)`
      Also: `ALTER TABLE strategy_instances ADD COLUMN standard_pack_version TEXT`
      (Decision 10 — used by health_check to surface skew)
- [x] B.2 Write `004_strategy_apps.sql` migration:
      `strategy_apps` table with columns:
      `id`, `instance_id`, `pack_name`, `pack_version`, `app_name`,
      `app_url`, `manifest_yaml`, `status` (active|degraded|disabled),
      `trusted`, `signing_secret` (TEXT NOT NULL — 32-byte hex, generated at install,
      used for HMAC-SHA256 request signing per Decision 9),
      `installed_at`, `installed_by`, `last_health_at`,
      `health_fail_count` (INT NOT NULL DEFAULT 0 — for 3-strike degraded rule)
      Index: `(instance_id, pack_name, app_name)` UNIQUE
- [x] B.3 Add `InstalledSkill` and `StrategyApp` structs to `internal/domain/models.go`
      `StrategyApp` must include `SigningSecret string` and `HealthFailCount int`
- [x] B.4 Run both migrations against local Postgres and verify schema

## Phase C: Skill Pack Domain Service

- [x] C.1 Create `domain/pack/service.go` with `Service` struct backed by `*bun.DB`
- [x] C.2 Implement `ResolvedSkill` type with fields:
      `SkillName`, `SkillYAML`, `PromptMD`, `ScriptSrc`, `ScriptLang`,
      `ExecutionMode` (prompt|script|inline), `Source` (installed|canonical|generator-alias),
      `PackName`, `PackVersion`, `Trusted`
- [x] C.3 Implement `ResolveSkill(ctx, instanceID, skillName) (*ResolvedSkill, error)` —
      resolution order: installed_skills → canonical skills/ → canonical outputs/ (alias)
- [x] C.4 Implement `ListAvailableSkills(ctx, instanceID) ([]*ResolvedSkill, error)` —
      union of installed + canonical, installed takes precedence by skill name
- [x] C.5 Implement `ParsePackBundle(data []byte) (*PackManifest, []*SkillBundle, []*AppBundle, error)` —
      validates pack.yaml + each skill.yaml + each app.yaml
- [x] C.6 Implement `InstallPack(ctx, instanceID, packBundle) error` —
      atomic: validates all skills, then inserts all into installed_skills in one tx;
      also registers any app entries into strategy_apps
- [x] C.7 Implement `UninstallPack(ctx, instanceID, packName) (skillsRemoved, appsRemoved int, err error)` —
      deletes all installed_skills and strategy_apps rows for the pack
- [x] C.8 Implement `ListInstalledPacks(ctx, instanceID) ([]*InstalledPackSummary, error)` —
      groups by (pack_name, pack_version), returns skill_count and app_count per pack
- [x] C.9 Implement `EnsureStandardPack(ctx, instanceID) error` —
      constructs PackBundle from embedded skills/ FS, calls InstallPack if not already present;
      pack_name = "emergent-standard", version = embedded VERSION string
- [x] C.10 Implement `RunSkill(ctx, instanceID, skillName, params) (*SkillRunResult, error)`:
      - For `execution: prompt`: return `{mode: "prompt", prompt_md: "..."}` immediately
      - For `execution: script`: resolve skill, load artifacts from strategy_artifacts,
        write script to temp file, exec subprocess with JSON stdin, collect stdout,
        enforce 30s timeout + 64MB cap, return `{mode: "script", output: "...", format: "..."}`
      - For `execution: inline`: return error "inline execution not available for installed skills"
- [x] C.11 Write unit tests for `ParsePackBundle`, `ResolveSkill`, `ListAvailableSkills`
- [x] C.12 Write integration tests for `InstallPack` → `ListInstalledPacks` → `UninstallPack`

## Phase D: App Platform Domain Service

- [x] D.1 Create `domain/app/service.go` with `Service` struct backed by `*bun.DB`
- [x] D.2 Implement `ListApps(ctx, instanceID) ([]*AppSummary, error)` —
      returns all rows in strategy_apps for the instance with display metadata parsed
      from manifest_yaml
- [x] D.3 Implement `RunApp(ctx, instanceID, appName, params) (*AppRunResult, error)`:
      - Load the app row from strategy_apps; return error if not found or status != active
      - Fetch artifacts declared in `requires.artifacts` from strategy_artifacts
      - Serialise push payload; if size > APP_PUSH_MAX_BYTES (default 2 MB), return error
        immediately with byte count and a hint to archive stale artifacts (Decision 8)
      - Build HTTP client with timeout = APP_CALL_TIMEOUT_S (default 30s) (Decision 8)
      - Set `Content-Type: application/vnd.strategy-app-request+json; version=1` (Decision 11)
      - Compute `X-Strategy-Signature: sha256=<HMAC-SHA256(signing_secret, body)>` and
        add to request headers (Decision 9)
      - POST to `{app_url}/run`; on timeout return clear error; on non-2xx return error
        with status code; increment `health_fail_count`; if count reaches 3, set
        `status = degraded` (Decision 9 + 3-strike rule)
      - Parse response `{document, staged_mutations?}`
      - If `staged_mutations` is non-empty, stage each as a batch via `strategy.Service.Stage()`
        grouped under one batch_id with `agent_id = app_name`
      - Return `{document, batch_id?}`
- [x] D.4 Implement `HealthCheckApp(ctx, app *StrategyApp) error` —
      GET `{app_url}/health` with 5s timeout; on failure increment `health_fail_count`
      and set `status = degraded` after 3 consecutive failures; on success reset
      `health_fail_count = 0` and set `status = active`
- [x] D.5 Implement `ParseAppManifest(manifestYAML string) (*AppManifest, error)` —
      validates required fields: name, version, display.name, url, output.format;
      checks `min_contract_version` field (default 1) is <= server-supported version (1);
      returns error if not (Decision 11)
- [x] D.6 Generate `signing_secret` at install time using `crypto/rand` (32 bytes, hex-encoded);
      store in strategy_apps row; never return it in any MCP tool response (Decision 9)
- [x] D.7 Write unit tests for `ParseAppManifest`, `RunApp` (with mock HTTP server):
      - verify HMAC header is present and correct
      - verify payload cap returns error at > 2 MB
      - verify 30s timeout fires (using a slow mock server)
      - verify 3-strike degraded logic
- [x] D.8 Write integration test for `InstallPack` (app pack) → `ListApps` → `RunApp`
      (using a local test HTTP server that checks the HMAC header)

## Phase E: Script Execution Runtime

- [x] E.1 Create `internal/skillrunner/runner.go`:
      `RunScript(ctx, scriptSrc, scriptLang, stdin []byte) ([]byte, error)`
- [x] E.2 Implement interpreter detection:
      `py` → `python3`, `sh` → `bash`, `ts` → `deno run`, `js` → `node`
- [x] E.3 Implement subprocess execution:
      write script to `os.MkdirTemp`, exec with `exec.CommandContext` (30s),
      pipe stdin, collect stdout, kill on timeout or stdout overflow
- [x] E.4 Implement 64MB stdout cap using `io.LimitReader`
- [x] E.5 Write unit tests for runner: timeout enforcement, stdout cap, bad interpreter
- [x] E.6 Add startup warning log if `python3` and `bash` are not in PATH

## Phase F: Standard Pack Auto-Install and Health Check Skew Reporting

- [x] F.1 Hook `pack.Service.EnsureStandardPack(ctx, instanceID)` into the instance
      creation path in `domain/instance/service.go` **after** the instance transaction
      commits (Decision 12 — post-commit, not inside the transaction)
- [x] F.2 On successful `EnsureStandardPack`, set `standard_pack_version` on the
      `strategy_instances` row to the current embedded VERSION string (Decision 10)
- [x] F.3 On `EnsureStandardPack` failure, log `level=warn` with `instance_id` and `err`
      and continue — do not roll back or fail the creation response (Decision 12)
- [x] F.4 Extend the `health_check` MCP tool response to include a
      `standard_pack_status` block:
      `{installed_version, server_version, up_to_date, upgrade_hint?}` (Decision 10)
      `installed_version` is `null` if `standard_pack_version` column is NULL
- [x] F.5 Extend `list_packs` response: when `pack_name == "emergent-standard"`,
      include `up_to_date: bool` comparing `pack_version` to embedded VERSION (Decision 10)
- [x] F.6 Write integration test: create instance → assert `list_packs` returns
      `emergent-standard` at current VERSION and `up_to_date: true`
- [x] F.7 Write integration test: simulate pack install at old version → assert
      `health_check` returns `up_to_date: false` with non-empty `upgrade_hint`

## Phase G: Skill Authoring Primitives (Decision 13)

- [x] G.1 Create `apps/strategy-server/internal/embedded/skills/skill-importer/skill.yaml`:
      ```yaml
      name: skill-importer
      version: "1.0.0"
      type: creation
      phase: FIRE
      description: "Guided workflow for importing an external skill (raw YAML, URL, or canonical name) into the strategy-server pack system. Handles schema normalisation, rewrites inline execution to prompt, and gates install_pack on user confirmation."
      capability:
        class: balanced
        context_budget: medium
      requires:
        tools:
          - get_skill
          - scaffold_skill
          - install_pack
      output:
        format: yaml
        artifact_type: installed_skill
      ```
- [x] G.2 Create `apps/strategy-server/internal/embedded/skills/skill-importer/prompt.md`
      with sections:
      - **Input acceptance** (raw YAML paste / URL fetch / canonical name via `get_skill`)
      - **Schema normalisation rules** (field mapping table: epf-cli → strategy-server;
        `execution: inline` → `execution: prompt` with explanatory note)
      - **Validation step** (call `scaffold_skill` with normalised metadata to get
        schema-correct skeleton)
      - **Content review** (present skeleton to user; wait for approval or edits)
      - **Install step** (call `install_pack` only after explicit user confirmation)
      - **Post-install verification** (call `get_installed_skill` to confirm resolution)
- [x] G.3 Run `task sync-embedded` (or manually verify embedded FS picks up the new
      skill directory) and confirm `list_skills` returns `skill-importer`

## Phase H: MCP Tools (11 new tools, 65 → 76)

- [x] H.1 Register `install_pack`:
      params: `instance_id` (required), `pack_yaml` (required, full pack.yaml JSON),
      `skills` (optional, array of `{name, skill_yaml, prompt_md, script_src, script_lang}`),
      `apps` (optional, array of `{name, app_url, manifest_yaml}`),
      `force` (optional bool, default false — required to upgrade existing pack version)
      Returns: `{installed: true, pack_name, pack_version, skill_count, app_count}`
- [x] H.2 Register `list_packs`:
      params: `instance_id` (required)
      Returns: array of `{pack_name, pack_version, skill_count, app_count, installed_at, trusted}`
- [x] H.3 Register `uninstall_pack`:
      params: `instance_id` (required), `pack_name` (required)
      Returns: `{uninstalled: true, pack_name, skills_removed, apps_removed}`
- [x] H.4 Register `get_pack`:
      params: `instance_id` (required), `pack_name` (required)
      Returns: full pack manifest + list of skill names + list of app names with status
- [x] H.5 Register `list_installed_skills`:
      params: `instance_id` (required), `source_filter` (optional: installed|canonical|all, default all)
      Returns: array of `{skill_name, type, execution, source, pack_name, pack_version}`
- [x] H.6 Register `get_installed_skill`:
      params: `instance_id` (required), `skill_name` (required)
      Returns: full `ResolvedSkill` including yaml, prompt_md, script presence flag, source
- [x] H.7 Register `run_skill`:
      params: `instance_id` (required), `skill_name` (required),
      `params` (optional JSON object — passed to script as `params` key in stdin)
      Returns (prompt mode): `{mode: "prompt", skill_name, prompt_md, requires}`
      Returns (script mode): `{mode: "script", skill_name, output, format, duration_ms}`
- [x] H.8 Register `scaffold_skill`:
      params: `name` (required), `type` (required: creation|review|generation|analysis),
      `execution` (required: prompt|script), `description` (required),
      `phase` (optional: READY|FIRE|AIM, default FIRE),
      `requires` (optional: `{artifacts: [], tools: []}`),
      `script_lang` (optional: py|sh|ts|js, default sh — only used when execution=script)
      Returns: `{skill_yaml: "...", prompt_md: "...", pack_yaml: "..."}` — all three
      files are schema-valid and ready to pass to `install_pack` as a single-skill pack
- [x] H.9 Register `list_apps`:
      params: `instance_id` (required)
      Returns: array of `{app_name, pack_name, display, status, installed_at}` —
      `display` includes name, description, icon, category, tags, inputs[]
- [x] H.10 Register `run_app`:
      params: `instance_id` (required), `app_name` (required),
      `params` (optional JSON object — forwarded to app as `params`)
      Returns: `{document: {format, content}, batch_id?}` —
      `batch_id` is present only when the app returned `staged_mutations`
- [x] H.11 Register `describe_pack_format`:
      params: none
      Returns: `{pack_yaml_schema, skill_yaml_schema, app_yaml_schema, execution_modes,
      example_pack}` — self-documenting format reference for pack authors
- [x] H.12 Update tool count comment in `server.go` (65 → 76)
- [x] H.13 Update `TestMCP_ToolDiscovery` to assert all 11 new tools present

## Phase I: Integration Tests

- [x] I.1 `TestMCP_SkillPackInstallAndList` — install a minimal prompt-mode pack, list
      packs, verify skill appears in `list_installed_skills` with `source: installed`
- [x] I.2 `TestMCP_SkillPackResolutionPrecedence` — install a pack that shadows a
      canonical skill; verify `get_installed_skill` returns installed version
- [x] I.3 `TestMCP_SkillPackRunPromptMode` — install a prompt-mode skill, call `run_skill`,
      verify `prompt_md` is returned
- [x] I.4 `TestMCP_SkillPackRunScriptMode` — install a bash script skill that echoes
      artifact count; call `run_skill`, verify output contains count
- [x] I.5 `TestMCP_SkillPackUninstall` — install then uninstall; verify skill reverts
      to canonical if shadowing, or disappears from list if novel
- [x] I.6 `TestMCP_SkillPackForceUpgrade` — install v1.0.0, attempt install v2.0.0
      without force (expect error), then with force (expect success)
- [x] I.7 `TestMCP_SkillPackInvalidPayload` — install with missing required skill.yaml
      fields; verify atomic rollback (no partial install)
- [x] I.8 `TestMCP_RunSkillTimeout` — install a script skill that sleeps 60s; verify
      `run_skill` returns timeout error within 31s
- [x] I.9 `TestMCP_AppInstallAndList` — install an app pack, call `list_apps`, verify
      display metadata matches manifest
- [x] I.10 `TestMCP_AppRun` — install an app pack pointing to a local test HTTP server
      that asserts the `X-Strategy-Signature` header is present and valid; call `run_app`;
      verify document returned
- [x] I.11 `TestMCP_AppRunStagedMutations` — app returns `staged_mutations`; verify
      `run_app` returns a `batch_id`; verify batch appears in `list_pending_batches`
- [x] I.12 `TestMCP_AppRunPayloadCap` — install an app and populate the instance with
      enough artifacts to exceed 2 MB; verify `run_app` returns a payload-cap error
      without calling the app URL
- [x] I.13 `TestMCP_AppRunTimeout` — install an app pointing to a slow test server that
      never responds; verify `run_app` returns a timeout error within 31s
- [x] I.14 `TestMCP_AppDegradedAfterThreeFailures` — force three consecutive failed
      `run_app` calls; verify app `status` becomes `degraded`; verify a subsequent
      `run_app` returns an error immediately without calling the URL
- [x] I.15 `TestMCP_StandardPackAutoInstalled` — create instance, call `list_packs`,
      verify `emergent-standard` appears at the current server version with `up_to_date: true`
- [x] I.16 `TestMCP_HealthCheckSkewReporting` — install standard pack at a fake old
      version string; verify `health_check` returns `up_to_date: false` with non-empty
      `upgrade_hint`
- [x] I.17 `TestMCP_DescribePackFormat` — call `describe_pack_format`; verify all three
      schemas returned are valid JSON and `example_pack` matches `pack_yaml_schema`
- [x] I.18 `TestMCP_AppIncompatibleContractVersion` — attempt to install an app manifest
      declaring `min_contract_version: 99`; verify install is rejected with a clear error
- [x] I.19 `TestMCP_ScaffoldSkill_PromptMode` — call `scaffold_skill` with
      `name: "my-test-skill"`, `type: creation`, `execution: prompt`, `description: "test"`;
      verify returned `skill_yaml` parses as valid YAML with all required fields;
      verify `pack_yaml` wraps the skill and passes `ParsePackBundle` validation
- [x] I.20 `TestMCP_ScaffoldSkill_ScriptMode` — call `scaffold_skill` with
      `execution: script`, `script_lang: sh`; verify `skill_yaml` contains `execution: script`
      and `script_lang: sh`; verify `prompt_md` contains script stdin/stdout contract notes
- [x] I.21 `TestMCP_SkillImporter_CoreSkillExists` — call `run_skill` for `skill-importer`;
      verify `{mode: "prompt", prompt_md: "..."}` is returned (skill is resolvable as core)
- [x] I.22 `TestMCP_ScaffoldThenInstall` — call `scaffold_skill` → take the returned
      `pack_yaml` + `skill_yaml` + `prompt_md` → call `install_pack` with that content;
      verify the skill resolves via `get_installed_skill` with `source: installed`

## Exit Gate

- [x] J.1 All integration tests pass (`PGPORT=5433 task test`)
- [x] J.2 Tool count verified at 76 via `tools/list` MCP call
- [x] J.3 Generator alias: `get_installed_skill(instance, "context-sheet")` returns
      a valid ResolvedSkill with `source: generator-alias`
- [x] J.4 `skill-importer` resolves via `get_skill` as a core skill with `execution: prompt`
- [x] J.5 `scaffold_skill` output passes `ParsePackBundle` validation without modification
- [x] J.6 `scaffold_skill` → `install_pack` end-to-end works; skill resolves immediately
- [x] J.7 `install_pack` → `run_skill` (script mode) end-to-end works with a real
      bash script receiving artifact JSON on stdin
- [x] J.8 `install_pack` (app pack) → `run_app` end-to-end works against a local
      test HTTP server; HMAC header is verified; document is returned; staged mutations
      create a pending batch
- [x] J.9 New instance: `list_packs` returns `emergent-standard` with `up_to_date: true`;
      `health_check` returns `standard_pack_status.up_to_date: true`
- [x] J.10 Payload cap: `run_app` returns a cap error before calling the app URL when
      serialised payload exceeds 2 MB
- [x] J.11 No regressions in existing 24 MCP integration test scenarios
