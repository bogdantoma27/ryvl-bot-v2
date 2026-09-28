import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { TotwConfig } from '../../core/models';

@Component({
  selector: 'app-admin-totw',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6 pb-12">
      <!-- Toast Notification -->
      @if (toast()) {
        <div
          class="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium transition-all"
          [ngClass]="toast()!.type === 'error' ? 'bg-rose-900 border border-rose-600 text-rose-100' : 'bg-emerald-900 border border-emerald-600 text-emerald-100'"
        >
          <span>{{ toast()!.text }}</span>
          <button (click)="toast.set(null)" class="text-xs opacity-75 hover:opacity-100 font-bold ml-2">✕</button>
        </div>
      }

      <!-- Page Header -->
      <div class="bg-gradient-to-r from-[#16213e] via-[#1a274a] to-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div>
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-2xl">⭐</span>
              <h1 class="text-2xl font-black text-white tracking-tight">Team of the Week & Season</h1>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                VPG Automation
              </span>
            </div>
            <p class="text-sm text-slate-400 mt-1">
              Automated high-resolution graphic cards and official Discord announcements powered by VPG Romania statistics.
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button
              (click)="loadPreview()"
              [disabled]="isLoadingPreview()"
              class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition flex items-center gap-2"
            >
              @if (isLoadingPreview()) {
                <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              } @else {
                <span>🔄</span>
              }
              <span>Refresh Stats</span>
            </button>

            <button
              (click)="postToDiscord()"
              [disabled]="isPosting() || !config()?.channelId"
              class="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-extrabold text-xs shadow-lg shadow-amber-500/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              @if (isPosting()) {
                <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                <span>Publishing...</span>
              } @else {
                <span>📢</span>
                <span>Publish to Discord</span>
              }
            </button>
          </div>
        </div>
      </div>

      <!-- Main Layout: Left Config & Live Preview, Right Squad Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Left Column: Controls & Configuration (5 cols) -->
        <div class="lg:col-span-5 space-y-6">
          <!-- Configuration Card -->
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h2 class="text-sm font-bold text-white flex items-center gap-2">
                <span>⚙️</span>
                <span>Automation Settings</span>
              </h2>
              @if (config()?.enabled) {
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Active
                </span>
              } @else {
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300">
                  Disabled
                </span>
              }
            </div>

            <!-- Mode Selector -->
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1.5">Card Type</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  (click)="setMode(false)"
                  class="py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                  [ngClass]="!isTots() ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'"
                >
                  <span>⭐</span>
                  <span>TOTW (Weekly)</span>
                </button>
                <button
                  type="button"
                  (click)="setMode(true)"
                  class="py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                  [ngClass]="isTots() ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'"
                >
                  <span>🏆</span>
                  <span>TOTS (Season)</span>
                </button>
              </div>
            </div>

            <!-- Target Discord Channel -->
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1.5">Target Announcement Channel</label>
              <select
                [(ngModel)]="editChannelId"
                class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option [ngValue]="null">-- Select a Discord Channel --</option>
                @for (c of availableChannels(); track c.id) {
                  <option [value]="c.id"># {{ c.name }}</option>
                }
              </select>
            </div>

            <!-- Searchable VPG League Picker -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-semibold text-slate-300">VPG League</label>
                <span class="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {{ selectedLeagueTitle() }}
                </span>
              </div>

              <!-- Search Input -->
              <div class="relative">
                <input
                  type="text"
                  [ngModel]="leagueSearchQuery()"
                  (ngModelChange)="leagueSearchQuery.set($event); onSearchLeagues()"
                  placeholder="Search league (e.g. Superliga, Serie A, Premier)..."
                  class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                />
                @if (isSearchingLeagues()) {
                  <div class="absolute right-3 top-1/2 -translate-y-1/2">
                    <span class="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                  </div>
                }
              </div>

              <!-- Dropdown Results -->
              @if (leagueSearchResults().length > 0) {
                <div class="max-h-40 overflow-y-auto space-y-1 border border-slate-700 rounded-xl p-2 bg-[#0c1322]">
                  @for (item of leagueSearchResults(); track item.leagueSlug) {
                    <button
                      type="button"
                      (click)="selectLeague(item)"
                      class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                      [ngClass]="selectedLeague() === item.leagueSlug ? 'bg-amber-950/60 border border-amber-600/40 text-amber-200' : 'text-slate-300'"
                    >
                      <div>
                        <div class="font-bold text-white">{{ item.leagueName }}</div>
                        <div class="text-[10px] text-slate-400">{{ item.communityName }}</div>
                      </div>
                      <span class="text-[10px] text-amber-400">Select →</span>
                    </button>
                  }
                </div>
              }

              <!-- Quick Presets -->
              <div class="flex items-center gap-1.5 flex-wrap pt-1">
                <button
                  type="button"
                  (click)="setLeagueSlug('Superliga-Romania', 'Superliga România')"
                  class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                  [class.text-amber-400]="selectedLeague() === 'Superliga-Romania'"
                  [class.border-amber-400]="selectedLeague() === 'Superliga-Romania'"
                  [class.border]="selectedLeague() === 'Superliga-Romania'"
                >
                  Superliga
                </button>
                <button
                  type="button"
                  (click)="setLeagueSlug('Liga-2-Romania', 'Liga 2 România')"
                  class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                  [class.text-amber-400]="selectedLeague() === 'Liga-2-Romania'"
                  [class.border-amber-400]="selectedLeague() === 'Liga-2-Romania'"
                  [class.border]="selectedLeague() === 'Liga-2-Romania'"
                >
                  Liga 2
                </button>
                <button
                  type="button"
                  (click)="setLeagueSlug('Serie-A', 'Serie A Italy')"
                  class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                  [class.text-amber-400]="selectedLeague() === 'Serie-A'"
                  [class.border-amber-400]="selectedLeague() === 'Serie-A'"
                  [class.border]="selectedLeague() === 'Serie-A'"
                >
                  Serie A
                </button>
                <button
                  type="button"
                  (click)="setLeagueSlug('Europe-Premier', 'Europe Premier')"
                  class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                  [class.text-amber-400]="selectedLeague() === 'Europe-Premier'"
                  [class.border-amber-400]="selectedLeague() === 'Europe-Premier'"
                  [class.border]="selectedLeague() === 'Europe-Premier'"
                >
                  VPG Europe
                </button>
              </div>
            </div>

            <!-- Tactical Formation -->
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1.5">Pitch Formation</label>
              <select
                [(ngModel)]="editFormation"
                class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value="3-5-2">3-5-2 (Twin Strikers, CAM & Midfield)</option>
                <option value="3-1-4-2">3-1-4-2 (Holding CDM & Twin Strikers)</option>
              </select>
            </div>

            <!-- Enable Automated Weekly Post -->
            <div class="flex items-center justify-between p-3 rounded-xl bg-[#11192e] border border-slate-800">
              <div>
                <div class="text-xs font-bold text-white">Automated Weekly Cron</div>
                <div class="text-[11px] text-slate-400">Posts automatically every Tuesday morning</div>
              </div>
              <input
                type="checkbox"
                [(ngModel)]="editEnabled"
                class="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            <!-- Save Button -->
            <button
              (click)="saveConfig()"
              [disabled]="isSaving()"
              class="w-full py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-lg transition flex items-center justify-center gap-2"
            >
              @if (isSaving()) {
                <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Saving Settings...</span>
              } @else {
                <span>Save Configuration</span>
              }
            </button>
          </div>

          <!-- Live Card Graphic Preview -->
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-bold text-white flex items-center gap-2">
                <span>🖼️</span>
                <span>Official Card Render</span>
              </h2>
              <span class="text-[10px] text-slate-400">1200 x 1400 HD</span>
            </div>

            <div class="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 aspect-[12/14] flex items-center justify-center">
              @if (previewImageUrl()) {
                <img
                  [src]="previewImageUrl()"
                  alt="TOTW Render"
                  class="w-full h-full object-contain"
                />
              } @else {
                <div class="text-center text-slate-500 space-y-2 p-6">
                  <div class="text-3xl">⚽</div>
                  <p class="text-xs">Click "Refresh Stats" to load the live rendered card.</p>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Right Column: Starting XI & Subs Roster Table (7 cols) -->
        <div class="lg:col-span-7 space-y-6">
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div class="p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 class="text-sm font-bold text-white flex items-center gap-2">
                  <span>📋</span>
                  <span>{{ isTots() ? 'Team of the Season' : 'Team of the Week' }} Roster</span>
                </h2>
                <p class="text-xs text-slate-400">
                  {{ previewData()?.leagueName || selectedLeague() }} &bull; Season {{ previewData()?.season || 'Current' }}
                </p>
              </div>
              <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-amber-400 font-bold">
                {{ previewData()?.players?.length || 0 }} Players Selected
              </span>
            </div>

            @if (isLoadingPreview()) {
              <div class="py-24 text-center text-slate-400 space-y-3">
                <div class="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p class="text-xs font-medium">Resolving player positions & computing ratings...</p>
              </div>
            } @else if (!previewData() || !previewData().players || previewData().players.length === 0) {
              <div class="py-24 text-center text-slate-400 space-y-3">
                <div class="text-3xl">📊</div>
                <h3 class="text-base font-bold text-white">No Match Data Available</h3>
                <p class="text-xs max-w-sm mx-auto">Could not find leaderboard stats for {{ selectedLeague() }}.</p>
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-[#11192e] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th class="py-3 px-3 text-center">Pos</th>
                      <th class="py-3 px-3">Player / Club</th>
                      <th class="py-3 px-3 text-center">Games</th>
                      <th class="py-3 px-3 text-center">Goals</th>
                      <th class="py-3 px-3 text-center">Assists</th>
                      <th class="py-3 px-3 text-center">Rating</th>
                      <th class="py-3 px-3 text-center">MOTM</th>
                      <th class="py-3 px-3 text-center">CS</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/80">
                    @for (p of previewData().players; track p.gamertag; let i = $index) {
                      <tr class="hover:bg-slate-800/30 transition" [class.bg-amber-500/5]="i < 11">
                        <td class="py-2.5 px-3 text-center font-extrabold text-xs">
                          <span
                            class="px-2 py-0.5 rounded text-[10px] font-bold"
                            [ngClass]="{
                              'bg-amber-500/20 text-amber-300 border border-amber-500/40': ['ST', 'CF', 'RW', 'LW'].includes(p.targetPosition),
                              'bg-sky-500/20 text-sky-300 border border-sky-500/40': ['CAM', 'CM', 'CDM', 'RM', 'LM'].includes(p.targetPosition),
                              'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40': ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.targetPosition),
                              'bg-rose-500/20 text-rose-300 border border-rose-500/40': p.targetPosition === 'GK'
                            }"
                          >
                            {{ p.targetPosition }}
                          </span>
                        </td>
                        <td class="py-2.5 px-3 font-semibold text-white">
                          <div class="font-bold text-white flex items-center gap-1.5">
                            @if (i < 11) {
                              <span class="text-[10px] text-amber-400 font-mono">#{{ i + 1 }}</span>
                            } @else {
                              <span class="text-[10px] text-slate-500 font-mono">SUB</span>
                            }
                            <span>{{ p.gamertag }}</span>
                          </div>
                          <div class="text-[11px] text-slate-400">{{ p.club }}</div>
                        </td>
                        <td class="py-2.5 px-3 text-center font-semibold text-slate-300">{{ p.gamesPlayed }}</td>
                        <td class="py-2.5 px-3 text-center font-bold text-emerald-400">{{ p.goals }}</td>
                        <td class="py-2.5 px-3 text-center font-bold text-sky-400">{{ p.assists }}</td>
                        <td class="py-2.5 px-3 text-center font-black text-amber-400">{{ p.averageRating }}</td>
                        <td class="py-2.5 px-3 text-center text-slate-300">{{ p.manOfTheMatch }}</td>
                        <td class="py-2.5 px-3 text-center text-slate-300">{{ p.cleanSheets }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminTotwComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);

  readonly config = signal<TotwConfig | null>(null);
  readonly previewData = signal<any>(null);
  readonly previewImageUrl = signal<string | null>(null);

  readonly selectedLeague = signal<string>('Superliga-Romania');
  readonly selectedLeagueTitle = signal<string>('Superliga România');
  readonly isTots = signal<boolean>(false);

  readonly leagueSearchQuery = signal<string>('');
  readonly leagueSearchResults = signal<Array<{ communitySlug: string; communityName: string; leagueSlug: string; leagueName: string }>>([]);
  readonly isSearchingLeagues = signal<boolean>(false);

  readonly editChannelId = signal<string | null>(null);
  readonly editFormation = signal<string>('3-5-2');
  readonly editEnabled = signal<boolean>(false);

  async onSearchLeagues(): Promise<void> {
    const q = this.leagueSearchQuery().trim();
    if (!q) {
      this.leagueSearchResults.set([]);
      return;
    }
    this.isSearchingLeagues.set(true);
    try {
      const res = await this.api.searchVpgLeagues(q);
      this.leagueSearchResults.set(res.leagues || []);
    } catch {
      this.leagueSearchResults.set([]);
    } finally {
      this.isSearchingLeagues.set(false);
    }
  }

  selectLeague(item: { communitySlug: string; communityName: string; leagueSlug: string; leagueName: string }): void {
    this.setLeagueSlug(item.leagueSlug, item.leagueName);
    this.leagueSearchQuery.set('');
    this.leagueSearchResults.set([]);
  }

  setLeagueSlug(slug: string, name?: string): void {
    this.selectedLeague.set(slug);
    this.selectedLeagueTitle.set(name || slug.replace(/-/g, ' '));
    this.onLeagueChange();
  }

  readonly isLoadingPreview = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly isPosting = signal<boolean>(false);
  readonly toast = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  readonly availableChannels = computed(() => {
    return this.guildStore.activeGuild()?.channels || [];
  });

  ngOnInit(): void {
    const guildId = this.guildStore.activeGuildId();
    if (guildId) {
      this.loadConfig(guildId);
      this.loadPreview();
    }
  }

  async loadConfig(guildId: string): Promise<void> {
    try {
      const cfg = await this.api.getTotwConfig(guildId, this.selectedLeague());
      this.config.set(cfg);
      this.editChannelId.set(cfg.channelId || null);
      this.editFormation.set(cfg.formation || '4-3-3');
      this.editEnabled.set(cfg.enabled || false);
    } catch (err) {
      console.error('Failed to load TOTW config:', err);
    }
  }

  async loadPreview(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    this.isLoadingPreview.set(true);
    try {
      const data = await this.api.getTotwPreview(guildId, this.selectedLeague(), this.isTots());
      this.previewData.set(data);

      const timestamp = Date.now();
      const imageUrl = `${this.api.baseUrl}/api/guilds/${guildId}/vpg/totw/image?leagueSlug=${encodeURIComponent(
        this.selectedLeague(),
      )}&isTots=${this.isTots()}&t=${timestamp}`;
      this.previewImageUrl.set(imageUrl);
    } catch (err: any) {
      this.showToast('Could not load TOTW preview data.', 'error');
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  setMode(tots: boolean): void {
    this.isTots.set(tots);
    this.loadPreview();
  }

  onLeagueChange(): void {
    const guildId = this.guildStore.activeGuildId();
    if (guildId) {
      this.loadConfig(guildId);
      this.loadPreview();
    }
  }

  async saveConfig(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    this.isSaving.set(true);
    try {
      const updated = await this.api.updateTotwConfig(guildId, this.selectedLeague(), {
        channelId: this.editChannelId(),
        formation: this.editFormation(),
        enabled: this.editEnabled(),
      });
      this.config.set(updated);
      this.showToast('TOTW settings saved successfully!', 'success');
    } catch (err: any) {
      this.showToast(err.message || 'Failed to save settings.', 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  async postToDiscord(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    this.isPosting.set(true);
    try {
      await this.api.postTotw(guildId, {
        channelId: this.editChannelId() || undefined,
        isTots: this.isTots(),
      });
      this.showToast('Official TOTW graphic card posted to Discord!', 'success');
    } catch (err: any) {
      this.showToast(err.message || 'Failed to post TOTW to Discord.', 'error');
    } finally {
      this.isPosting.set(false);
    }
  }

  private showToast(text: string, type: 'success' | 'error'): void {
    this.toast.set({ text, type });
    setTimeout(() => {
      this.toast.set(null);
    }, 4000);
  }
}
