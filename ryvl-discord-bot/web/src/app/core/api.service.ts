import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AuthState,
  EventCreatePayload,
  EventItem,
  EventRsvp,
  GuildBootstrap,
  GuildMemberOption,
  GuildSettings,
  GuildSummary,
  LineupFormationsResponse,
  LineupDraft,
  LineupRenderPayload,
  LineupPostPayload,
} from './models';

const PRODUCTION_API_BASE_URL = 'https://ryvl-bot-api.onrender.com';
const DEVELOPMENT_API_BASE_URL = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly sessionTokenKey = 'ryvl_token';

  readonly baseUrl: string = (() => {
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return DEVELOPMENT_API_BASE_URL;
      }
    }
    return PRODUCTION_API_BASE_URL;
  })();

  getSessionToken(): string | null {
    if (typeof window === 'undefined') return null;

    if (window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        this.setSessionToken(urlToken);
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        return urlToken;
      }
    }

    return (
      window.localStorage.getItem(this.sessionTokenKey) ||
      window.sessionStorage.getItem(this.sessionTokenKey)
    );
  }

  setSessionToken(token: string | null): void {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(this.sessionTokenKey, token);
      window.sessionStorage.setItem(this.sessionTokenKey, token);
    } else {
      window.localStorage.removeItem(this.sessionTokenKey);
      window.sessionStorage.removeItem(this.sessionTokenKey);
    }
  }

  private headers(): { [header: string]: string } {
    const token = this.getSessionToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  authMe(): Promise<AuthState> {
    return firstValueFrom(
      this.http.get<AuthState>(`${this.baseUrl}/api/auth/me`, {
        headers: this.headers(),
      })
    );
  }

  getGuilds(): Promise<GuildSummary[]> {
    return firstValueFrom(
      this.http.get<GuildSummary[]>(`${this.baseUrl}/api/guilds`, {
        headers: this.headers(),
      })
    );
  }

  getBootstrap(guildId: string): Promise<GuildBootstrap> {
    return firstValueFrom(
      this.http.get<GuildBootstrap>(`${this.baseUrl}/api/guilds/${guildId}/bootstrap`, {
        headers: this.headers(),
      })
    );
  }

  getGuildMembers(guildId: string): Promise<GuildMemberOption[]> {
    return firstValueFrom(
      this.http.get<GuildMemberOption[]>(`${this.baseUrl}/api/guilds/${guildId}/members`, {
        headers: this.headers(),
      })
    );
  }

  getEvents(guildId: string, status?: string): Promise<EventItem[]> {
    const params = status ? { status } : undefined;
    return firstValueFrom(
      this.http.get<EventItem[]>(`${this.baseUrl}/api/guilds/${guildId}/events`, {
        headers: this.headers(),
        params,
      })
    );
  }

  getEvent(guildId: string, eventId: string): Promise<EventItem> {
    return firstValueFrom(
      this.http.get<EventItem>(`${this.baseUrl}/api/guilds/${guildId}/events/${eventId}`, {
        headers: this.headers(),
      })
    );
  }

  createEvent(guildId: string, data: EventCreatePayload | Record<string, unknown>): Promise<EventItem> {
    return firstValueFrom(
      this.http.post<EventItem>(`${this.baseUrl}/api/guilds/${guildId}/events`, data, {
        headers: this.headers(),
      })
    );
  }

  updateEvent(
    guildId: string,
    eventId: string,
    data: Partial<EventCreatePayload> | Record<string, unknown>
  ): Promise<EventItem> {
    return firstValueFrom(
      this.http.patch<EventItem>(`${this.baseUrl}/api/guilds/${guildId}/events/${eventId}`, data, {
        headers: this.headers(),
      })
    );
  }

  deleteEvent(guildId: string, eventId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/api/guilds/${guildId}/events/${eventId}`, {
        headers: this.headers(),
      })
    );
  }

  getRsvps(guildId: string, eventId: string, occurrenceId: string): Promise<EventRsvp[]> {
    return firstValueFrom(
      this.http.get<EventRsvp[]>(`${this.baseUrl}/api/guilds/${guildId}/events/${eventId}/rsvps`, {
        headers: this.headers(),
        params: { occurrenceId },
      })
    );
  }

  getSettings(guildId: string): Promise<GuildSettings> {
    return firstValueFrom(
      this.http.get<GuildSettings>(`${this.baseUrl}/api/guilds/${guildId}/settings`, {
        headers: this.headers(),
      })
    );
  }

  updateSettings(guildId: string, data: Partial<GuildSettings>): Promise<GuildSettings> {
    return firstValueFrom(
      this.http.patch<GuildSettings>(`${this.baseUrl}/api/guilds/${guildId}/settings`, data, {
        headers: this.headers(),
      })
    );
  }

  cancelOccurrence(guildId: string, eventId: string, occurrenceId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.baseUrl}/api/guilds/${guildId}/events/${eventId}/occurrences/${occurrenceId}/cancel`,
        {},
        { headers: this.headers() }
      )
    );
  }

  getDiscordLoginUrl(): string {
    return `${this.baseUrl}/api/auth/discord/start`;
  }

  getLineupFormations(guildId: string): Promise<LineupFormationsResponse> {
    return firstValueFrom(
      this.http.get<LineupFormationsResponse>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/formations`,
        { headers: this.headers() },
      ),
    );
  }

  renderLineup(guildId: string, payload: LineupRenderPayload): Promise<{ svg: string }> {
    return firstValueFrom(
      this.http.post<{ svg: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/render`,
        payload,
        { headers: this.headers() },
      ),
    );
  }

  postLineup(
    guildId: string,
    payload: LineupPostPayload,
  ): Promise<{ ok: boolean; channel_id: string; message_id: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; channel_id: string; message_id: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/post`,
        payload,
        { headers: this.headers() },
      ),
    );
  }

  getLineupDrafts(guildId: string): Promise<LineupDraft[]> {
    return firstValueFrom(
      this.http.get<LineupDraft[]>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/drafts`,
        { headers: this.headers() },
      ),
    );
  }

  createLineupDraft(
    guildId: string,
    payload: Partial<LineupDraft>,
  ): Promise<LineupDraft> {
    return firstValueFrom(
      this.http.post<LineupDraft>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/drafts`,
        payload,
        { headers: this.headers() },
      ),
    );
  }

  updateLineupDraft(
    guildId: string,
    draftId: string,
    payload: Partial<LineupDraft>,
  ): Promise<LineupDraft> {
    return firstValueFrom(
      this.http.patch<LineupDraft>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/drafts/${draftId}`,
        payload,
        { headers: this.headers() },
      ),
    );
  }

  deleteLineupDraft(
    guildId: string,
    draftId: string,
  ): Promise<{ ok: boolean; id: string }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; id: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/drafts/${draftId}`,
        { headers: this.headers() },
      ),
    );
  }

  getEaConfig(guildId: string): Promise<{ config: any; clubInfo: any; overallStats: any }> {
    return firstValueFrom(
      this.http.get<{ config: any; clubInfo: any; overallStats: any }>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/config`,
        { headers: this.headers() },
      ),
    );
  }

  updateEaConfig(guildId: string, data: any): Promise<any> {
    return firstValueFrom(
      this.http.patch<any>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/config`,
        data,
        { headers: this.headers() },
      ),
    );
  }

  searchEaClubs(guildId: string, query: string): Promise<any[]> {
    return firstValueFrom(
      this.http.get<any[]>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/search`,
        {
          headers: this.headers(),
          params: { query },
        },
      ),
    );
  }

  getEaMatches(guildId: string, count = 10): Promise<any[]> {
    return firstValueFrom(
      this.http.get<any[]>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/matches`,
        {
          headers: this.headers(),
          params: { count: String(count) },
        },
      ),
    );
  }

  getEaMembers(guildId: string): Promise<any> {
    return firstValueFrom(
      this.http.get<any>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/members`,
        { headers: this.headers() },
      ),
    );
  }

  postLatestEaMatch(guildId: string, channelId?: string): Promise<{ success: boolean; match?: any; error?: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; match?: any; error?: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/post-latest`,
        { channelId },
        { headers: this.headers() },
      ),
    );
  }

  pollEaNow(guildId: string): Promise<{ postedCount: number; latestMatch?: any }> {
    return firstValueFrom(
      this.http.post<{ postedCount: number; latestMatch?: any }>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/poll-now`,
        {},
        { headers: this.headers() },
      ),
    );
  }
}

