import { GuildHealth } from '../../core/models';
import { healthCards } from './dashboard-health.component';
import { adminSection } from '../admin-shell/admin-shell.component';

const off = { status: 'off' as const, reason: 'Not set up' };
const health: GuildHealth = {
  generatedAt: '2026-10-06T12:00:00Z',
  eaTracker: { ...off, configured: false, enabled: false, clubId: null, clubName: null, channelId: null, lastPolledAt: null, pollIntervalSec: null, pendingPosts: 0, failedPosts: 0 },
  trackedClubs: { ...off, total: 0, enabled: 0, clubs: [] },
  vpgTransfers: { status: 'error', reason: 'No channel selected', configured: true, enabled: true, channelId: null, lastPolledAt: null, pollIntervalSec: 120 },
  vpgNotifications: { ...off, configured: false, lastPolledAt: null, lastSuccessAt: null, lastError: null, retryAfter: null, pollIntervalSec: null },
  superligaMvp: { status: 'ok', reason: '3 linked', season: 7, counts: { LINKED: 3 }, lastAttemptAt: null, lastError: null },
  totw: { ...off, configs: [] },
  events: { status: 'ok', reason: 'Next: Scrim', nextOccurrence: { eventId: 'e', title: 'Scrim', startsAt: '2026-10-07T18:00:00Z' }, stuckClaims: 0, overdue: 0 },
};

describe('healthCards', () => {
  it('links every feed to the tab that manages it', () => {
    const cards = healthCards(health, true);
    expect(cards.map((c) => c.key)).toEqual(['eaTracker', 'trackedClubs', 'vpgTransfers', 'vpgNotifications', 'superligaMvp', 'totw', 'events']);
    expect(cards.find((c) => c.key === 'vpgTransfers')).toMatchObject({ status: 'error', link: { path: ['/admin', 'superliga'], queryParams: { tab: 'transfers' } } });
    expect(cards.find((c) => c.key === 'totw')!.link!.queryParams).toEqual({ tab: 'awards', view: 'totw' });
    expect(cards.find((c) => c.key === 'superligaMvp')!.detail).toContain('Season 7');
  });

  it('hides the RYVL-only notifications card on other servers while it is off', () => {
    expect(healthCards(health, false).some((c) => c.key === 'vpgNotifications')).toBe(false);
    const failing = { ...health, vpgNotifications: { ...health.vpgNotifications, status: 'error' as const, reason: 'VPG down' } };
    const card = healthCards(failing, false).find((c) => c.key === 'vpgNotifications');
    expect(card?.link).toBeNull();
  });
});

describe('adminSection', () => {
  it('maps admin URLs to their sidebar section', () => {
    expect(adminSection('/admin/dashboard')).toBe('overview');
    expect(adminSection('/admin/club?tab=lineup')).toBe('club');
    expect(adminSection('/admin/events/abc')).toBe('community');
    expect(adminSection('/admin/server#x')).toBe('server');
    expect(adminSection('/admin/login')).toBeNull();
    expect(adminSection('/club')).toBeNull();
  });
});
