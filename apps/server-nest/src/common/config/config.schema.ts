import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

export class EnvVariables {
    @IsString()
    @IsOptional()
    GOOGLE_API_KEY?: string;

    @IsBoolean()
    @IsOptional()
    CHAT_MODEL_ENABLED?: boolean; // when true and GOOGLE_API_KEY present, stream real model output

    @IsString()
    PGHOST!: string;

    @IsNumber()
    PGPORT: number = 5432;

    @IsString()
    PGUSER!: string;

    @IsString()
    PGPASSWORD!: string;

    @IsString()
    PGDATABASE!: string;

    @IsNumber()
    PORT: number = 3001; // default aligned with admin frontend fallback

    @IsBoolean()
    @IsOptional()
    DB_AUTOINIT?: boolean;

    @IsString()
    @IsOptional()
    SKIP_DB?: string;

    @IsBoolean()
    @IsOptional()
    ORGS_DEMO_SEED?: boolean;
}

export function validate(config: Record<string, unknown>): EnvVariables {
    // Provide safe defaults for OpenAPI generation or test contexts without full env
    const withDefaults: Record<string, unknown> = {
        PGHOST: 'localhost',
        PGPORT: 5432,
        PGUSER: 'spec',
        PGPASSWORD: 'spec',
        PGDATABASE: 'spec',
        DB_AUTOINIT: false,
        SKIP_DB: process.env.SKIP_DB,
        ORGS_DEMO_SEED: process.env.ORGS_DEMO_SEED,
        CHAT_MODEL_ENABLED: process.env.CHAT_MODEL_ENABLED,
        ...config,
    };
    const transformed = plainToInstance(EnvVariables, {
        ...withDefaults,
        PGPORT: withDefaults.PGPORT ? Number(withDefaults.PGPORT) : 5432,
        PORT: withDefaults.PORT ? Number(withDefaults.PORT) : 3001,
        DB_AUTOINIT: withDefaults.DB_AUTOINIT === 'true' || withDefaults.DB_AUTOINIT === true,
        ORGS_DEMO_SEED: withDefaults.ORGS_DEMO_SEED === 'true' || withDefaults.ORGS_DEMO_SEED === true,
        CHAT_MODEL_ENABLED: withDefaults.CHAT_MODEL_ENABLED === 'true' || withDefaults.CHAT_MODEL_ENABLED === true,
    });
    const errors = validateSync(transformed, { skipMissingProperties: false });
    if (errors.length) {
        throw new Error(`Config validation error: ${errors.map(e => Object.values(e.constraints || {}).join(', ')).join('; ')}`);
    }
    return transformed;
}
