# EPF Output Validation

This directory contains validation scripts for EPF output artifacts (external artifacts generated FROM EPF data).

## Available Validators

| Validator | Output Type | Purpose |
|-----------|-------------|---------|
| `context-sheet/validator.sh` | Context Sheet | Validates AI context sheets against schema |
| `investor-memo/validator.sh` | Investor Memo | Validates investor materials and manifests |
| `skattefunn-application/validator.sh` | SkatteFUNN Application | Validates Norwegian R&D tax deduction applications |

## Usage

### Context Sheet Validation

```bash
bash docs/EPF/outputs/context-sheet/validator.sh path/to/context-sheet.md
```

### Investor Memo Validation

```bash
bash docs/EPF/outputs/investor-memo/validator.sh --manifest path/to/manifest.json
# or
bash docs/EPF/outputs/investor-memo/validator.sh --dir path/to/investor-materials/2025-12-30/
```

### SkatteFUNN Application Validation

```bash
bash docs/EPF/outputs/skattefunn-application/validator.sh path/to/skattefunn-application.md
```

**Example:**

```bash
bash docs/EPF/outputs/skattefunn-application/validator.sh \
  docs/EPF/_instances/emergent/outputs/skattefunn-application/emergent-skattefunn-application-2025-12-31.md
```

## Exit Codes

- `0` - Validation passed
- `1` - Validation failed (schema errors)
- `2` - Missing required files
- `3` - Source files outdated (warning)

## Validation Types

### 1. Schema Validation

Checks structural compliance:
- Required fields present
- Correct data types
- Valid enumerations
- Field constraints (min/max length, patterns)

### 2. Semantic Validation

Checks business logic:
- No placeholder text remaining (`{PLACEHOLDER}`)
- Valid markdown formatting
- Reasonable content (not empty strings)
- Consistent cross-references

### 3. Freshness Validation

Checks source currency:
- Source files exist and are readable
- Source files modified recently (< 90 days)
- Output generated after source modifications
- EPF version compatibility

### 4. Quality Validation

Checks content quality:
- Appropriate length for descriptions
- Complete sentences
- No duplicate content
- Proper capitalization and formatting

## Configuration

Validation behavior can be configured via environment variables:

```bash
# Warn instead of fail on freshness issues
VALIDATION_WARN_STALE=true npm run validate:output -- ...

# Maximum age for source files (days)
VALIDATION_MAX_SOURCE_AGE=90 npm run validate:output -- ...

# Strict mode (fail on warnings)
VALIDATION_STRICT=true npm run validate:output -- ...
```

## Integration

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# Validate any modified output artifacts

git diff --cached --name-only | grep "outputs/" | while read file; do
  if [[ $file == *.md ]]; then
    npm run validate:output -- --file "$file" || exit 1
  fi
done
```

### CI/CD

Add to `.github/workflows/validate-outputs.yml`:

```yaml
name: Validate EPF Outputs

on:
  pull_request:
    paths:
      - 'docs/EPF/_instances/**/outputs/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run validate:all-outputs
```

## Error Messages

Validators provide detailed error messages:

```
❌ Validation Failed: context_sheet_generator.wizard.md

Schema Errors:
  - Missing required field: metadata.generated_at
  - Invalid type for quick_reference.purpose: expected string, got null

Semantic Errors:
  - Found placeholder text: {PLACEHOLDER} at line 42
  - Empty description in capability 'Knowledge Extraction'

Freshness Warnings:
  - Source file outdated: 00_north_star.yaml (modified 120 days ago)
  - Output older than source: regeneration recommended

Quality Issues:
  - Description too short in value_proposition[0] (< 10 chars)
  - Duplicate feature name: 'Document Analysis'
