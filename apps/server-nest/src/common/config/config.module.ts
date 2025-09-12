import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './config.service';
import { EnvVariables, validate } from './config.schema';

const envProvider = {
    provide: EnvVariables,
    useFactory: (): EnvVariables => {
        // Load process.env directly (dotenv already loaded at root if needed)
        return validate(process.env as Record<string, unknown>);
    },
};

@Global()
@Module({
    providers: [envProvider, AppConfigService],
    exports: [AppConfigService, EnvVariables],
})
export class AppConfigModule { }
