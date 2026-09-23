export type VoteStatus = 'accepted' | 'tentative' | 'declined';

export interface User {
  id: string;
  username: string;
  discriminator?: string;
  global_name?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
}

export interface AuthState {
  authenticated: boolean;
  user: User | null;
}

export interface ChannelOption {
  id: string;
  name: string;
  type?: string;
}

export interface RoleOption {
  id: string;
  name: string;
  color?: string;
}

export interface GuildMemberOption {
  id: string;
  displayName?: string;
  display_name?: string;
  username: string;
  avatarUrl?: string | null;
  avatar_url?: string | null;
}

export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  icon?: string | null;
  botPresent?: boolean;
  memberCount?: number;
}

export interface GuildSettings {
  guildId?: string;
  name?: string;
  iconUrl?: string | null;
  timezone?: string;
  defaultChannelId?: string | null;
  defaultLineupChannelId?: string | null;
  defaultTransfersChannelId?: string | null;
  defaultFixturesChannelId?: string | null;
  defaultStandingsChannelId?: string | null;
  defaultLiveResultsChannelId?: string | null;
  defaultRyvlResultsChannelId?: string | null;
  defaultRyvlFixturesChannelId?: string | null;
  defaultRyvlLeaderboardChannelId?: string | null;
  defaultContactChannelId?: string | null;
  defaultRecruitmentChannelId?: string | null;
  ryvlTeamName?: string;
  botStatus?: 'online' | 'offline' | 'idle';
}

export interface GuildBootstrap {
  id: string;
  name: string;
  iconUrl: string | null;
  defaultTimezone?: string;
  defaultLineupChannelId?: string | null;
  defaultTransfersChannelId?: string | null;
  defaultFixturesChannelId?: string | null;
  defaultStandingsChannelId?: string | null;
  defaultLiveResultsChannelId?: string | null;
  defaultRyvlResultsChannelId?: string | null;
  defaultRyvlFixturesChannelId?: string | null;
  defaultRyvlLeaderboardChannelId?: string | null;
  defaultContactChannelId?: string | null;
  defaultRecruitmentChannelId?: string | null;
  ryvlTeamName?: string;
  channels: ChannelOption[];
  roles: RoleOption[];
  members?: GuildMemberOption[];
  settings?: {
    timezone: string;
    defaultChannelId: string | null;
    defaultLineupChannelId?: string | null;
    defaultTransfersChannelId?: string | null;
    defaultFixturesChannelId?: string | null;
    defaultStandingsChannelId?: string | null;
    defaultLiveResultsChannelId?: string | null;
    defaultRyvlResultsChannelId?: string | null;
    defaultRyvlFixturesChannelId?: string | null;
    defaultRyvlLeaderboardChannelId?: string | null;
    defaultContactChannelId?: string | null;
    defaultRecruitmentChannelId?: string | null;
    ryvlTeamName?: string;
    botActive: boolean;
  };
}

export interface EventRsvp {
  user_discord_id: string;
  display_name: string;
  username?: string;
  avatar_url?: string | null;
  status: VoteStatus;
  updated_at: string;
}

export interface RsvpCounts {
  accepted: number;
  tentative: number;
  declined: number;
  total?: number;
}

export interface EventOccurrence {
  id: string;
  eventId: string;
  startsAt: string;
  closesAt?: string;
  status: 'scheduled' | 'open' | 'closed' | 'cancelled';
  rsvps: EventRsvp[];
  counts: RsvpCounts;
}

export interface EventItem {
  id: string;
  guildId: string;
  title: string;
  description: string;
  location?: string;
  color?: string;
  startsAt: string;
  time?: string;
  durationMinutes?: number;
  duration?: string;
  timezone: string;
  isRecurring: boolean;
  frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  weekdays?: number[];
  monthlyType?: 'day_of_month' | 'nth_weekday';
  endCondition?: 'never' | 'after_count' | 'on_date';
  endCount?: number;
  endDate?: string;
  channelId: string;
  roleMentionIds: string[];
  status: 'active' | 'draft' | 'archived';
  nextOccurrence?: string;
  occurrences: EventOccurrence[];
  rsvpsCount: RsvpCounts;
}

