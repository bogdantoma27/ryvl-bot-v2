import { assignToSlot, eaNamesForAssignments, localDateTimeParts, normalizeAssignments, slotForMember } from './lineup-assignments';
import { isUpcomingEvent } from '../events/event-display';

describe('normalizeAssignments', () => {
  it('reads the legacy { slot: name } format', () => {
    expect(normalizeAssignments({ GK: ' Alex ', st: '' })).toEqual({ gk: { name: 'Alex' } });
  });

  it('reads the current format and JSON strings', () => {
    const raw = JSON.stringify({ st: { discordUserId: '42', name: 'Bob' }, lw: { name: 'Guest' } });
    expect(normalizeAssignments(raw)).toEqual({ st: { discordUserId: '42', name: 'Bob' }, lw: { name: 'Guest' } });
  });

  it('ignores garbage', () => {
    expect(normalizeAssignments('not json')).toEqual({});
    expect(normalizeAssignments(['a'])).toEqual({});
    expect(normalizeAssignments(null)).toEqual({});
  });
});

describe('assignToSlot', () => {
  it('moves a member instead of duplicating them', () => {
    const next = assignToSlot({ gk: { discordUserId: '1', name: 'A' } }, 'st', { discordUserId: '1', name: 'A' });
    expect(next).toEqual({ st: { discordUserId: '1', name: 'A' } });
  });

  it('matches legacy name-only entries for slotForMember', () => {
    expect(slotForMember({ cm: { name: 'Zed' } }, { discordUserId: '9', displayName: 'Zed' })).toBe('cm');
    expect(slotForMember({ cm: { discordUserId: '8', name: 'Zed' } }, { discordUserId: '9', displayName: 'Zed' })).toBeNull();
  });
});

describe('eaNamesForAssignments', () => {
  it('maps slots to registered EA names', () => {
    const members = [
      { discordUserId: '1', displayName: 'A', username: null, avatarUrl: null, rsvpStatus: null, eaPlayerName: 'A_EA', preferredPos: 'ST', inGuild: true },
    ];
    expect(eaNamesForAssignments({ st: { discordUserId: '1', name: 'A' }, gk: { name: 'Guest' } }, members)).toEqual({ st: 'A_EA' });
  });
});

describe('localDateTimeParts', () => {
  it('converts to the given timezone', () => {
    expect(localDateTimeParts('2026-01-15T18:30:00Z', 'Europe/Bucharest')).toEqual({ date: '2026-01-15', time: '20:30' });
  });
});

describe('isUpcomingEvent', () => {
  it('uses uppercase server statuses and the next open occurrence', () => {
    expect(isUpcomingEvent({ status: 'ACTIVE', nextOccurrence: { startsAt: '2099-01-01T00:00:00Z' } } as never)).toBe(true);
    expect(isUpcomingEvent({ status: 'active', nextOccurrence: { startsAt: '2099-01-01T00:00:00Z' } } as never)).toBe(false);
    expect(isUpcomingEvent({ status: 'ACTIVE', nextOccurrence: null } as never)).toBe(false);
  });
});
