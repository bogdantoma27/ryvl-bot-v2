import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/api.service';
import { VpgMatchItem } from '../../core/models';
import { ResultsComponent } from './results.component';

const match = (id: number, homeName: string): VpgMatchItem =>
  ({ id, homeName, awayName: 'Rival FC', homeScore: 1, awayScore: 0, status: 'complete', datetime: '2026-10-01T18:00:00Z', matchDay: 1 }) as VpgMatchItem;

describe('ResultsComponent', () => {
  let getResults: (season: number) => Promise<{ season: number; results: VpgMatchItem[]; total: number }>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiService,
          useValue: {
            getSuperligaSeasons: async () => ({ seasons: [2, 1], latest: 2 }),
            getSuperligaResults: (season: number) => getResults(season),
          },
        },
      ],
    });
  });

  it('shows an outage with a retry instead of "no results"', async () => {
    getResults = async () => { throw new Error('503'); };
    const fixture = TestBed.createComponent(ResultsComponent);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(fixture.componentInstance.loadError()).toBeTruthy();
    expect(text).toContain('could not be loaded');
    expect(text).not.toContain('No Match Results Found');

    getResults = async (season) => ({ season, results: [match(1, 'RYVL')], total: 1 });
    await fixture.componentInstance.loadResults();
    expect(fixture.componentInstance.loadError()).toBeNull();
    expect(fixture.componentInstance.matches().length).toBe(1);
  });

  it('keeps the latest season when an older request answers last', async () => {
    let releaseSlow!: () => void;
    getResults = (season) => season === 1
      ? new Promise((resolve) => { releaseSlow = () => resolve({ season, results: [match(10, 'Old')], total: 1 }); })
      : Promise.resolve({ season, results: [match(20, 'New')], total: 1 });
    const component = TestBed.createComponent(ResultsComponent).componentInstance;
    component.selectedSeason.set(1);
    const slow = component.loadResults();
    component.selectedSeason.set(2);
    await component.loadResults();
    releaseSlow();
    await slow;
    expect(component.matches().map((m) => m.id)).toEqual([20]);
    expect(component.isLoading()).toBe(false);
  });
});
