import { Injectable } from '@nestjs/common';
import { EnvVariables } from './config.schema';

@Injectable()
export class AppConfigService {
    constructor(private readonly env: EnvVariables) {
        if (process.env.E2E_DEBUG_CHAT === '1') {
            // eslint-disable-next-line no-console
            console.log('[config-debug] CHAT_MODEL_ENABLED raw=', process.env.CHAT_MODEL_ENABLED,
                'GOOGLE_API_KEY set=', !!process.env.GOOGLE_API_KEY,
                'computed chatModelEnabled=', !!process.env.GOOGLE_API_KEY && (process.env.CHAT_MODEL_ENABLED === 'true' || process.env.CHAT_MODEL_ENABLED === '1'));
        }
    }
    get skipDb(): boolean { return !!this.env.SKIP_DB; }

    get port() { return this.env.PORT; }
    get dbHost() { return this.env.PGHOST; }
    get dbPort() { return this.env.PGPORT; }
    get dbUser() { return this.env.PGUSER; }
    get dbPassword() { return this.env.PGPASSWORD; }
    get dbName() { return this.env.PGDATABASE; }
    get googleApiKey() { return this.env.GOOGLE_API_KEY; }
    get embeddingsEnabled() { return !!this.env.GOOGLE_API_KEY; }
    get chatModelEnabled() { return !!this.env.GOOGLE_API_KEY && !!this.env.CHAT_MODEL_ENABLED; }
    get autoInitDb() { return !!this.env.DB_AUTOINIT; }
    get demoSeedOrgs() { return !!this.env.ORGS_DEMO_SEED; }
}
