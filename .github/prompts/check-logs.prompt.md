---
description: Check logs for errors and suggest fixes
agent: build
---

# Check Logs for Problems

Use the **logs MCP server** tools to inspect application logs and identify issues.

## Available Log Tools

| Tool                    | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `logs_list_log_files`   | List all available log files with sizes      |
| `logs_tail_error_logs`  | Get recent entries from all error logs       |
| `logs_tail_server_logs` | Tail server logs (server.log + server.error) |
| `logs_tail_admin_logs`  | Tail admin/frontend logs                     |
| `logs_tail_app_logs`    | Tail main application log                    |
| `logs_get_errors`       | Extract ERROR/FATAL/Exception entries        |
| `logs_search_logs`      | Search for specific patterns across logs     |
| `logs_tail_log`         | Tail a specific log file by path             |

## Instructions

1. **Start with errors**: Use `logs_get_errors` or `logs_tail_error_logs` to find recent errors
2. **Check server logs**: Use `logs_tail_server_logs` for backend issues
3. **Check admin logs**: Use `logs_tail_admin_logs` for frontend issues
4. **Search if needed**: Use `logs_search_logs` to find specific patterns

## Goal

You are looking for **problems** in the logs:

- Errors, exceptions, stack traces
- Failed requests or operations
- Warnings that indicate issues
- Unexpected behavior patterns

## Output

For each problem found:

1. **Describe the issue** - What error/problem was detected
2. **Show relevant log entries** - Include the actual log output
3. **Identify the cause** - Explain what likely caused the issue
4. **Suggest a fix** - Provide actionable steps or code changes to resolve it
