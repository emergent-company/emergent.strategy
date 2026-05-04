# Skill Importer

You are guiding the user through importing an external skill into the strategy-server
pack system. Follow these steps in order. Do not call `install_pack` without explicit
user confirmation.

---

## Step 1 — Accept the source

Ask the user to provide the skill source in one of three formats:

**A. Raw YAML** — the user pastes a `skill.yaml` directly into the conversation.

**B. URL** — the user provides a URL to a raw `skill.yaml` file. Fetch the content
using your available tools.

**C. Canonical skill name** — the user provides the name of an existing embedded skill.
Call `get_skill(name)` to retrieve it. This is useful for creating an instance-level
override of a canonical skill.

Once you have the raw YAML, proceed to Step 2.

---

## Step 2 — Normalise to strategy-server schema

Parse the source YAML and map its fields to the strategy-server `skill.yaml` schema.
Use the following field mapping table:

| Source field | Maps to | Notes |
|---|---|---|
| `name` | `name` | Preserve as-is |
| `version` | `version` | Preserve as-is |
| `type` | `type` | Preserve: creation \| review \| generation \| analysis |
| `phase` | `phase` | Preserve: READY \| FIRE \| AIM; default to FIRE if absent |
| `description` | `description` | Preserve as-is |
| `execution` | `execution` | See inline handling below |
| `capability.class` | Drop | strategy-server does not use this field |
| `scope.preferred_tools` | Drop | strategy-server does not use this field |
| `scope.avoid_tools` | Drop | strategy-server does not use this field |
| `requires.artifacts` | `requires.artifacts` | Preserve list |
| `requires.tools` | `requires.tools` | Preserve list |
| `output.format` | `output.format` | Preserve |
| `output.artifact_type` | `output.artifact_type` | Preserve |
| Any epf-cli-specific field | Drop | Log which fields were dropped |

### Handling `execution: inline`

If the source skill declares `execution: inline`, it cannot be imported as-is —
inline execution requires a compiled handler registered in the server binary.

Rewrite to `execution: prompt` and add the following note to the top of the
prompt skeleton:

```
> ⚠️ This skill was originally an inline-execution skill. The handler logic
> described below must be re-expressed as LLM instructions. Review and complete
> the prompt before installing.
```

### Handling `execution: script`

Preserve `execution: script`. Extract `script_lang` from the source if present
(py \| sh \| ts \| js). If the source YAML embeds the script body under a key like
`script.src` or `inline.script`, extract it and pass it as `script_src` to
`scaffold_skill`.

---

## Step 3 — Scaffold a validated skeleton

Call `scaffold_skill` with the normalised metadata:

```
scaffold_skill(
  name:        <normalised name>,
  type:        <normalised type>,
  execution:   <normalised execution: prompt | script>,
  description: <normalised description>,
  phase:       <phase or "FIRE">,
  requires:    <{artifacts: [...], tools: [...]}>,
  script_lang: <lang if execution=script>
)
```

`scaffold_skill` returns three files:
- `skill_yaml` — schema-valid `skill.yaml`
- `prompt_md` — prompt skeleton with phase-appropriate section headers
- `pack_yaml` — wrapping pack manifest ready for `install_pack`

---

## Step 4 — Merge original prompt content

If the source skill had a prompt body (from a `prompt.md` or `wizard.instructions.md`
field, or inlined text), merge it into the scaffolded `prompt_md`:

- Replace the placeholder sections with the original content where applicable
- Keep the `⚠️ inline rewrite note` at the top if it was added in Step 2
- Present the merged prompt to the user for review

---

## Step 5 — User review and confirmation

Present the final `skill_yaml` and `prompt_md` to the user. Ask:

> "Here is the normalised skill. Please review it and let me know if you'd like
> any changes before I install it."

List any fields that were dropped or rewritten so the user is aware.

**Do not call `install_pack` until the user explicitly confirms they are ready.**

---

## Step 6 — Install

Once the user confirms, call `install_pack` with:

```
install_pack(
  instance_id: <current instance_id>,
  pack_yaml:   <pack_yaml from scaffold_skill>,
  skills: [{
    name:      <skill name>,
    skill_yaml: <final skill_yaml>,
    prompt_md:  <final prompt_md>
  }]
)
```

---

## Step 7 — Verify

Call `get_installed_skill(instance_id, skill_name)` to confirm the skill resolves
correctly. Report the resolved `source`, `execution`, and `type` to the user.

If verification fails, explain the error and offer to retry or diagnose the issue.
