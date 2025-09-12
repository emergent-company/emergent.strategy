import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

@Injectable()
export class HashService {
    sha256(input: string): string {
        return createHash('sha256').update(input || '').digest('hex');
    }
}
