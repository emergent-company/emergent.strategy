# Skill Building Guide

This skill helps you create custom EPF skills. Follow the agent's guided workflow to produce a working skill with all required files.

## Execution Modes

| Mode | When to Use | What You Create |
|------|------------|----------------|
| `prompt-delivery` | Creative/reasoning tasks (writing, analysis, review) | `skill.yaml` + `prompt.md` |
| `script` | Deterministic computation (calculations, transforms, data processing) | `skill.yaml` + script file + test harness |
| `plugin` | Shared/distributed skill packs (multiple related skills) | Go module with CLI contract |

## JSON Contract for Script Skills

Script skills communicate via JSON on stdin/stdout.

### Input (stdin)

```json
{
  "instance_path": "/absolute/path/to/epf/instance",
  "parameters": {
    "user_defined_key": "user_defined_value"
  },
  "skill_dir": "/absolute/path/to/skill/directory"
}
```

### Output (stdout) -- Success

```json
{
  "success": true,
  "output": {
    "format": "json|html|markdown|text",
    "content": "...",
    "filename": "optional-suggested-filename.ext"
  }
}
```

### Output (stdout) -- Error

```json
{
  "success": false,
  "error": "Human-readable error description"
}
```

### Rules

1. Read ALL input from stdin before processing
2. Write ONLY valid JSON to stdout (no debug output, no logging to stdout)
3. Use stderr for debug/log output
4. Exit with code 0 on success, non-zero on error
5. Respect the timeout (default 30 seconds)
6. The `instance_path` is an absolute path to the EPF instance root (contains READY/, FIRE/, AIM/)

## File Placement

Skills go in the instance's `skills/` directory:

```
{instance}/skills/{your-skill-name}/
├── skill.yaml           # Required: manifest
├── prompt.md            # Required for prompt-delivery
├── your_script.py       # Required for script execution
├── test_skill.sh        # Recommended: test harness
└── schema.json          # Optional: output validation schema
```

## Verification

After creating a skill, verify it works:

1. `epf_list_skills` -- skill should appear with correct type and execution mode
2. `epf_get_skill` -- should return the skill's prompt or redirection instructions
3. For script skills: `epf_execute_skill` -- should execute and return results
4. Run the test harness: `bash test_skill.sh /path/to/instance`
