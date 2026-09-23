export interface VpgMovementRaw {
  id: number;
  amount?: number | null;
  username: string;
  datetime: string;
  avatar?: string | null;
  from_name?: string | null;
  from_slug?: string | null;
  from_logo?: string | null;
  to_name?: string | null;
  to_slug?: string | null;
  to_logo?: string | null;
}

export interface VpgMovementResponse {
  data: VpgMovementRaw[];
  count: number;
}

export interface VpgCommunityInfo {
  id: number;
  name: string;
  slug: string;
  logo_id?: string | null;
}

export interface VpgPlayerContract {
  id?: number;
  community_id?: number;
  team_id?: number;
  team_name?: string;
  team_slug?: string;
  league_id?: number;
  started_at?: string;
  ended_at?: string;
}

export interface VpgTransferItem {
  id: number;
  username: string;
  fromName: string;
  fromSlug?: string | null;
  fromLogoUrl?: string | null;
  toName: string;
  toSlug?: string | null;
  toLogoUrl?: string | null;
  amount: number;
  amountFormatted: string;
  datetime: string;
  dateFormattedRo: string;
  superligaClubs: string[];
}

export interface UpdateVpgConfigDto {
  channelId?: string | null;
  enabled?: boolean;
  pollIntervalSec?: number;
  leagueSlug?: string;
  leagueName?: string;
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
  homeSlug?: string | null;
  awaySlug?: string | null;
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

export interface RyvlCompetitionDto {
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
  competitions: RyvlCompetitionDto[];
  stats: RyvlPerformanceStats;
  recentResults: VpgMatchItem[];
  upcomingFixtures: VpgMatchItem[];
}

export interface ContactFormPayload {
  name: string;
  contact: string;
  topic: string;
  message: string;
  guildId?: string;
}

export interface RecruitmentFormPayload {
  gamertag: string;
  discordTag: string;
  primaryPosition: string;
  secondaryPosition?: string;
  platform: string;
  age: number;
  experience?: string;
  guildId?: string;
}
