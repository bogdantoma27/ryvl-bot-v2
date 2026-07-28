import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService, AttendanceEvent, AttendanceSeries, ChannelOption, GuildMemberOption, RoleOption, VoteStatus } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

interface EventOption {
  id: number;
  label: string;
}

interface ManageEventRow {
  id: number;
  title: string;
  occurrence_number: number;
  starts_at: string;
  timezone: string;
  status: AttendanceEvent['status'];
  votes_count: number;
  channel_id: string;
}

type ManageStatusFilter = 'all' | AttendanceEvent['status'];
type VoteBucket = 'accepted' | 'declined' | 'tentative';

function todayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-attendance-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <header class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Attendance</p>
        <h1 class="text-2xl font-semibold text-slate-100">Create and manage attendance</h1>
      </header>

      <form class="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-2" (ngSubmit)="create()">
        <div class="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Event setup</p>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Post channel</span>
            <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.channel_id" name="channel_id" required>
              <option value="">Select a channel</option>
              @for (channel of channels(); track channel.id) {
                <option [value]="channel.id">#{{ channel.name }}</option>
              }
            </select>
          </label>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Title</span>
            <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.title" (ngModelChange)="touchPreview()" name="title" required />
          </label>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Description</span>
            <textarea class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" rows="3" [(ngModel)]="form.description" (ngModelChange)="touchPreview()" name="description"></textarea>
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1">
              <span class="text-xs text-slate-400">Kickoff date</span>
              <input #kickoffDateInput class="picker-input w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="date" [(ngModel)]="form.kickoff_date" (click)="openNativePicker(kickoffDateInput)" (focus)="openNativePicker(kickoffDateInput)" (ngModelChange)="touchPreview()" name="kickoff_date" required />
            </label>

            <label class="space-y-1">
              <span class="text-xs text-slate-400">Kickoff time</span>
              <input #kickoffTimeInput class="picker-input w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="time" [(ngModel)]="form.kickoff_time" (click)="openNativePicker(kickoffTimeInput)" (focus)="openNativePicker(kickoffTimeInput)" (ngModelChange)="touchPreview()" name="kickoff_time" required />
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 sm:col-span-2">
              <span class="text-xs text-slate-400">Timezone</span>
              <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.timezone" (ngModelChange)="touchPreview()" name="timezone">
                <option value="Europe/Bucharest">Europe/Bucharest</option>
                <option value="Europe/London">Europe/London</option>
                <option value="UTC">UTC</option>
              </select>
            </label>

            <div class="space-y-2 sm:col-span-2">
              <span class="text-xs text-slate-400">Mention roles</span>
              <button type="button" class="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm text-slate-100" (click)="toggleMentionRoles()">
                <span class="truncate">Mention roles (optional)</span>
                <span class="text-xs text-slate-500">{{ mentionRolesOpen() ? 'Hide' : 'Select' }}</span>
              </button>

              @if (mentionRolesOpen()) {
                @if (roles().length) {
                  <div class="grid gap-2 sm:grid-cols-2">
                    @for (role of roles(); track role.id) {
                      <label class="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          class="h-4 w-4"
                          [checked]="mentionRoleChecked(role.id)"
                          (change)="toggleMentionRole(role.id, $any($event.target).checked)"
                        />
                        <span>@{{ role.name }}</span>
                      </label>
                    }
                  </div>
                } @else {
                  <p class="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-2 py-2 text-xs text-slate-500">No roles loaded from Discord.</p>
                }
              }
            </div>

            <label class="space-y-1">
              <span class="text-xs text-slate-400">Recurrence</span>
              <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.recurrence" (ngModelChange)="touchPreview()" name="recurrence">
                <option value="none">One time</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>

            <label class="space-y-1" [class.opacity-40]="form.recurrence === 'none'">
              <span class="text-xs text-slate-400">Repeat count</span>
              <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="number" min="2" max="52" [(ngModel)]="form.repeat_count" (ngModelChange)="touchPreview()" name="repeat_count" [disabled]="form.recurrence === 'none'" />
            </label>
          </div>
        </div>

        <div class="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Discord preview</p>
          <div class="discord-message rounded-lg border border-[#23262b] bg-[#313338] p-3 text-sm text-[#dbdee1]">
            <div class="mb-2 flex items-center gap-2">
              <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-xs font-semibold text-white">RB</span>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white">RYVL Bot</p>
                <p class="text-[11px] text-[#b5bac1]">Today at {{ attendancePreviewClock() }}</p>
              </div>
            </div>

            @if (previewRoleMentions()) {
              <p class="mb-1 text-[13px] font-semibold text-[#f0b132]">{{ previewRoleMentions() }}</p>
            }

            <div class="discord-embed flex gap-0 overflow-hidden rounded-md border border-[#1f2124] bg-[#2b2d31]">
              <div class="w-1 shrink-0 bg-[#2563eb]"></div>
              <div class="min-w-0 space-y-2 p-3">
                <p class="wrap-break-word text-[15px] font-semibold text-white">{{ attendancePreviewTitle() }}</p>
                <p class="wrap-break-word text-[13px] text-[#dbdee1]">{{ attendancePreviewDescription() }}</p>

                <p class="text-[13px] text-[#dbdee1]">Created by: <span class="rounded bg-[#3f48cc]/40 px-1.5 py-0.5 text-[#b9c0ff]">@{{ attendancePreviewCreator() }}</span></p>
                <p class="text-[13px] text-white">🇷🇴 {{ attendancePreviewRo() }}</p>
                <p class="text-[13px] text-white">🇬🇧 {{ attendancePreviewUk() }}</p>
                <p class="text-[13px] text-[#dbdee1]">Click one button below to set or change your response.</p>

                @if (form.recurrence === 'weekly') {
                  <p class="text-[12px] text-[#b5bac1]">Series: Weekly ({{ form.repeat_count || 0 }} occurrences)</p>
                }

                <div class="grid gap-2 sm:grid-cols-3">
                  <div>
                    <p class="text-[24px] leading-none">✅</p>
                    <p class="mt-1 text-[13px] font-semibold text-white">Accept (0)</p>
                    <p class="text-[13px] text-[#dbdee1]">-</p>
                  </div>
                  <div>
                    <p class="text-[24px] leading-none">❌</p>
                    <p class="mt-1 text-[13px] font-semibold text-white">Decline (0)</p>
                    <p class="text-[13px] text-[#dbdee1]">-</p>
                  </div>
                  <div>
                    <p class="text-[24px] leading-none">🟡</p>
                    <p class="mt-1 text-[13px] font-semibold text-white">Tentative (0)</p>
                    <p class="text-[13px] text-[#dbdee1]">-</p>
                  </div>
                </div>

                <p class="text-[11px] text-[#b5bac1]">Event ID: pending - Updated {{ attendancePreviewFooterTime() }}</p>
              </div>
            </div>

            <div class="mt-2 flex flex-wrap gap-2">
              <button class="rounded-md bg-[#248046] px-3 py-1.5 text-sm font-semibold text-white" type="button">✅ Accept</button>
              <button class="rounded-md bg-[#da373c] px-3 py-1.5 text-sm font-semibold text-white" type="button">❌ Decline</button>
              <button class="rounded-md bg-[#4e5058] px-3 py-1.5 text-sm font-semibold text-white" type="button">🟡 Tentative</button>
            </div>
          </div>
          <p class="text-xs text-slate-500">Preview matches Discord embed layout: role mentions, creator, timezone lines, vote blocks and vote buttons.</p>
        </div>

        <div class="md:col-span-2 flex justify-end">
          <button class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50" [disabled]="loading()" type="submit">
            {{ loading() ? 'Creating...' : 'Create attendance' }}
          </button>
        </div>
      </form>

      <section class="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-100">Manage events</h2>
          <button class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800" (click)="load()">Refresh</button>
        </div>

        <div class="grid gap-3 md:grid-cols-3">
          <label class="space-y-1">
            <span class="text-xs text-slate-400">Select event</span>
            <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [ngModel]="selectedEventId()" (ngModelChange)="pickEvent($event)" name="selected_event_id">
              <option [ngValue]="null">Select event</option>
              @for (option of eventOptions(); track option.id) {
                <option [ngValue]="option.id">{{ option.label }}</option>
              }
            </select>
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-400">Filter by status</span>
            <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [ngModel]="manageStatusFilter()" (ngModelChange)="setManageStatusFilter($event)" name="manage_status_filter">
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-400">Search</span>
            <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [ngModel]="manageSearch()" (ngModelChange)="setManageSearch($event)" name="manage_search" placeholder="title, channel, id" />
          </label>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" class="h-4 w-4" [checked]="areAllVisibleManageRowsSelected()" (change)="selectVisibleManageRows($any($event.target).checked)" />
            <span>Select visible rows</span>
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <span>{{ selectedManageRows().length }} selected</span>
            <button type="button" class="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:opacity-40" [disabled]="!selectedManageRows().length || loading()" (click)="cancelSelectedManageEvents()">Cancel selected</button>
            <button type="button" class="rounded border border-rose-500/60 px-2 py-1 text-rose-200 disabled:opacity-40" [disabled]="!hasSelectedCancelledManageRows() || loading()" (click)="deleteSelectedCancelledManageEvents()">Delete cancelled</button>
            <button type="button" class="rounded border border-slate-700 px-2 py-1 text-slate-200" (click)="clearManageSelection()">Clear</button>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
          <table class="min-w-full text-left text-sm">
            <thead class="bg-slate-900/80 text-xs uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th class="px-3 py-2"><span class="sr-only">Select</span></th>
                <th class="px-3 py-2">Event ID</th>
                <th class="px-3 py-2">Title</th>
                <th class="px-3 py-2">Occ.</th>
                <th class="px-3 py-2">Kickoff</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Votes</th>
                <th class="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (row of pagedManageRows(); track row.id) {
                <tr
                  class="border-t border-slate-800"
                  [class.bg-slate-900/60]="selectedEventId() === row.id"
                  [class.cursor-pointer]="row.status !== 'cancelled'"
                  [class.hover:bg-slate-900/40]="row.status !== 'cancelled'"
                  (click)="pickEventFromRow(row.id, row.status)"
                >
                  <td class="px-3 py-2 align-middle">
                    <input type="checkbox" class="h-4 w-4" [checked]="isManageRowSelected(row.id)" (click)="$event.stopPropagation()" (change)="toggleManageRowSelection(row.id, $any($event.target).checked)" />
                  </td>
                  <td class="px-3 py-2 text-slate-300">#{{ row.id }}</td>
                  <td class="px-3 py-2 text-slate-100">{{ row.title }}</td>
                  <td class="px-3 py-2 text-slate-300">{{ row.occurrence_number }}</td>
                  <td class="px-3 py-2 text-slate-300">{{ formatKickoffInTimezone(row.starts_at, row.timezone) }}</td>
                  <td class="px-3 py-2" [class.text-emerald-300]="row.status === 'open' || row.status === 'scheduled'" [class.text-rose-300]="row.status === 'closed' || row.status === 'cancelled'">{{ row.status }}</td>
                  <td class="px-3 py-2 text-slate-300">{{ row.votes_count }}</td>
                  <td class="px-3 py-2">
                    @if (row.status === 'cancelled') {
                      <button class="rounded-lg border border-rose-500/60 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/10" type="button" (click)="$event.stopPropagation(); deleteCancelledEvent(row.id)">Delete permanently</button>
                    } @else {
                      <button class="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-800" type="button" (click)="$event.stopPropagation(); pickEvent(row.id)">Edit</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td class="px-3 py-4 text-slate-400" colspan="8">No attendance events yet.</td>
                </tr>
              }
            </tbody>
          </table>
          <div class="flex items-center justify-between border-t border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
            <p>Showing {{ pageStartIndex() }}-{{ pageEndIndex() }} of {{ filteredManageRows().length }}</p>
            <div class="flex items-center gap-2">
              <button class="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:opacity-40" type="button" [disabled]="managePage() <= 1" (click)="prevManagePage()">Prev</button>
              <span>Page {{ managePage() }} / {{ manageTotalPages() }}</span>
              <button class="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:opacity-40" type="button" [disabled]="managePage() >= manageTotalPages()" (click)="nextManagePage()">Next</button>
            </div>
          </div>
        </div>

        @if (selectedEvent()) {
          <form class="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 md:grid-cols-2">
            <p class="md:col-span-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Edit event #{{ selectedEvent()!.id }}</p>
            <p class="md:col-span-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
              Changes are saved live. No manual save is required.
            </p>
            @if (selectedEvent()!.status === 'cancelled') {
              <div class="md:col-span-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                This event is cancelled and cannot be edited. You can only permanently delete it from history.
              </div>
            }
            <label class="space-y-1 md:col-span-2">
              <span class="text-xs text-slate-400">Title</span>
              <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50" [(ngModel)]="manage.title" (ngModelChange)="onManageFormChanged(true)" name="manage_title" [disabled]="selectedEvent()!.status === 'cancelled'" />
            </label>
            <label class="space-y-1 md:col-span-2">
              <span class="text-xs text-slate-400">Description</span>
              <textarea class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50" rows="3" [(ngModel)]="manage.description" (ngModelChange)="onManageFormChanged(true)" name="manage_description" [disabled]="selectedEvent()!.status === 'cancelled'"></textarea>
            </label>
            <label class="space-y-1">
              <span class="text-xs text-slate-400">Timezone</span>
              <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50" [(ngModel)]="manage.timezone" (ngModelChange)="onManageFormChanged()" name="manage_timezone" [disabled]="selectedEvent()!.status === 'cancelled'">
                <option value="Europe/Bucharest">Europe/Bucharest</option>
                <option value="Europe/London">Europe/London</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="text-xs text-slate-400">New kickoff date</span>
              <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50" type="date" [(ngModel)]="manage.reschedule_date" (ngModelChange)="onManageFormChanged()" name="reschedule_date" [disabled]="selectedEvent()!.status === 'cancelled'" />
            </label>
            <label class="space-y-1">
              <span class="text-xs text-slate-400">New kickoff time</span>
              <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50" type="time" [(ngModel)]="manage.reschedule_time" (ngModelChange)="onManageFormChanged()" name="reschedule_time" [disabled]="selectedEvent()!.status === 'cancelled'" />
            </label>
            <label class="space-y-1 md:col-span-2">
              <span class="text-xs text-slate-400">Reschedule scope</span>
              <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50" [(ngModel)]="manage.reschedule_scope" (ngModelChange)="onManageFormChanged()" name="reschedule_scope" [disabled]="selectedEvent()!.status === 'cancelled'">
                <option value="this_occurrence_only">Only this occurrence</option>
                <option value="this_and_following">This occurrence and following</option>
              </select>
            </label>

            <div class="md:col-span-2 grid gap-3 lg:grid-cols-4" [class.opacity-50]="selectedEvent()!.status === 'cancelled'">
              <div class="rounded-lg border border-slate-700 bg-slate-900/70 p-2" (dragover)="allowDrop($event)" (drop)="dropToPool($event)">
                <p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Server members</p>
                <p class="mb-2 text-[11px] text-slate-500">Drag a voted member back here to remove their vote. Changes are saved live.</p>
                <div class="max-h-52 space-y-1 overflow-y-auto">
                  @for (member of poolMembers(); track member.id) {
                    <div class="rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-sm" draggable="true" (dragstart)="dragMember(member.id)">
                      <div class="flex items-center gap-2">
                        <div class="flex min-w-0 flex-1 items-center gap-2">
                          @if (member.avatar_url) {
                            <img [src]="member.avatar_url" [alt]="member.display_name" class="h-6 w-6 rounded-full" />
                          } @else {
                            <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-[11px] text-slate-200">{{ member.display_name.slice(0, 1) }}</span>
                          }
                          <p class="truncate text-slate-200">{{ member.display_name }}</p>
                        </div>
                      </div>
                      <div class="mt-1 flex gap-1">
                        <button type="button" class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] text-emerald-200" (click)="moveMemberToStatus(member.id, 'accepted')" [disabled]="selectedEvent()!.status === 'cancelled'">Accept</button>
                        <button type="button" class="rounded bg-rose-500/20 px-1.5 py-0.5 text-[11px] text-rose-200" (click)="moveMemberToStatus(member.id, 'declined')" [disabled]="selectedEvent()!.status === 'cancelled'">Decline</button>
                        <button type="button" class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] text-amber-200" (click)="moveMemberToStatus(member.id, 'tentative')" [disabled]="selectedEvent()!.status === 'cancelled'">Tentative</button>
                      </div>
                    </div>
                  } @empty {
                    <p class="text-xs text-slate-500">All members currently assigned to a vote bucket.</p>
                  }
                </div>
              </div>

              @for (status of voteBuckets(); track status) {
                <div class="rounded-lg border border-slate-700 bg-slate-900/70 p-2" (dragover)="allowDrop($event)" (drop)="dropToStatus(status, $event)">
                  <p class="mb-2 text-xs font-semibold uppercase tracking-[0.14em]" [class.text-emerald-300]="status === 'accepted'" [class.text-rose-300]="status === 'declined'" [class.text-amber-300]="status === 'tentative'">{{ status }} ({{ voteDraft()[status].length }})</p>
                  <div class="max-h-52 space-y-1 overflow-y-auto">
                    @for (memberId of voteDraft()[status]; track memberId) {
                      <div class="rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-sm" draggable="true" (dragstart)="dragMember(memberId)">
                        <p class="truncate text-slate-200">{{ memberName(memberId) }}</p>
                        <div class="mt-1 flex gap-1">
                          @if (status !== 'accepted') {
                            <button type="button" class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] text-emerald-200" (click)="moveMemberToStatus(memberId, 'accepted')" [disabled]="selectedEvent()!.status === 'cancelled'">A</button>
                          }
                          @if (status !== 'declined') {
                            <button type="button" class="rounded bg-rose-500/20 px-1.5 py-0.5 text-[11px] text-rose-200" (click)="moveMemberToStatus(memberId, 'declined')" [disabled]="selectedEvent()!.status === 'cancelled'">D</button>
                          }
                          @if (status !== 'tentative') {
                            <button type="button" class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] text-amber-200" (click)="moveMemberToStatus(memberId, 'tentative')" [disabled]="selectedEvent()!.status === 'cancelled'">T</button>
                          }
                          <button type="button" class="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200" (click)="removeMemberVote(memberId)" [disabled]="selectedEvent()!.status === 'cancelled'">Remove</button>
                        </div>
                      </div>
                    } @empty {
                      <p class="text-xs text-slate-500">Drop members here.</p>
                    }
                  </div>
                </div>
              }
            </div>

            <div class="md:col-span-2 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
              <div class="flex items-center gap-2">
                @if (selectedEvent()!.status === 'cancelled') {
                  <button class="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50" [disabled]="loading()" type="button" (click)="deleteCancelledEvent(selectedEvent()!.id)">Delete permanently</button>
                } @else {
                  <button class="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50" [disabled]="loading()" type="button" (click)="cancelSelectedEvent()">Cancel event</button>
                }
                <button class="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:opacity-50" [disabled]="loading()" type="button" (click)="clearSelectedEvent()">Close editor</button>
              </div>
            </div>
          </form>
        }
      </section>

    </section>
  `,
  styles: [
    `
      .picker-input::-webkit-calendar-picker-indicator {
        filter: invert(1) brightness(1.2);
        opacity: 1;
        cursor: pointer;
      }
    `,
  ],
})
export class AttendancePageComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);
  private attendanceUpdatesSource: EventSource | null = null;
  private suppressManageLiveSync = false;
  private manageLiveSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private manageLiveSyncInFlight = false;
  private manageLiveSyncQueued = false;

  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly channels = signal<ChannelOption[]>([]);
  protected readonly members = signal<GuildMemberOption[]>([]);
  protected readonly roles = signal<RoleOption[]>([]);
  protected readonly seriesList = signal<AttendanceSeries[]>([]);
  protected readonly selectedEventId = signal<number | null>(null);
  protected readonly manageStatusFilter = signal<ManageStatusFilter>('all');
  protected readonly manageSearch = signal('');
  protected readonly managePage = signal(1);
  protected readonly managePageSize = signal(10);
  protected readonly selectedManageEventIds = signal<number[]>([]);
  protected readonly voteDraftDirty = signal(false);
  protected readonly voteDraft = signal<Record<VoteBucket, string[]>>({
    accepted: [],
    declined: [],
    tentative: [],
  });
  protected readonly previewTick = signal(0);
  protected readonly currentUserLabel = signal('You');
  protected readonly defaultAttendanceChannelId = signal('');
  protected readonly draggedMemberId = signal('');
  protected readonly mentionRolesOpen = signal(false);
  protected readonly defaultTimezone = signal('Europe/Bucharest');
  protected readonly hasChannels = computed(() => this.channels().length > 0);
  protected readonly voteBuckets = signal<VoteBucket[]>(['accepted', 'declined', 'tentative']);

  protected readonly eventOptions = computed<EventOption[]>(() => {
    const options: EventOption[] = [];
    for (const series of this.seriesList()) {
      for (const event of series.events) {
        options.push({
          id: event.id,
          label: `${series.title} | Occurrence ${event.occurrence_number} | ${this.formatKickoffInTimezone(event.starts_at, series.timezone || this.defaultTimezone())}`,
        });
      }
    }
    return options.sort((a, b) => a.id - b.id);
  });

  protected readonly manageRows = computed<ManageEventRow[]>(() => {
    const rows: ManageEventRow[] = [];
    for (const series of this.seriesList()) {
      for (const event of series.events) {
        rows.push({
          id: event.id,
          title: series.title,
          occurrence_number: event.occurrence_number,
          starts_at: event.starts_at,
          timezone: series.timezone || this.defaultTimezone(),
          status: event.status,
          votes_count: event.votes.length,
          channel_id: series.channel_id,
        });
      }
    }
    return rows.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  });

  protected readonly filteredManageRows = computed<ManageEventRow[]>(() => {
    const statusFiltered = this.manageStatusFilter() === 'all'
      ? this.manageRows()
      : this.manageRows().filter(row => row.status === this.manageStatusFilter());

    const term = this.manageSearch().trim().toLowerCase();
    if (!term) return statusFiltered;

    return statusFiltered.filter(row => {
      const channelName = this.channelName(row.channel_id).toLowerCase();
      return row.title.toLowerCase().includes(term)
        || String(row.id).includes(term)
        || String(row.occurrence_number).includes(term)
        || channelName.includes(term)
        || row.status.toLowerCase().includes(term);
    });
  });

  protected readonly manageTotalPages = computed<number>(() => {
    const total = this.filteredManageRows().length;
    const size = this.managePageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  protected readonly pagedManageRows = computed<ManageEventRow[]>(() => {
    const page = Math.min(this.managePage(), this.manageTotalPages());
    const size = this.managePageSize();
    const start = (page - 1) * size;
    return this.filteredManageRows().slice(start, start + size);
  });

  protected readonly pageStartIndex = computed<number>(() => {
    const total = this.filteredManageRows().length;
    if (!total) return 0;
    const page = Math.min(this.managePage(), this.manageTotalPages());
    return (page - 1) * this.managePageSize() + 1;
  });

  protected readonly pageEndIndex = computed<number>(() => {
    const total = this.filteredManageRows().length;
    if (!total) return 0;
    const page = Math.min(this.managePage(), this.manageTotalPages());
    return Math.min(page * this.managePageSize(), total);
  });

  protected readonly selectedManageRows = computed<ManageEventRow[]>(() => {
    const selected = new Set(this.selectedManageEventIds());
    return this.manageRows().filter(row => selected.has(row.id));
  });

  protected readonly hasSelectedCancelledManageRows = computed<boolean>(() =>
    this.selectedManageRows().some(row => row.status === 'cancelled'),
  );

  protected readonly selectedSeries = computed<AttendanceSeries | null>(() => {
    const event = this.selectedEvent();
    if (!event) return null;
    return this.seriesList().find(series => series.id === event.series_id) || null;
  });

  protected readonly poolMembers = computed<GuildMemberOption[]>(() => {
    const assigned = new Set([
      ...this.voteDraft().accepted,
      ...this.voteDraft().declined,
      ...this.voteDraft().tentative,
    ]);
    return this.members().filter(member => !assigned.has(member.id));
  });

  protected readonly selectedEvent = computed<AttendanceEvent | null>(() => {
    const eventId = this.selectedEventId();
    if (eventId === null) return null;
    for (const series of this.seriesList()) {
      const match = series.events.find(event => event.id === eventId);
      if (match) return match;
    }
    return null;
  });

  protected readonly form = {
    channel_id: '',
    title: 'Attendance',
    description: 'Respond with accept, tentative or decline.',
    timezone: this.defaultTimezone(),
    mention_role_ids: [] as string[],
    kickoff_date: todayDateInput(),
    kickoff_time: '21:45',
    recurrence: 'none' as 'none' | 'weekly',
    repeat_count: 6,
  };

  protected readonly manage = {
    title: 'Attendance',
    description: '',
    timezone: this.defaultTimezone(),
    reschedule_date: '',
    reschedule_time: '21:45',
    reschedule_scope: 'this_occurrence_only' as 'this_occurrence_only' | 'this_and_following',
  };

  async ngOnInit(): Promise<void> {
    await this.loadBootstrap();
    await this.load();
    this.startRealtimeStream();
  }

  ngOnDestroy(): void {
    this.attendanceUpdatesSource?.close();
    this.attendanceUpdatesSource = null;
  }

  private startRealtimeStream(): void {
    if (typeof window === 'undefined' || this.attendanceUpdatesSource) return;
    const baseUrl = this.api.getBaseUrl();
    const url = `${baseUrl}/api/admin/attendance/stream`;
    this.attendanceUpdatesSource = new EventSource(url, { withCredentials: true });
    this.attendanceUpdatesSource.addEventListener('attendance-update', () => {
      void this.load(false);
    });
    this.attendanceUpdatesSource.onerror = () => {
      if (this.attendanceUpdatesSource) {
        this.attendanceUpdatesSource.close();
        this.attendanceUpdatesSource = null;
      }
      setTimeout(() => this.startRealtimeStream(), 5000);
    };
  }

  private async loadBootstrap(): Promise<void> {
    try {
      const bootstrap = await this.api.getBootstrap();
      this.channels.set(bootstrap.channels || []);
      this.members.set(bootstrap.members || []);
      this.roles.set(bootstrap.roles || []);
      this.defaultTimezone.set(String(bootstrap.default_timezone || 'Europe/Bucharest').trim() || 'Europe/Bucharest');
      const channelId = bootstrap.default_attendance_channel_id || bootstrap.channels?.[0]?.id || '';
      this.defaultAttendanceChannelId.set(channelId);
      this.form.channel_id = channelId;
      this.form.timezone = this.defaultTimezone();
      this.manage.timezone = this.defaultTimezone();
      try {
        const authState = await this.api.authMe();
        this.currentUserLabel.set(authState.user.username || 'You');
      } catch {
        this.currentUserLabel.set('You');
      }
    } catch {
      this.snackbar.error('Failed to load server channels from Discord.');
    }
  }

  protected mentionRoleChecked(roleId: string): boolean {
    return this.form.mention_role_ids.includes(roleId);
  }

  protected toggleMentionRole(roleId: string, checked: boolean): void {
    const current = [...this.form.mention_role_ids];
    const exists = current.includes(roleId);
    if (checked && !exists) {
      current.push(roleId);
    }
    if (!checked && exists) {
      const index = current.indexOf(roleId);
      current.splice(index, 1);
    }
    this.form.mention_role_ids = current;
    this.touchPreview();
  }

  protected toggleMentionRoles(): void {
    this.mentionRolesOpen.update(value => !value);
  }

  protected channelName(channelId: string): string {
    return this.channels().find(channel => channel.id === channelId)?.name || channelId;
  }

  protected setManageStatusFilter(value: ManageStatusFilter): void {
    this.manageStatusFilter.set(value);
    this.managePage.set(1);
  }

  protected setManageSearch(value: string): void {
    this.manageSearch.set(String(value || ''));
    this.managePage.set(1);
  }

  protected prevManagePage(): void {
    this.managePage.update(page => Math.max(1, page - 1));
  }

  protected nextManagePage(): void {
    this.managePage.update(page => Math.min(this.manageTotalPages(), page + 1));
  }

  protected isManageRowSelected(eventId: number): boolean {
    return this.selectedManageEventIds().includes(eventId);
  }

  protected toggleManageRowSelection(eventId: number, checked: boolean): void {
    const next = new Set(this.selectedManageEventIds());
    if (checked) {
      next.add(eventId);
    } else {
      next.delete(eventId);
    }
    this.selectedManageEventIds.set([...next]);
  }

  protected clearManageSelection(): void {
    this.selectedManageEventIds.set([]);
  }

  protected selectVisibleManageRows(checked: boolean): void {
    const visibleIds = this.pagedManageRows().map(row => row.id);
    const next = new Set(this.selectedManageEventIds());
    for (const id of visibleIds) {
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    this.selectedManageEventIds.set([...next]);
  }

  protected areAllVisibleManageRowsSelected(): boolean {
    const visibleIds = this.pagedManageRows().map(row => row.id);
    return visibleIds.length > 0 && visibleIds.every(id => this.selectedManageEventIds().includes(id));
  }

  protected pickEventFromRow(eventId: number, status: AttendanceEvent['status']): void {
    if (status === 'cancelled') return;
    this.pickEvent(eventId);
  }

  protected pickEvent(value: number | null): void {
    this.selectedEventId.set(value);
    this.voteDraftDirty.set(false);
    const event = this.selectedEvent();
    if (!event) return;

    this.suppressManageLiveSync = true;

    const series = this.selectedSeries();
    if (series) {
      this.manage.title = series.title;
      this.manage.description = series.description;
      this.manage.timezone = series.timezone || this.defaultTimezone();
    }

    const kickoff = this.toDateTimeInputsInTimezone(event.starts_at, this.manage.timezone || this.defaultTimezone());
    this.manage.reschedule_date = kickoff.date;
    this.manage.reschedule_time = kickoff.time;

    const nextDraft: Record<VoteBucket, string[]> = { accepted: [], declined: [], tentative: [] };
    for (const vote of event.votes) {
      const bucket = vote.status as VoteBucket;
      if (nextDraft[bucket] && !nextDraft[bucket].includes(vote.user_discord_id)) {
        nextDraft[bucket].push(vote.user_discord_id);
      }
    }
    this.voteDraft.set(nextDraft);

    setTimeout(() => {
      this.suppressManageLiveSync = false;
    }, 0);
  }

  protected memberName(memberId: string): string {
    const member = this.members().find(item => item.id === memberId);
    if (member) return member.display_name;
    const vote = this.selectedEvent()?.votes.find(item => item.user_discord_id === memberId);
    if (vote) return vote.display_name;
    return memberId;
  }

  private toDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toTimeInput(date: Date): string {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
  }

  private extractPartsInTimezone(date: Date, timezoneName: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezoneName,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(date);

    const byType = new Map(parts.map(part => [part.type, part.value]));
    return {
      year: Number(byType.get('year') || '0'),
      month: Number(byType.get('month') || '1'),
      day: Number(byType.get('day') || '1'),
      hour: Number(byType.get('hour') || '0'),
      minute: Number(byType.get('minute') || '0'),
      second: Number(byType.get('second') || '0'),
    };
  }

  private timezoneOffsetMs(date: Date, timezoneName: string): number {
    const parts = this.extractPartsInTimezone(date, timezoneName);
    const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return zonedAsUtc - date.getTime();
  }

  private wallTimeToUtcIso(dateInput: string, timeInput: string, timezoneName: string): string {
    const [year, month, day] = dateInput.split('-').map(value => Number(value));
    const [hour, minute] = timeInput.split(':').map(value => Number(value));
    const wallTimeUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

    let candidate = wallTimeUtc;
    for (let i = 0; i < 3; i += 1) {
      const offset = this.timezoneOffsetMs(new Date(candidate), timezoneName);
      const next = wallTimeUtc - offset;
      if (next === candidate) break;
      candidate = next;
    }

    return new Date(candidate).toISOString();
  }

  private toDateTimeInputsInTimezone(iso: string, timezoneName: string): { date: string; time: string } {
    const parts = this.extractPartsInTimezone(this.parseApiDate(iso), timezoneName);
    const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    return { date, time };
  }

  protected formatKickoffInTimezone(iso: string, timezoneName: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezoneName,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(this.parseApiDate(iso));
  }

  private parseApiDate(iso: string): Date {
    const raw = String(iso || '').trim();
    if (!raw) return new Date(NaN);

    const hasZoneDesignator = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
    const normalized = hasZoneDesignator ? raw : `${raw}Z`;
    return new Date(normalized);
  }

  private draftFromEvent(event: AttendanceEvent): Record<VoteBucket, string[]> {
    const draft: Record<VoteBucket, string[]> = { accepted: [], declined: [], tentative: [] };
    for (const vote of event.votes) {
      const bucket = vote.status as VoteBucket;
      if (!draft[bucket].includes(vote.user_discord_id)) {
        draft[bucket].push(vote.user_discord_id);
      }
    }
    return draft;
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const payload = error.error as { detail?: string } | string | null;
      const detail = typeof payload === 'string'
        ? payload
        : typeof payload?.detail === 'string'
          ? payload.detail
          : '';
      if (detail.trim()) {
        if (detail.includes('cannot move kickoff to the past')) {
          return 'Cannot move kickoff to the past. Choose a future date and time.';
        }
        if (detail.includes('event changed by another admin')) {
          return 'Failed to save event changes. Another admin may have changed this event; refresh and try again.';
        }
        return detail;
      }
    }
    return fallback;
  }

  protected touchPreview(): void {
    this.previewTick.update(value => value + 1);
  }

  protected openNativePicker(input: HTMLInputElement): void {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  }

  protected attendancePreviewTitle(): string {
    this.previewTick();
    return this.form.title.trim() || 'Attendance';
  }

  protected attendancePreviewKickoff(): string {
    this.previewTick();
    const kickoff = this.previewKickoffDate();
    if (!kickoff) return 'Not set';
    return this.formatZone(kickoff, this.form.timezone || this.defaultTimezone());
  }

  protected attendancePreviewDescription(): string {
    this.previewTick();
    const description = this.form.description.trim();
    return description || 'Respond with accept, tentative or decline.';
  }

  protected attendancePreviewCreator(): string {
    this.previewTick();
    return this.currentUserLabel().trim() || 'You';
  }

  protected attendancePreviewRecurrence(): string {
    this.previewTick();
    if (this.form.recurrence === 'weekly') {
      return `Weekly (${this.form.repeat_count || 0} occurrences)`;
    }
    return 'One time';
  }

  protected attendancePreviewClock(): string {
    this.previewTick();
    const now = new Date();
    return now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  protected attendancePreviewFooterTime(): string {
    this.previewTick();
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
  }

  protected attendancePreviewRelative(): string {
    this.previewTick();
    const kickoff = this.previewKickoffDate();
    if (!kickoff) return 'in unknown time';

    const deltaMs = kickoff.getTime() - Date.now();
    const deltaMin = Math.round(deltaMs / 60000);
    if (deltaMin <= 0) return 'starting now';
    if (deltaMin < 60) return `in ${deltaMin} minutes`;
    const hours = Math.round(deltaMin / 60);
    if (hours < 48) return `in ${hours} hours`;
    const days = Math.round(hours / 24);
    return `in ${days} days`;
  }

  protected attendancePreviewCloseAt(): string {
    this.previewTick();
    const kickoff = this.previewKickoffDate();
    if (!kickoff) return 'Not set';
    return this.formatZone(kickoff, this.form.timezone || this.defaultTimezone());
  }

  protected previewRoleMentions(): string {
    this.previewTick();
    if (!this.form.mention_role_ids.length) return '';
    return this.form.mention_role_ids
      .map(roleId => this.roles().find(role => role.id === roleId)?.name)
      .filter((name): name is string => Boolean(name))
      .map(name => `@${name}`)
      .join(' ');
  }

  protected attendancePreviewRo(): string {
    this.previewTick();
    const kickoff = this.previewKickoffDate();
    if (!kickoff) return 'Not set';
    return this.formatZone(kickoff, 'Europe/Bucharest');
  }

  protected attendancePreviewUk(): string {
    this.previewTick();
    const kickoff = this.previewKickoffDate();
    if (!kickoff) return 'Not set';
    return this.formatZone(kickoff, 'Europe/London');
  }

  private previewKickoffDate(): Date | null {
    if (!this.form.kickoff_date || !this.form.kickoff_time) return null;
    const candidate = new Date(`${this.form.kickoff_date}T${this.form.kickoff_time}:00`);
    if (Number.isNaN(candidate.getTime())) return null;
    return candidate;
  }

  private formatZone(date: Date, zone: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  private resetMessages(): void {
    void 0;
  }

  private resetCreateForm(): void {
    this.form.channel_id = this.defaultAttendanceChannelId() || this.channels()[0]?.id || '';
    this.form.title = 'Attendance';
    this.form.description = 'Respond with accept, tentative or decline.';
    this.form.timezone = this.defaultTimezone();
    this.form.mention_role_ids = [];
    this.form.kickoff_date = todayDateInput();
    this.form.kickoff_time = '21:45';
    this.form.recurrence = 'none';
    this.form.repeat_count = 6;
    this.touchPreview();
  }

  async load(resetMessages = true): Promise<void> {
    if (resetMessages) {
      this.resetMessages();
    }
    try {
      const data = await this.api.listAttendance();
      this.seriesList.set(data);
      this.managePage.update(page => Math.min(page, this.manageTotalPages()));
      const selectedId = this.selectedEventId();
      if (selectedId !== null && !data.some(series => series.events.some(event => event.id === selectedId))) {
        this.selectedEventId.set(null);
        this.voteDraftDirty.set(false);
      } else if (selectedId !== null && !this.voteDraftDirty()) {
        this.pickEvent(selectedId);
      }
    } catch {
      this.snackbar.error('Failed to load attendance data.');
    }
  }

  async create(): Promise<void> {
    this.resetMessages();
    if (!this.hasChannels()) {
      this.snackbar.error('No text channels available. Verify bot permissions and guild configuration.');
      return;
    }

    this.loading.set(true);
    try {
      const startsAt = this.wallTimeToUtcIso(this.form.kickoff_date, this.form.kickoff_time, this.form.timezone || this.defaultTimezone());
      await this.api.createAttendance({
        channel_id: this.form.channel_id,
        title: this.form.title.trim(),
        description: this.form.description.trim(),
        timezone: this.form.timezone,
        mention_role_ids: this.form.mention_role_ids,
        starts_at: startsAt,
        recurrence: this.form.recurrence,
        repeat_count: this.form.recurrence === 'weekly' ? this.form.repeat_count : null,
      });
      await this.load();
      this.resetCreateForm();
      this.snackbar.success('Attendance event created and posted to Discord.');
    } catch {
      this.snackbar.error('Failed to create attendance event. Check selected date/time and channel.');
    } finally {
      this.loading.set(false);
    }
  }

  private voteMapFromDraft(): Record<string, VoteBucket> {
    const result: Record<string, VoteBucket> = {};
    for (const memberId of this.voteDraft().accepted) result[memberId] = 'accepted';
    for (const memberId of this.voteDraft().declined) result[memberId] = 'declined';
    for (const memberId of this.voteDraft().tentative) result[memberId] = 'tentative';
    return result;
  }

  private eventVoteMap(event: AttendanceEvent): Record<string, VoteBucket> {
    const result: Record<string, VoteBucket> = {};
    for (const vote of event.votes) {
      result[vote.user_discord_id] = vote.status as VoteBucket;
    }
    return result;
  }

  private async syncVoteDraft(selected: AttendanceEvent): Promise<void> {
    const current = this.eventVoteMap(selected);
    const next = this.voteMapFromDraft();
    const allMemberIds = new Set<string>([...Object.keys(current), ...Object.keys(next)]);

    for (const memberId of allMemberIds) {
      const currentStatus = current[memberId];
      const nextStatus = next[memberId];
      if (currentStatus === nextStatus) continue;

      if (!nextStatus) {
        await this.api.removeAttendanceVote(selected.id, memberId);
        continue;
      }

      await this.api.setAttendanceVote(selected.id, {
        user_discord_id: memberId,
        display_name: this.memberName(memberId),
        status: nextStatus,
      });
    }
  }

  private voteUpdatesPayload(draft: Record<VoteBucket, string[]>): Array<{ user_discord_id: string; display_name: string; status: VoteStatus }> {
    const entries: Array<{ user_discord_id: string; display_name: string; status: VoteStatus }> = [];
    for (const memberId of draft.accepted) {
      entries.push({ user_discord_id: memberId, display_name: this.memberName(memberId), status: 'accepted' });
    }
    for (const memberId of draft.declined) {
      entries.push({ user_discord_id: memberId, display_name: this.memberName(memberId), status: 'declined' });
    }
    for (const memberId of draft.tentative) {
      entries.push({ user_discord_id: memberId, display_name: this.memberName(memberId), status: 'tentative' });
    }
    return entries;
  }

  async applyVoteChanges(): Promise<void> {
    this.resetMessages();
    const selected = this.selectedEvent();
    if (!selected) {
      this.snackbar.error('Select an event first.');
      return;
    }
    if (selected.status === 'cancelled') {
      this.snackbar.error('Cancelled events cannot be edited.');
      return;
    }

    this.loading.set(true);
    const originalDraft = this.draftFromEvent(selected);
    try {
      await this.syncVoteDraft(selected);
      this.voteDraftDirty.set(false);
      await this.load(false);
      this.pickEvent(selected.id);
      this.snackbar.success('Votes updated and synced to Discord.');
    } catch (error) {
      this.voteDraft.set(originalDraft);
      this.voteDraftDirty.set(false);
      this.snackbar.error(this.apiErrorMessage(error, 'Failed to update votes.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected clearAllDraftVotes(): void {
    this.voteDraft.set({ accepted: [], declined: [], tentative: [] });
    this.voteDraftDirty.set(true);
  }

  protected onManageFormChanged(debounce = false): void {
    if (this.suppressManageLiveSync) return;
    if (debounce) {
      if (this.manageLiveSyncTimer) {
        clearTimeout(this.manageLiveSyncTimer);
      }
      this.manageLiveSyncTimer = setTimeout(() => {
        this.manageLiveSyncTimer = null;
        void this.syncManageFormLive();
      }, 500);
      return;
    }
    void this.syncManageFormLive();
  }

  private async syncManageFormLive(): Promise<void> {
    if (this.manageLiveSyncInFlight) {
      this.manageLiveSyncQueued = true;
      return;
    }

    const selected = this.selectedEvent();
    if (!selected) return;
    if (selected.status === 'cancelled') return;
    if (!this.manage.reschedule_date || !this.manage.reschedule_time) return;

    this.manageLiveSyncInFlight = true;
    this.loading.set(true);
    try {
      const startsAt = this.wallTimeToUtcIso(this.manage.reschedule_date, this.manage.reschedule_time, this.manage.timezone || this.defaultTimezone());
      await this.api.editAttendanceEvent(selected.id, {
        title: this.manage.title.trim(),
        description: this.manage.description.trim(),
        timezone: this.manage.timezone,
        starts_at: startsAt,
        scope: this.manage.reschedule_scope,
        expected_updated_at: selected.updated_at,
      });
      await this.load(false);
      this.pickEvent(selected.id);
    } catch (error) {
      this.snackbar.error(this.apiErrorMessage(error, 'Failed to save live changes.'));
    } finally {
      this.loading.set(false);
      this.manageLiveSyncInFlight = false;
      if (this.manageLiveSyncQueued) {
        this.manageLiveSyncQueued = false;
        void this.syncManageFormLive();
      }
    }
  }

  protected dragMember(memberId: string): void {
    this.draggedMemberId.set(memberId);
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected dropToStatus(status: VoteBucket, event: DragEvent): void {
    event.preventDefault();
    const memberId = this.draggedMemberId();
    if (!memberId) return;
    void this.moveMemberToStatus(memberId, status);
    this.draggedMemberId.set('');
  }

  protected dropToPool(event: DragEvent): void {
    event.preventDefault();
    const memberId = this.draggedMemberId();
    if (!memberId) return;
    void this.removeMemberVote(memberId);
    this.draggedMemberId.set('');
  }

  protected async moveMemberToStatus(memberId: string, status: VoteBucket): Promise<void> {
    if (this.loading()) return;
    const selected = this.selectedEvent();
    if (!selected) return;
    if (selected.status === 'cancelled') return;

    const current = this.voteMapFromDraft()[memberId] || null;
    if (current === status) return;

    const previousDraft = this.voteDraft();
    const next: Record<VoteBucket, string[]> = {
      accepted: this.voteDraft().accepted.filter(value => value !== memberId),
      declined: this.voteDraft().declined.filter(value => value !== memberId),
      tentative: this.voteDraft().tentative.filter(value => value !== memberId),
    };
    next[status] = [...next[status], memberId];
    this.voteDraft.set(next);
    this.voteDraftDirty.set(true);

    this.loading.set(true);
    try {
      await this.api.setAttendanceVote(selected.id, {
        user_discord_id: memberId,
        display_name: this.memberName(memberId),
        status,
      });
      this.voteDraftDirty.set(false);
      await this.load(false);
      this.pickEvent(selected.id);
    } catch (error) {
      this.voteDraft.set(previousDraft);
      this.voteDraftDirty.set(false);
      this.snackbar.error(this.apiErrorMessage(error, 'Failed to update vote.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async removeMemberVote(memberId: string): Promise<void> {
    if (this.loading()) return;
    const selected = this.selectedEvent();
    if (!selected) return;
    if (selected.status === 'cancelled') return;

    const current = this.voteMapFromDraft()[memberId] || null;
    if (!current) return;

    const previousDraft = this.voteDraft();
    this.voteDraft.set({
      accepted: this.voteDraft().accepted.filter(value => value !== memberId),
      declined: this.voteDraft().declined.filter(value => value !== memberId),
      tentative: this.voteDraft().tentative.filter(value => value !== memberId),
    });
    this.voteDraftDirty.set(true);

    this.loading.set(true);
    try {
      await this.api.removeAttendanceVote(selected.id, memberId);
      this.voteDraftDirty.set(false);
      await this.load(false);
      this.pickEvent(selected.id);
    } catch (error) {
      this.voteDraft.set(previousDraft);
      this.voteDraftDirty.set(false);
      this.snackbar.error(this.apiErrorMessage(error, 'Failed to remove vote.'));
    } finally {
      this.loading.set(false);
    }
  }

  async saveEventChanges(): Promise<void> {
    this.resetMessages();
    const selected = this.selectedEvent();
    if (!selected) {
      this.snackbar.error('Select an event first.');
      return;
    }
    if (selected.status === 'cancelled') {
      this.snackbar.error('Cancelled events cannot be edited.');
      return;
    }
    if (!this.manage.reschedule_date || !this.manage.reschedule_time) {
      this.snackbar.error('Select both reschedule date and time.');
      return;
    }

    this.loading.set(true);
    const originalDraft = this.draftFromEvent(selected);
    try {
      const pendingVoteDraft = {
        accepted: [...this.voteDraft().accepted],
        declined: [...this.voteDraft().declined],
        tentative: [...this.voteDraft().tentative],
      };
      const startsAt = this.wallTimeToUtcIso(this.manage.reschedule_date, this.manage.reschedule_time, this.manage.timezone || this.defaultTimezone());
      await this.api.editAttendanceEvent(selected.id, {
        title: this.manage.title.trim(),
        description: this.manage.description.trim(),
        timezone: this.manage.timezone,
        starts_at: startsAt,
        scope: this.manage.reschedule_scope,
        expected_updated_at: selected.updated_at,
        vote_updates: this.voteUpdatesPayload(pendingVoteDraft),
      });

      await this.load(false);
      this.snackbar.success('Event changes saved and synced to Discord.');
      this.pickEvent(selected.id);
    } catch (error) {
      this.voteDraft.set(originalDraft);
      this.voteDraftDirty.set(false);
      this.snackbar.error(this.apiErrorMessage(error, 'Failed to save event changes.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected clearSelectedEvent(): void {
    this.selectedEventId.set(null);
    this.voteDraftDirty.set(false);
    this.manage.title = 'Attendance';
    this.manage.description = '';
    this.manage.timezone = this.defaultTimezone();
    this.manage.reschedule_date = '';
    this.manage.reschedule_time = '21:45';
    this.manage.reschedule_scope = 'this_occurrence_only';
    this.voteDraft.set({ accepted: [], declined: [], tentative: [] });
  }

  async cancelSelectedEvent(): Promise<void> {
    this.resetMessages();
    const selected = this.selectedEvent();
    if (!selected) {
      this.snackbar.error('Select an event first.');
      return;
    }
    if (selected.status === 'cancelled') {
      this.snackbar.error('Event is already cancelled.');
      return;
    }

    this.loading.set(true);
    try {
      await this.api.cancelAttendanceEvent(selected.id);
      await this.load();
      this.clearSelectedEvent();
      this.snackbar.success('Attendance event cancelled and Discord message removed.');
    } catch {
      this.snackbar.error('Failed to cancel event.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteCancelledEvent(eventId: number): Promise<void> {
    this.resetMessages();
    this.loading.set(true);
    try {
      await this.api.deleteAttendanceEvent(eventId);
      await this.load(false);
      if (this.selectedEventId() === eventId) {
        this.clearSelectedEvent();
      }
      this.snackbar.success('Cancelled event deleted permanently from history.');
    } catch {
      this.snackbar.error('Failed to delete cancelled event.');
    } finally {
      this.loading.set(false);
    }
  }

  async cancelSelectedManageEvents(): Promise<void> {
    this.resetMessages();
    const selectedIds = this.selectedManageRows().filter(row => row.status !== 'cancelled').map(row => row.id);
    if (!selectedIds.length) {
      this.snackbar.error('Select at least one non-cancelled event to cancel.');
      return;
    }

    this.loading.set(true);
    try {
      for (const eventId of selectedIds) {
        await this.api.cancelAttendanceEvent(eventId);
      }
      await this.load();
      this.clearManageSelection();
      this.snackbar.success(`Cancelled ${selectedIds.length} event(s).`);
    } catch {
      this.snackbar.error('Failed to cancel selected events.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteSelectedCancelledManageEvents(): Promise<void> {
    this.resetMessages();
    const selectedIds = this.selectedManageRows().filter(row => row.status === 'cancelled').map(row => row.id);
    if (!selectedIds.length) {
      this.snackbar.error('Select at least one cancelled event to delete.');
      return;
    }

    this.loading.set(true);
    try {
      for (const eventId of selectedIds) {
        await this.api.deleteAttendanceEvent(eventId);
      }
      await this.load(false);
      if (this.selectedEventId() !== null && selectedIds.includes(this.selectedEventId()!)) {
        this.clearSelectedEvent();
      }
      this.clearManageSelection();
      this.snackbar.success(`Deleted ${selectedIds.length} cancelled event(s).`);
    } catch {
      this.snackbar.error('Failed to delete selected cancelled events.');
    } finally {
      this.loading.set(false);
    }
  }
}