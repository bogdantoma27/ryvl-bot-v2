import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EaTrackedClubsPanelComponent } from './ea-tracked-clubs-panel.component';

describe('EaTrackedClubsPanelComponent', () => {
  const clubs = [
    { id: 'primary:1', clubId: '128199', clubName: 'RYVL Esports', platform: 'common-gen5', enabled: true, elo: 1234, isPrimary: true },
    { id: 't2', clubId: '555', clubName: 'Rival FC', platform: 'common-gen5', enabled: true, elo: 1187, isPrimary: false },
  ];
  let statsCalls: string[];

  beforeEach(() => {
    statsCalls = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            getClubStats: async (_guildId: string, clubId: string) => {
              statsCalls.push(clubId);
              return { clubName: 'Rival FC', elo: 1187, totalMatches: 2, matchWindow: 50, wins: 1, draws: 0, losses: 1, winRate: 50, goalsFor: 3, goalsAgainst: 2, goalDifference: 1, cleanSheets: 1, topScorers: [{ name: 'Nine', goals: 3, assists: 1 }], recentMatches: [] };
            },
          },
        },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(EaTrackedClubsPanelComponent);
    fixture.componentRef.setInput('guildId', '111111111111111111');
    fixture.componentRef.setInput('trackedClubs', clubs);
    fixture.componentRef.setInput('isAdmin', true);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('shows Elo for every club and protects the primary club from removal', async () => {
    const fixture = await render();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Primary');
    expect(rows[0].textContent).toContain('1234');
    expect(rows[1].textContent).toContain('1187');
    expect(rows[0].querySelector('button[title="Remove tracked club"]')).toBeNull();
    expect(rows[1].querySelector('button[title="Remove tracked club"]')).not.toBeNull();
  });

  it('loads and shows the stored-match stats of a club', async () => {
    const fixture = await render();
    const statsButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')[1].querySelectorAll('button'))
      .find((b) => b.textContent!.includes('Stats'))!;
    statsButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(statsCalls).toEqual(['555']);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Rival FC — Tracked Match Stats');
    expect(text).toContain('1W - 0D - 1L');
    expect(text).toContain('Nine');
  });
});
