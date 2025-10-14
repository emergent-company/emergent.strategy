# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-06

### Added
- Initial release
- Test execution tool (npm, playwright, vitest, jest)
- Service management tool (docker-compose, pm2, npm)
- Log browsing tool (tail, cat, grep, list)
- Status checking tool
- Safe command execution with timeout and error handling
- Path validation to prevent directory traversal
- Support for E2E_FORCE_TOKEN environment variable
- Comprehensive README with examples

### Security
- Path validation to prevent directory traversal attacks
- Command output size limits
- Operation timeouts
