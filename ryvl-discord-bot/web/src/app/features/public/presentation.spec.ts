import { isRyvlName, romanianMatchDate } from './presentation';

describe('isRyvlName', () => {
  it('matches the club name regardless of case and spacing', () => {
    expect(isRyvlName('RYVL')).toBe(true);
    expect(isRyvlName('  ryvl   Esports ')).toBe(true);
  });

  it('rejects other names and non-strings', () => {
    expect(isRyvlName('Rival FC')).toBe(false);
    expect(isRyvlName(null)).toBe(false);
  });
});

describe('romanianMatchDate', () => {
  it('formats in Bucharest time', () => {
    expect(romanianMatchDate('2026-01-15T18:30:00Z')).toBe('15 Jan 2026, 20:30');
  });

  it('falls back for invalid dates', () => {
    expect(romanianMatchDate('not a date')).toBe('Date to be confirmed');
  });
});
