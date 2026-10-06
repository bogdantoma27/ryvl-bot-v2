import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

/** Step 4: summary of the lineup draft plus post / update-posted actions and preview. */
@Component({
  selector: 'app-lineup-draft-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div>
        <h2 class="text-base font-bold text-white">Review & Publish to Discord</h2>
        <p class="text-xs text-slate-400 mt-1">Review the match lineup details and publish the official graphic to your server.</p>
      </div>

      <div class="bg-[#11192e] p-5 rounded-2xl border border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div class="border-b sm:border-b-0 sm:border-r border-slate-800 pb-3 sm:pb-0 pr-4">
          <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Lineup Title</span>
          <div class="text-sm font-bold text-white truncate">{{ title() }}</div>
          @if (matchLabel()) {
            <div class="text-[11px] text-slate-400 truncate">Match: {{ matchLabel() }}</div>
          }
        </div>

        <div class="border-b sm:border-b-0 sm:border-r border-slate-800 pb-3 sm:pb-0 pr-4">
          <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Formation</span>
          <div class="text-sm font-bold text-[#EAE905]">{{ formationLabel() }}</div>
          <div class="text-[11px] text-slate-400">{{ filledCount() }}/11 positions filled</div>
        </div>

        <div class="border-b sm:border-b-0 sm:border-r border-slate-800 pb-3 sm:pb-0 pr-4">
          <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Kickoff Times</span>
          <div class="text-xs text-slate-200 mt-0.5 space-y-0.5">
            @for (k of kickoffLines(); track k) {
              <div><strong>{{ k }}</strong></div>
            }
          </div>
        </div>

        <div>
          <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Target Channel</span>
          <div class="text-xs font-semibold text-white mt-0.5">#{{ channelName() }}</div>
          <div class="text-[11px] text-slate-400">{{ mentionText() }}</div>
        </div>
      </div>

      <label class="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer w-fit">
        <input
          type="checkbox"
          [checked]="showEaNames()"
          (change)="showEaNames.set(!showEaNames())"
          class="rounded border-slate-600 bg-slate-900 text-[#EAE905] focus:ring-0 w-4 h-4 cursor-pointer"
        />
        <span>Show registered EA names under player names on the graphic</span>
      </label>

      @if (postedMessageId()) {
        <div class="p-3 rounded-xl border border-slate-700 bg-slate-900/60 text-[11px] text-slate-300">
          This draft was posted to Discord{{ postedAtLabel() ? ' on ' + postedAtLabel() : '' }}.
          "Update posted lineup" replaces that message's graphic; "Post as new message" leaves it in place.
        </div>
      }

      <div class="flex flex-col sm:flex-row gap-3">
        @if (postedMessageId()) {
          <button
            type="button"
            [disabled]="isPosting() || !canPost()"
            (click)="post.emit(true)"
            class="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition cursor-pointer"
          >
            {{ isPosting() ? 'Updating...' : 'Update posted lineup' }}
          </button>
        }
        <button
          type="button"
          [disabled]="isPosting() || !canPost()"
          (click)="post.emit(false)"
          class="flex-1 bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/25 transition cursor-pointer"
        >
          @if (isPosting()) {
            Posting Lineup to Discord...
          } @else {
            {{ postedMessageId() ? 'Post as new message' : 'Post Lineup to Discord' }}
          }
        </button>
      </div>

      <div class="w-full flex justify-center pt-2">
        <div class="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-slate-700 bg-black">
          @if (previewHtml()) {
            <div [innerHTML]="previewHtml()"></div>
          } @else {
            <div class="py-24 text-center text-xs text-slate-500">Generating preview...</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class LineupDraftPanelComponent {
  readonly title = input.required<string>();
  readonly matchLabel = input<string | null>(null);
  readonly formationLabel = input.required<string>();
  readonly filledCount = input.required<number>();
  readonly kickoffLines = input<string[]>([]);
  readonly channelName = input.required<string>();
  readonly mentionText = input.required<string>();
  readonly previewHtml = input<SafeHtml | ''>('');
  readonly isPosting = input<boolean>(false);
  readonly canPost = input<boolean>(false);
  readonly postedMessageId = input<string | null>(null);
  readonly postedAtLabel = input<string | null>(null);
  readonly showEaNames = model<boolean>(false);

  /** Emits true to edit the previously posted message, false to post a new one. */
  readonly post = output<boolean>();
}
