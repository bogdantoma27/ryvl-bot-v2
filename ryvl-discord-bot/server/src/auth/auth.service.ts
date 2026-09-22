import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../config/config.service';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;
  mfa_enabled?: boolean;
  banner?: string | null;
  accent_color?: number | null;
  locale?: string;
  verified?: boolean;
  email?: string | null;
  flags?: number;
  premium_type?: number;
  public_flags?: number;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
}

export interface JwtPayload {
  userId: string;
  username: string;
  avatar: string | null;
  guildId?: string;
  iat?: number;
  exp?: number;
}

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

@Injectable()
export class AuthService {
  private readonly discordApiBase = 'https://discord.com/api/v10';

  constructor(private readonly configService: ConfigService) {}

  getDiscordAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.discordClientId,
      response_type: 'code',
      redirect_uri: this.configService.discordOauthRedirectUri,
      scope: 'identify guilds',
    });

    if (state) {
      params.append('state', state);
    }

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{
    accessToken: string;
    user: DiscordUser;
    guilds: DiscordGuild[];
  }> {
    const tokenUrl = `${this.discordApiBase}/oauth2/token`;

    const bodyParams = new URLSearchParams({
      client_id: this.configService.discordClientId,
      client_secret: this.configService.discordClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.configService.discordOauthRedirectUri,
    });

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      });
    } catch (networkError) {
      const message = networkError instanceof Error ? networkError.message : 'Network request failed';
      throw new BadRequestException(`Failed to connect to Discord OAuth2: ${message}`);
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new UnauthorizedException(`Failed to exchange code for token: ${errorText}`);
    }

    const tokenData = (await tokenResponse.json()) as DiscordTokenResponse;
    const accessToken = tokenData.access_token;

    const [user, guilds] = await Promise.all([
      this.fetchDiscordApi<DiscordUser>('/users/@me', accessToken),
      this.fetchDiscordApi<DiscordGuild[]>('/users/@me/guilds', accessToken),
    ]);

    return {
      accessToken,
      user,
      guilds,
    };
  }

  signJwt(payload: { userId: string; username: string; avatar: string | null; guildId?: string }): string {
    return jwt.sign(payload, this.configService.jwtSecret, { expiresIn: '7d' });
  }

  verifyJwt(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.configService.jwtSecret);
      return decoded as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }

  async fetchDiscordApi<T>(endpoint: string, accessToken: string): Promise<T> {
    const url = `${this.discordApiBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BadRequestException(`Discord API error on ${endpoint}: ${errorBody}`);
    }

    return (await response.json()) as T;
  }
}
