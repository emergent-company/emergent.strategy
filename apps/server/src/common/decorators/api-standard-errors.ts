import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';

interface StandardErrorOptions {
    notFound?: boolean;
    unauthorized?: boolean; // allow opting out later if needed
    forbidden?: boolean; // allow opting out later if needed
}

/**
 * Consolidated standard error responses so controllers stay DRY.
 * Add/adjust here to propagate across endpoints.
 */
export function ApiStandardErrors(opts: StandardErrorOptions = {}) {
    const { notFound, unauthorized = true, forbidden = true } = opts;
    const decorators: ClassDecorator[] | MethodDecorator[] = [
        ApiBadRequestResponse({
            description: 'Bad request',
            schema: { example: { error: { code: 'bad-request', message: 'Invalid request' } } },
        }),
        ApiInternalServerErrorResponse({
            description: 'Internal server error',
            schema: { example: { error: { code: 'internal', message: 'Unexpected error' } } },
        }),
    ];
    if (unauthorized) {
        decorators.push(
            ApiUnauthorizedResponse({
                description: 'Unauthorized',
                schema: { example: { error: { code: 'unauthorized', message: 'Missing or invalid credentials' } } },
            }),
        );
    }
    if (forbidden) {
        decorators.push(
            ApiForbiddenResponse({
                description: 'Forbidden',
                schema: { example: { error: { code: 'forbidden', message: 'Insufficient permissions' } } },
            }),
        );
    }
    if (notFound) {
        decorators.push(
            ApiNotFoundResponse({
                description: 'Not found',
                schema: { example: { error: { code: 'not-found', message: 'Resource not found' } } },
            }),
        );
    }
    return applyDecorators(...decorators);
}
