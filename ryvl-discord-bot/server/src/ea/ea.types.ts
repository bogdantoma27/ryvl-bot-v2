export interface EaClubSearchResult {
  clubId: string;
  name: string;
  currentDivision: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  teamId?: number | null;
  crestAssetId?: string | null;
  crestUrl: string;
}

export interface EaClubDetails {
  name: string;
  clubId: number | string;
  regionId?: number;
  teamId?: number;
  customKit?: {
    stadName?: string;
    crestAssetId?: string;
    kitColor1?: string;
    kitColor2?: string;
    [key: string]: any;
  };
}

export interface EaClubMatchData {
  date: string;
  gameNumber: string;
  goals: string | number;
  goalsAgainst: string | number;
  losses: string | number;
  matchType?: string | number | null;
  result: string;
  score: string | number;
  TEAM: string;
  ties: string | number;
  wins: string | number;
  details?: EaClubDetails;
}

export interface EaMatchPlayerStat {
  playername: string;
  rating: string | number;
  goals: string | number;
  assists: string | number;
  shots: string | number;
  passesmade: string | number;
  passattempts: string | number;
  tacklesmade: string | number;
  tackleattempts: string | number;
  saves: string | number;
  cleansheetsgk: string | number;
  cleansheetsdef: string | number;
  mom: string | number | boolean;
  pos: string;
  redcards: string | number;
  archetypeid?: string;
  secondsPlayed?: string | number;
  [key: string]: any;
}

export interface EaMatchAggregate {
  goals: number;
  goalsconceded: number;
  shots: number;
  passesmade: number;
  passattempts: number;
  tacklesmade: number;
  tackleattempts: number;
  saves: number;
  redcards: number;
  rating: number;
  mom: number;
  wins: number;
  losses: number;
  [key: string]: any;
}

export interface EaRawMatch {
  // Fetch provenance is preserved in stored rawPayload for later re-parsing.
  sourceMatchTypes?: string[];
  matchType?: string | number | null;
  matchId: string;
  timestamp: number;
  timeAgo?: {
    number: number;
    unit: string;
  };
  clubs: Record<string, EaClubMatchData>;
  players: Record<string, Record<string, EaMatchPlayerStat>>;
  aggregate: Record<string, EaMatchAggregate>;
}

export interface ParsedEaPlayer {
  gamertag: string;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  saves: number;
  cleanSheetsGk: number;
  isMom: boolean;
  position: string;
  redCards: number;
}

export interface ParsedEaMatch {
  matchId: string;
  timestamp: Date;
  matchType: string;
  matchTypeLabel?: string;
  trackedClubId: string;
  isHome: boolean;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  trackedClub: {
    id: string;
    name: string;
    score: number;
    crestUrl: string;
    aggregate?: EaMatchAggregate;
  };
  opponentClub: {
    id: string;
    name: string;
    score: number;
    crestUrl: string;
    aggregate?: EaMatchAggregate;
  };
  trackedPlayers: ParsedEaPlayer[];
  opponentPlayers: ParsedEaPlayer[];
  rawMatch: EaRawMatch;
}

export interface ClubTrackerConfigDto {
  guildId: string;
  clubId: string;
  clubName: string;
  platform: string;
  channelId?: string | null;
  enabled: boolean;
  matchTypes: string[];
  pollIntervalSec: number;
  lastPolledAt?: Date | null;
  lastMatchId?: string | null;
}

export interface PublicRosterMember {
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

