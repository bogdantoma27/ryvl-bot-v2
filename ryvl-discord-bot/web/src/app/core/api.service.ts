import { VpgNotificationSettings, VpgNotificationResponse } from './models';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, isDevMode } from '@angular/core';
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
  LineupPostResult,
  LineupDraftPayload,
  LineupMemberOption,
  LineupMatchOccurrence,
  LineupAssignments,
  UpcomingFixture,
  CreateFixtureEventsResult,
  VpgStandingsRow,
  VpgMatchItem,
  VpgLeaderboardEntry,
  RyvlPerformanceResponse,
  RyvlCompetition,
  ContactSubmission,
  RecruitmentSubmission,
  WebsiteSubmissionItem,
  BotCommandDoc,
  RosterPlayer,
  RegisteredDiscordPlayer,
  PlayerRegistrationAudit,
  TotwConfig,
  TournamentInstance,
  SuperligaMvpLeaderboard,
  SuperligaMvpMatches,
  SuperligaMvpSyncResult,
} from './models';

const DEVELOPMENT_API_BASE_URL = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly sessionTokenKey = 'ryvl_token';

  readonly baseUrl: string = (() => {
    if (typeof window !== 'undefined' && window.location) {
      const { hostname, port } = window.location;

      // Development builds only: a production build must never send the session token
      // to an API origin taken from page globals or localStorage.
      const customApi = isDevMode()
        ? (window as unknown as { __RYVL_API_URL__?: string }).__RYVL_API_URL__ ||
          localStorage.getItem('ryvl_api_url')
        : null;
      if (customApi) {
        return customApi.replace(/\/+$/, '');
      }

      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return port === '4200' ? DEVELOPMENT_API_BASE_URL : '';
      }

      // In production on Oracle VM (served via Caddy/Nginx reverse proxy),
      // keeping requests same-origin avoids hard-coded hostnames and CORS issues.
      return window.location.origin;
    }
    return '';
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

  /** The server pages events (20 by default); ask for its maximum so lists and counts are complete. */
  getEvents(guildId: string, status?: string, limit = 100): Promise<EventItem[]> {
    const params: Record<string, string> = { limit: String(limit) };
    if (status) params['status'] = status;
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

  getUpcomingFixtures(guildId: string): Promise<UpcomingFixture[]> {
    return firstValueFrom(
      this.http.get<UpcomingFixture[]>(`${this.baseUrl}/api/guilds/${guildId}/events/fixtures/upcoming`, {
        headers: this.headers(),
      })
    );
  }

  createEventsFromFixtures(
    guildId: string,
    payload: { channelId: string; matchIds?: number[]; durationMinutes?: number; mentionRoleIds?: string[] }
  ): Promise<CreateFixtureEventsResult> {
    return firstValueFrom(
      this.http.post<CreateFixtureEventsResult>(`${this.baseUrl}/api/guilds/${guildId}/events/fixtures/create`, payload, {
        headers: this.headers(),
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

  cancelOccurrence(guildId: string, eventId: string, occurrenceId: string): Promise<{ status: string; discordSync?: { updated: number; failed: number } }> {
    return firstValueFrom(
      this.http.post<{ status: string; discordSync?: { updated: number; failed: number } }>(
        `${this.baseUrl}/api/guilds/${guildId}/events/${eventId}/occurrences/${occurrenceId}/cancel`,
        {},
        { headers: this.headers() }
      )
    );
  }

  getDiscordLoginUrl(): string {
    const isBot = typeof window !== 'undefined' && window.location.hostname.startsWith('bot.');
    return `${this.baseUrl}/api/auth/discord/start${isBot ? '?origin=bot' : ''}`;
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

  postLineup(guildId: string, payload: LineupPostPayload): Promise<LineupPostResult> {
    return firstValueFrom(
      this.http.post<LineupPostResult>(
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
    payload: LineupDraftPayload,
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
    payload: LineupDraftPayload,
  ): Promise<LineupDraft> {
    return firstValueFrom(
      this.http.patch<LineupDraft>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/drafts/${draftId}`,
        payload,
        { headers: this.headers() },
      ),
    );
  }

  /** Members with their RSVP status for the occurrence, EA name and preferred position. */
  getLineupMembers(guildId: string, occurrenceId?: string | null): Promise<LineupMemberOption[]> {
    return firstValueFrom(
      this.http.get<LineupMemberOption[]>(`${this.baseUrl}/api/guilds/${guildId}/lineup/members`, {
        headers: this.headers(),
        params: occurrenceId ? { occurrence_id: occurrenceId } : {},
      }),
    );
  }

  getLineupOccurrences(guildId: string): Promise<LineupMatchOccurrence[]> {
    return firstValueFrom(
      this.http.get<LineupMatchOccurrence[]>(`${this.baseUrl}/api/guilds/${guildId}/lineup/occurrences`, {
        headers: this.headers(),
      }),
    );
  }

  autoFillLineup(
    guildId: string,
    payload: { formation: string; occurrence_id: string; assignments: LineupAssignments },
  ): Promise<{ assignments: LineupAssignments; unplaced: string[] }> {
    return firstValueFrom(
      this.http.post<{ assignments: LineupAssignments; unplaced: string[] }>(
        `${this.baseUrl}/api/guilds/${guildId}/lineup/auto-fill`,
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

  getEaConfig(guildId?: string | null): Promise<{ config: any; clubInfo: any; overallStats: any }> {
    const url =
      guildId && guildId !== 'default'
        ? `${this.baseUrl}/api/guilds/${guildId}/ea/config`
        : `${this.baseUrl}/api/ea/default`;
    return firstValueFrom(
      this.http.get<{ config: any; clubInfo: any; overallStats: any }>(
        url,
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

  getEaMatches(guildId?: string | null, count = 10): Promise<any[]> {
    const url =
      guildId && guildId !== 'default'
        ? `${this.baseUrl}/api/guilds/${guildId}/ea/matches`
        : `${this.baseUrl}/api/ea/default/matches`;
    return firstValueFrom(
      this.http.get<any[]>(
        url,
        {
          headers: this.headers(),
          params: { count: String(count) },
        },
      ),
    );
  }

  getEaMembers(guildId?: string | null): Promise<any> {
    const url =
      guildId && guildId !== 'default'
        ? `${this.baseUrl}/api/guilds/${guildId}/ea/members`
        : `${this.baseUrl}/api/ea/default/members`;
    return firstValueFrom(
      this.http.get<any>(
        url,
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

  getTrackedClubs(guildId: string): Promise<any[]> {
    return firstValueFrom(
      this.http.get<any[]>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/tracked-clubs`,
        { headers: this.headers() },
      ),
    );
  }

  addTrackedClub(
    guildId: string,
    data: { clubId: string; clubName: string; platform?: string; channelId?: string; enabled?: boolean },
  ): Promise<any> {
    return firstValueFrom(
      this.http.post<any>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/tracked-clubs`,
        data,
        { headers: this.headers() },
      ),
    );
  }

  updateTrackedClub(
    guildId: string,
    clubId: string,
    data: { clubName?: string; platform?: string; channelId?: string | null; enabled?: boolean },
  ): Promise<any> {
    return firstValueFrom(
      this.http.patch<any>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/tracked-clubs/${clubId}`,
        data,
        { headers: this.headers() },
      ),
    );
  }

  removeTrackedClub(guildId: string, clubId: string): Promise<any> {
    return firstValueFrom(
      this.http.delete<any>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/tracked-clubs/${clubId}`,
        { headers: this.headers() },
      ),
    );
  }

  getClubStats(guildId: string, clubId: string, platform?: string): Promise<any> {
    const params = platform ? { platform } : undefined;
    return firstValueFrom(
      this.http.get<any>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/tracked-clubs/${clubId}/stats`,
        { headers: this.headers(), params },
      ),
    );
  }

  getVpgConfig(guildId?: string | null): Promise<any> {
    const url =
      guildId && guildId !== 'default'
        ? `${this.baseUrl}/api/guilds/${guildId}/vpg/config`
        : `${this.baseUrl}/api/vpg/default`;
    return firstValueFrom(
      this.http.get<any>(url, { headers: this.headers() }),
    );
  }

  getVpgTransfers(
    guildId?: string | null,
    limit = 20,
  ): Promise<{ transfers: any[]; processedHistory?: any[]; total: number }> {
    const url =
      guildId && guildId !== 'default'
        ? `${this.baseUrl}/api/guilds/${guildId}/vpg/transfers`
        : `${this.baseUrl}/api/vpg/default/transfers`;
    return firstValueFrom(
      this.http.get<any>(url, {
        headers: this.headers(),
        params: { limit: String(limit) },
      }),
    );
  }

  updateVpgConfig(guildId: string, data: any): Promise<any> {
    return firstValueFrom(
      this.http.patch<any>(
        `${this.baseUrl}/api/guilds/${guildId}/vpg/config`,
        data,
        { headers: this.headers() },
      ),
    );
  }

  pollVpgTransfersNow(guildId: string): Promise<{ success: boolean; postedCount: number }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; postedCount: number }>(
        `${this.baseUrl}/api/guilds/${guildId}/vpg/poll-now`,
        {},
        { headers: this.headers() },
      ),
    );
  }

  postVpgTransferLatest(guildId: string): Promise<{ success: boolean; messageId?: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; messageId?: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/vpg/post-latest`,
        {},
        { headers: this.headers() },
      ),
    );
  }

  getVpgCommunities(q?: string): Promise<{ data: Array<{ id: string | number; name: string; slug: string; logo?: string }> }> {
    const params: Record<string, string> = {};
    if (q) params['q'] = q;
    return firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/api/vpg/communities`, { params }),
    );
  }

  getCommunityLeagues(communitySlug: string): Promise<{ data: Array<{ id: number; name: string; slug: string; logo?: string }> }> {
    return firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/api/vpg/communities/${encodeURIComponent(communitySlug)}/leagues`),
    );
  }

  searchVpgLeagues(q?: string): Promise<{ leagues: Array<{ communitySlug: string; communityName: string; leagueSlug: string; leagueName: string }> }> {
    const params: Record<string, string> = {};
    if (q) params['q'] = q;
    return firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/api/vpg/leagues/search`, { params }),
    );
  }

  // ----------------------------------------------------
  // Superliga România API (Public & Admin)
  // ----------------------------------------------------

  getSuperligaSeasons(): Promise<{ seasons: number[]; latest: number }> {
    return firstValueFrom(
      this.http.get<{ seasons: number[]; latest: number }>(
        `${this.baseUrl}/api/vpg/superliga/seasons`,
      ),
    );
  }

  getSuperligaStandings(
    season?: number,
  ): Promise<{ season: number; standings: VpgStandingsRow[]; total: number }> {
    const params = season ? { season: String(season) } : undefined;
    return firstValueFrom(
      this.http.get<{ season: number; standings: VpgStandingsRow[]; total: number }>(
        `${this.baseUrl}/api/vpg/superliga/standings`,
        { params },
      ),
    );
  }

  getSuperligaFixtures(
    season?: number,
    limit = 20,
  ): Promise<{ season: number; fixtures: VpgMatchItem[]; total: number }> {
    const params: Record<string, string> = { limit: String(limit) };
    if (season) params['season'] = String(season);
    return firstValueFrom(
      this.http.get<{ season: number; fixtures: VpgMatchItem[]; total: number }>(
        `${this.baseUrl}/api/vpg/superliga/fixtures`,
        { params },
      ),
    );
  }

  getSuperligaResults(
    season?: number,
    limit = 20,
  ): Promise<{ season: number; results: VpgMatchItem[]; total: number }> {
    const params: Record<string, string> = { limit: String(limit) };
    if (season) params['season'] = String(season);
    return firstValueFrom(
      this.http.get<{ season: number; results: VpgMatchItem[]; total: number }>(
        `${this.baseUrl}/api/vpg/superliga/results`,
        { params },
      ),
    );
  }

  getSuperligaLeaderboard(
    category: 'strikers' | 'cam' | 'gk' | 'cb' | 'cdm' | 'wingers' = 'strikers',
    season?: number,
  ): Promise<{ category: string; season: number; leaderboard: VpgLeaderboardEntry[]; total: number }> {
    const params: Record<string, string> = { category };
    if (season) params['season'] = String(season);
    return firstValueFrom(
      this.http.get<{ category: string; season: number; leaderboard: VpgLeaderboardEntry[]; total: number }>(
        `${this.baseUrl}/api/vpg/superliga/leaderboard`,
        { params },
      ),
    );
  }

  // ----------------------------------------------------
  // RYVL Team Performance & Multi-Competition Methods
  // ----------------------------------------------------

  getRyvlPerformance(
    competitionSlug?: string,
    guildId?: string,
  ): Promise<RyvlPerformanceResponse> {
    const params = new URLSearchParams();
    if (competitionSlug) params.set('competition', competitionSlug);
    if (guildId) params.set('guildId', guildId);
    const qs = params.toString() ? `?${params.toString()}` : '';

    return firstValueFrom(
      this.http.get<RyvlPerformanceResponse>(
        `${this.baseUrl}/api/vpg/performance${qs}`,
      ),
    );
  }

  getCompetitions(guildId: string): Promise<{ competitions: RyvlCompetition[] }> {
    return firstValueFrom(
      this.http.get<{ competitions: RyvlCompetition[] }>(
        `${this.baseUrl}/api/guilds/${guildId}/vpg/competitions`,
        { headers: this.headers() },
      ),
    );
  }

  updateCompetition(
    guildId: string,
    compId: string,
    data: Partial<RyvlCompetition>,
  ): Promise<{ success: boolean; competition: RyvlCompetition }> {
    return firstValueFrom(
      this.http.patch<{ success: boolean; competition: RyvlCompetition }>(
        `${this.baseUrl}/api/guilds/${guildId}/vpg/competitions/${compId}`,
        data,
        { headers: this.headers() },
      ),
    );
  }

  postRyvlResults(
    guildId: string,
    channelId?: string,
  ): Promise<{ success: boolean; message: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; message: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/vpg/performance/post-results`,
        { channelId },
        { headers: this.headers() },
      ),
    );
  }

  postRyvlFixtures(
    guildId: string,
    channelId?: string,
  ): Promise<{ success: boolean; message: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; message: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/vpg/performance/post-fixtures`,
        { channelId },
        { headers: this.headers() },
      ),
    );
  }

  postRyvlLeaderboard(
    guildId: string,
    channelId?: string,
  ): Promise<{ success: boolean; message: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; message: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/vpg/performance/post-leaderboard`,
        { channelId },
        { headers: this.headers() },
      ),
    );
  }

  // ----------------------------------------------------
  // Public Form Submissions
  // ----------------------------------------------------

  submitContact(
    payload: ContactSubmission,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; message?: string; error?: string }>(
        `${this.baseUrl}/api/public/contact`,
        payload,
      ),
    );
  }

  submitRecruitment(
    payload: RecruitmentSubmission,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; message?: string; error?: string }>(
        `${this.baseUrl}/api/public/recruitment`,
        payload,
      ),
    );
  }

  getWebsiteSubmissions(guildId: string, limit = 50): Promise<WebsiteSubmissionItem[]> {
    return firstValueFrom(
      this.http.get<WebsiteSubmissionItem[]>(`${this.baseUrl}/api/guilds/${guildId}/website-submissions`, {
        headers: this.headers(),
        params: { limit: String(limit) },
      }),
    );
  }

  getBotCommands(): Promise<BotCommandDoc[]> {
    return firstValueFrom(this.http.get<BotCommandDoc[]>(`${this.baseUrl}/api/public/bot-commands`));
  }

  getPublicRoster(): Promise<RosterPlayer[]> {
    return firstValueFrom(
      this.http.get<RosterPlayer[]>(`${this.baseUrl}/api/public/roster?t=${Date.now()}`),
    );
  }
  getSuperligaToday(): Promise<{ date: string; season: number; results: VpgMatchItem[]; fixtures: VpgMatchItem[]; updatedAt: string }> {
    return firstValueFrom(this.http.get<{ date: string; season: number; results: VpgMatchItem[]; fixtures: VpgMatchItem[]; updatedAt: string }>(`${this.baseUrl}/api/vpg/superliga/today`));
  }
  getVpgNotifications(guildId: string): Promise<VpgNotificationResponse> {
    return firstValueFrom(this.http.get<VpgNotificationResponse>(`${this.baseUrl}/api/guilds/${guildId}/vpg/notifications`, { headers: this.headers() }));
  }
  updateVpgNotifications(guildId: string, value: VpgNotificationSettings): Promise<VpgNotificationResponse> {
    return firstValueFrom(this.http.patch<VpgNotificationResponse>(`${this.baseUrl}/api/guilds/${guildId}/vpg/notifications`, value, { headers: this.headers() }));
  }
  checkVpgNotifications(guildId: string): Promise<{ postedCount: number; updatedCount?: number; busy?: boolean }> {
    return firstValueFrom(this.http.post<{ postedCount: number; updatedCount?: number; busy?: boolean }>(`${this.baseUrl}/api/guilds/${guildId}/vpg/notifications/check`, {}, { headers: this.headers() }));
  }
  repairClubLinks(guildId: string): Promise<{ updated: number; skipped: number; failed: number; inspected: number; limit: number }> {
    return firstValueFrom(this.http.post<{ updated: number; skipped: number; failed: number; inspected: number; limit: number }>(`${this.baseUrl}/api/guilds/${guildId}/vpg/notifications/repair-club-links`, {}, { headers: this.headers() }));
  }

  // ----------------------------------------------------
  // EA Pro Clubs Player Registrations & Individual Stats
  // ----------------------------------------------------

  getRegisteredPlayers(guildId: string): Promise<RegisteredDiscordPlayer[]> {
    return firstValueFrom(
      this.http.get<RegisteredDiscordPlayer[]>(`${this.baseUrl}/api/guilds/${guildId}/ea/players`, {
        headers: this.headers(),
      }),
    );
  }

  registerPlayer(
    guildId: string,
    body: { discordUserId: string; eaPlayerName: string; preferredPos?: string },
  ): Promise<RegisteredDiscordPlayer> {
    return firstValueFrom(
      this.http.post<RegisteredDiscordPlayer>(`${this.baseUrl}/api/guilds/${guildId}/ea/players`, body, {
        headers: this.headers(),
      }),
    );
  }

  unregisterPlayer(guildId: string, discordUserId: string): Promise<{ success: boolean; unlinked: string }> {
    return firstValueFrom(
      this.http.delete<{ success: boolean; unlinked: string }>(
        `${this.baseUrl}/api/guilds/${guildId}/ea/players/${discordUserId}`,
        { headers: this.headers() },
      ),
    );
  }

  getPlayerRegistrationAudit(guildId: string): Promise<PlayerRegistrationAudit[]> {
    return firstValueFrom(
      this.http.get<PlayerRegistrationAudit[]>(`${this.baseUrl}/api/guilds/${guildId}/ea/players-audit`, {
        headers: this.headers(),
      }),
    );
  }

  getPlayerStats(guildId: string, identifier: string): Promise<any> {
    return firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/api/guilds/${guildId}/ea/players/${encodeURIComponent(identifier)}/stats`, {
        headers: this.headers(),
      }),
    );
  }

  // ----------------------------------------------------
  // VPG Team of the Week (TOTW)
  // ----------------------------------------------------

  getTotwConfig(guildId: string, leagueSlug = 'Superliga-Romania'): Promise<TotwConfig> {
    return firstValueFrom(
      this.http.get<TotwConfig>(`${this.baseUrl}/api/guilds/${guildId}/vpg/totw/config`, {
        headers: this.headers(),
        params: { leagueSlug },
      }),
    );
  }

  updateTotwConfig(
    guildId: string,
    leagueSlug: string,
    body: { channelId?: string | null; enabled?: boolean; cronSchedule?: string | null },
  ): Promise<TotwConfig> {
    return firstValueFrom(
      this.http.patch<TotwConfig>(`${this.baseUrl}/api/guilds/${guildId}/vpg/totw/config`, body, {
        headers: this.headers(),
        params: { leagueSlug },
      }),
    );
  }

  getTotwPreview(guildId: string, leagueSlug = 'Superliga-Romania', isTots = false): Promise<any> {
    return firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/api/guilds/${guildId}/vpg/totw/preview`, {
        headers: this.headers(),
        params: { leagueSlug, isTots: String(isTots) },
      }),
    );
  }

  postTotw(guildId: string, body: { channelId?: string; isTots?: boolean; leagueSlug?: string }): Promise<{ success: boolean; messageId?: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; messageId?: string }>(`${this.baseUrl}/api/guilds/${guildId}/vpg/totw/post`, body, {
        headers: this.headers(),
      }),
    );
  }

  // ----------------------------------------------------
  // Superliga MVP
  // ----------------------------------------------------

  getSuperligaMvpLeaderboard(guildId: string, opts: { season?: number | null; minMatches?: number | null } = {}): Promise<SuperligaMvpLeaderboard> {
    const params: Record<string, string> = {};
    if (opts.season) params['season'] = String(opts.season);
    if (opts.minMatches) params['minMatches'] = String(opts.minMatches);
    return firstValueFrom(
      this.http.get<SuperligaMvpLeaderboard>(`${this.baseUrl}/api/guilds/${guildId}/superliga-mvp/leaderboard`, {
        headers: this.headers(),
        params,
      }),
    );
  }

  getSuperligaMvpMatches(guildId: string, season?: number | null): Promise<SuperligaMvpMatches> {
    return firstValueFrom(
      this.http.get<SuperligaMvpMatches>(`${this.baseUrl}/api/guilds/${guildId}/superliga-mvp/matches`, {
        headers: this.headers(),
        params: season ? { season: String(season) } : {},
      }),
    );
  }

  syncSuperligaMvp(guildId: string): Promise<SuperligaMvpSyncResult> {
    return firstValueFrom(
      this.http.post<SuperligaMvpSyncResult>(`${this.baseUrl}/api/guilds/${guildId}/superliga-mvp/sync`, {}, {
        headers: this.headers(),
      }),
    );
  }

  postSuperligaMvp(
    guildId: string,
    body: { channelId: string; season?: number | null; minMatches?: number | null; count?: number },
  ): Promise<{ success: boolean; messageId?: string }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; messageId?: string }>(`${this.baseUrl}/api/guilds/${guildId}/superliga-mvp/post`, body, {
        headers: this.headers(),
      }),
    );
  }

  // ----------------------------------------------------
  // Tournaments
  // ----------------------------------------------------

  getTournaments(guildId: string): Promise<TournamentInstance[]> {
    return firstValueFrom(
      this.http.get<TournamentInstance[]>(`${this.baseUrl}/api/guilds/${guildId}/tournaments`, {
        headers: this.headers(),
      }),
    );
  }

  createTournament(
    guildId: string,
    body: { name: string; type?: 'STANDARD' | 'DRAFT'; formation?: string; numTeams?: number },
  ): Promise<TournamentInstance> {
    return firstValueFrom(
      this.http.post<TournamentInstance>(`${this.baseUrl}/api/guilds/${guildId}/tournaments`, body, {
        headers: this.headers(),
      }),
    );
  }

  getTournament(guildId: string, tournamentId: string): Promise<TournamentInstance> {
    return firstValueFrom(
      this.http.get<TournamentInstance>(`${this.baseUrl}/api/guilds/${guildId}/tournaments/${tournamentId}`, {
        headers: this.headers(),
      }),
    );
  }

  provisionTournamentDiscord(guildId: string, tournamentId: string): Promise<{ success: boolean; categoryId: string; channels: any }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; categoryId: string; channels: any }>(
        `${this.baseUrl}/api/guilds/${guildId}/tournaments/${tournamentId}/provision-discord`,
        {},
        { headers: this.headers() },
      ),
    );
  }

  removeTournamentSignup(guildId: string, tournamentId: string, userId: string): Promise<TournamentInstance> {
    return firstValueFrom(
      this.http.delete<TournamentInstance>(`${this.baseUrl}/api/guilds/${guildId}/tournaments/${tournamentId}/signups/${userId}`, {
        headers: this.headers(),
      }),
    );
  }

  recordTournamentResult(
    guildId: string,
    tournamentId: string,
    body: { matchId?: string; homeTeam?: string; awayTeam?: string; homeScore: number; awayScore: number },
  ): Promise<{ tournament: TournamentInstance; completed: boolean }> {
    return firstValueFrom(
      this.http.post<{ tournament: TournamentInstance; completed: boolean }>(
        `${this.baseUrl}/api/guilds/${guildId}/tournaments/${tournamentId}/results`,
        body,
        { headers: this.headers() },
      ),
    );
  }

  toggleTournamentSignups(guildId: string, tournamentId: string): Promise<TournamentInstance> {
    return this.tournamentAction<TournamentInstance>(guildId, tournamentId, 'toggle-signups');
  }

  /** Closes signups and starts play: bracket + fixtures (standard) or the draft (draft). */
  startTournament(guildId: string, tournamentId: string): Promise<{ tournament: TournamentInstance; message: string }> {
    return this.tournamentAction(guildId, tournamentId, 'start');
  }

  autoDraftTournament(guildId: string, tournamentId: string): Promise<TournamentInstance> {
    return this.tournamentAction<TournamentInstance>(guildId, tournamentId, 'draft/auto');
  }

  refreshTournamentDiscord(guildId: string, tournamentId: string): Promise<TournamentInstance> {
    return this.tournamentAction<TournamentInstance>(guildId, tournamentId, 'refresh-discord');
  }

  private tournamentAction<T>(guildId: string, tournamentId: string, action: string): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(`${this.baseUrl}/api/guilds/${guildId}/tournaments/${tournamentId}/${action}`, {}, {
        headers: this.headers(),
      }),
    );
  }
}
