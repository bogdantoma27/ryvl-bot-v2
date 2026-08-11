import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

// Fallback API origin used in production when not served from localhost.
const PRODUCTION_API_BASE_URL = 'https://ryvl-bot-api.onrender.com';

export type VoteStatus = 'accepted' | 'tentative' | 'declined';

export interface EventVote {
  user_discord_id: string;
  display_name: string;
  status: VoteStatus;
  updated_at: string;
}

export interface EventOccurrence {
  id: number;
  series_id: number;
  occurrence_number: number;
  batch_number: number;
  weekday: number | null;
  publish_at: string;
  starts_at: string;
  closes_at: string;
  status: 'scheduled' | 'open' | 'closed' | 'cancelled';
  message_id: string | null;
  updated_at: string;
  votes: EventVote[];
}

export interface EventSeries {
  id: number;
  guild_id: string;
  channel_id: string;
  title: string;
  description: string;
  timezone: string;
  recurrence: 'none' | 'weekly';
  repeat_count: number | null;
  anchor_starts_at: string | null;
  weekdays: number[];
  ends_mode: 'never' | 'after_count' | 'on_date';
  end_date: string | null;
  post_timing_mode: 'at_event_start' | 'before_event_start' | 'when_previous_event_ends' | 'after_previous_event_ends' | 'at_specific_time';
  post_timing_value: string | null;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  created_by_discord_id: string;
  events: EventOccurrence[];
}

export interface ChannelOption {
  id: string;
  name: string;
}

export interface RoleOption {
  id: string;
  name: string;
}

export interface GuildMemberOption {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export interface BootstrapResponse {
  guild_id: string;
  guild_name: string | null;
  guild_icon_url: string | null;
  default_timezone: string;
  channels: ChannelOption[];
  members: GuildMemberOption[];
  roles: RoleOption[];
}

export interface HealthResponse {
  status: string;
}

export interface AuthState {
  authenticated: boolean;
  user: {
    id: string;
    username: string;
    discriminator: string;
    global_name: string | null;
    avatar: string | null;
  };
}

export interface LineupPostResult {
  ok: boolean;
  channel_id: string;
  message_id: string;
}

export interface LineupFormationsResponse {
  formations: string[];
  labels_by_formation: Record<string, string>;
  slots_by_formation: Record<string, string[]>;
  coords_by_formation: Record<string, Record<string, [number, number]>>;
  canvas_width: number;
  canvas_height: number;
}

export interface LineupPayload {
  formation: string;
  title: string;
  players: Record<string, string>;
  kickoff_at: string | null;
}

export interface LineupDraft {
  id: number;
  title: string;
  channel_id: string;
  formation: string;
  kickoff_at: string | null;
  mention_role_ids: string[];
  assignments: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface LineupDraftPayload {
  title: string;
  channel_id: string;
  formation: string;
  kickoff_at: string | null;
  mention_role_ids: string[];
  assignments: Record<string, string>;
}

export interface VpgLeague {
  slug: string;
  name: string;
  logo_url: string | null;
  team_count: number | null;
  community_slug: string;
  community_name: string;
}

export interface VpgCommunity {
  slug: string;
  name: string;
  logo_url: string | null;
}

export interface VpgStandingRow {
  position: number;
  team_name: string;
  team_abbr: string;
  team_logo_url: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  score_for: number;
  score_against: number;
  goal_difference: number;
  points: number;
}

export interface VpgMatch {
  id: number;
  match_day: string | null;
  home_name: string;
  home_logo_url: string | null;
  away_name: string;
  away_logo_url: string | null;
  home_score: number | null;
  away_score: number | null;
  datetime: string | null;
}

export interface VpgSchedule {
  id: number;
  league_slug: string;
  league_name: string;
  content_type: 'fixtures' | 'results' | 'standings';
  channel_id: string;
  weekdays: number[];
  post_time: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  last_error: string | null;
}

export interface VpgTransferFeed {
  id: number;
  community_slug: string;
  channel_id: string;
  poll_interval_minutes: number;
  enabled: boolean;
  last_polled_at: string | null;
  last_error: string | null;
}

export interface VpgTransferRecord {
  id: number;
  username: string;
  from_name: string | null;
  to_name: string | null;
  amount: number | null;
  occurred_at: string | null;
  message_id: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly sessionStorageKey = 'ryvl_session_token';
  private readonly baseUrl = (() => {
    if (typeof window !== 'undefined' && window.location) {
      const { hostname, port } = window.location;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return port === '4200' ? 'http://localhost:8000' : window.location.origin;
      }
    }
    return PRODUCTION_API_BASE_URL;
  })();

