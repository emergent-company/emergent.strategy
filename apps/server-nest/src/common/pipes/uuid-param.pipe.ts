import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Reusable UUID parameter validator. Ensures values match canonical 8-4-4-4-12 hex.
 * Converts invalid UUID 22P02 database errors into early 400 responses.
 */
@Injectable()
export class UuidParamPipe implements PipeTransform<string | undefined, string | undefined> {
    private static readonly RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    constructor(private readonly options: { nullable?: boolean; paramName?: string } = {}) { }
    transform(value: string | undefined) {
        if (value == null || value === '') {
            if (this.options.nullable) return undefined;
            return value; // leave further required validation to DTO/other pipes
        }
        if (!UuidParamPipe.RE.test(value)) {
            throw new BadRequestException({ error: { code: 'invalid-uuid', message: `${this.options.paramName || 'id'} must be a valid UUID` } });
        }
        return value.toLowerCase();
    }
}
