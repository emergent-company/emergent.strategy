import { describe, it, expect } from 'vitest';
import {
  shouldUseKreuzberg,
  isKreuzbergSupported,
  KREUZBERG_SUPPORTED_MIME_TYPES,
  PLAIN_TEXT_MIME_TYPES,
  PLAIN_TEXT_EXTENSIONS,
} from '../../../src/modules/document-parsing/interfaces/kreuzberg.interface';

describe('Kreuzberg Interface Helpers', () => {
  describe('shouldUseKreuzberg', () => {
    describe('plain text MIME types (should NOT use Kreuzberg)', () => {
      it.each([
        ['text/plain', null],
        ['text/markdown', null],
        ['text/csv', null],
        ['text/xml', null],
        ['application/json', null],
        ['application/xml', null],
      ])('returns false for %s', (mimeType, filename) => {
        expect(shouldUseKreuzberg(mimeType, filename)).toBe(false);
      });
    });

    describe('plain text extensions (should NOT use Kreuzberg)', () => {
      it.each([
        [null, 'readme.txt'],
        [null, 'document.md'],
        [null, 'data.csv'],
        [null, 'config.json'],
        [null, 'settings.yaml'],
        [null, 'settings.yml'],
        [null, 'config.xml'],
        [null, 'NOTES.TXT'], // uppercase extension
        [null, 'README.MD'], // uppercase extension
      ])('returns false for filename %s', (mimeType, filename) => {
        expect(shouldUseKreuzberg(mimeType, filename)).toBe(false);
      });
    });

    describe('binary document types (SHOULD use Kreuzberg)', () => {
      it.each([
        ['application/pdf', 'document.pdf'],
        ['application/msword', 'document.doc'],
        [
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'document.docx',
        ],
        [
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'slides.pptx',
        ],
        [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'data.xlsx',
        ],
        ['application/rtf', 'document.rtf'],
        ['text/html', 'page.html'],
      ])('returns true for %s', (mimeType, filename) => {
        expect(shouldUseKreuzberg(mimeType, filename)).toBe(true);
      });
    });

    describe('image types (SHOULD use Kreuzberg for OCR)', () => {
      it.each([
        ['image/png', 'photo.png'],
        ['image/jpeg', 'photo.jpg'],
        ['image/tiff', 'scan.tiff'],
        ['image/bmp', 'image.bmp'],
        ['image/gif', 'image.gif'],
        ['image/webp', 'image.webp'],
      ])('returns true for %s', (mimeType, filename) => {
        expect(shouldUseKreuzberg(mimeType, filename)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('returns true when both mimeType and filename are null', () => {
        expect(shouldUseKreuzberg(null, null)).toBe(true);
      });

      it('returns true when both mimeType and filename are undefined', () => {
        expect(shouldUseKreuzberg(undefined, undefined)).toBe(true);
      });

      it('uses MIME type first when both are provided', () => {
        // MIME type says plain text, filename suggests PDF
        expect(shouldUseKreuzberg('text/plain', 'document.pdf')).toBe(false);
      });

      it('falls back to extension when MIME type is unknown', () => {
        // Unknown MIME type, but filename is plain text
        expect(
          shouldUseKreuzberg('application/octet-stream', 'readme.txt')
        ).toBe(false);
      });

      it('uses Kreuzberg for unknown MIME type and non-text extension', () => {
        expect(shouldUseKreuzberg('application/octet-stream', 'data.bin')).toBe(
          true
        );
      });

      it('handles files without extension', () => {
        expect(shouldUseKreuzberg(null, 'README')).toBe(true);
      });

      it('handles empty filename', () => {
        expect(shouldUseKreuzberg(null, '')).toBe(true);
      });

      it('handles markdown extension', () => {
        expect(shouldUseKreuzberg(null, 'doc.markdown')).toBe(false);
      });
    });
  });

  describe('isKreuzbergSupported', () => {
    describe('supported document types', () => {
      it.each([
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/rtf',
        'text/html',
      ])('returns true for %s', (mimeType) => {
        expect(isKreuzbergSupported(mimeType)).toBe(true);
      });
    });

    describe('supported image types (for OCR)', () => {
      it.each([
        'image/png',
        'image/jpeg',
        'image/tiff',
        'image/bmp',
        'image/gif',
        'image/webp',
      ])('returns true for %s', (mimeType) => {
        expect(isKreuzbergSupported(mimeType)).toBe(true);
      });
    });

    describe('unsupported types', () => {
      it.each([
        'text/plain',
        'text/markdown',
        'text/csv',
        'application/json',
        'application/octet-stream',
        'video/mp4',
        'audio/mp3',
      ])('returns false for %s', (mimeType) => {
        expect(isKreuzbergSupported(mimeType)).toBe(false);
      });
    });
  });

  describe('Constants', () => {
    it('KREUZBERG_SUPPORTED_MIME_TYPES contains expected types', () => {
      expect(KREUZBERG_SUPPORTED_MIME_TYPES).toContain('application/pdf');
      expect(KREUZBERG_SUPPORTED_MIME_TYPES).toContain('image/png');
      expect(KREUZBERG_SUPPORTED_MIME_TYPES).toContain('image/jpeg');
    });

    it('PLAIN_TEXT_MIME_TYPES contains expected types', () => {
      expect(PLAIN_TEXT_MIME_TYPES).toContain('text/plain');
      expect(PLAIN_TEXT_MIME_TYPES).toContain('text/markdown');
      expect(PLAIN_TEXT_MIME_TYPES).toContain('text/csv');
    });

    it('PLAIN_TEXT_EXTENSIONS contains expected extensions', () => {
      expect(PLAIN_TEXT_EXTENSIONS).toContain('.txt');
      expect(PLAIN_TEXT_EXTENSIONS).toContain('.md');
      expect(PLAIN_TEXT_EXTENSIONS).toContain('.csv');
      expect(PLAIN_TEXT_EXTENSIONS).toContain('.json');
    });
  });
});