  private readonly options = { withCredentials: true as const };

  getSessionToken(): string {
    if (typeof window === 'undefined') return '';
    return window.sessionStorage.getItem(this.sessionStorageKey) || '';
  }

  setSessionToken(value: string | null): void {
    if (typeof window === 'undefined') return;
    if (value) {
      window.sessionStorage.setItem(this.sessionStorageKey, value);
      return;
    }
    window.sessionStorage.removeItem(this.sessionStorageKey);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getDiscordLoginUrl(returnTo?: string): string {
    const url = new URL(`${this.baseUrl}/api/auth/discord/start`);
    if (returnTo) url.searchParams.set('return_to', returnTo);
    return url.toString();
  }

  authMe(): Promise<AuthState> {
    return firstValueFrom(this.http.get<AuthState>(`${this.baseUrl}/api/auth/me`, this.options));
  }

  getPublicGuildInfo(): Promise<{ guild_name: string | null; guild_icon_url: string | null }> {
    return firstValueFrom(this.http.get<{ guild_name: string | null; guild_icon_url: string | null }>(`${this.baseUrl}/api/public/guild`));
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/api/auth/logout`, {}, this.options))
      .finally(() => this.setSessionToken(null));
  }

  getBootstrap(): Promise<BootstrapResponse> {
    return firstValueFrom(this.http.get<BootstrapResponse>(`${this.baseUrl}/api/admin/bootstrap`, this.options));
  }

  getHealth(): Promise<HealthResponse> {
    return firstValueFrom(this.http.get<HealthResponse>(`${this.baseUrl}/healthz`, this.options));
  }

  getVpgSettings(): Promise<{ community_slug: string; community_slugs: string[]; timezone: string }> {
    return firstValueFrom(this.http.get<{ community_slug: string; community_slugs: string[]; timezone: string }>(`${this.baseUrl}/api/admin/vpg/settings`, this.options));
  }
  updateVpgSettings(payload: { community_slug: string; community_slugs?: string[]; timezone: string }): Promise<{ community_slug: string; community_slugs: string[]; timezone: string }> {
    return firstValueFrom(this.http.put<{ community_slug: string; community_slugs: string[]; timezone: string }>(`${this.baseUrl}/api/admin/vpg/settings`, payload, this.options));
  }

  listVpgCommunities(): Promise<VpgCommunity[]> {
    return firstValueFrom(this.http.get<VpgCommunity[]>(`${this.baseUrl}/api/admin/vpg/communities`, this.options));
  }

  listVpgLeagues(community?: string): Promise<VpgLeague[]> {
    return firstValueFrom(this.http.get<VpgLeague[]>(`${this.baseUrl}/api/admin/vpg/leagues`, { ...this.options, params: community ? { community } : {} }));
  }

  listVpgSeasons(leagueSlug: string): Promise<number[]> {
    return firstValueFrom(this.http.get<number[]>(`${this.baseUrl}/api/admin/vpg/leagues/${encodeURIComponent(leagueSlug)}/seasons`, this.options));
  }

  getVpgStandings(leagueSlug: string, season: number): Promise<VpgStandingRow[]> {
    return firstValueFrom(this.http.get<VpgStandingRow[]>(`${this.baseUrl}/api/admin/vpg/leagues/${encodeURIComponent(leagueSlug)}/standings`, { ...this.options, params: { season } }));
  }

  getVpgMatches(leagueSlug: string, status: 'scheduled' | 'complete', season: number): Promise<VpgMatch[]> {
    return firstValueFrom(this.http.get<VpgMatch[]>(`${this.baseUrl}/api/admin/vpg/leagues/${encodeURIComponent(leagueSlug)}/matches`, { ...this.options, params: { status, season } }));
  }

  previewVpg(payload: { league_slug: string; content_type: 'fixtures' | 'results' | 'standings'; season: number }): Promise<Blob> {
    return firstValueFrom(this.http.post(`${this.baseUrl}/api/admin/vpg/preview`, payload, { ...this.options, responseType: 'blob' }));
  }

  postVpg(payload: { league_slug: string; content_type: 'fixtures' | 'results' | 'standings'; season: number; channel_id: string }): Promise<{ ok: string; channel_id: string; message_id: string }> {
    return firstValueFrom(this.http.post<{ ok: string; channel_id: string; message_id: string }>(`${this.baseUrl}/api/admin/vpg/post`, payload, this.options));
  }

  listVpgSchedules(): Promise<VpgSchedule[]> { return firstValueFrom(this.http.get<VpgSchedule[]>(`${this.baseUrl}/api/admin/vpg/schedules`, this.options)); }
  createVpgSchedule(payload: Omit<VpgSchedule, 'id' | 'last_run_at' | 'last_error'>): Promise<VpgSchedule> { return firstValueFrom(this.http.post<VpgSchedule>(`${this.baseUrl}/api/admin/vpg/schedules`, payload, this.options)); }
  updateVpgSchedule(id: number, payload: Omit<VpgSchedule, 'id' | 'last_run_at' | 'last_error'>): Promise<VpgSchedule> { return firstValueFrom(this.http.put<VpgSchedule>(`${this.baseUrl}/api/admin/vpg/schedules/${id}`, payload, this.options)); }
  runVpgSchedule(id: number): Promise<{ ok: boolean }> { return firstValueFrom(this.http.post<{ ok: boolean }>(`${this.baseUrl}/api/admin/vpg/schedules/${id}/run-now`, {}, this.options)); }
  setVpgScheduleEnabled(id: number, enabled: boolean): Promise<VpgSchedule> { return firstValueFrom(this.http.patch<VpgSchedule>(`${this.baseUrl}/api/admin/vpg/schedules/${id}/enabled`, {}, { ...this.options, params: { enabled } })); }
  deleteVpgSchedule(id: number): Promise<void> { return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/api/admin/vpg/schedules/${id}`, this.options)); }
  getVpgTransferFeed(): Promise<VpgTransferFeed | null> { return firstValueFrom(this.http.get<VpgTransferFeed | null>(`${this.baseUrl}/api/admin/vpg/transfers/feed`, this.options)); }
  updateVpgTransferFeed(payload: Omit<VpgTransferFeed, 'id' | 'last_polled_at' | 'last_error'>): Promise<VpgTransferFeed> { return firstValueFrom(this.http.put<VpgTransferFeed>(`${this.baseUrl}/api/admin/vpg/transfers/feed`, payload, this.options)); }
  pollVpgTransfers(): Promise<{ posted: number }> { return firstValueFrom(this.http.post<{ posted: number }>(`${this.baseUrl}/api/admin/vpg/transfers/poll-now`, {}, this.options)); }
  previewVpgTransfer(communitySlug?: string): Promise<Blob> { return firstValueFrom(this.http.post(`${this.baseUrl}/api/admin/vpg/transfers/preview`, {}, { ...this.options, responseType: 'blob', params: communitySlug ? { community_slug: communitySlug } : {} })); }
  listVpgTransfers(): Promise<VpgTransferRecord[]> { return firstValueFrom(this.http.get<VpgTransferRecord[]>(`${this.baseUrl}/api/admin/vpg/transfers/recent`, this.options)); }

