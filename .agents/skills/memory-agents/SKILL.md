---
name: memory-agents
description: Manage Emergent runtime agents and agent definitions — create, trigger, monitor runs, respond to questions, and manage agent configurations. Use when the user wants to run, inspect, or configure AI agents in an Emergent project.
metadata:
  author: emergent
  version: "2.0"
---

Manage runtime agents and agent definitions in an Emergent project using `memory agents` and `memory agent-definitions`.

## Rules

- **Never run `memory browse`** — it launches a full interactive TUI that blocks on terminal input and will hang in an automated agent context.
- **Always prefix `memory` commands with `NO_PROMPT=1`** (e.g. `NO_PROMPT=1 memory <cmd>`). Without it, the CLI may show interactive pickers when no project, agent, MCP server, skill, or agent-definition ID is provided. Do not add this to `.env.local` — it must only apply to agent-driven invocations.
- **Always supply a project** with `--project <id>` on project-scoped commands, or ensure `MEMORY_PROJECT` is set.

## Concepts

- **Agent definition** (`agent-definitions`) — the blueprint: system prompt, model config, tools, flow type, visibility. Created once, reused.
- **Agent** (`agents`) — a live instance of a definition in a project, with scheduling, triggers, and run history.

---

## Agent Definitions

### List definitions
```bash
memory agent-definitions list
memory agent-defs list --output json
```

### Get definition details
```bash
memory agent-definitions get <definition-id>
```

### Create a definition
```bash
memory agent-definitions create --name "My Agent" --description "Does X"
```

### Update a definition
```bash
memory agent-definitions update <definition-id> --name "New Name"
```

### Delete a definition
```bash
memory agent-definitions delete <definition-id>
```

---

## Runtime Agents

### List agents in a project
```bash
memory agents list
memory agents list --project <id> --output json
```

### Get agent details
```bash
memory agents get <agent-id>
```

### Create an agent (instantiate a definition in a project)
```bash
memory agents create --name "My Agent" --definition-id <def-id>
```

### Trigger an agent run
```bash
memory agents trigger <agent-id>
```

### View recent runs
```bash
memory agents runs <agent-id>
memory agents runs <agent-id> --limit 20
```

### Update an agent
```bash
memory agents update <agent-id> --name "New Name"
```

### Delete an agent
```bash
memory agents delete <agent-id>
```

---

## Agent Questions

Agents can pause and ask clarifying questions. Use these commands to list and respond.

### List questions for a specific run
```bash
memory agents questions list <run-id>
```

### List all pending questions for a project
```bash
memory agents questions list-project
memory agents questions list-project --project <id>
```

### Respond to a question
```bash
memory agents questions respond <question-id> --answer "Yes, proceed"
```

---

## Webhook Hooks

### Manage hooks on an agent
```bash
memory agents hooks list <agent-id>
```

---

## Workflow

1. **First-time setup**: create an agent definition, then create an agent in your project referencing that definition
2. **Running an agent**: `trigger` kicks off an immediate run; check `runs` to see status
3. **Monitoring**: use `runs --limit 50 --output json` for scripted monitoring
4. **Blocked agent**: if a run is waiting for input, use `questions list-project` to find pending questions, then `questions respond` to unblock it
5. **Finding IDs**: use `list --output json` and look up by name

## Notes

- `agent-definitions` has aliases: `agent-defs`, `defs`
- `--project` global flag selects the project; falls back to config default
- Agent and definition IDs are UUIDs
