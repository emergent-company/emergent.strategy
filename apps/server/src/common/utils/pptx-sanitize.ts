/**
 * PPTX Sanitization Utility
 *
 * Fixes PPTX files that have shapes without txBody elements, which causes
 * Kreuzberg to fail with "No txBody found" parsing error.
 *
 * Background:
 * - Kreuzberg's PPTX parser (v4.0.0-rc.25) requires every <p:sp> shape to have a <p:txBody>
 * - Google Slides exports create shapes with custom geometry (lines, arrows, connectors)
 *   that legitimately have no text body
 * - This utility adds empty txBody elements to fix the parsing
 *
 * @see https://github.com/kreuzberg-dev/kreuzberg/issues/XXX (bug report pending)
 */

import AdmZip from 'adm-zip';
import { Logger } from '@nestjs/common';

const logger = new Logger('PptxSanitize');

// OOXML namespaces
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/**
 * Empty txBody XML to insert into shapes that lack one.
 * This is the minimal valid structure required by the OOXML spec.
 */
const EMPTY_TXBODY = `<p:txBody xmlns:p="${P_NS}" xmlns:a="${A_NS}"><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody>`;

/**
 * Result of PPTX sanitization
 */
export interface PptxSanitizeResult {
  /** Whether the file was modified */
  modified: boolean;
  /** Number of shapes that were fixed */
  shapesFixed: number;
  /** Slides that were modified */
  slidesModified: string[];
  /** The sanitized file buffer (same as input if not modified) */
  buffer: Buffer;
}

/**
 * Check if a PPTX file needs sanitization (has shapes without txBody).
 *
 * @param buffer - The PPTX file as a Buffer
 * @returns true if the file has shapes that need fixing
 */
export function needsPptxSanitization(buffer: Buffer): boolean {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (
        entry.entryName.startsWith('ppt/slides/slide') &&
        entry.entryName.endsWith('.xml')
      ) {
        const content = entry.getData().toString('utf-8');
        // Quick check: look for <p:sp> elements and check if any lack <p:txBody>
        if (hasShapesWithoutTxBody(content)) {
          return true;
        }
      }
    }

    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Error checking PPTX for sanitization: ${errorMessage}`);
    return false;
  }
}

/**
 * Sanitize a PPTX file by adding empty txBody elements to shapes that lack them.
 *
 * @param buffer - The PPTX file as a Buffer
 * @returns Sanitization result with the fixed file buffer
 */
export function sanitizePptx(buffer: Buffer): PptxSanitizeResult {
  const result: PptxSanitizeResult = {
    modified: false,
    shapesFixed: 0,
    slidesModified: [],
    buffer: buffer,
  };

  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let anyModified = false;

    for (const entry of entries) {
      // Only process slide XML files
      if (
        entry.entryName.startsWith('ppt/slides/slide') &&
        entry.entryName.endsWith('.xml')
      ) {
        const content = entry.getData().toString('utf-8');
        const { fixed, count } = fixSlideXml(content);

        if (count > 0) {
          zip.updateFile(entry.entryName, Buffer.from(fixed, 'utf-8'));
          result.shapesFixed += count;
          result.slidesModified.push(entry.entryName);
          anyModified = true;
          logger.debug(`Fixed ${count} shapes in ${entry.entryName}`);
        }
      }
    }

    if (anyModified) {
      result.modified = true;
      result.buffer = zip.toBuffer();
      logger.log(
        `Sanitized PPTX: fixed ${result.shapesFixed} shapes in ${result.slidesModified.length} slides`
      );
    }

    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error sanitizing PPTX: ${errorMessage}`);
    // Return original buffer on error
    return result;
  }
}

/**
 * Check if XML content has <p:sp> shapes without <p:txBody> children.
 * Uses regex for quick detection without full XML parsing.
 */
function hasShapesWithoutTxBody(xml: string): boolean {
  // Find all <p:sp>...</p:sp> blocks
  const spRegex = /<p:sp[^>]*>[\s\S]*?<\/p:sp>/g;
  let match;

  while ((match = spRegex.exec(xml)) !== null) {
    const spContent = match[0];
    // Check if this shape has a txBody
    if (!/<p:txBody[^>]*>/.test(spContent)) {
      return true;
    }
  }

  return false;
}

/**
 * Fix a slide XML by adding empty txBody to shapes that lack it.
 * Uses regex-based approach for speed and to avoid XML namespace issues.
 */
function fixSlideXml(xml: string): { fixed: string; count: number } {
  let count = 0;

  // Match <p:sp>...</p:sp> blocks and fix those without txBody
  const fixed = xml.replace(
    /<p:sp([^>]*)>([\s\S]*?)<\/p:sp>/g,
    (match, attrs, content) => {
      // Check if this shape already has a txBody
      if (/<p:txBody[^>]*>/.test(content)) {
        return match; // Already has txBody, no change needed
      }

      count++;

      // Find the insertion point - txBody should come after spPr (shape properties)
      // Standard order: nvSpPr, spPr, txBody, style
      const spPrEndMatch = content.match(/<\/p:spPr>/);
      if (spPrEndMatch) {
        const insertPos = content.indexOf('</p:spPr>') + '</p:spPr>'.length;
        const newContent =
          content.slice(0, insertPos) + EMPTY_TXBODY + content.slice(insertPos);
        return `<p:sp${attrs}>${newContent}</p:sp>`;
      }

      // If no spPr found, append txBody at the end (before closing tag)
      return `<p:sp${attrs}>${content}${EMPTY_TXBODY}</p:sp>`;
    }
  );

  return { fixed, count };
}

/**
 * Check if a file is a PPTX based on its MIME type or extension.
 */
export function isPptxFile(mimeType: string, filename?: string): boolean {
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return true;
  }

  if (filename && filename.toLowerCase().endsWith('.pptx')) {
    return true;
  }

  return false;
}
