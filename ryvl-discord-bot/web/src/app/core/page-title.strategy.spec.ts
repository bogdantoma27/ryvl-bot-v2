import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { PageTitleStrategy, fallbackPageTitle } from './page-title.strategy';

@Component({ template: '' })
class BlankComponent {}

describe('fallbackPageTitle', () => {
  it('names public pages and ignores query strings', () => {
    expect(fallbackPageTitle('/team')).toBe('Team | RYVL Esports');
    expect(fallbackPageTitle('/club?guildId=123')).toBe('Club Tracker | RYVL Esports');
    expect(fallbackPageTitle('/admin/events/abc')).toBe('Admin | RYVL Esports');
    expect(fallbackPageTitle('/')).toBe('RYVL Esports');
    expect(fallbackPageTitle('/unknown')).toBe('RYVL Esports');
  });
});

describe('PageTitleStrategy', () => {
  it('replaces the previous page title when the next route has none', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'privacy', title: 'Privacy Policy | RYVL Esports', component: BlankComponent },
          { path: 'team', component: BlankComponent },
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    const title = TestBed.inject(Title);
    await router.navigateByUrl('/privacy');
    expect(title.getTitle()).toBe('Privacy Policy | RYVL Esports');
    await router.navigateByUrl('/team');
    expect(title.getTitle()).toBe('Team | RYVL Esports');
  });
});
