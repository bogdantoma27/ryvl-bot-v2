"""Apply the reviewed public copy/navigation corrections in an isolated CI checkout."""
from pathlib import Path
import re
import subprocess

ROOT = Path('.')
WEB = ROOT / 'ryvl-discord-bot/web/src/app/features/public'
def edit(path, old, new, expected=1):
    text = path.read_text()
    assert text.count(old) == expected, f'Unexpected source at {path}: {old[:75]}'
    path.write_text(text.replace(old, new))

# Only textual game branding is updated. Never rewrite edition numbers embedded
# in third-party CDN paths, dependency versions, protocol fields or dates.
for name in subprocess.check_output(['git', 'ls-files', '-z'], text=True).split('\0'):
    if not name or '/test/' in name or name.startswith(('.github/', '.maintenance/')) or name.endswith('package-lock.json'):
        continue
    file = Path(name)
    if file.suffix not in ('.ts', '.html', '.md', '.py', '.json', '.example'):
        continue
    old = file.read_text()
    new = re.sub(r'\bEA\s+SPORTS\s+FC(?:\s+2[567])?\b', 'EA SPORTS FC 27', old, flags=re.I)
    new = re.sub(r'\bEA\s+SPORTS\s+Pro Clubs\b', 'EA SPORTS FC 27 Pro Clubs', new, flags=re.I)
    if new != old:
        file.write_text(new)
        print('Updated branding:', name)

edit(WEB / 'live.component.ts', 'There are no scheduled Superliga matches today.', 'There are no scheduled matches today.')
edit(WEB / 'matches-panel.component.ts', '          <p class="mt-1 text-sm text-slate-400">This section updates when VPG publishes new information.</p>\n', '')
edit(WEB / 'public-shell.component.ts', "{ path: '/performance', label: 'Performance' }, { path: '/match-center', label: 'Match Center' },", "{ path: '/performance', label: 'Performance' }, { path: '/match-center', label: 'Match Center' },\n    { path: '/club', label: 'Club Tracker' },")
edit(WEB / 'public-shell.component.ts', '>Club tracker</a>', '>Club Tracker</a>')
# Preserve desktop navigation at 1024px while making room for the added link.
edit(WEB / 'public-shell.component.ts', 'class="social-brand-link public-button"><img src="/assets/brands/discord.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />Discord</a>', 'aria-label="Discord" class="social-brand-link public-button"><img src="/assets/brands/discord.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" /><span class="hidden xl:inline">Discord</span></a>')

club = WEB / 'club.component.ts'
edit(club, '  Component,\n  OnInit,', '  Component,\n  DestroyRef,\n  OnInit,')
edit(club, "import { RouterLink } from '@angular/router';", "import { ActivatedRoute, RouterLink } from '@angular/router';\nimport { takeUntilDestroyed } from '@angular/core/rxjs-interop';\nimport { distinctUntilChanged, map } from 'rxjs';")
edit(club, "import { GuildStore } from '../../core/guild.store';\n", '')
edit(club, 'class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12 animate-fadeIn"', 'class="w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12 animate-fadeIn"')
edit(club, 'class="text-4xl font-black text-white uppercase tracking-tight flex items-center gap-3"', 'class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight flex flex-wrap items-center gap-3"')
edit(club, '      <!-- Club Showcase Hero Card -->', '''      <!-- Distinguish outages from a valid empty match/member feed. -->
      @if(errorMessage()) {
        <div class="public-error" role="alert">
          <p>{{ errorMessage() }}</p>
          <button type="button" class="public-button mt-3" (click)="refreshData()" [disabled]="isLoadingConfig()">Try again</button>
        </div>
      }

      <!-- Club Showcase Hero Card -->''')
edit(club, 'class="p-8 sm:p-10 rounded-3xl', 'class="p-5 sm:p-10 rounded-3xl')
edit(club, 'class="flex items-center gap-6"', 'class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 min-w-0 max-w-full"')
edit(club, 'class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight"', 'class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight break-words"')
edit(club, 'Verified EA Bridge', 'EA SPORTS FC 27')
edit(club, 'class="flex items-center gap-2 border-b border-white/10 pb-2"', 'class="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2"')
edit(club, '@if(isLoadingMatches()) {', '@if(isLoadingConfig() || isLoadingMatches()) {')
edit(club, '} @else if (matches().length === 0) {', '} @else if (configError() || matchesError()) {\n          <!-- The error and retry action are presented above, not as empty data. -->\n        } @else if (matches().length === 0) {')
edit(club, '@if(isLoadingMembers()) {', '@if(isLoadingConfig() || isLoadingMembers()) {')
edit(club, '} @else if (members().length === 0) {', '} @else if (configError() || membersError()) {\n          <!-- A failed member request must not be described as no member records. -->\n        } @else if (members().length === 0) {')
edit(club, '<p class="text-sm font-bold text-slate-300">Loading club member leaderboard...</p>', '<p class="text-sm font-bold text-slate-300">Loading...</p>')
edit(club, '  readonly guildStore = inject(GuildStore);', '''  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private requestVersion = 0;
  private disposed = false;
  private targetGuildId = 'default';
  readonly configError = signal<string | null>(null);
  readonly matchesError = signal<string | null>(null);
  readonly membersError = signal<string | null>(null);
  readonly errorMessage = computed(() => this.configError() || this.matchesError() || this.membersError());''')
