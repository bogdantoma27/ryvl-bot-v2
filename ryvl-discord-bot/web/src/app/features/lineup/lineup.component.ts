import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import {
  LineupDraft,
  LineupFormationsResponse,
  LineupPostPayload,
  LineupRenderPayload,
} from '../../core/models';

type LineupStep = 1 | 2 | 3 | 4;

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Component({
  selector: 'app-lineup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="max-w-6xl mx-auto space-y-6">
      <!-- Breadcrumb & Top Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-700/60 pb-4">
        <div>
          <nav class="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <span class="text-slate-200">Lineups</span>
            <span>/</span>
            <span class="text-[#EAE905] font-bold">New Lineup</span>
          </nav>
          <h1 class="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <svg class="w-6 h-6 text-[#EAE905]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Match Lineup Creator</span>
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">Build a match formation, assign players, and publish an official graphic to Discord.</p>
        </div>

        <div class="flex items-center gap-2 self-start sm:self-center">
          <a
            routerLink="/lineup/drafts"
            class="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 transition flex items-center gap-1.5"
          >
            <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Saved Drafts</span>
          </a>

          <button
            type="button"
            [disabled]="isSavingDraft()"
            (click)="saveDraft()"
            class="text-xs text-black bg-[#EAE905] hover:bg-[#d8d704] font-bold px-3 py-1.5 rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <span>{{ isSavingDraft() ? 'Saving...' : 'Save Draft' }}</span>
          </button>
        </div>
      </div>

      <!-- Notification / Alert -->
      @if (notification()) {
        <div
          class="p-3.5 rounded-xl text-xs flex items-center justify-between border transition"
          [class.bg-emerald-950/50]="notification()!.type === 'success'"
          [class.border-emerald-700]="notification()!.type === 'success'"
          [class.text-emerald-200]="notification()!.type === 'success'"
          [class.bg-rose-950/50]="notification()!.type === 'error'"
          [class.border-rose-700]="notification()!.type === 'error'"
          [class.text-rose-200]="notification()!.type === 'error'"
        >
          <span>{{ notification()!.message }}</span>
          <button type="button" (click)="notification.set(null)" class="text-slate-400 hover:text-white text-base leading-none">&times;</button>
        </div>
      }

      <!-- Stepper Navigation -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#16213e] p-2 rounded-xl border border-slate-800">
        @for (s of steps; track s.num) {
          <button
            type="button"
            (click)="goToStep(s.num)"
            class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer"
            [class.bg-[#5865F2]]="currentStep() === s.num"
            [class.text-white]="currentStep() === s.num"
            [class.text-slate-400]="currentStep() !== s.num"
            [class.hover:bg-slate-800]="currentStep() !== s.num"
          >
            <span
              class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              [class.bg-white]="currentStep() === s.num"
              [class.text-[#5865F2]]="currentStep() === s.num"
              [class.bg-slate-700]="currentStep() !== s.num"
              [class.text-slate-300]="currentStep() !== s.num"
            >
              {{ currentStep() > s.num ? '✓' : s.num }}
            </span>
            <span class="truncate">{{ s.label }}</span>
          </button>
        }
      </div>

      <!-- Main Step Panels -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl min-h-[460px]">
        <!-- STEP 1: Match Details -->
        @if (currentStep() === 1) {
          <div class="max-w-2xl space-y-6">
            <div>
              <h2 class="text-base font-bold text-white">Match Details & Colors</h2>
              <p class="text-xs text-slate-400 mt-1">Configure match title, formation setup, and dual kickoff timetable.</p>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Lineup Title</label>
                <input
                  type="text"
                  [(ngModel)]="title"
                  placeholder="RYVL Match Lineup"
                  class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#EAE905] transition"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Formation</label>
                  <select
                    [(ngModel)]="selectedFormation"
                    (ngModelChange)="onFormationChange()"
                    class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  >
                    @for (fmt of formationList(); track fmt) {
                      <option [value]="fmt">
                        {{ formationLabels()[fmt] || fmt }} ({{ fmt }})
                      </option>
                    }
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Timezone</label>
                  <select
                    [(ngModel)]="timezone"
                    class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  >
                    <option value="Europe/Bucharest">Europe/Bucharest (Romania 🇷🇴)</option>
                    <option value="Europe/London">Europe/London (UK 🇬🇧)</option>
                    <option value="UTC">UTC</option>
                    <option value="Europe/Paris">Europe/Paris (CET)</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Kickoff Date</label>
                  <input
                    type="date"
                    [(ngModel)]="kickoffDate"
                    class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Kickoff Time</label>
                  <input
                    type="time"
                    [(ngModel)]="kickoffTime"
                    class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  />
                </div>
              </div>

              <!-- Colors Configuration -->
              <div class="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Primary Jersey Color</label>
                  <div class="flex items-center gap-2">
                    <input
                      type="color"
                      [(ngModel)]="primaryColor"
                      class="w-10 h-10 rounded-lg bg-transparent border-0 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      [(ngModel)]="primaryColor"
                      class="flex-1 bg-[#11192e] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Secondary / Trim Color</label>
                  <div class="flex items-center gap-2">
                    <input
                      type="color"
                      [(ngModel)]="secondaryColor"
                      class="w-10 h-10 rounded-lg bg-transparent border-0 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      [(ngModel)]="secondaryColor"
                      class="flex-1 bg-[#11192e] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- STEP 2: Fill Positions -->
        @if (currentStep() === 2) {
          <div class="space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 class="text-base font-bold text-white">Fill Positions ({{ filledCount() }}/11)</h2>
                <p class="text-xs text-slate-400">Assign Discord members or custom trialists to each position in {{ selectedFormation }}.</p>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="clearAllSlots()"
                  class="text-xs text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded-lg border border-rose-900/60 hover:bg-rose-950/30 transition cursor-pointer"
                >
                  Clear All
                </button>

                <button
                  type="button"
                  (click)="refreshPreview()"
                  class="text-xs text-[#EAE905] hover:text-white px-3 py-1.5 rounded-lg border border-[#EAE905]/40 hover:bg-[#EAE905]/10 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Update Pitch Preview</span>
                </button>
              </div>
            </div>

            <!-- Two Columns: Left Roster & Custom Name, Right Pitch Preview & Slot Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <!-- Left: Server Roster & Custom Member (5 cols) -->
              <div class="lg:col-span-5 space-y-4">
                <!-- Custom Trialist / Name Input -->
                <div class="bg-[#11192e] p-3.5 rounded-xl border border-slate-700/80 space-y-2">
                  <div class="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-[#EAE905]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Custom Name / Trialist</span>
                  </div>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      [(ngModel)]="customPlayerName"
                      placeholder="e.g. GuestPlayer"
                      (keyup.enter)="addCustomPlayerToFirstEmptySlot()"
                      class="flex-1 bg-[#16213e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#EAE905]"
                    />
                    <button
                      type="button"
                      (click)="addCustomPlayerToFirstEmptySlot()"
                      class="bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Assign Next
                    </button>
                  </div>
                </div>

                <!-- Server Members Search & List -->
                <div class="bg-[#11192e] p-3.5 rounded-xl border border-slate-700/80 space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-white">Server Members</span>
                    <span class="text-[10px] text-slate-400">{{ filteredMembers().length }} available</span>
                  </div>

                  <input
                    type="text"
                    [(ngModel)]="memberSearch"
                    placeholder="Search roster..."
                    class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#EAE905]"
                  />

                  <div class="max-h-[360px] overflow-y-auto space-y-1.5 pr-1">
                    @for (m of filteredMembers(); track m.id) {
                      <div class="flex items-center justify-between p-2 rounded-lg bg-[#16213e]/70 hover:bg-[#1f2e54] border border-slate-800 transition">
                        <div class="flex items-center gap-2.5 min-w-0">
                          @if (m.avatar_url) {
                            <img [src]="m.avatar_url" [alt]="m.display_name" class="w-6 h-6 rounded-full object-cover shrink-0" />
                          } @else {
                            <div class="w-6 h-6 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                              {{ m.display_name.slice(0, 1).toUpperCase() }}
                            </div>
                          }
                          <span class="text-xs font-medium text-slate-200 truncate">{{ m.display_name }}</span>
                        </div>

                        <!-- Dropdown or quick button to assign -->
                        <div class="flex items-center gap-1 shrink-0">
                          <select
                            (change)="onAssignMemberSelect(m.display_name, $event)"
                            class="bg-[#11192e] border border-slate-700 rounded px-1.5 py-1 text-[11px] text-[#EAE905] focus:outline-none cursor-pointer"
                          >
                            <option value="">Assign to...</option>
                            @for (slot of currentSlots(); track slot) {
                              <option [value]="slot">{{ slot.toUpperCase() }}{{ assignments()[slot] ? ' (' + assignments()[slot] + ')' : '' }}</option>
                            }
                          </select>
                        </div>
                      </div>
                    } @empty {
                      <div class="text-center py-6 text-xs text-slate-500">No matching members found.</div>
                    }
                  </div>
                </div>
              </div>

              <!-- Right: Pitch Preview & Slot Map (7 cols) -->
              <div class="lg:col-span-7 space-y-4">
                <!-- Slot Grid: Quick inspection and removal -->
                <div class="bg-[#11192e] p-3.5 rounded-xl border border-slate-700/80">
                  <div class="text-xs font-bold text-white mb-2.5">Formation Slots</div>
                  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    @for (slot of currentSlots(); track slot) {
                      <div
                        class="p-2 rounded-lg border text-xs flex flex-col justify-between transition"
                        [class.bg-slate-800]="!assignments()[slot]"
                        [class.border-slate-700]="!assignments()[slot]"
                        [class.bg-emerald-950/40]="!!assignments()[slot]"
                        [class.border-emerald-700/60]="!!assignments()[slot]"
                      >
                        <div class="flex items-center justify-between">
                          <span class="font-bold text-[#EAE905] uppercase text-[11px]">{{ slot }}</span>
                          @if (assignments()[slot]) {
                            <button
                              type="button"
                              (click)="unassignSlot(slot)"
                              title="Unassign slot"
                              class="text-slate-400 hover:text-rose-400 text-sm leading-none cursor-pointer"
                            >
                              &times;
                            </button>
                          }
                        </div>
                        <div class="mt-1 truncate font-medium text-[11px]" [class.text-white]="assignments()[slot]" [class.text-slate-500]="!assignments()[slot]">
                          {{ assignments()[slot] || 'Empty' }}
                        </div>
                      </div>
                    }
                  </div>
                </div>

                <!-- Pitch SVG Preview Container -->
                <div class="bg-[#11192e] p-4 rounded-xl border border-slate-700/80 flex flex-col items-center">
                  @if (isLoadingPreview()) {
                    <div class="py-20 flex flex-col items-center text-slate-400 gap-2">
                      <svg class="w-8 h-8 animate-spin text-[#EAE905]" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span class="text-xs">Rendering pitch preview...</span>
                    </div>
                  } @else if (previewSvg()) {
                    <div class="w-full max-w-[420px] rounded-lg overflow-hidden shadow-2xl border border-slate-800" [innerHTML]="safePreviewSvg()"></div>
                  } @else {
                    <div class="py-16 text-center text-slate-500 text-xs">
                      <p>Preview ready to render.</p>
                      <button
                        type="button"
                        (click)="refreshPreview()"
                        class="mt-2 text-[#EAE905] font-semibold underline cursor-pointer"
                      >
                        Generate Pitch Graphic
                      </button>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        <!-- STEP 3: Connections -->
        @if (currentStep() === 3) {
          <div class="max-w-2xl space-y-6">
            <div>
              <h2 class="text-base font-bold text-white">Discord Destination & Mentions</h2>
              <p class="text-xs text-slate-400 mt-1">Select the target text channel and which roles to ping when publishing.</p>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Target Discord Text Channel</label>
                <select
                  [(ngModel)]="channelId"
                  class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                >
                  <option value="">Select a channel...</option>
                  @for (ch of guildStore.activeGuild()?.channels; track ch.id) {
                    <option [value]="ch.id">#{{ ch.name }}</option>
                  }
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Mention Roles (Optional)</label>
                <div class="bg-[#11192e] border border-slate-700/80 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5">
                  @for (role of guildStore.activeGuild()?.roles; track role.id) {
                    <label class="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
                      <input
                        type="checkbox"
                        [checked]="isRoleSelected(role.id)"
                        (change)="toggleRole(role.id)"
                        class="rounded border-slate-600 bg-slate-900 text-[#EAE905] focus:ring-0 w-4 h-4 cursor-pointer"
                      />
                      <span class="text-xs font-medium text-slate-200" [style.color]="role.color || '#fff'">{{ role.name }}</span>
                    </label>
                  } @empty {
                    <div class="text-slate-500 text-xs text-center py-2">No roles available in this server.</div>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        <!-- STEP 4: Review & Publish -->
        @if (currentStep() === 4) {
          <div class="space-y-6">
            <div>
              <h2 class="text-base font-bold text-white">Review & Publish to Discord</h2>
              <p class="text-xs text-slate-400 mt-1">Review the match lineup and publish the official image attachment to your server.</p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <!-- Summary Details (5 cols) -->
              <div class="lg:col-span-5 space-y-4">
                <div class="bg-[#11192e] p-4 rounded-xl border border-slate-700/80 space-y-3">
                  <div class="border-b border-slate-800 pb-2.5">
                    <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Lineup Title</span>
                    <div class="text-sm font-bold text-white">{{ title }}</div>
                  </div>

                  <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
                    <div>
                      <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Formation</span>
                      <div class="text-sm font-bold text-[#EAE905]">{{ formationLabels()[selectedFormation] || selectedFormation }}</div>
                    </div>
                    <span class="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-semibold">
                      {{ filledCount() }}/11 Filled
                    </span>
                  </div>

                  <div class="border-b border-slate-800 pb-2.5">
                    <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Kickoff Times</span>
                    <div class="text-xs text-slate-200 mt-0.5 space-y-0.5">
                      <div>🇷🇴 Romania: <strong>{{ formatKickoffFor('Europe/Bucharest') }}</strong></div>
                      <div>🇬🇧 UK: <strong>{{ formatKickoffFor('Europe/London') }}</strong></div>
                    </div>
                  </div>

                  <div class="border-b border-slate-800 pb-2.5">
                    <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Destination Channel</span>
                    <div class="text-xs font-semibold text-white mt-0.5">#{{ targetChannelName() }}</div>
                  </div>

                  <div>
                    <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Role Mentions</span>
                    <div class="text-xs text-slate-300 mt-0.5">{{ selectedMentionRolesText() }}</div>
                  </div>
                </div>

                <!-- Publish Action Button -->
                <button
                  type="button"
                  [disabled]="isPosting() || !channelId"
                  (click)="publishToDiscord()"
                  class="w-full bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/25 transition duration-150 flex items-center justify-center gap-2 cursor-pointer"
                >
                  @if (isPosting()) {
                    <svg class="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Posting to Discord...</span>
                  } @else {
                    <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
                    </svg>
                    <span>Post Lineup to Discord</span>
                  }
                </button>
              </div>

              <!-- Graphic Pitch Render Preview (7 cols) -->
              <div class="lg:col-span-7 flex flex-col items-center">
                <div class="w-full max-w-[420px] rounded-2xl overflow-hidden shadow-2xl border border-slate-700 bg-black">
                  @if (previewSvg()) {
                    <div [innerHTML]="safePreviewSvg()"></div>
                  } @else {
                    <div class="py-24 text-center text-xs text-slate-500">Generating preview...</div>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Bottom Wizard Step Navigation -->
        <div class="flex items-center justify-between pt-6 mt-6 border-t border-slate-800">
          <div>
            @if (currentStep() > 1) {
              <button
                type="button"
                (click)="prevStep()"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 hover:bg-slate-800 transition cursor-pointer"
              >
                &larr; Back
              </button>
            }
          </div>

          <div>
            @if (currentStep() < 4) {
              <button
                type="button"
                (click)="nextStep()"
                class="px-5 py-2.5 rounded-xl text-xs font-bold text-black bg-[#EAE905] hover:bg-[#d8d704] transition cursor-pointer"
              >
                Continue &rarr;
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LineupComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly steps = [
    { num: 1 as LineupStep, label: 'Details' },
    { num: 2 as LineupStep, label: 'Fill Positions' },
    { num: 3 as LineupStep, label: 'Connections' },
    { num: 4 as LineupStep, label: 'Review & Publish' },
  ];

  protected readonly currentStep = signal<LineupStep>(1);
  protected readonly formationList = signal<string[]>([]);
  protected readonly formationLabels = signal<Record<string, string>>({});
  protected readonly slotsByFmt = signal<Record<string, string[]>>({});

  // Form State
  protected draftId: string | null = null;
  protected title = 'RYVL Match Lineup';
  protected selectedFormation = '433';
  protected kickoffDate = getTodayDateString();
  protected kickoffTime = '21:45';
  protected timezone = 'Europe/Bucharest';
  protected primaryColor = '#EAE905';
  protected secondaryColor = '#111111';
  protected channelId = '';
  protected selectedRoleIds = signal<string[]>([]);
  protected assignments = signal<Record<string, string>>({});

  // Sub-panel state
  protected memberSearch = '';
  protected customPlayerName = '';
  protected previewSvg = signal<string>('');
  protected isLoadingPreview = signal<boolean>(false);
  protected isSavingDraft = signal<boolean>(false);
  protected isPosting = signal<boolean>(false);
  protected notification = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  protected readonly currentSlots = computed(() => {
    return this.slotsByFmt()[this.selectedFormation] || [
      'gk', 'lb', 'lcb', 'rcb', 'rb', 'lcm', 'cm', 'rcm', 'lw', 'st', 'rw',
    ];
  });

  protected readonly filledCount = computed(() => {
    const assigned = this.assignments();
    return this.currentSlots().filter((s) => Boolean(assigned[s]?.trim())).length;
  });

  protected readonly filteredMembers = computed(() => {
    const members = this.guildStore.activeGuild()?.members || [];
    const query = this.memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter(
      (m) =>
        m.display_name.toLowerCase().includes(query) ||
        m.username.toLowerCase().includes(query),
    );
  });

  protected readonly safePreviewSvg = computed(() => {
    return this.sanitizer.bypassSecurityTrustHtml(this.previewSvg());
  });

  protected readonly targetChannelName = computed(() => {
    const ch = this.guildStore.activeGuild()?.channels?.find((c) => c.id === this.channelId);
    return ch ? ch.name : 'Not selected';
  });

  protected readonly selectedMentionRolesText = computed(() => {
    const roles = this.guildStore.activeGuild()?.roles || [];
    const selected = this.selectedRoleIds();
    if (!selected.length) return 'None';
    const names = roles.filter((r) => selected.includes(r.id)).map((r) => `@${r.name}`);
    return names.join(', ');
  });

  constructor() {
    effect(() => {
      const active = this.guildStore.activeGuild();
      if (active && !this.channelId) {
        this.channelId = active.settings?.defaultChannelId || active.channels?.[0]?.id || '';
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    try {
      const res: LineupFormationsResponse = await this.api.getLineupFormations(guildId);
      this.formationList.set(res.formations);
      this.formationLabels.set(res.labels_by_formation);
      this.slotsByFmt.set(res.slots_by_formation);

      const queryDraftId = this.route.snapshot.queryParamMap.get('draftId');
      if (queryDraftId) {
        await this.loadDraft(guildId, queryDraftId);
      } else {
        await this.refreshPreview();
      }
    } catch (err) {
      console.error('Failed to initialize lineup:', err);
    }
  }

  private async loadDraft(guildId: string, draftId: string): Promise<void> {
    try {
      const drafts = await this.api.getLineupDrafts(guildId);
      const draft = drafts.find((d) => d.id === draftId);
      if (draft) {
        this.draftId = draft.id;
        this.title = draft.title || this.title;
        this.selectedFormation = draft.formation || this.selectedFormation;
        if (draft.channelId) this.channelId = draft.channelId;
        if (draft.timezone) this.timezone = draft.timezone;
        if (draft.mentionRoleIds) this.selectedRoleIds.set(draft.mentionRoleIds);
        if (draft.assignments) {
          const raw = typeof draft.assignments === 'string' ? JSON.parse(draft.assignments) : draft.assignments;
          this.assignments.set(raw || {});
        }
        if (draft.kickoffAt) {
          const d = new Date(draft.kickoffAt);
          this.kickoffDate = d.toISOString().slice(0, 10);
          this.kickoffTime = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        }
        await this.refreshPreview();
      }
    } catch (err) {
      console.error('Failed to load draft:', err);
    }
  }

  protected goToStep(step: LineupStep): void {
    this.currentStep.set(step);
    if (step === 2 || step === 4) {
      this.refreshPreview();
    }
  }

  protected nextStep(): void {
    const next = Math.min(4, this.currentStep() + 1) as LineupStep;
    this.goToStep(next);
  }

  protected prevStep(): void {
    const prev = Math.max(1, this.currentStep() - 1) as LineupStep;
    this.goToStep(prev);
  }

  protected onFormationChange(): void {
    const validSlots = new Set(this.currentSlots());
    const next: Record<string, string> = {};
    for (const [slot, name] of Object.entries(this.assignments())) {
      if (validSlots.has(slot)) {
        next[slot] = name;
      }
    }
    this.assignments.set(next);
    this.refreshPreview();
  }

  protected unassignSlot(slot: string): void {
    const current = { ...this.assignments() };
    delete current[slot];
    this.assignments.set(current);
    this.refreshPreview();
  }

  protected clearAllSlots(): void {
    this.assignments.set({});
    this.refreshPreview();
  }

  protected onAssignMemberSelect(displayName: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const slot = select.value;
    if (!slot) return;

    const next = { ...this.assignments(), [slot]: displayName };
    this.assignments.set(next);
    select.value = '';
    this.refreshPreview();
  }

  protected addCustomPlayerToFirstEmptySlot(): void {
    const name = this.customPlayerName.trim();
    if (!name) return;

    const emptySlot = this.currentSlots().find((s) => !this.assignments()[s]);
    if (!emptySlot) {
      this.notification.set({ message: 'All 11 slots are already assigned!', type: 'error' });
      return;
    }

    const next = { ...this.assignments(), [emptySlot]: name };
    this.assignments.set(next);
    this.customPlayerName = '';
    this.refreshPreview();
  }

  protected isRoleSelected(roleId: string): boolean {
    return this.selectedRoleIds().includes(roleId);
  }

  protected toggleRole(roleId: string): void {
    this.selectedRoleIds.update((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    );
  }

  private buildKickoffDate(): Date | null {
    if (!this.kickoffDate) return null;
    const time = this.kickoffTime || '20:00';
    const parsed = new Date(`${this.kickoffDate}T${time}:00Z`);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  protected formatKickoffFor(timeZone: string): string {
    const d = this.buildKickoffDate();
    if (!d) return 'Kickoff pending';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch {
      return d.toISOString().replace('T', ' ').slice(0, 16);
    }
  }

  protected async refreshPreview(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    this.isLoadingPreview.set(true);
    try {
      const payload: LineupRenderPayload = {
        formation: this.selectedFormation,
        title: this.title,
        players: this.assignments(),
        kickoff_at: this.buildKickoffDate()?.toISOString() || null,
        primary_color: this.primaryColor,
        secondary_color: this.secondaryColor,
        show_slot_tags: true,
      };

      const res = await this.api.renderLineup(guildId, payload);
      this.previewSvg.set(res.svg);
    } catch (err) {
      console.error('Failed to render lineup preview:', err);
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  protected async saveDraft(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    this.isSavingDraft.set(true);
    try {
      const payload = {
        title: this.title,
        channel_id: this.channelId || null,
        formation: this.selectedFormation,
        kickoff_at: this.buildKickoffDate()?.toISOString() || null,
        timezone: this.timezone,
        mention_role_ids: this.selectedRoleIds(),
        assignments: this.assignments(),
      };

      if (this.draftId) {
        await this.api.updateLineupDraft(guildId, this.draftId, payload);
      } else {
        const created = await this.api.createLineupDraft(guildId, payload);
        this.draftId = created.id;
      }

      this.notification.set({ message: 'Lineup draft saved successfully!', type: 'success' });
    } catch (err) {
      console.error('Failed to save draft:', err);
      this.notification.set({ message: 'Failed to save lineup draft.', type: 'error' });
    } finally {
      this.isSavingDraft.set(false);
    }
  }

  protected async publishToDiscord(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId || !this.channelId) {
      this.notification.set({ message: 'Please select a Discord target channel in Step 3.', type: 'error' });
      return;
    }

    this.isPosting.set(true);
    try {
      const payload: LineupPostPayload = {
        channel_id: this.channelId,
        formation: this.selectedFormation,
        title: this.title,
        players: this.assignments(),
        kickoff_at: this.buildKickoffDate()?.toISOString() || null,
        mention_role_ids: this.selectedRoleIds(),
        primary_color: this.primaryColor,
        secondary_color: this.secondaryColor,
        show_slot_tags: true,
      };

      const res = await this.api.postLineup(guildId, payload);
      this.notification.set({
        message: `Lineup graphic posted to Discord successfully! Message ID: ${res.message_id}`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Failed to post lineup to Discord:', err);
      this.notification.set({
        message: `Failed to post lineup: ${err?.error?.message || err?.message || 'Check bot permissions'}`,
        type: 'error',
      });
    } finally {
      this.isPosting.set(false);
    }
  }
}
