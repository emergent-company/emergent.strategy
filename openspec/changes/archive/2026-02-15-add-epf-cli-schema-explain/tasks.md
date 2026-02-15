## 1. Schema Show Command

- [ ] 1.1 Add `schemas show <schema-name>` subcommand
- [ ] 1.2 Display schema structure in human-readable format
- [ ] 1.3 Mark required vs optional fields clearly
- [ ] 1.4 Show field types (string, array, object, enum)
- [ ] 1.5 Show enum allowed values
- [ ] 1.6 Show minimum/maximum length constraints
- [ ] 1.7 Expand nested objects with proper indentation
- [ ] 1.8 Add `--json` flag for machine-readable output
- [ ] 1.9 Add `--path <json-path>` flag to show specific section (e.g., `--path strengths`)

## 2. Validate Explain Mode

- [ ] 2.1 Add `--explain` flag to `validate` command
- [ ] 2.2 Include JSON path for each error (e.g., `/strengths/2/strength`)
- [ ] 2.3 Show expected structure alongside the error
- [ ] 2.4 Provide fix suggestion text for common error patterns
- [ ] 2.5 Group errors by section for easier fixing

## 3. Health Command Enhancement

- [ ] 3.1 Add `--explain` flag to `health` command (delegates to validate --explain)
- [ ] 3.2 Show which schema is being validated against for each file

## 4. Documentation

- [ ] 4.1 Update epf-cli --help with new commands
- [ ] 4.2 Add examples to command help text
