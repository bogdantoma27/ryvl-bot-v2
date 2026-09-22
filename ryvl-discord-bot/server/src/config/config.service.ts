import { Injectable } from '@nestjs/common';
import { EnvConfig } from './env.validation';

@Injectable()
export class ConfigService {
  constructor(private readonly envConfig: EnvConfig) {}

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.envConfig[key];
  }

  getAll(): Readonly<EnvConfig> {
    return Object.freeze({ ...this.envConfig });
  }

  get databaseUrl(): string {
    return this.envConfig.DATABASE_URL;
  }

  get discordToken(): string {
    return this.envConfig.DISCORD_TOKEN;
  }

  get discordClientId(): string {
    return this.envConfig.DISCORD_CLIENT_ID;
  }

  get discordClientSecret(): string {
    return this.envConfig.DISCORD_CLIENT_SECRET;
  }

  get discordOauthRedirectUri(): string {
    return this.envConfig.DISCORD_OAUTH_REDIRECT_URI;
  }

  get jwtSecret(): string {
    return this.envConfig.JWT_SECRET;
  }

  get frontendUrl(): string {
    return this.envConfig.FRONTEND_URL;
  }

  get port(): number {
    return this.envConfig.PORT;
  }
}
