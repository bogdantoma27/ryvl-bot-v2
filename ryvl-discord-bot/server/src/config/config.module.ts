import { DynamicModule, Global, Module } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from './config.service';
import { validateEnv } from './env.validation';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(customEnv?: Record<string, unknown>): DynamicModule {
    if (!customEnv) {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        try {
          const fileContent = fs.readFileSync(envPath, 'utf-8');
          for (const rawLine of fileContent.split('\n')) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) {
              continue;
            }
            const separatorIndex = line.indexOf('=');
            if (separatorIndex !== -1) {
              const key = line.substring(0, separatorIndex).trim();
              const val = line.substring(separatorIndex + 1).trim();
              if (!(key in process.env)) {
                process.env[key] = val.replace(/^["']|["']$/g, '');
              }
            }
          }
        } catch {
          // Ignore failure to load .env file; process.env may already be populated
        }
      }
    }

    const validatedConfig = validateEnv(customEnv ?? process.env);
    const configService = new ConfigService(validatedConfig);

    return {
      module: ConfigModule,
      providers: [
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
      exports: [ConfigService],
    };
  }
}
