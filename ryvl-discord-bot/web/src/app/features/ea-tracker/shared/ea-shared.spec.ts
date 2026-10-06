import { TestBed } from '@angular/core/testing';
import { EaMatchCardComponent } from './ea-match-card.component';
import { EaMemberTableComponent } from './ea-member-table.component';

const match = {
  matchId: 'm1',
  timestamp: '2026-01-15T18:30:00Z',
  outcome: 'WIN',
  matchTypeLabel: 'League Match',
  trackedClub: { id: '1', name: 'RYVL Esports', score: 3, crestUrl: '', aggregate: { shots: 9 } },
  opponentClub: { id: '2', name: 'Rival FC', score: 1, crestUrl: '' },
  trackedPlayers: [{ gamertag: 'Striker', position: 'ST', rating: 8, goals: 2, assists: 0, passesMade: 10, passAttempts: 12, tacklesMade: 1, tackleAttempts: 2, isMom: true }],
  opponentPlayers: [],
};

describe('EaMatchCardComponent', () => {
  it('renders the scoreboard and the theme labels', async () => {
    const fixture = TestBed.createComponent(EaMatchCardComponent);
    fixture.componentRef.setInput('match', match);
    fixture.componentRef.setInput('theme', 'public');
    fixture.detectChanges();
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('🟢 VICTORY');
    expect(text).toContain('RYVL Esports');
    expect(text).toContain('Rival FC');
    expect(text).toContain('View Squad Stats');
    expect(text).not.toContain('Striker');
  });

  it('shows player ratings when expanded and emits the match id on toggle', async () => {
    const fixture = TestBed.createComponent(EaMatchCardComponent);
    fixture.componentRef.setInput('match', match);
    fixture.componentRef.setInput('expanded', true);
    const toggled: string[] = [];
    fixture.componentInstance.toggle.subscribe((id) => toggled.push(id));
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Striker');
    expect(el.textContent).toContain('8.0');
    expect(el.textContent).toContain('Team Aggregate Statistics');
    el.querySelector('button')!.click();
    expect(toggled).toEqual(['m1']);
  });
});

describe('EaMemberTableComponent', () => {
  it('reads the EA average rating field', async () => {
    const fixture = TestBed.createComponent(EaMemberTableComponent);
    fixture.componentRef.setInput('members', [
      { name: 'Keeper', gamesPlayed: 10, ratingAve: '7.46' },
      { name: 'Legacy', gamesPlayed: 1, rating: 6.5 },
      { name: 'Nobody', gamesPlayed: 0 },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    const cells = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).map(
      (row) => row.querySelectorAll('td')[5].textContent!.trim(),
    );
    expect(cells).toEqual(['7.5', '6.5', '-']);
  });
});
