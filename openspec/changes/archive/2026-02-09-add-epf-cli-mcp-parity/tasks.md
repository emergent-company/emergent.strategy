## 1. High Priority - Core AI Agent Operations

- [x] 1.1 Add `epf_init_instance` MCP tool

  - [x] 1.1.1 Define tool parameters (path, product_name, epf_version, structure_type)
  - [x] 1.1.2 Implement handler calling existing init logic
  - [x] 1.1.3 Support dry_run parameter
  - [x] 1.1.4 Return created file list and anchor file content
  - [x] 1.1.5 Add unit tests

- [x] 1.2 Add `epf_fix_file` MCP tool

  - [x] 1.2.1 Define tool parameters (path, fix_types[], dry_run)
  - [x] 1.2.2 Support granular fix types: whitespace, line_endings, tabs, newlines, versions
  - [x] 1.2.3 Implement handler reusing fix command logic
  - [x] 1.2.4 Return detailed change report (file, line, before/after)
  - [x] 1.2.5 Add unit tests

- [x] 1.3 Add `epf_aim_bootstrap` MCP tool (non-interactive version)

  - [x] 1.3.1 Define all parameters from CLI wizard (org_type, team_size, funding_stage, etc.)
  - [x] 1.3.2 Implement handler that creates LRA from parameters
  - [x] 1.3.3 Support partial parameters with sensible defaults
  - [x] 1.3.4 Return created LRA content for AI agent review
  - [x] 1.3.5 Add unit tests

- [x] 1.4 Add `epf_aim_status` MCP tool
  - [x] 1.4.1 Define tool parameters (instance_path)
  - [x] 1.4.2 Implement handler that returns LRA summary
  - [x] 1.4.3 Include lifecycle stage, adoption level, track maturity, warnings
  - [x] 1.4.4 Add unit tests

## 2. Medium Priority - Strategic Operations

- [x] 2.1 Add `epf_aim_assess` MCP tool

  - [x] 2.1.1 Define tool parameters (instance_path, roadmap_id)
  - [x] 2.1.2 Implement handler that generates assessment template
  - [x] 2.1.3 Return YAML content (not write to file)
  - [x] 2.1.4 Add unit tests

- [x] 2.2 Add `epf_aim_validate_assumptions` MCP tool

  - [x] 2.2.1 Define tool parameters (instance_path, verbose)
  - [x] 2.2.2 Implement handler with assumption validation logic
  - [x] 2.2.3 Return categorized assumptions (validated, invalidated, inconclusive, pending)
  - [x] 2.2.4 Add unit tests

- [x] 2.3 Add `epf_aim_okr_progress` MCP tool

  - [x] 2.3.1 Define tool parameters (instance_path, cycle, track, all_cycles)
  - [x] 2.3.2 Implement handler with OKR calculation logic
  - [x] 2.3.3 Return achievement rates by track and status
  - [x] 2.3.4 Add unit tests

- [x] 2.4 Add `epf_generate_report` MCP tool

  - [x] 2.4.1 Define tool parameters (instance_path, format, verbose)
  - [x] 2.4.2 Support formats: markdown, html, json
  - [x] 2.4.3 Return report content (not write to file)
  - [x] 2.4.4 Add unit tests

- [x] 2.5 Add `epf_diff_artifacts` MCP tool

  - [x] 2.5.1 Define tool parameters (path1, path2, format, verbose)
  - [x] 2.5.2 Support file-to-file and directory-to-directory comparison
  - [x] 2.5.3 Return structured diff result
  - [x] 2.5.4 Add unit tests

- [x] 2.6 Add `epf_diff_template` MCP tool
  - [x] 2.6.1 Define tool parameters (file_path, format, verbose)
  - [x] 2.6.2 Auto-detect artifact type and compare against canonical template
  - [x] 2.6.3 Return structural differences with fix hints
  - [x] 2.6.4 Add unit tests

## 3. Documentation & Testing

- [x] 3.1 Update AGENTS.md with new MCP tools

  - [x] 3.1.1 Add MCP tool reference table for new tools
  - [x] 3.1.2 Document use cases and parameters
  - [x] 3.1.3 Add examples for common workflows

- [x] 3.2 Update MCP server version

  - [x] 3.2.1 Bump version to 0.14.0 or appropriate version
  - [x] 3.2.2 Update tool count in documentation (29 -> 49)

- [x] 3.3 Integration testing
  - [x] 3.3.1 Test all new tools against real EPF instance
  - [x] 3.3.2 Verify dry_run behavior for write operations
  - [x] 3.3.3 Test error handling and edge cases
