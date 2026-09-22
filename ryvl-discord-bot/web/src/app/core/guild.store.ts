import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { GuildBootstrap, GuildMemberOption, GuildSummary } from './models';

const STORAGE_KEY = 'ryvl_active_guild_id';
const STORAGE_AVAILABLE_KEY = 'ryvl_cached_available_guilds';
const STORAGE_BOOTSTRAP_PREFIX = 'ryvl_cached_bootstrap_';

@Injectable({ providedIn: 'root' })
export class GuildStore {
  private readonly api = inject(ApiService);

  readonly activeGuildId = signal<string | null>(null);
  readonly activeGuild = signal<GuildBootstrap | null>(null);
  readonly availableGuilds = signal<GuildSummary[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.restoreFromStorage();
  }

  private restoreFromStorage(): void {
    if (typeof window === 'undefined') return;

    const savedId = window.localStorage.getItem(STORAGE_KEY);
    // Purge any legacy mock IDs
    if (savedId === '123456789012345678') {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    // Immediately restore cached guilds list (frame 0)
    try {
      const cachedGuildsJson = window.localStorage.getItem(STORAGE_AVAILABLE_KEY);
      if (cachedGuildsJson) {
        const parsedGuilds = JSON.parse(cachedGuildsJson);
        if (Array.isArray(parsedGuilds) && parsedGuilds.length > 0) {
          this.availableGuilds.set(parsedGuilds);
        }
      }
    } catch {
      // ignore JSON parse errors
    }

    // Immediately restore active guild and its cached bootstrap data (frame 0)
    const effectiveId = savedId && savedId !== '123456789012345678' ? savedId : null;
    if (effectiveId) {
      this.activeGuildId.set(effectiveId);
      try {
        const cachedBootstrapJson = window.localStorage.getItem(
          `${STORAGE_BOOTSTRAP_PREFIX}${effectiveId}`,
        );
        if (cachedBootstrapJson) {
          const parsed = JSON.parse(cachedBootstrapJson);
          if (parsed && (parsed.id === effectiveId || parsed.guild?.id === effectiveId)) {
            this.activeGuild.set(parsed);
          }
        }
      } catch {
        // ignore JSON parse errors
      }

      // If already authenticated, revalidate in the background
      if (this.api.getSessionToken()) {
        this.fetchBootstrap(effectiveId);
      }
    }
  }

  async setActiveGuild(guildId: string): Promise<void> {
    if (!guildId || guildId === '123456789012345678') return;
    this.activeGuildId.set(guildId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, guildId);

      // Check for cached bootstrap for this guild to render immediately
      try {
        const cached = window.localStorage.getItem(`${STORAGE_BOOTSTRAP_PREFIX}${guildId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed) {
            this.activeGuild.set(parsed);
          }
        }
      } catch {
        // ignore
      }
    }
    await this.fetchBootstrap(guildId);
  }

  async loadGuilds(): Promise<void> {
    const token = this.api.getSessionToken();
    if (!token) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const guilds = await this.api.getGuilds();
      this.availableGuilds.set(guilds);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_AVAILABLE_KEY, JSON.stringify(guilds));
      }

      // Check current stored active ID
      let currentId = this.activeGuildId();
      if (!currentId && typeof window !== 'undefined') {
        currentId = window.localStorage.getItem(STORAGE_KEY);
      }

      if (currentId && guilds.some((g) => g.id === currentId)) {
        this.activeGuildId.set(currentId);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, currentId);
        }
        await this.fetchBootstrap(currentId);
      } else if (guilds.length > 0) {
        await this.setActiveGuild(guilds[0].id);
      } else {
        this.activeGuild.set(null);
      }
    } catch (err: unknown) {
      console.error('Could not load guilds from API:', err);
      this.error.set('Failed to load Discord servers. Make sure the bot is joined to your server.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async fetchBootstrap(guildId: string): Promise<void> {
    if (!guildId || guildId === '123456789012345678') return;
    const token = this.api.getSessionToken();
    if (!token) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const raw: any = await this.api.getBootstrap(guildId);
      const defaultChannelId =
        raw.settings?.defaultChannelId ||
        raw.guild?.defaultChannelId ||
        (raw.channels?.length > 0 ? raw.channels[0].id : null);

      const data: GuildBootstrap = {
        id: raw.id || raw.guild?.id || guildId,
        name: raw.name || raw.guild?.name || 'Discord Server',
        iconUrl: raw.iconUrl || raw.guild?.iconUrl || null,
        defaultTimezone: raw.defaultTimezone || raw.guild?.timezone || 'UTC',
        channels: raw.channels || [],
        roles: raw.roles || [],
        members: raw.members || [],
        settings: {
          timezone: raw.settings?.timezone || raw.defaultTimezone || raw.guild?.timezone || 'UTC',
          defaultChannelId,
          botActive: raw.settings?.botActive ?? true,
        },
      };

      this.activeGuild.set(data);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          `${STORAGE_BOOTSTRAP_PREFIX}${guildId}`,
          JSON.stringify(data),
        );
      }
    } catch (err: unknown) {
      console.error(`Failed to fetch bootstrap for guild ${guildId}:`, err);
      this.error.set(`Could not load details for server ${guildId}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  async fetchMembers(guildId?: string): Promise<GuildMemberOption[]> {
    const targetGuildId = guildId || this.activeGuildId();
    if (!targetGuildId) return [];

    try {
      const members = await this.api.getGuildMembers(targetGuildId);
      const current = this.activeGuild();
      const updated: GuildBootstrap =
        current && current.id === targetGuildId
          ? { ...current, members }
          : {
              id: targetGuildId,
              name: current?.name || 'Server',
              iconUrl: current?.iconUrl || null,
              channels: current?.channels || [],
              roles: current?.roles || [],
              members,
            };

      this.activeGuild.set(updated);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          `${STORAGE_BOOTSTRAP_PREFIX}${targetGuildId}`,
          JSON.stringify(updated),
        );
      }
      return members;
    } catch (err) {
      console.error(`Failed to fetch members for ${targetGuildId}:`, err);
      return [];
    }
  }

  updateActiveGuildSettings(updated: {
    defaultChannelId?: string | null;
    timezone?: string;
    name?: string;
  }): void {
    const current = this.activeGuild();
    if (!current) return;

    const modified: GuildBootstrap = {
      ...current,
      name: updated.name ?? current.name,
      defaultTimezone: updated.timezone ?? current.defaultTimezone,
      settings: current.settings
        ? {
            ...current.settings,
            defaultChannelId:
              updated.defaultChannelId !== undefined
                ? updated.defaultChannelId
                : current.settings.defaultChannelId,
            timezone: updated.timezone ?? current.settings.timezone,
          }
        : {
            timezone: updated.timezone || 'UTC',
            defaultChannelId: updated.defaultChannelId || null,
            botActive: true,
          },
    };

    this.activeGuild.set(modified);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        `${STORAGE_BOOTSTRAP_PREFIX}${modified.id}`,
        JSON.stringify(modified),
      );
    }
  }
}