edit(club, "this.config()?.clubId || '128199'", "this.config()?.clubId || '—'")
edit(club, "return data?.skillRating || '1689';", "return data?.skillRating ?? '—';")
edit(club, "return data?.bestDivision != null ? `Div ${data.bestDivision}` : 'Division 1';", "return data?.bestDivision != null ? `Div ${data.bestDivision}` : '—';")
edit(club, "const identifier = clubData.teamId || clubData.customKit?.crestAssetId || '22';", "const identifier = clubData.teamId || clubData.customKit?.crestAssetId;\n    if (!identifier) return null;")

text = club.read_text()
start = text.index('  ngOnInit(): void {')
end = text.index('  toggleExpandMatch(', start)
text = text[:start] + '''  ngOnInit(): void {
    this.destroy.onDestroy(() => { this.disposed = true; this.requestVersion++; });
    // Bot buttons include a guildId. Honour it without borrowing another club
    // from a staff member's cached admin selection; ordinary visits use default.
    this.route.queryParamMap.pipe(
      map(params => {
        const id = params.get('guildId');
        return id && /^\\d{17,20}$/.test(id) ? id : 'default';
      }),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroy),
    ).subscribe(guildId => { void this.loadAllData(guildId); });
  }

  private isCurrent(request: number): boolean {
    return !this.disposed && request === this.requestVersion;
  }

  async loadAllData(guildId: string): Promise<void> {
    const request = ++this.requestVersion;
    if (this.targetGuildId !== guildId) {
      // A new deep link must never briefly show the previous club's data.
      this.config.set(null); this.clubInfo.set(null); this.overallStats.set(null);
      this.matches.set([]); this.members.set([]); this.expandedMatchId.set(null);
    }
    this.targetGuildId = guildId;
    this.configError.set(null); this.matchesError.set(null); this.membersError.set(null);
    this.isLoadingConfig.set(true);
    this.isLoadingMatches.set(false); this.isLoadingMembers.set(false);
    try {
      const data = await this.api.getEaConfig(guildId);
      if (!this.isCurrent(request)) return;
      if (!data?.config?.clubId) throw new Error('Missing club configuration');
      this.config.set(data.config); this.clubInfo.set(data.clubInfo); this.overallStats.set(data.overallStats);
      await Promise.all([this.loadMatches(guildId, request), this.loadMembers(guildId, request)]);
    } catch {
      if (this.isCurrent(request)) this.configError.set('Club details could not be loaded. Please try again.');
    } finally {
      if (this.isCurrent(request)) this.isLoadingConfig.set(false);
    }
  }

  private async loadMatches(guildId: string, request: number): Promise<void> {
    this.isLoadingMatches.set(true);
    try {
      const list = await this.api.getEaMatches(guildId, 15);
      if (!this.isCurrent(request)) return;
      if (!Array.isArray(list)) throw new Error('Invalid match response');
      this.matches.set(list);
    } catch {
      if (this.isCurrent(request)) this.matchesError.set('Recent matches could not be loaded. Please try again.');
    } finally {
      if (this.isCurrent(request)) this.isLoadingMatches.set(false);
    }
  }

  private async loadMembers(guildId: string, request: number): Promise<void> {
    this.isLoadingMembers.set(true);
    try {
      const data = await this.api.getEaMembers(guildId);
      if (!this.isCurrent(request)) return;
      const list = data?.members ?? data;
      if (!Array.isArray(list)) throw new Error('Invalid member response');
      this.members.set(list);
    } catch {
      if (this.isCurrent(request)) this.membersError.set('Club member statistics could not be loaded. Please try again.');
    } finally {
      if (this.isCurrent(request)) this.isLoadingMembers.set(false);
    }
  }

  refreshData(): void {
    // Avoid overlapping manual refreshes. Version checks above also protect
    // against late replies when Angular reuses the route for a new guildId.
    if (!this.isLoadingConfig() && !this.disposed) void this.loadAllData(this.targetGuildId);
  }

''' + text[end:]
club.write_text(text)

# When ALL upstream match types fail, return a recoverable API failure instead
# of claiming the club has zero matches. A legitimate empty response stays valid.
controller = ROOT / 'ryvl-discord-bot/server/src/ea/ea.controller.ts'
edit(controller, '  Logger,\n', '  Logger,\n  ServiceUnavailableException,\n')
edit(controller, '    const rawMatchesMap = new Map<string, any>();', '    const rawMatchesMap = new Map<string, any>();\n    let successfulRequests = 0;')
edit(controller, '        if (Array.isArray(matches)) {\n          for (const m of matches) {', "        if (!Array.isArray(matches)) throw new Error('Invalid upstream match response');\n        successfulRequests++;\n        if (Array.isArray(matches)) {\n          for (const m of matches) {")
edit(controller, '    const allMatches = Array.from(rawMatchesMap.values())', "    if (successfulRequests === 0) {\n      throw new ServiceUnavailableException('Match data is temporarily unavailable. Please try again.');\n    }\n\n    const allMatches = Array.from(rawMatchesMap.values())")
print('Applied public copy, Club Tracker navigation, deep-link and recoverable-loading fixes.')
