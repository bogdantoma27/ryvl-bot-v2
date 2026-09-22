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
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  icon?: string | null;
  botPresent?: boolean;
  memberCount?: number;
}

export interface GuildBootstrap {
  id: string;
  name: string;
  iconUrl: string | null;
  defaultTimezone?: string;
  channels: ChannelOption[];
  roles: RoleOption[];
  members?: GuildMemberOption[];
  settings?: {
    timezone: string;
    defaultChannelId: string | null;
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

export interface GuildSettings {
  guildId: string;
  name: string;
  iconUrl: string | null;
  timezone: string;
  defaultChannelId: string | null;
  botStatus: 'online' | 'offline' | 'idle';
}
