import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

@Injectable()
export class HashService {
  sha256(input: string): string {
    return createHash('sha256')
      .update(input || '')
      .digest('hex');
  }

  /**
   * Compute SHA-256 hash of a buffer (for file hashing).
   * @param buffer - The buffer to hash
   * @returns Hex-encoded SHA-256 hash
   */
  sha256Buffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
