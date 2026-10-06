import { GuildSettings } from '../../core/models';

/** Settings the form edits; anything else in GuildSettings is read-only here. */
export const EDITABLE_SETTING_KEYS = [
  'timezone',
  'defaultChannelId',
  'defaultLineupChannelId',
  'defaultTransfersChannelId',
  'defaultFixturesChannelId',
  'defaultStandingsChannelId',
  'defaultLiveResultsChannelId',
  'defaultRyvlResultsChannelId',
  'defaultRyvlFixturesChannelId',
  'defaultRyvlLeaderboardChannelId',
  'defaultContactChannelId',
  'defaultRecruitmentChannelId',
  'ryvlTeamName',
] as const;

export type EditableSettingKey = (typeof EDITABLE_SETTING_KEYS)[number];
export type EditableSettings = Partial<Pick<GuildSettings, EditableSettingKey>>;

const blank = (value: unknown): string | null =>
  value === undefined || value === null || value === '' ? null : String(value);

/**
 * The PATCH body: only fields whose value differs from what was loaded. Unset, null and
 * '' are the same "no channel" value, sent as null so the server clears the setting.
 */
export function changedSettings(loaded: EditableSettings, current: EditableSettings): EditableSettings {
  const patch: Record<string, string | null> = {};
  for (const key of EDITABLE_SETTING_KEYS) {
    const before = blank(loaded[key]);
    const after = blank(current[key]);
    if (before !== after) patch[key] = after;
  }
  return patch as EditableSettings;
}
