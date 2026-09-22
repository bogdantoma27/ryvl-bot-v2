import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { EventCreatePayload } from '../../core/models';

type StepNumber = 1 | 2 | 3 | 4;

const PRESET_COLORS = [
  { name: 'Blurple', hex: '#5865F2' },
  { name: 'Green', hex: '#57F287' },
  { name: 'Yellow', hex: '#FEE75C' },
  { name: 'Fuchsia', hex: '#EB459E' },
  { name: 'Red', hex: '#ED4245' },
  { name: 'Cyan', hex: '#00A8FC' },
  { name: 'Coral', hex: '#F26522' },
  { name: 'White', hex: '#FFFFFF' },
];

const WEEKDAYS = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Bucharest',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
];

@Component({
  selector: 'app-event-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, TitleCasePipe],
  template: `
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- Breadcrumb & Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-700/60 pb-4">
        <div>
          <nav class="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <a routerLink="/events" class="hover:text-slate-200">Events</a>
            <span>/</span>
            <span class="text-[#5865F2]">New Event</span>
          </nav>
          <h1 class="text-2xl font-bold text-white tracking-tight">Create Guild Event</h1>
        </div>
        <a
          routerLink="/events"
          class="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 self-start sm:self-center transition"
        >
          Cancel
        </a>
      </div>

      <!-- Main Stepper Layout: Left Stepper, Right Form Panels -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
        <!-- Vertical Stepper (md: 3 columns) -->
        <div class="md:col-span-4 lg:col-span-3">
          <nav class="flex flex-row md:flex-col justify-between md:justify-start gap-4 md:gap-0 sticky top-6">
            @for (stepItem of steps; track stepItem.num) {
              <div class="flex items-start gap-3 relative pb-6 md:pb-8">
                <!-- Vertical Line between circles (except last) -->
                @if (stepItem.num < 4) {
                  <div
                    class="hidden md:block absolute left-4 top-8 w-0.5 h-[calc(100%-24px)]"
                    [class.bg-[#5865F2]]="currentStep() > stepItem.num"
                    [class.bg-slate-700]="currentStep() <= stepItem.num"
                  ></div>
                }

                <!-- Step Circle -->
                <button
                  type="button"
                  (click)="goToStep(stepItem.num)"
                  class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition relative z-10 cursor-pointer"
                  [class.bg-[#5865F2]]="currentStep() === stepItem.num"
                  [class.text-white]="currentStep() === stepItem.num"
                  [class.shadow-lg]="currentStep() === stepItem.num"
                  [class.shadow-indigo-500/30]="currentStep() === stepItem.num"
                  [class.bg-emerald-500]="currentStep() > stepItem.num"
                  [class.text-white]="currentStep() > stepItem.num"
                  [class.bg-slate-800]="currentStep() < stepItem.num"
                  [class.text-slate-300]="currentStep() < stepItem.num"
                  [class.border]="currentStep() < stepItem.num"
                  [class.border-slate-600]="currentStep() < stepItem.num"
                >
                  @if (currentStep() > stepItem.num) {
                    ✓
                  } @else {
                    {{ stepItem.num }}
                  }
                </button>

                <!-- Step Label -->
                <div class="hidden md:block text-left pt-1">
                  <div
                    class="text-xs font-semibold leading-none"
                    [class.text-white]="currentStep() >= stepItem.num"
                    [class.text-slate-400]="currentStep() < stepItem.num"
                  >
                    {{ stepItem.title }}
                  </div>
                  <div class="text-[11px] text-slate-400 mt-1">{{ stepItem.sub }}</div>
                </div>
              </div>
            }
          </nav>
        </div>

        <!-- Form Content (md: 8/9 columns) -->
        <div class="md:col-span-8 lg:col-span-9 bg-[#16213e] border border-slate-700/60 rounded-xl p-6 shadow-xl">
          @if (errorMessage()) {
            <div class="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <!-- STEP 1: Details -->
          @if (currentStep() === 1) {
            <div class="space-y-5 animate-fadeIn">
              <div class="border-b border-slate-700/50 pb-3">
                <h2 class="text-lg font-bold text-white">Event Details</h2>
                <p class="text-xs text-slate-400">Give your event a memorable title, description, and visual identity.</p>
              </div>

              <!-- Title -->
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">
                  Event Title <span class="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  [ngModel]="title()"
                  (ngModelChange)="title.set($event)"
                  placeholder="e.g. Weekly Premier Scrim vs Team Phoenix"
                  class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2] transition"
                />
              </div>

              <!-- Description -->
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  [ngModel]="description()"
                  (ngModelChange)="description.set($event)"
                  rows="4"
                  placeholder="Provide instructions, voice channel notes, tactical requirements..."
                  class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2] transition"
                ></textarea>
              </div>

              <!-- Location -->
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Location / Channel Note</label>
                <input
                  type="text"
                  [ngModel]="location()"
                  (ngModelChange)="location.set($event)"
                  placeholder="e.g. Discord Voice: Match Lobby 1 or In-game Server"
                  class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5865F2] transition"
                />
              </div>

              <!-- Color Picker -->
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-2">Accent Color</label>
                <div class="flex flex-wrap items-center gap-3">
                  @for (preset of presetColors; track preset.hex) {
                    <button
                      type="button"
                      (click)="color.set(preset.hex)"
                      class="w-7 h-7 rounded-full border-2 transition transform hover:scale-110 flex items-center justify-center text-xs"
                      [style.background-color]="preset.hex"
                      [class.border-white]="color() === preset.hex"
                      [class.border-transparent]="color() !== preset.hex"
                      [class.shadow-md]="color() === preset.hex"
                      [title]="preset.name"
                    >
                      @if (color() === preset.hex) {
                        <span [class.text-black]="preset.hex === '#FFFFFF'" [class.text-white]="preset.hex !== '#FFFFFF'">✓</span>
                      }
                    </button>
                  }
                  <input
                    type="color"
                    [ngModel]="color()"
                    (ngModelChange)="color.set($event)"
                    class="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                    title="Custom color"
                  />
                </div>
              </div>

              <!-- Step 1 Actions -->
              <div class="pt-4 flex justify-end">
                <button
                  type="button"
                  (click)="nextStep()"
                  [disabled]="!title().trim()"
                  class="px-5 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md hover:shadow-indigo-500/25 transition active:scale-95 cursor-pointer"
                >
                  Continue to Schedule →
                </button>
              </div>
            </div>
          }

          <!-- STEP 2: Schedule -->
          @if (currentStep() === 2) {
            <div class="space-y-5 animate-fadeIn">
              <div class="border-b border-slate-700/50 pb-3">
                <h2 class="text-lg font-bold text-white">Schedule</h2>
                <p class="text-xs text-slate-400">Specify when the event starts, duration, and time zone.</p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Date -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">
                    Event Date <span class="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    [ngModel]="date()"
                    (ngModelChange)="date.set($event)"
                    class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
                  />
                </div>

                <!-- Time -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">
                    Start Time <span class="text-rose-400">*</span>
                  </label>
                  <input
                    type="time"
                    [ngModel]="time()"
                    (ngModelChange)="time.set($event)"
                    class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Duration -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Duration</label>
                  <select
                    [ngModel]="duration()"
                    (ngModelChange)="duration.set($event)"
                    class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
                  >
                    <option value="30min">30 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="1.5h">1.5 hours</option>
                    <option value="2h">2 hours</option>
                    <option value="3h">3 hours</option>
                    <option value="custom">Custom duration</option>
                  </select>

                  @if (duration() === 'custom') {
                    <div class="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="1440"
                        [ngModel]="customDurationMinutes()"
                        (ngModelChange)="customDurationMinutes.set($event)"
                        class="w-32 bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                      />
                      <span class="text-xs text-slate-400">minutes</span>
                    </div>
                  }
                </div>

                <!-- Timezone -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Timezone</label>
                  <select
                    [ngModel]="timezone()"
                    (ngModelChange)="timezone.set($event)"
                    class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
                  >
                    @for (tz of timezones; track tz) {
                      <option [value]="tz">{{ tz }}</option>
                    }
                  </select>
                </div>
              </div>

              <!-- Step 2 Actions -->
              <div class="pt-4 flex items-center justify-between border-t border-slate-700/50">
                <button
                  type="button"
                  (click)="prevStep()"
                  class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-600 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  (click)="nextStep()"
                  [disabled]="!date() || !time()"
                  class="px-5 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md hover:shadow-indigo-500/25 transition active:scale-95 cursor-pointer"
                >
                  Continue to Recurrence →
                </button>
              </div>
            </div>
          }

          <!-- STEP 3: Recurrence -->
          @if (currentStep() === 3) {
            <div class="space-y-5 animate-fadeIn">
              <div class="border-b border-slate-700/50 pb-3">
                <h2 class="text-lg font-bold text-white">Recurrence</h2>
                <p class="text-xs text-slate-400">Configure repetition rules or keep as a one-time event.</p>
              </div>

              <!-- Toggle One-time vs Recurring -->
              <div class="p-4 rounded-xl bg-[#1a1a2e] border border-slate-700 flex items-center justify-between">
                <div>
                  <div class="text-sm font-semibold text-white">Recurring Event</div>
                  <div class="text-xs text-slate-400">Automatically generate future occurrences and post RSVP alerts</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    [checked]="isRecurring()"
                    (change)="isRecurring.set(!isRecurring())"
                    class="sr-only peer"
                  />
                  <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5865F2]"></div>
                </label>
              </div>

              @if (isRecurring()) {
                <div class="space-y-4 pt-2">
                  <!-- Frequency -->
                  <div>
                    <label class="block text-xs font-semibold text-slate-300 mb-1">Frequency</label>
                    <select
                      [ngModel]="frequency()"
                      (ngModelChange)="frequency.set($event)"
                      class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly (Every 2 weeks)</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  <!-- Weekday checkboxes (if Weekly or Biweekly) -->
                  @if (frequency() === 'weekly' || frequency() === 'biweekly') {
                    <div>
                      <label class="block text-xs font-semibold text-slate-300 mb-2">Repeat on Days</label>
                      <div class="flex flex-wrap gap-2">
                        @for (day of weekdays; track day.id) {
                          <button
                            type="button"
                            (click)="toggleWeekday(day.id)"
                            class="px-3.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer"
                            [class.bg-[#5865F2]]="selectedWeekdays().includes(day.id)"
                            [class.border-[#5865F2]]="selectedWeekdays().includes(day.id)"
                            [class.text-white]="selectedWeekdays().includes(day.id)"
                            [class.shadow-sm]="selectedWeekdays().includes(day.id)"
                            [class.bg-slate-800]="!selectedWeekdays().includes(day.id)"
                            [class.border-slate-700]="!selectedWeekdays().includes(day.id)"
                            [class.text-slate-200]="!selectedWeekdays().includes(day.id)"
                          >
                            {{ day.label }}
                          </button>
                        }
                      </div>
                    </div>
                  }

                  <!-- Monthly Options -->
                  @if (frequency() === 'monthly') {
                    <div class="space-y-2">
                      <label class="block text-xs font-semibold text-slate-300 mb-1">Monthly Rule</label>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label
                          (click)="monthlyType.set('day_of_month')"
                          class="p-3 rounded-lg border cursor-pointer flex items-center gap-2"
                          [class.border-[#5865F2]]="monthlyType() === 'day_of_month'"
                          [class.bg-indigo-500/10]="monthlyType() === 'day_of_month'"
                          [class.border-slate-700]="monthlyType() !== 'day_of_month'"
                        >
                          <input type="radio" name="monthlyRule" [checked]="monthlyType() === 'day_of_month'" class="text-[#5865F2]" />
                          <span class="text-xs text-slate-200">On this day of the month</span>
                        </label>
                        <label
                          (click)="monthlyType.set('nth_weekday')"
                          class="p-3 rounded-lg border cursor-pointer flex items-center gap-2"
                          [class.border-[#5865F2]]="monthlyType() === 'nth_weekday'"
                          [class.bg-indigo-500/10]="monthlyType() === 'nth_weekday'"
                          [class.border-slate-700]="monthlyType() !== 'nth_weekday'"
                        >
                          <input type="radio" name="monthlyRule" [checked]="monthlyType() === 'nth_weekday'" class="text-[#5865F2]" />
                          <span class="text-xs text-slate-200">On the Nth weekday</span>
                        </label>
                      </div>
                    </div>
                  }

                  <!-- End Condition -->
                  <div>
                    <label class="block text-xs font-semibold text-slate-300 mb-1">End Condition</label>
                    <select
                      [ngModel]="endCondition()"
                      (ngModelChange)="endCondition.set($event)"
                      class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
                    >
                      <option value="never">Never (Keep generating)</option>
                      <option value="after_count">After a specific number of occurrences</option>
                      <option value="on_date">On a specific date</option>
                    </select>

                    @if (endCondition() === 'after_count') {
                      <div class="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="52"
                          [ngModel]="endCount()"
                          (ngModelChange)="endCount.set($event)"
                          class="w-28 bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                        />
                        <span class="text-xs text-slate-400">occurrences</span>
                      </div>
                    }

                    @if (endCondition() === 'on_date') {
                      <div class="mt-2">
                        <input
                          type="date"
                          [ngModel]="endDate()"
                          (ngModelChange)="endDate.set($event)"
                          class="w-full sm:w-64 bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Step 3 Actions -->
              <div class="pt-4 flex items-center justify-between border-t border-slate-700/50">
                <button
                  type="button"
                  (click)="prevStep()"
                  class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-600 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  (click)="nextStep()"
                  class="px-5 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-md hover:shadow-indigo-500/25 transition active:scale-95 cursor-pointer"
                >
                  Continue to Publish & Review →
                </button>
              </div>
            </div>
          }

          <!-- STEP 4: Publish & Review -->
          @if (currentStep() === 4) {
            <div class="space-y-6 animate-fadeIn">
              <div class="border-b border-slate-700/50 pb-3">
                <h2 class="text-lg font-bold text-white">Publish Settings & Review</h2>
                <p class="text-xs text-slate-400">Choose Discord target channel, mention roles, and verify all details.</p>
              </div>

              <!-- Channel Selector -->
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">
                  Announce in Channel <span class="text-rose-400">*</span>
                </label>
                <select
                  [ngModel]="channelId()"
                  (ngModelChange)="channelId.set($event)"
                  class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
                >
                  <option value="">Select a Discord text channel</option>
                  @for (ch of channels(); track ch.id) {
                    <option [value]="ch.id" [selected]="ch.id === channelId()"># {{ ch.name }}</option>
                  }
                </select>
              </div>

              <!-- Role Mentions -->
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-2">Mention Roles</label>
                <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 rounded-lg bg-[#1a1a2e] border border-slate-700">
                  @if (roles().length === 0) {
                    <p class="text-xs text-slate-500 py-2">No roles available</p>
                  } @else {
                    @for (role of roles(); track role.id) {
                      <button
                        type="button"
                        (click)="toggleRole(role.id)"
                        class="px-3 py-1.5 rounded-md text-xs font-semibold border flex items-center gap-2 transition cursor-pointer"
                        [class.bg-[#5865F2]]="selectedRoleIds().includes(role.id)"
                        [class.border-[#5865F2]]="selectedRoleIds().includes(role.id)"
                        [class.text-white]="selectedRoleIds().includes(role.id)"
                        [class.shadow-sm]="selectedRoleIds().includes(role.id)"
                        [class.bg-slate-800]="!selectedRoleIds().includes(role.id)"
                        [class.border-slate-700]="!selectedRoleIds().includes(role.id)"
                        [class.text-slate-200]="!selectedRoleIds().includes(role.id)"
                      >
                        <span class="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0" [style.background-color]="role.color || '#5865F2'"></span>
                        <span>@{{ role.name }}</span>
                      </button>
                    }
                  }
                </div>
              </div>

              <!-- Review Summary Card -->
              <div class="p-4 rounded-xl bg-[#11192e] border border-slate-700 space-y-3">
                <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
                  <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Review Summary</span>
                  <div class="w-3 h-3 rounded-full" [style.background-color]="color()"></div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span class="text-slate-400">Title:</span>
                    <p class="font-semibold text-white truncate">{{ title() }}</p>
                  </div>
                  <div>
                    <span class="text-slate-400">Kickoff:</span>
                    <p class="font-semibold text-white">{{ date() }} at {{ time() }} ({{ timezone() }})</p>
                  </div>
                  <div>
                    <span class="text-slate-400">Duration:</span>
                    <p class="font-semibold text-white">{{ duration() === 'custom' ? customDurationMinutes() + ' min' : duration() }}</p>
                  </div>
                  <div>
                    <span class="text-slate-400">Recurrence:</span>
                    <p class="font-semibold text-white">
                      {{ isRecurring() ? (frequency() | titlecase) : 'One-time event' }}
                    </p>
                  </div>
                  <div>
                    <span class="text-slate-400">Post Channel:</span>
                    <p class="font-semibold text-indigo-300"># {{ selectedChannelName() }}</p>
                  </div>
                  <div>
                    <span class="text-slate-400">Mentions:</span>
                    <p class="font-semibold text-slate-300">{{ selectedRoleNames() }}</p>
                  </div>
                </div>
              </div>

              <!-- Step 4 Actions -->
              <div class="pt-4 flex items-center justify-between border-t border-slate-700/50">
                <button
                  type="button"
                  (click)="prevStep()"
                  class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-600 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  (click)="submitEvent()"
                  [disabled]="isSubmitting() || !channelId()"
                  class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-emerald-600/25 transition active:scale-95 cursor-pointer"
                >
                  @if (isSubmitting()) {
                    <span class="inline-block animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                    <span>Creating...</span>
                  } @else {
                    <span>🚀 Create & Publish Event</span>
                  }
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: ``,
})
export class EventCreateComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly guildStore = inject(GuildStore);

  readonly currentStep = signal<StepNumber>(1);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  // Form Fields
  readonly title = signal<string>('');
  readonly description = signal<string>('');
  readonly location = signal<string>('');
  readonly color = signal<string>('#5865F2');

  readonly date = signal<string>(this.getTodayDateString());
  readonly time = signal<string>('20:00');
  readonly duration = signal<string>('1h');
  readonly customDurationMinutes = signal<number>(60);
  readonly timezone = signal<string>('UTC');

  readonly isRecurring = signal<boolean>(false);
  readonly frequency = signal<'daily' | 'weekly' | 'biweekly' | 'monthly'>('weekly');
  readonly selectedWeekdays = signal<number[]>([1]);
  readonly monthlyType = signal<'day_of_month' | 'nth_weekday'>('day_of_month');
  readonly endCondition = signal<'never' | 'after_count' | 'on_date'>('never');
  readonly endCount = signal<number>(5);
  readonly endDate = signal<string>('');

  readonly channelId = signal<string>('');
  readonly selectedRoleIds = signal<string[]>([]);

  readonly presetColors = PRESET_COLORS;
  readonly weekdays = WEEKDAYS;
  readonly timezones = TIMEZONES;

  readonly steps: { num: StepNumber; title: string; sub: string }[] = [
    { num: 1, title: 'Details', sub: 'Title & visual' },
    { num: 2, title: 'Schedule', sub: 'Date & duration' },
    { num: 3, title: 'Recurrence', sub: 'Repeat rules' },
    { num: 4, title: 'Publish', sub: 'Channel & review' },
  ];

  readonly channels = computed(() => this.guildStore.activeGuild()?.channels ?? []);
  readonly roles = computed(() => this.guildStore.activeGuild()?.roles ?? []);

  readonly selectedChannelName = computed(() => {
    const ch = this.channels().find((c) => c.id === this.channelId());
    return ch ? ch.name : 'None selected';
  });

  readonly selectedRoleNames = computed(() => {
    const rIds = this.selectedRoleIds();
    if (rIds.length === 0) return 'None';
    const names = this.roles()
      .filter((r) => rIds.includes(r.id))
      .map((r) => '@' + r.name);
    return names.join(', ');
  });

  constructor() {
    effect(() => {
      const active = this.guildStore.activeGuild();
      if (active) {
        if (active.defaultTimezone && this.timezone() === 'UTC') {
          this.timezone.set(active.defaultTimezone);
        }
        const defaultChannel = active.settings?.defaultChannelId;
        const channelExists = defaultChannel && active.channels.some((c) => c.id === defaultChannel);
        if (channelExists) {
          this.channelId.set(defaultChannel!);
        } else if (active.channels.length > 0 && !this.channelId()) {
          this.channelId.set(active.channels[0].id);
        }
      }
    });
  }

  ngOnInit(): void {
    const active = this.guildStore.activeGuild();
    if (active) {
      if (active.defaultTimezone && this.timezone() === 'UTC') {
        this.timezone.set(active.defaultTimezone);
      }
      const defaultChannel = active.settings?.defaultChannelId;
      const channelExists = defaultChannel && active.channels.some((c) => c.id === defaultChannel);
      if (channelExists) {
        this.channelId.set(defaultChannel!);
      } else if (active.channels.length > 0 && !this.channelId()) {
        this.channelId.set(active.channels[0].id);
      }
    }
  }

  goToStep(step: StepNumber): void {
    if (step <= this.currentStep()) {
      this.currentStep.set(step);
    } else if (step === 2 && this.title().trim()) {
      this.currentStep.set(2);
    } else if (step === 3 && this.title().trim() && this.date()) {
      this.currentStep.set(3);
    } else if (step === 4 && this.title().trim() && this.date()) {
      this.currentStep.set(4);
    }
  }

  nextStep(): void {
    const current = this.currentStep();
    if (current === 1) {
      if (!this.title().trim()) {
        this.errorMessage.set('Event title is required');
        return;
      }
      this.errorMessage.set(null);
      this.currentStep.set(2);
    } else if (current === 2) {
      if (!this.date() || !this.time()) {
        this.errorMessage.set('Date and start time are required');
        return;
      }
      this.errorMessage.set(null);
      this.currentStep.set(3);
    } else if (current === 3) {
      this.errorMessage.set(null);
      this.currentStep.set(4);
    }
  }

  prevStep(): void {
    const current = this.currentStep();
    if (current > 1) {
      this.currentStep.set((current - 1) as StepNumber);
    }
  }

  toggleWeekday(dayId: number): void {
    const current = this.selectedWeekdays();
    if (current.includes(dayId)) {
      if (current.length > 1) {
        this.selectedWeekdays.set(current.filter((d) => d !== dayId));
      }
    } else {
      this.selectedWeekdays.set([...current, dayId]);
    }
  }

  toggleRole(roleId: string): void {
    const current = this.selectedRoleIds();
    if (current.includes(roleId)) {
      this.selectedRoleIds.set(current.filter((r) => r !== roleId));
    } else {
      this.selectedRoleIds.set([...current, roleId]);
    }
  }

  async submitEvent(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) {
      this.errorMessage.set('No active guild selected');
      return;
    }

    if (!this.title().trim()) {
      this.errorMessage.set('Title is required');
      this.currentStep.set(1);
      return;
    }

    if (!this.channelId()) {
      this.errorMessage.set('Please select an announcement channel');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const payload: EventCreatePayload = {
      title: this.title().trim(),
      description: this.description().trim(),
      location: this.location().trim(),
      color: this.color(),
      date: this.date(),
      time: this.time(),
      duration: this.duration() === 'custom' ? `${this.customDurationMinutes()}min` : this.duration(),
      timezone: this.timezone(),
      isRecurring: this.isRecurring(),
      frequency: this.isRecurring() ? this.frequency() : undefined,
      weekdays: this.isRecurring() && (this.frequency() === 'weekly' || this.frequency() === 'biweekly')
        ? this.selectedWeekdays()
        : undefined,
      monthlyType: this.isRecurring() && this.frequency() === 'monthly' ? this.monthlyType() : undefined,
      endCondition: this.isRecurring() ? this.endCondition() : undefined,
      endCount: this.isRecurring() && this.endCondition() === 'after_count' ? this.endCount() : undefined,
      endDate: this.isRecurring() && this.endCondition() === 'on_date' ? this.endDate() : undefined,
      channelId: this.channelId(),
      roleMentionIds: this.selectedRoleIds(),
    };

    try {
      const created = await this.api.createEvent(guildId, payload);
      this.router.navigate(['/events', created.id]);
    } catch (err: any) {
      console.error('Failed to create event:', err);
      const msg = err?.error?.message || err?.message || 'Failed to create event on server. Please try again.';
      this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private getTodayDateString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
