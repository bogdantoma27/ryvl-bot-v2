import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type VoteStatus = 'accepted' | 'tentative' | 'declined';

export interface AttendanceVote {
  user_discord_id: string;
  display_name: string;
  status: VoteStatus;
  updated_at: string;
}

export interface AttendanceEvent {
  id: number;
  series_id: number;
  occurrence_number: number;
  starts_at: string;
  closes_at: string;
  status: 'scheduled' | 'open' | 'closed' | 'cancelled';
  message_id: string | null;
  updated_at: string;
  votes: AttendanceVote[];
}

export interface AttendanceSeries {
  id: number;
  guild_id: string;
  channel_id: string;
  title: string;
  description: string;
  timezone: string;
  recurrence: 'none' | 'weekly';
  repeat_count: number | null;
  created_by_discord_id: string;
  events: AttendanceEvent[];
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
  default_timezone: string;
  default_attendance_channel_id: string;
  default_lineup_channel_id: string;
  default_attendance_role_ids: string[];
  channels: ChannelOption[];
  members: GuildMemberOption[];
  roles: RoleOption[];
}

export interface AdminSettings {
  guild_id: string;
  default_timezone: string;
  default_attendance_channel_id: string;
  default_lineup_channel_id: string;
  admin_role_ids: string[];
  default_attendance_role_ids: string[];
}

export interface DiagnosticsResponse {
  status: 'ok' | 'degraded';
  checked_at: string;
  uptime_seconds: number | null;
  app: {
    environment: string;
    public_api_base_url: string;
    guild_id_configured: boolean;
  };
  database: {
    ok: boolean;
    error: string;
  };
  scheduler: {
    running: boolean;
    interval_seconds: number;
    last_tick_at: string | null;
    last_error: string | null;
  };
  discord: {
    bot_connected: boolean;
    guild_reachable: boolean;
    error: string;
  };
  audit_logs: Array<{
    id: number;
    actor_discord_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    details: string;
    created_at: string;
  }>;
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
  slots_by_formation: Record<string, string[]>;
}

