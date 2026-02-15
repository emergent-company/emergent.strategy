## Context

After Changes A (`fix-epf-cli-submodule-discovery`) and B (`extract-epf-instance-to-submodule`), the EPF strategy instance lives in `emergent-epf` and repos connect to it via git submodules. The CLI discovers instances regardless of whether `schemas/` exists locally.

The missing piece is **developer experience for enrollment**. Currently the process is:
1. Know the submodule URL
2. Know the mount path (`docs/EPF/_instances/emergent`)
3. Run `git submodule add ...`
4. Update `AGENTS.md` / `.opencode/instructions.md`
5. Hope you got the path right

This is ~3 commands but requires tribal knowledge. As the org grows and more repos need strategy context, a codified enrollment flow reduces errors and improves consistency.

**Constraints:**
- Must work for repos that opt-in (not all repos need EPF)
- Must not break repos that don't use EPF
- Must be backward compatible with the manual submodule approach
- Should be informed by real experience from Changes A+B before implementing

## Goals / Non-Goals

**Goals:**
- One-command enrollment: `epf enroll <url>`
- Per-repo configuration that survives across clones and developers
- Standalone init mode for creating instance repos
- Clear enrollment status in diagnostics

**Non-Goals:**
- Automatic enrollment of all repos in an org
- Instance registry or discovery service
- Multi-instance support (defer until concrete need)
- Submodule update automation (manual `git submodule update --remote` is fine)

## Decisions

### Decision 1: `epf enroll` as a git submodule wrapper

**Choice**: `epf enroll <url> [--path <mount-path>]` automates the submodule setup:

```bash
epf enroll https://github.com/emergent-company/emergent-epf.git
# Equivalent to:
# git submodule add <url> docs/EPF/_instances/emergent
# + creates .epf.yaml
# + prints AGENTS.md snippet to add
```

Default mount path: `docs/EPF/_instances/<repo-name-from-url>/` (derived from the URL). Override with `--path`.

**Why a CLI command over just documentation**: Consistency. The command enforces the correct mount path, creates the config file, and provides the AGENTS.md snippet. Documentation can be wrong or outdated; a command is always current.

**Why not `epf link`**: "Enroll" implies joining a system, which is what's happening. "Link" is ambiguous (link to what?).

### Decision 2: Per-repo `.epf.yaml` configuration

**Choice**: Optional `.epf.yaml` at repo root, created by `epf enroll` or manually.

```yaml
# .epf.yaml — per-repo EPF configuration
instance_path: docs/EPF/_instances/emergent   # relative to repo root
mode: submodule                                # integrated | submodule | standalone
schemas: embedded                              # embedded | local
```

**Config precedence** (highest to lowest):
1. Explicit CLI flag (`--instance-path`, `--schemas-dir`)
2. Per-repo `.epf.yaml`
3. Global `~/.epf-cli.yaml`
4. Auto-detection (current behavior)

**Why `.epf.yaml` not `.epf-cli.yaml`**: The file describes the repo's EPF setup, not CLI config. Other tools could read it too.

**Why at repo root**: Same convention as `.gitignore`, `.editorconfig`, etc. Found by walking up from cwd to `.git`, then checking for `.epf.yaml` adjacent.

### Decision 3: `epf init --mode standalone`

**Choice**: Add `--mode` flag to `epf init`:

- `--mode integrated` (default): Creates `docs/EPF/_instances/{product}/` within the current repo. Current behavior, unchanged.
- `--mode standalone`: Creates `_epf.yaml`, `READY/`, `FIRE/`, `AIM/` directly at the specified path. No `docs/EPF/` wrapper. For repos that ARE the instance.

**Why `standalone` not `submodule`**: The init command creates files, not git submodules. Whether the result becomes a submodule is a git-level concern outside `epf init`'s scope.

### Decision 4: Enrollment status in diagnostics

**Choice**: Add enrollment info to `epf health` output and consider a lightweight `epf status` command.

Output includes:
- Enrolled: yes/no
- Instance source: local / submodule / not found
- Config source: `.epf.yaml` / `~/.epf-cli.yaml` / auto-detected / CLI flag
- Submodule status: initialized / uninitialized / not a submodule

### Decision 5: Defer registry and multi-instance

Not implementing:
- **Instance registry**: A central list of known instances. URL-only is sufficient for <10 repos. Revisit if the org scales.
- **Multi-instance**: A repo having both org strategy + product strategy. No concrete use case yet. The config structure supports it (change `instance_path` to an array), but don't build it until needed.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Over-engineering before pattern is proven | Wasted effort on wrong abstraction | Implement only after Changes A+B are done and 2-3 repos enrolled manually |
| Per-repo config conflicts with auto-detection | Confusing behavior | Clear precedence order. `epf health` shows which config source was used |
| `epf enroll` hides git complexity | Developers don't understand what happened | Command prints every git operation it runs. `--dry-run` mode available |
| `.epf.yaml` becomes stale | Config says one thing, filesystem says another | `epf health` cross-checks config against actual filesystem state |

## Open Questions

1. **Should `epf enroll` run `git submodule update --init` automatically?** Probably yes — no reason to leave the submodule uninitialized after adding it.
2. **Should `epf enroll --dry-run` exist?** Yes, consistent with `epf init --dry-run`.
3. **MCP parity**: Should there be an `epf_enroll` MCP tool? Probably not — enrollment is a repo-level git operation that AI agents shouldn't do autonomously. But the per-repo config reading should work in MCP context.
