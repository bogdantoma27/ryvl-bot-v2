import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const DEFAULT_PAGE_TITLE = 'RYVL Esports';

/** Titles of public pages whose route sets none, keyed by the first path segment. */
const PUBLIC_PAGE_TITLES: Readonly<Record<string, string>> = {
  team: 'Team',
  performance: 'Team performance',
  results: 'Match results',
  fixtures: 'Fixtures',
  standings: 'Standings',
  'match-center': 'Match Center',
  club: 'Club Tracker',
  recruitment: 'Recruitment',
  about: 'About',
  contact: 'Contact',
};

/** The document title for a URL whose route has no `title`. */
export function fallbackPageTitle(url: string): string {
  const segments = url.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  if (segments[0] === 'admin') return `Admin | ${DEFAULT_PAGE_TITLE}`;
  const page = PUBLIC_PAGE_TITLES[segments[0] ?? ''];
  return page ? `${page} | ${DEFAULT_PAGE_TITLE}` : DEFAULT_PAGE_TITLE;
}

/**
 * Angular's default strategy only sets a title when the route defines one, so leaving
 * /privacy for /team kept "Privacy Policy" in the tab and in search results. Every
 * navigation now sets a title: the route's own, or one derived from the URL.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.setTitle(this.buildTitle(snapshot) ?? fallbackPageTitle(snapshot.url));
  }
}
