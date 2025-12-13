# logs-mcp Specification

## Purpose

Provide log file browsing capabilities for AI coding assistants via the Model Context Protocol, enabling efficient debugging and monitoring of application logs in the `logs/` directory.

## ADDED Requirements

### Requirement: List Log Files

The logs-mcp server SHALL provide a `list_log_files` tool that lists all available log files in the logs directory.

#### Scenario: List all log files with metadata

**Given** the logs directory contains log files  
**When** an AI assistant calls `list_log_files`  
**Then** the tool SHALL return a list of log files including:

- File name
- File path relative to logs directory
- File size in human-readable format
- Last modified timestamp

#### Scenario: Include subdirectories

**Given** the logs directory contains subdirectories (e.g., `extraction/`, `llm-dumps/`)  
**When** an AI assistant calls `list_log_files`  
**Then** the tool SHALL recursively list log files in subdirectories

### Requirement: Tail Log File

The logs-mcp server SHALL provide a `tail_log` tool that retrieves the last N lines from a specified log file.

#### Scenario: Tail with default line count

**Given** a log file exists in the logs directory  
**When** an AI assistant calls `tail_log` with only the file parameter  
**Then** the tool SHALL return the last 100 lines from the file

#### Scenario: Tail with custom line count

**Given** a log file exists in the logs directory  
**When** an AI assistant calls `tail_log` with `lines: 50`  
**Then** the tool SHALL return the last 50 lines from the file

#### Scenario: Efficient reading of large files

**Given** a log file is larger than 100MB  
**When** an AI assistant calls `tail_log`  
**Then** the tool SHALL read from the end of the file without loading the entire file into memory

### Requirement: Search Logs

The logs-mcp server SHALL provide a `search_logs` tool that searches for text patterns across log files.

#### Scenario: Search single file

**Given** a log file contains matching text  
**When** an AI assistant calls `search_logs` with a pattern and file  
**Then** the tool SHALL return matching lines with line numbers and context

#### Scenario: Search all log files

**Given** multiple log files exist  
**When** an AI assistant calls `search_logs` with only a pattern  
**Then** the tool SHALL search all `.log` files and return matches grouped by file

#### Scenario: Case-insensitive search

**Given** log files contain text in various cases  
**When** an AI assistant calls `search_logs` with `caseSensitive: false`  
**Then** the tool SHALL match patterns regardless of case

### Requirement: Get Errors

The logs-mcp server SHALL provide a `get_errors` tool that retrieves recent error entries from log files.

#### Scenario: Extract errors from error logs

**Given** error log files exist (\*.error.log, errors.log)  
**When** an AI assistant calls `get_errors`  
**Then** the tool SHALL return recent lines containing error patterns (ERROR, Exception, FATAL, Error:)

#### Scenario: Configurable error line count

**Given** error logs contain many errors  
**When** an AI assistant calls `get_errors` with `lines: 50`  
**Then** the tool SHALL return up to 50 recent error lines

### Requirement: Service-Specific Aliases

The logs-mcp server SHALL provide convenience aliases for common log file combinations.

#### Scenario: tail_server_logs alias

**When** an AI assistant calls `tail_server_logs`  
**Then** the tool SHALL return combined output from:

- server.out.log (last N lines)
- server.error.log (last N lines)

#### Scenario: tail_admin_logs alias

**When** an AI assistant calls `tail_admin_logs`  
**Then** the tool SHALL return combined output from:

- admin.out.log (last N lines)
- admin.error.log (last N lines)

#### Scenario: tail_app_logs alias

**When** an AI assistant calls `tail_app_logs`  
**Then** the tool SHALL return the last N lines from app.log

#### Scenario: tail_debug_logs alias

**When** an AI assistant calls `tail_debug_logs`  
**Then** the tool SHALL return the last N lines from debug.log

#### Scenario: tail_error_logs alias

**When** an AI assistant calls `tail_error_logs`  
**Then** the tool SHALL return combined output from all error logs:

- errors.log
- server.error.log
- admin.error.log
