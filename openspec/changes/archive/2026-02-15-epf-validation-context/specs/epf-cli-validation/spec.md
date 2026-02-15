## ADDED Requirements

### Requirement: Product Context Display

The validation command SHALL display product context information at the start of validation output when context can be loaded.

#### Scenario: Product context from \_meta.yaml

- **WHEN** validating a file in an EPF instance with `_meta.yaml` containing product_name and description
- **THEN** the validation output MUST show a "PRODUCT CONTEXT" section with product name, description, and source file

#### Scenario: Product context fallback to README

- **WHEN** validating a file in an EPF instance without `_meta.yaml` but with a README.md containing an H1 header
- **THEN** the validation output MUST show product context inferred from the README header and first paragraph

#### Scenario: No product context available

- **WHEN** validating a file where no product context can be determined
- **THEN** the validation output MUST proceed without the product context section and validation still completes

### Requirement: Template Content Detection

The validation command SHALL detect and warn when field values contain template placeholder content.

#### Scenario: Template placeholder detected

- **WHEN** validating a file where a field contains placeholder patterns like "TBD", "Example:", "[INSERT]", or "Your Organization"
- **THEN** the validation output MUST include a template warning listing the affected fields

#### Scenario: AI-friendly output includes template warnings

- **WHEN** using `--ai-friendly` flag on a file with template content
- **THEN** the YAML output MUST include a `template_warnings` array with field paths and matched patterns

#### Scenario: Exclusion patterns prevent false positives

- **WHEN** content legitimately discusses template concepts (e.g., "0 TBD markers found")
- **THEN** the content SHALL NOT trigger a template placeholder warning

### Requirement: Semantic Alignment Checks

The validation command SHALL detect when content appears misaligned with the product's domain.

#### Scenario: Strong domain mismatch detected

- **WHEN** validating strategic fields (mission, purpose, job_to_be_done) that contain 2+ strong domain indicators unrelated to the product
- **THEN** the validation output MUST include an alignment warning with high confidence

#### Scenario: AI-friendly output includes alignment warnings

- **WHEN** using `--ai-friendly` flag on a file with domain misalignment
- **THEN** the YAML output MUST include an `alignment_warnings` array with field path, issue, confidence, and suggestion

#### Scenario: Product without clear domain

- **WHEN** validating content for a product where context has no clear domain keywords
- **THEN** alignment checks SHALL be skipped gracefully without errors

### Requirement: Per-Field Examples in Error Output

The validation command SHALL provide field-specific examples when showing validation errors.

#### Scenario: Example shown for validation error

- **WHEN** a field fails validation with `--ai-friendly` output
- **THEN** the error output SHOULD include an example value appropriate for that field type

#### Scenario: Domain-specific examples when available

- **WHEN** product context indicates a specific domain (e.g., transportation, fintech)
- **THEN** examples SHOULD be tailored to that domain when domain-specific examples are available

#### Scenario: Explain field command

- **WHEN** user runs `epf-cli validate <file> --explain <field_path>`
- **THEN** the output MUST show field purpose, constraints, and multiple examples

### Requirement: Enhanced AI-Friendly Output Format

The `--ai-friendly` validation output format SHALL include product context and warnings.

#### Scenario: Complete AI-friendly output structure

- **WHEN** using `--ai-friendly` flag
- **THEN** the YAML output MUST include: `product_context`, `template_warnings`, `alignment_warnings`, and `errors_by_section`

#### Scenario: Fix plan includes context-aware suggestions

- **WHEN** using `--fix-plan` flag with product context available
- **THEN** fix suggestions SHOULD reference the product name and domain
