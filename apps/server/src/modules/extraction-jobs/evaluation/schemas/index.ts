/**
 * JSON Schema exports for extraction evaluation
 *
 * These schemas can be used for:
 * - Validating golden dataset items before upload to LangFuse
 * - Generating documentation
 * - IDE autocomplete and validation
 */

import extractionDatasetSchema from './extraction-dataset.schema.json';

export { extractionDatasetSchema };

/**
 * Validate a dataset item against the JSON schema.
 * Returns { valid: true } or { valid: false, errors: [...] }
 *
 * Note: For full validation, use a JSON Schema validator library like ajv:
 *
 * ```typescript
 * import Ajv from 'ajv';
 * import { extractionDatasetSchema } from './schemas';
 *
 * const ajv = new Ajv();
 * const validate = ajv.compile(extractionDatasetSchema);
 *
 * const item = { input: {...}, expected_output: {...} };
 * if (!validate(item)) {
 *   console.error(validate.errors);
 * }
 * ```
 */
export const SCHEMA_VERSION = '1.0.0';