  listEvents(): Promise<EventSeries[]> {
    return firstValueFrom(this.http.get<EventSeries[]>(`${this.baseUrl}/api/admin/events/events`, this.options));
  }

  listEventDrafts(): Promise<EventSeries[]> {
    return firstValueFrom(this.http.get<EventSeries[]>(`${this.baseUrl}/api/admin/events/drafts`, this.options));
  }

  listRecurringEvents(): Promise<EventSeries[]> {
    return firstValueFrom(this.http.get<EventSeries[]>(`${this.baseUrl}/api/admin/events/recurring`, this.options));
  }

  publishEventDraft(seriesId: number): Promise<EventSeries> {
    return firstValueFrom(this.http.post<EventSeries>(`${this.baseUrl}/api/admin/events/series/${seriesId}/publish`, {}, this.options));
  }

  updateEventDraft(seriesId: number, payload: Parameters<ApiService['createEvent']>[0]): Promise<EventSeries> {
    return firstValueFrom(this.http.put<EventSeries>(`${this.baseUrl}/api/admin/events/series/${seriesId}/draft`, payload, this.options));
  }

  createEvent(payload: {
    channel_id: string;
    title: string;
    description: string;
    timezone: string;
    mention_role_ids?: string[];
    starts_at: string;
    publish_time?: string | null;
    recurrence: 'none' | 'weekly';
    repeat_count: number | null;
    weekdays?: number[];
    ends_mode?: 'never' | 'after_count' | 'on_date';
    end_date?: string | null;
    post_timing_mode?: 'at_event_start' | 'before_event_start' | 'when_previous_event_ends' | 'after_previous_event_ends' | 'at_specific_time';
    post_timing_value?: string | null;
    save_as_draft?: boolean;
  }): Promise<EventSeries> {
    return firstValueFrom(this.http.post<EventSeries>(`${this.baseUrl}/api/admin/events/events`, payload, this.options));
  }

