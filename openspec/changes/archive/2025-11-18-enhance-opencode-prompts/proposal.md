# Enhance Opencode Prompts

## Summary

Refactor OpenSpec prompts in Opencode to use a concise `os/` namespace and add a new proposal listing capability.

## Motivation

The current `open-spec-proposal` command is verbose. Renaming it to `os/proposal` improves brevity. Additionally, users need a way to view existing proposals directly within Opencode, similar to the `open-spec-view` command.

## Proposed Changes

- Rename `.github/prompts/openspec-proposal.prompt.md` to `.github/prompts/os-proposal.prompt.md`.
- Add `.github/prompts/os-list.prompt.md` to expose proposal listings.
- Rename all OpenCode commands to use `os-` prefix for consistency (`os-proposal`, `os-apply`, `os-archive`, `os-list`).

## Implementation Details

- Prompts are stored as flat files in `.github/prompts/` to ensure compatibility with OpenCode's command discovery (e.g., `/os-proposal`, `/os-list`).
- Commands are also updated in `.opencode/command/` to ensure they are available in the OpenCode TUI.