export interface EventCreatePayload {
  title: string;
  description?: string;
  location?: string;
  color?: string;
  date: string;
  time: string;
  duration: string;
  timezone: string;
  isRecurring: boolean;
  frequency?: string;
  weekdays?: number[];
  monthlyType?: string;
  endCondition?: string;
  endCount?: number;
  endDate?: string;
  channelId: string;
  roleMentionIds: string[];
}


export interface VpgStandingsRow {
  position: number;
  teamName: string;
  teamAbbr?: string | null;
  teamSlug?: string | null;
  teamLogoUrl?: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  goalDifference: number;
  points: number;
}

export interface VpgMatchItem {
  id: number;
  datetime: string;
  dateFormattedRo: string;
  dateFormattedEn?: string;
  status: 'complete' | 'scheduled' | string;
  matchDay: number;
  homeName: string;
  awayName: string;
  homeScore?: number | null;
  awayScore?: number | null;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
}

export interface VpgLeaderboardEntry {
  rank: number;
  username: string;
  userAvatarUrl?: string | null;
  nationality?: string | null;
  teamName: string;
  teamLogoUrl?: string | null;
  goals: number;
  assists: number;
  shots?: number | null;
  cleanSheets?: number | null;
  matchesPlayed: number;
  rating?: number | null;
  points?: number | null;
}

export interface RyvlPerformanceStats {
  competitionName: string;
  competitionSlug: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  winRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  goalsPerMatch: number;
  concededPerMatch: number;
  cleanSheets: number;
  currentStreak: ('W' | 'D' | 'L')[];
  homeRecord: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  awayRecord: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  standingsPosition?: number | null;
  totalTeams?: number | null;
}

export interface RyvlCompetition {
  id?: string;
  name: string;
  slug: string;
  communitySlug?: string;
  season?: number;
  active: boolean;
  displayOrder?: number;
}

export interface RyvlPerformanceResponse {
  standings?: VpgStandingsRow[];
  season?: number;
  warnings?: string[];
  teamName: string;
  activeCompetition: string;
  competitions: RyvlCompetition[];
  stats: RyvlPerformanceStats;
  recentResults: VpgMatchItem[];
  upcomingFixtures: VpgMatchItem[];
}

export interface ContactSubmission {
  name: string;
  contact: string;
  topic: string;
  message: string;
  guildId?: string;
}

export interface RecruitmentSubmission {
  gamertag: string;
  discordTag: string;
  primaryPosition: string;
  secondaryPosition?: string;
  platform: string;
  age: number;
  experience?: string;
  guildId?: string;
}

export interface LineupFormationsResponse {
  formations: string[];
  labels_by_formation: Record<string, string>;
  slots_by_formation: Record<string, string[]>;
  coords_by_formation: Record<string, Record<string, [number, number]>>;
  canvas_width: number;
  canvas_height: number;
}

export interface LineupDraft {
  id: string;
  guildId: string;
  title: string;
  channelId: string | null;
  formation: string;
  kickoffAt: string | null;
  timezone: string;
  mentionRoleIds: string[];
  assignments: Record<string, string>;
  createdByDiscordId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineupRenderPayload {
  formation: string;
  title: string;
  players: Record<string, string>;
  kickoff_at?: string | null;
  primary_color?: string;
  secondary_color?: string;
  show_slot_tags?: boolean;
}

export interface LineupPostPayload extends LineupRenderPayload {
  channel_id: string;
  mention_role_ids?: string[];
}

export interface RosterPlayer {
  name: string;
  proName: string;
  proOverall: number;
  position: string;
  positionGroup: 'forward' | 'midfielder' | 'defender' | 'goalkeeper';
  gamesPlayed: number;
  goals: number;
  assists: number;
  ratingAve: number;
  cleanSheets: number;
  manOfTheMatch: number;
  passSuccessRate: number;
  tackleSuccessRate: number;
  shotSuccessRate: number;
  nationality?: string;
  height?: number;
}




export interface VpgNotificationSettings {
  pollIntervalSec: number;
  fixturesTime: string;
  resultsEnabled: boolean;
  ryvlResultsEnabled: boolean;
  fixturesEnabled: boolean;
  ryvlFixturesEnabled: boolean;
  standingsEnabled: boolean;
  ryvlStandingsEnabled: boolean;
}
export interface VpgNotificationResponse {
  config: VpgNotificationSettings & { lastPolledAt?: string | null; lastSuccessAt?: string | null; lastError?: string | null; retryAfter?: string | null };
  timezone: string;
  channels: Record<string, string | null | undefined>;
}