export interface LineupPayload {
  formation: string;
  title: string;
  players: Record<string, string>;
  kickoff_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = (() => {
    const runtimeValue = String((globalThis as { __RYVL_API_BASE_URL__?: string }).__RYVL_API_BASE_URL__ || '').trim();
    if (runtimeValue) return runtimeValue;
    if (typeof window !== 'undefined' && window.location) {
      const { hostname, port, origin } = window.location;
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '4200') {
        return 'http://localhost:8000';
      }
      return origin;
    }
    return '';
  })();

  private readonly options = { withCredentials: true as const };

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

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/api/auth/logout`, {}, this.options));
  }

  getBootstrap(): Promise<BootstrapResponse> {
    return firstValueFrom(this.http.get<BootstrapResponse>(`${this.baseUrl}/api/admin/bootstrap`, this.options));
  }

  getAdminSettings(): Promise<AdminSettings> {
    return firstValueFrom(this.http.get<AdminSettings>(`${this.baseUrl}/api/admin/settings`, this.options));
  }

  updateAdminSettings(payload: {
    default_timezone: string;
    default_attendance_channel_id: string;
    default_lineup_channel_id: string;
    default_attendance_role_ids: string[];
  }): Promise<AdminSettings> {
    return firstValueFrom(this.http.put<AdminSettings>(`${this.baseUrl}/api/admin/settings`, payload, this.options));
  }

  getDiagnostics(): Promise<DiagnosticsResponse> {
    return firstValueFrom(this.http.get<DiagnosticsResponse>(`${this.baseUrl}/api/admin/diagnostics`, this.options));
  }

  getHealth(): Promise<HealthResponse> {
    return firstValueFrom(this.http.get<HealthResponse>(`${this.baseUrl}/healthz`, this.options));
  }

  listAttendance(): Promise<AttendanceSeries[]> {
    return firstValueFrom(this.http.get<AttendanceSeries[]>(`${this.baseUrl}/api/admin/attendance/events`, this.options));
  }

  createAttendance(payload: {
    channel_id: string;
    title: string;
    description: string;
    timezone: string;
    mention_role_ids?: string[];
    starts_at: string;
    recurrence: 'none' | 'weekly';
    repeat_count: number | null;
  }): Promise<AttendanceSeries> {
    return firstValueFrom(this.http.post<AttendanceSeries>(`${this.baseUrl}/api/admin/attendance/events`, payload, this.options));
  }

  setAttendanceVote(eventId: number, payload: { user_discord_id: string; display_name: string; status: VoteStatus }): Promise<AttendanceEvent> {
    return firstValueFrom(this.http.post<AttendanceEvent>(`${this.baseUrl}/api/admin/attendance/events/${eventId}/votes`, payload, this.options));
  }

  removeAttendanceVote(eventId: number, userDiscordId: string): Promise<AttendanceEvent> {
    return firstValueFrom(this.http.delete<AttendanceEvent>(`${this.baseUrl}/api/admin/attendance/events/${eventId}/votes/${encodeURIComponent(userDiscordId)}`, this.options));
  }

  rescheduleAttendanceEvent(eventId: number, payload: { starts_at: string; scope: 'this_occurrence_only' | 'this_and_following' }): Promise<AttendanceEvent> {
    return firstValueFrom(this.http.post<AttendanceEvent>(`${this.baseUrl}/api/admin/attendance/events/${eventId}/reschedule`, payload, this.options));
  }

  editAttendanceEvent(eventId: number, payload: {
    title: string;
    description: string;
    timezone: string;
    starts_at: string;
    scope: 'this_occurrence_only' | 'this_and_following';
    expected_updated_at?: string | null;
    vote_updates?: Array<{ user_discord_id: string; display_name: string; status: VoteStatus }>;
  }): Promise<AttendanceEvent> {
    return firstValueFrom(this.http.post<AttendanceEvent>(`${this.baseUrl}/api/admin/attendance/events/${eventId}/edit`, payload, this.options));
  }

  closeAttendanceEvent(eventId: number): Promise<AttendanceEvent> {
    return firstValueFrom(this.http.post<AttendanceEvent>(`${this.baseUrl}/api/admin/attendance/events/${eventId}/close`, {}, this.options));
  }

  cancelAttendanceEvent(eventId: number): Promise<AttendanceEvent> {
    return firstValueFrom(this.http.post<AttendanceEvent>(`${this.baseUrl}/api/admin/attendance/events/${eventId}/cancel`, {}, this.options));
  }

  deleteAttendanceEvent(eventId: number): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`${this.baseUrl}/api/admin/attendance/events/${eventId}`, this.options));
  }

  listLineupFormations(): Promise<LineupFormationsResponse> {
    return firstValueFrom(this.http.get<LineupFormationsResponse>(`${this.baseUrl}/api/admin/lineup/formations`, this.options));
  }

  async renderLineupPreview(payload: LineupPayload): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/admin/lineup/render`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error('Failed to render lineup preview.');
    }
    return response.blob();
  }

  postLineup(payload: {
    channel_id: string;
    title: string;
    formation: string;
    players: Record<string, string>;
    kickoff_at: string | null;
  }): Promise<LineupPostResult> {
    return firstValueFrom(this.http.post<LineupPostResult>(`${this.baseUrl}/api/admin/lineup/post`, payload, this.options));
  }

  sendLineup(payload: {
    channel_id: string;
    title: string;
    formation: string;
    players: Record<string, string>;
    kickoff_at: string | null;
    mention_role_ids?: string[];
    message_prefix?: string | null;
    message_suffix?: string | null;
    filename?: string | null;
  }): Promise<LineupPostResult> {
    return firstValueFrom(this.http.post<LineupPostResult>(`${this.baseUrl}/api/admin/lineup/send`, payload, this.options));
  }
}