  setEventVote(eventId: number, payload: { user_discord_id: string; display_name: string; status: VoteStatus }): Promise<EventOccurrence> {
    return firstValueFrom(this.http.post<EventOccurrence>(`${this.baseUrl}/api/admin/events/events/${eventId}/votes`, payload, this.options));
  }

  removeEventVote(eventId: number, userDiscordId: string): Promise<EventOccurrence> {
    return firstValueFrom(this.http.delete<EventOccurrence>(`${this.baseUrl}/api/admin/events/events/${eventId}/votes/${encodeURIComponent(userDiscordId)}`, this.options));
  }

  rescheduleEvent(eventId: number, payload: { starts_at: string; publish_time?: string | null; scope: 'this_occurrence_only' | 'this_and_following' }): Promise<EventOccurrence> {
    return firstValueFrom(this.http.post<EventOccurrence>(`${this.baseUrl}/api/admin/events/events/${eventId}/reschedule`, payload, this.options));
  }

  editEvent(eventId: number, payload: {
    title: string;
    description: string;
    timezone: string;
    starts_at: string;
    publish_time?: string | null;
    scope: 'this_occurrence_only' | 'this_and_following';
    expected_updated_at?: string | null;
    vote_updates?: Array<{ user_discord_id: string; display_name: string; status: VoteStatus }>;
  }): Promise<EventOccurrence> {
    return firstValueFrom(this.http.post<EventOccurrence>(`${this.baseUrl}/api/admin/events/events/${eventId}/edit`, payload, this.options));
  }

  closeEvent(eventId: number): Promise<EventOccurrence> {
    return firstValueFrom(this.http.post<EventOccurrence>(`${this.baseUrl}/api/admin/events/events/${eventId}/close`, {}, this.options));
  }

  cancelEvent(eventId: number): Promise<EventOccurrence> {
    return firstValueFrom(this.http.post<EventOccurrence>(`${this.baseUrl}/api/admin/events/events/${eventId}/cancel`, {}, this.options));
  }

  deleteEvent(eventId: number): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`${this.baseUrl}/api/admin/events/events/${eventId}`, this.options));
  }

  listLineupFormations(): Promise<LineupFormationsResponse> {
    return firstValueFrom(this.http.get<LineupFormationsResponse>(`${this.baseUrl}/api/admin/lineup/formations`, this.options));
  }

  async renderLineupPreview(payload: LineupPayload): Promise<Blob> {
    const sessionToken = this.getSessionToken();
    const response = await fetch(`${this.baseUrl}/api/admin/lineup/render`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error('Failed to render lineup preview.');
    }
    return response.blob();
  }

  sendLineup(payload: {
    channel_id: string;
    title: string;
    formation: string;
    players: Record<string, string>;
    kickoff_at: string | null;
    mention_role_ids?: string[];
  }): Promise<LineupPostResult> {
    return firstValueFrom(this.http.post<LineupPostResult>(`${this.baseUrl}/api/admin/lineup/send`, payload, this.options));
  }

  listLineupDrafts(): Promise<LineupDraft[]> {
    return firstValueFrom(this.http.get<LineupDraft[]>(`${this.baseUrl}/api/admin/lineup/drafts`, this.options));
  }

  saveLineupDraft(payload: LineupDraftPayload): Promise<LineupDraft> {
    return firstValueFrom(this.http.post<LineupDraft>(`${this.baseUrl}/api/admin/lineup/drafts`, payload, this.options));
  }

  updateLineupDraft(draftId: number, payload: LineupDraftPayload): Promise<LineupDraft> {
    return firstValueFrom(this.http.put<LineupDraft>(`${this.baseUrl}/api/admin/lineup/drafts/${draftId}`, payload, this.options));
  }

  deleteLineupDraft(draftId: number): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`${this.baseUrl}/api/admin/lineup/drafts/${draftId}`, this.options));
  }
}
