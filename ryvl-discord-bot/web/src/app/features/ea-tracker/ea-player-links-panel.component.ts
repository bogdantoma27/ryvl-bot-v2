import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { PlayerRegistrationAudit, RegisteredDiscordPlayer } from '../../core/models';
import { formatEaTimestamp } from './shared/ea-format';

export interface EaToast {
  text: string;
  type: 'success' | 'error';
}

/** "Registered Players" tab: link Discord members to EA gamertags, list links and the audit log. */
@Component({
  selector: 'app-ea-player-links-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Link New Player Card -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div class="border-b border-slate-800 pb-3">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <span>🔗</span>
            <span>Link Discord Member to EA Pro Clubs Gamertag</span>
          </h3>
          <p class="text-xs text-slate-400 mt-1">
            Associating Discord IDs with EA Gamertags enables commands like <code class="text-emerald-400">/stats me</code> and detailed individual tracking.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">Discord Member</label>
            <select
              [(ngModel)]="newRegUserId"
              class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">-- Select Member or Input ID --</option>
              @for (m of guildMembers(); track m.id) {
                <option [value]="m.id">{{ m.displayName || m.username }} ({{ m.id }})</option>
              }
            </select>
            <div class="mt-1">
              <input
                type="text"
                [(ngModel)]="newRegUserId"
                placeholder="Or enter Discord User ID directly"
                class="w-full bg-[#11192e] border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-300 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">EA Gamertag / Player Name</label>
            <input
              type="text"
              [(ngModel)]="newRegEaName"
              placeholder="Exact EA FC Gamertag"
              class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">Preferred Position</label>
            <select
              [(ngModel)]="newRegPos"
              class="w-full bg-[#11192e] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="ST">ST / CF (Striker)</option>
              <option value="CAM">CAM (Attacking Midfielder)</option>
              <option value="CM">CM (Central Midfielder)</option>
              <option value="CDM">CDM (Defensive Midfielder)</option>
              <option value="RW">RW / RM (Right Winger)</option>
              <option value="LW">LW / LM (Left Winger)</option>
              <option value="CB">CB (Center Back)</option>
              <option value="LB">LB / LWB (Left Back)</option>
              <option value="RB">RB / RWB (Right Back)</option>
              <option value="GK">GK (Goalkeeper)</option>
            </select>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <button
            type="button"
            (click)="linkPlayer()"
            [disabled]="isRegistering() || !newRegUserId || !newRegEaName"
            class="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50"
          >
            @if (isRegistering()) {
              <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
              <span>Linking...</span>
            } @else {
              <span>Link Player</span>
            }
          </button>
        </div>
      </div>

      <!-- Registered Players List -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div class="p-4 bg-[#11192e] border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-white">Linked Players Directory</h3>
            <p class="text-xs text-slate-400">All registered Discord members mapped to EA Pro Clubs profiles</p>
          </div>
          <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold">
            {{ registeredPlayers().length }} Linked
          </span>
        </div>

        @if (isLoading()) {
          <div class="py-16 text-center text-slate-400 space-y-2">
            <div class="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-xs">Loading registered players...</p>
          </div>
        } @else if (registeredPlayers().length === 0) {
          <div class="p-12 text-center text-slate-400 space-y-2">
            <div class="text-3xl">👥</div>
            <h4 class="text-sm font-bold text-white">No Registered Players Yet</h4>
            <p class="text-xs">Use the form above or the Discord command <code class="text-emerald-400">/register-player</code> to link members.</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-[#16213e] text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                <tr>
                  <th class="py-3 px-4">Discord User</th>
                  <th class="py-3 px-4">EA Gamertag</th>
                  <th class="py-3 px-4 text-center">Position</th>
                  <th class="py-3 px-4">Linked Date</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/80">
                @for (rp of registeredPlayers(); track rp.id) {
                  <tr class="hover:bg-slate-800/30 transition">
                    <td class="py-3 px-4 font-bold text-white">
                      <div>{{ getMemberDisplayName(rp.discordUserId) }}</div>
                      <div class="font-mono text-[10px] text-slate-400">{{ rp.discordUserId }}</div>
                    </td>
                    <td class="py-3 px-4 font-bold text-emerald-400 font-mono">{{ rp.eaPlayerName }}</td>
                    <td class="py-3 px-4 text-center font-extrabold text-amber-400">{{ rp.preferredPos || '-' }}</td>
                    <td class="py-3 px-4 text-slate-400">{{ formatTimestamp(rp.createdAt) }}</td>
                    <td class="py-3 px-4 text-right space-x-2">
                      <button (click)="viewStats.emit(rp.eaPlayerName)" class="text-indigo-400 hover:text-indigo-300 font-bold text-xs">
                        View Stats
                      </button>
                      <button (click)="unlinkPlayer(rp.discordUserId)" class="text-rose-400 hover:text-rose-300 font-bold text-xs">
                        Unlink
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- Audit Trail -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <span>🛡️</span>
            <span>Registration Security Audit Log</span>
          </h3>
          <span class="text-xs text-slate-400">{{ auditLogs().length }} entries</span>
        </div>

        @if (auditLogs().length > 0) {
          <div class="overflow-x-auto max-h-60 overflow-y-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-[#11192e] text-slate-400 text-[10px] uppercase font-bold sticky top-0">
                <tr>
                  <th class="py-2 px-3">Date</th>
                  <th class="py-2 px-3">Action</th>
                  <th class="py-2 px-3">User ID</th>
                  <th class="py-2 px-3">Gamertag</th>
                  <th class="py-2 px-3">Performed By</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/80">
                @for (log of auditLogs(); track log.id) {
                  <tr class="hover:bg-slate-800/20 transition">
                    <td class="py-2 px-3 text-slate-400 text-[11px]">{{ formatTimestamp(log.createdAt) }}</td>
                    <td class="py-2 px-3 font-bold" [ngClass]="log.action === 'UNLINK' ? 'text-rose-400' : 'text-emerald-400'">
                      {{ log.action }}
                    </td>
                    <td class="py-2 px-3 font-mono text-slate-300">{{ log.discordUserId }}</td>
                    <td class="py-2 px-3 font-bold text-white">{{ log.eaPlayerName }}</td>
                    <td class="py-2 px-3 text-slate-400">{{ getMemberDisplayName(log.performedById || log.performedBy || '') }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="text-xs text-slate-500">No audit log entries recorded yet.</p>
        }
      </div>
    </div>
  `,
})
export class EaPlayerLinksPanelComponent {
  private readonly api = inject(ApiService);

  readonly guildId = input.required<string>();
  readonly registeredPlayers = input<RegisteredDiscordPlayer[]>([]);
  readonly auditLogs = input<PlayerRegistrationAudit[]>([]);
  readonly isLoading = input(false);
  readonly guildMembers = input<any[]>([]);

  /** Emitted after a link/unlink so the parent reloads the list. */
  readonly changed = output<void>();
  readonly viewStats = output<string>();
  readonly toast = output<EaToast>();

  readonly isRegistering = signal(false);
  newRegUserId = '';
  newRegEaName = '';
  newRegPos = 'ST';

  readonly formatTimestamp = formatEaTimestamp;

  getMemberDisplayName(userId: string): string {
    const m = this.guildMembers().find((member) => member.id === userId);
    return m?.displayName || m?.username || userId;
  }

  async linkPlayer(): Promise<void> {
    const guildId = this.guildId();
    if (!guildId || !this.newRegUserId.trim() || !this.newRegEaName.trim()) return;

    this.isRegistering.set(true);
    try {
      await this.api.registerPlayer(guildId, {
        discordUserId: this.newRegUserId.trim(),
        eaPlayerName: this.newRegEaName.trim(),
        preferredPos: this.newRegPos || undefined,
      });
      this.toast.emit({ text: `Linked Discord user to ${this.newRegEaName}!`, type: 'success' });
      this.newRegUserId = '';
      this.newRegEaName = '';
      this.changed.emit();
    } catch (err: any) {
      this.toast.emit({ text: err.message || 'Failed to register player.', type: 'error' });
    } finally {
      this.isRegistering.set(false);
    }
  }

  async unlinkPlayer(discordUserId: string): Promise<void> {
    const guildId = this.guildId();
    if (!guildId || !discordUserId) return;

    try {
      await this.api.unregisterPlayer(guildId, discordUserId);
      this.toast.emit({ text: 'Unlinked player registration.', type: 'success' });
      this.changed.emit();
    } catch (err: any) {
      this.toast.emit({ text: err.message || 'Failed to unregister player.', type: 'error' });
    }
  }
}
