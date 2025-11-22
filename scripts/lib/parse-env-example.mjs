/**
 * Parser for .env.example files with metadata in comments
 *
 * Parses .env.example files to extract:
 * - Variable names and default values
 * - Required vs optional status
 * - Secret vs non-secret status
 * - Descriptions from comments
 *
 * Comment Format:
 * # Variable Name (REQUIRED) (SECRET)
 * # Description line 1
 * # Description line 2
 * VARIABLE_NAME=default_value
 *
 * Tags supported in comments (case-insensitive):
 * - (REQUIRED) or (Required) - Variable must be set
 * - (OPTIONAL) or (Optional) - Variable is optional
 * - (SECRET) or (Secret) - Variable contains sensitive data
 *
 * If no tag is specified:
 * - Variables with values are OPTIONAL (have safe defaults)
 * - Variables without values (empty or commented) are REQUIRED
 */

import { readFileSync, existsSync } from 'fs';

/**
 * Parse a single .env.example file
 * @param {string} filePath - Path to .env.example file
 * @returns {Object} Parsed variable specifications
 */
export function parseEnvExample(filePath) {
  if (!existsSync(filePath)) {
    return { variables: {}, errors: [`File not found: ${filePath}`] };
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const variables = {};
  const errors = [];

  let currentComments = [];
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      currentComments = []; // Reset comments on empty line
      continue;
    }

    // Collect comments
    if (trimmed.startsWith('#')) {
      const comment = trimmed.substring(1).trim();
      // Skip section headers (lines with = or all caps)
      if (
        !comment.includes('===') &&
        !comment.includes('---') &&
        !/^[A-Z\s]+$/.test(comment)
      ) {
        currentComments.push(comment);
      }
      continue;
    }

    // Parse variable definition
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      const [, varName, value] = match;

      // Extract metadata from comments
      const commentText = currentComments.join(' ');
      const hasRequiredTag = /\(required\)/i.test(commentText);
      const hasOptionalTag = /\(optional\)/i.test(commentText);
      const hasSecretTag = /\(secret\)/i.test(commentText);

      // Determine if required
      let isRequired;
      if (hasRequiredTag) {
        isRequired = true;
      } else if (hasOptionalTag) {
        isRequired = false;
      } else {
        // Heuristic: empty value or placeholder = required
        const isEmpty = !value || value.trim() === '';
        const isPlaceholder =
          value.includes('your-') ||
          value.includes('TODO') ||
          value.includes('...') ||
          value.includes('SET_THIS');
        isRequired = isEmpty || isPlaceholder;
      }

      // Extract description (remove tags)
      const description = commentText
        .replace(/\(required\)/gi, '')
        .replace(/\(optional\)/gi, '')
        .replace(/\(secret\)/gi, '')
        .trim();

      variables[varName] = {
        name: varName,
        defaultValue: value,
        required: isRequired,
        secret: hasSecretTag,
        description,
        line: lineNumber,
      };

      currentComments = [];
    } else if (trimmed && !trimmed.startsWith('#')) {
      // Invalid line
      errors.push(`Line ${lineNumber}: Invalid format: ${trimmed}`);
    }
  }

  return { variables, errors };
}

/**
 * Parse all .env.example files in the workspace
 * @param {Object} paths - Paths to .env.example files
 * @returns {Object} Combined variable specifications by context
 */
export function parseAllEnvExamples(paths) {
  const result = {
    root: { required: [], optional: [], secrets: [] },
    server: { required: [], optional: [], secrets: [] },
    admin: { required: [], optional: [], secrets: [] },
  };

  const allErrors = [];

  // Parse each file
  for (const [context, filePath] of Object.entries(paths)) {
    const { variables, errors } = parseEnvExample(filePath);

    if (errors.length > 0) {
      allErrors.push(...errors.map((e) => `[${context}] ${e}`));
    }

    // Categorize variables
    for (const [varName, meta] of Object.entries(variables)) {
      if (meta.required) {
        result[context].required.push(varName);
      } else {
        result[context].optional.push(varName);
      }

      if (meta.secret) {
        result[context].secrets.push(varName);
      }
    }
  }

  return { varSpecs: result, allVariables: getAllVariables(result), allErrors };
}

/**
 * Get all variables with their metadata
 * @param {Object} varSpecs - Variable specifications by context
 * @returns {Map} Map of variable name to metadata
 */
function getAllVariables(varSpecs) {
  const allVars = new Map();

  for (const [context, specs] of Object.entries(varSpecs)) {
    [...specs.required, ...specs.optional].forEach((varName) => {
      if (!allVars.has(varName)) {
        allVars.set(varName, {
          context,
          required: specs.required.includes(varName),
          secret: specs.secrets.includes(varName),
        });
      }
    });
  }

  return allVars;
}
