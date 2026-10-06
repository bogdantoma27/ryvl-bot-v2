import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { HomeComponent } from './home.component';
import { LiveComponent } from './live.component';

// An API outage must never be presented as "there are no matches".
describe('public pages during a VPG outage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            getRyvlPerformance: async () => { throw new Error('503'); },
            getSuperligaToday: async () => { throw new Error('503'); },
          },
        },
      ],
    });
  });

  it('home says results are unavailable, not that none were published', async () => {
    const fixture = TestBed.createComponent(HomeComponent);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('temporarily unavailable');
    expect(text).not.toContain('No completed RYVL matches');
  });

  it('match center shows only the error before its first successful load', async () => {
    const fixture = TestBed.createComponent(LiveComponent);
    fixture.detectChanges(); // ngOnInit starts the first load
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('VPG is temporarily unavailable');
    expect(text).not.toContain('There are no scheduled matches today');
    fixture.destroy();
  });
});
