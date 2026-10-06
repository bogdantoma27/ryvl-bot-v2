import { changedSettings } from './settings-diff';

describe('changedSettings', () => {
  const loaded = {
    timezone: 'Europe/Bucharest',
    defaultChannelId: null,
    defaultContactChannelId: '111',
    defaultFixturesChannelId: '222',
    ryvlTeamName: 'RYVL Esports',
  };

  it('sends nothing when nothing changed, treating "", null and unset alike', () => {
    expect(changedSettings(loaded, { ...loaded, defaultChannelId: '' as unknown as null, defaultStandingsChannelId: '' })).toEqual({});
  });

  it('sends only the edited fields', () => {
    expect(changedSettings(loaded, { ...loaded, defaultStandingsChannelId: '333', timezone: 'Europe/London' })).toEqual({
      defaultStandingsChannelId: '333',
      timezone: 'Europe/London',
    });
  });

  it('sends null to clear a channel', () => {
    expect(changedSettings(loaded, { ...loaded, defaultFixturesChannelId: '' })).toEqual({ defaultFixturesChannelId: null });
  });
});
