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