```

## Custom Validators

### Creating a New Validator

1. Create the TypeScript file:
```typescript
// validate-my-output.ts
import Ajv from 'ajv';
import * as fs from 'fs';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateMyOutput(filePath: string): Promise<ValidationResult> {
  // 1. Load schema
  const schema = JSON.parse(
    fs.readFileSync('docs/EPF/outputs/schemas/my_output.schema.json', 'utf-8')
  );
  
  // 2. Parse output file
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseMyOutputFormat(content);
  
  // 3. Schema validation
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(data);
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!valid) {
    errors.push(...(validate.errors?.map(e => e.message) || []));
  }
  
  // 4. Semantic validation
  // Add custom checks here
  
  // 5. Freshness validation
  // Check source file ages
  
  return { valid: errors.length === 0, errors, warnings };
}
```

2. Add npm script in root `package.json`:
```json
{
  "scripts": {
    "validate:my-output": "tsx docs/EPF/outputs/validation/validate-my-output.ts"
  }
}
```

3. Update this README

## Troubleshooting

### Schema Not Found

```
Error: Cannot find module '../schemas/context_sheet.schema.json'
```

**Solution**: Run validators from repository root, not from validation directory.

### Invalid JSON Schema

```
Error: Schema compilation failed
```

**Solution**: Validate schema itself first:
```bash
npm run validate:schema -- docs/EPF/outputs/schemas/my_schema.json
```

### Source Files Missing

```
Warning: Source file not found: 00_north_star.yaml
```

**Solution**: Ensure EPF instance is complete and paths in metadata are correct.

## See Also

- [Context Sheet Output Documentation](./context-sheet/README.md)
- [Investor Memo Output Documentation](./investor-memo/README.md)
- [SkatteFUNN Application Wizard](./skattefunn-application/wizard.instructions.md)
- [EPF Schema Documentation](../schemas/README.md)

## SkatteFUNN-Specific Validation

The SkatteFUNN validator performs specialized checks for Norwegian R&D tax deduction applications:

### Validation Layers

1. **Schema Structure**
   - 6 required sections (Owner, Roles, Details, Timeline, Budget, Traceability)
   - Application metadata (date, period, total budget)
   - Organization number format (9 digits: XXX XXX XXX)
   - Frascati criteria section present

2. **Semantic Rules**
   - No placeholder text (XXX, [TODO], [TBD], etc.)
   - All R&D activity fields present (hypothesis, experiment, success criteria, etc.)
   - TRL ranges within eligibility (TRL 2-7 only, no TRL 1 or TRL 8-9)
   - All 5 Frascati criteria addressed (Novel, Creative, Uncertain, Systematic, Transferable)
   - Technical uncertainty language present
   - State-of-the-art comparison included

3. **Budget Validation**
   - Total budget extracted and validated
   - Yearly budgets ≤ 25M NOK (SkatteFUNN limit)
   - Cost category percentages typical for software R&D:
     * Personnel: 65-75% (warning if outside range)
     * Equipment: 15-25% (warning if outside range)
     * Overhead: 10-15% (warning if outside range)
   - Cost categories sum to 100%
   - Work Package budgets sum to total (within 1,000 NOK tolerance)

4. **Traceability**
   - EPF traceability section present
   - Roadmap KR references (kr-p-XXX format)
   - At least 5 distinct R&D activities (recommended)
   - Direct WP → KR mapping documented
   - Required EPF sources referenced (north_star, strategy_formula, roadmap)

### Environment Variables

```bash
# Treat warnings as errors
VALIDATION_STRICT=true bash validator.sh application.md

# Custom budget limits
VALIDATION_MAX_BUDGET_YEAR=25000000 bash validator.sh application.md

# Custom budget tolerance
VALIDATION_BUDGET_TOLERANCE=1000 bash validator.sh application.md
```

### Exit Codes

- `0` - Valid, ready for submission
- `1` - Invalid (errors found, must fix)
- `2` - File not found
- `3` - Warnings only (review recommended)

### Common Issues

**Error: Found placeholder text: XXX**
- Replace all phone number placeholders (+47 XXX XX XXX) with actual numbers
- Check for [TODO], [TBD], [FILL], [Not entered] markers

**Error: TRL 8 or TRL 9 found**
- SkatteFUNN only covers TRL 2-7 (R&D phase)
- Remove production/operations activities (TRL 8-9)
- Ensure all activities show technical uncertainty

**Error: Work Package budgets don't match total**
- Verify individual activity budgets sum to WP totals
- Check WP totals sum to total application budget
- Use budget tolerance environment variable if minor rounding differences

**Warning: Personnel cost outside typical range**
- 70% is typical for software R&D
- Document if your project requires different allocation
- Ensure justification in budget breakdown section

- [Output Schemas](../schemas/README.md) - Schema definitions
- [Output Wizards](../wizards/README.md) - Generation instructions
- [Outputs Overview](../README.md) - Architecture and principles
