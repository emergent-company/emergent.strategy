import { Injectable } from '@nestjs/common';
import { EnvVariables } from './config.schema';

@Injectable()
export class AppConfigService {
    constructor(private readonly env: EnvVariables) { }
    get skipDb(): boolean { return !!this.env.SKIP_DB; }

    get port() { return this.env.PORT; }
    get dbHost() { return this.env.PGHOST; }
    get dbPort() { return this.env.PGPORT; }
    get dbUser() { return this.env.PGUSER; }
    get dbPassword() { return this.env.PGPASSWORD; }
    get dbName() { return this.env.PGDATABASE; }
    get googleApiKey() { return this.env.GOOGLE_API_KEY; }
    get embeddingsEnabled() { return !!this.env.GOOGLE_API_KEY; }
    get autoInitDb() { return !!this.env.DB_AUTOINIT; }
    get demoSeedOrgs() { return !!this.env.ORGS_DEMO_SEED; }
}
