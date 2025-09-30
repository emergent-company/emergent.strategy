import { Inject, Injectable } from '@nestjs/common';
import { EnvVariables } from './config.schema';

@Injectable()
export class AppConfigService {
    constructor(@Inject(EnvVariables) private readonly env: EnvVariables) {
        if (process.env.E2E_DEBUG_CHAT === '1') {
            // eslint-disable-next-line no-console
            console.log('[config-debug] CHAT_MODEL_ENABLED raw=', process.env.CHAT_MODEL_ENABLED,
                'GOOGLE_API_KEY set=', !!process.env.GOOGLE_API_KEY,
                'computed chatModelEnabled=', !!process.env.GOOGLE_API_KEY && (process.env.CHAT_MODEL_ENABLED === 'true' || process.env.CHAT_MODEL_ENABLED === '1'));
        }
    }
    /**
     * Only treat SKIP_DB as enabled when explicitly set to 'true' or '1'. This
     * prevents accidental activation when the variable is defined but blank or
     * set to another placeholder value by tooling.
     */
    get skipDb(): boolean {
        const v = (this.env.SKIP_DB || '').trim().toLowerCase();
        return v === 'true' || v === '1';
    }

    get port() { return this.env.PORT; }
    get dbHost() { return this.env.PGHOST; }
    get dbPort() { return this.env.PGPORT; }
    get dbUser() { return this.env.PGUSER; }
    get dbPassword() { return this.env.PGPASSWORD; }
    get dbName() { return this.env.PGDATABASE; }
    get googleApiKey() { return this.env.GOOGLE_API_KEY; }
    get embeddingsEnabled() { return !!this.env.GOOGLE_API_KEY; }
    get embeddingsNetworkDisabled() { return !!this.env.EMBEDDINGS_NETWORK_DISABLED; }
    get chatModelEnabled() { return !!this.env.GOOGLE_API_KEY && !!this.env.CHAT_MODEL_ENABLED; }
    get autoInitDb() { return !!this.env.DB_AUTOINIT; }
    /** Password used when creating / connecting as dedicated non-bypass RLS role (app_rls). Optional so tests can rely on default. */
    get appRlsPassword() { return this.env.APP_RLS_PASSWORD || 'app_rls_pw'; }
    get rlsPolicyStrict() { return !!this.env.RLS_POLICY_STRICT; }
}
