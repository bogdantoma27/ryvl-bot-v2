import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-public-recruitment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      <!-- Header -->
      <div class="border-b border-[#EAE905]/15 pb-6">
        <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest mb-1">Squad Scouting & Trials</div>
        <h1 class="text-4xl font-black text-white uppercase tracking-tight">Recruitment & Trials</h1>
        <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl">
          We are seeking dedicated, high-IQ competitors ready to push limits in VPG Superliga România and European tournaments.
        </p>
      </div>

      <!-- Criteria & Expectations -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="p-6 rounded-2xl bg-[#0c0c0e] border border-white/10 space-y-3">
          <div class="w-10 h-10 rounded-xl bg-[#EAE905]/10 border border-[#EAE905]/30 flex items-center justify-center text-lg text-[#EAE905]">
            ⏰
          </div>
          <h3 class="text-base font-bold text-white uppercase">Match Night Commitment</h3>
          <p class="text-xs text-slate-400 leading-relaxed">
            Attendance is mandatory for official VPG Superliga fixtures on <strong class="text-slate-200">Monday, Tuesday, and Thursday</strong> from 21:45 to 00:00 (Bucharest time).
          </p>
        </div>

        <div class="p-6 rounded-2xl bg-[#0c0c0e] border border-white/10 space-y-3">
          <div class="w-10 h-10 rounded-xl bg-[#EAE905]/10 border border-[#EAE905]/30 flex items-center justify-center text-lg text-[#EAE905]">
            🎙️
          </div>
          <h3 class="text-base font-bold text-white uppercase">Voice Comms & Clarity</h3>
          <p class="text-xs text-slate-400 leading-relaxed">
            A clear microphone and calm communication on Discord voice channels during matches. Constructive tactical callouts only.
          </p>
        </div>

        <div class="p-6 rounded-2xl bg-[#0c0c0e] border border-white/10 space-y-3">
          <div class="w-10 h-10 rounded-xl bg-[#EAE905]/10 border border-[#EAE905]/30 flex items-center justify-center text-lg text-[#EAE905]">
            ⚽
          </div>
          <h3 class="text-base font-bold text-white uppercase">11v11 Experience</h3>
          <p class="text-xs text-slate-400 leading-relaxed">
            Demonstrated mastery of positional discipline, spacing, and quick decision-making in competitive manual 11v11 Pro Clubs settings.
          </p>
        </div>
      </div>

      <!-- Application Form -->
      <div class="p-8 sm:p-12 rounded-3xl bg-[#0d0d10] border border-[#EAE905]/30 relative overflow-hidden shadow-2xl">
        <div class="max-w-3xl mx-auto space-y-8">
          <div>
            <span class="text-xs font-mono font-bold text-[#EAE905] uppercase tracking-widest">Trial Application</span>
            <h2 class="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mt-1">Submit Your Dossier</h2>
            <p class="text-xs text-slate-400 mt-1">Our captaincy team reviews submissions within 24–48 hours.</p>
          </div>

          @if (submitted()) {
            <div class="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3 animate-fadeIn">
              <div class="text-3xl">✅</div>
              <h3 class="text-lg font-bold text-emerald-300">Application Received!</h3>
              <p class="text-xs text-slate-300 max-w-md mx-auto">
                Thank you for applying to RYVL Esports, <strong>{{ form.gamertag }}</strong>. Our management team will contact you via Discord at <strong>{{ form.discordTag }}</strong> for your trial schedule.
              </p>
              <button
                type="button"
                (click)="resetForm()"
                class="px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold uppercase mt-2 cursor-pointer"
              >
                Submit Another Application
              </button>
            </div>
          } @else {
            <form (ngSubmit)="submitApplication()" class="space-y-6">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <!-- Gamertag / EA ID -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">EA Sports FC ID / PSN *</label>
                  <input
                    type="text"
                    required
                    [(ngModel)]="form.gamertag"
                    name="gamertag"
                    placeholder="e.g. RYVL_Striker"
                    class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                  />
                </div>

                <!-- Discord Username -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Discord Username *</label>
                  <input
                    type="text"
                    required
                    [(ngModel)]="form.discordTag"
                    name="discordTag"
                    placeholder="e.g. your_discord#0000"
                    class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                  />
                </div>

                <!-- Primary Position -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Primary Position *</label>
                  <select
                    required
                    [(ngModel)]="form.primaryPosition"
                    name="primaryPosition"
                    class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  >
                    <option value="ST">Striker (ST / CF)</option>
                    <option value="LW">Left Winger (LW / LM)</option>
                    <option value="RW">Right Winger (RW / RM)</option>
                    <option value="CAM">Attacking Midfield (CAM)</option>
                    <option value="CM">Central Midfield (CM)</option>
                    <option value="CDM">Defensive Midfield (CDM)</option>
                    <option value="CB">Center Back (CB)</option>
                    <option value="LB">Left Back (LB)</option>
                    <option value="RB">Right Back (RB)</option>
                    <option value="GK">Goalkeeper (GK)</option>
                  </select>
                </div>

                <!-- Secondary Position -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Secondary Position</label>
                  <select
                    [(ngModel)]="form.secondaryPosition"
                    name="secondaryPosition"
                    class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  >
                    <option value="None">None (Pure Specialist)</option>
                    <option value="ST">Striker (ST / CF)</option>
                    <option value="LW">Left Winger (LW / LM)</option>
                    <option value="RW">Right Winger (RW / RM)</option>
                    <option value="CAM">Attacking Midfield (CAM)</option>
                    <option value="CM">Central Midfield (CM)</option>
                    <option value="CDM">Defensive Midfield (CDM)</option>
                    <option value="CB">Center Back (CB)</option>
                    <option value="LB">Left Back (LB)</option>
                    <option value="RB">Right Back (RB)</option>
                    <option value="GK">Goalkeeper (GK)</option>
                  </select>
                </div>

                <!-- Platform -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Platform *</label>
                  <select
                    [(ngModel)]="form.platform"
                    name="platform"
                    class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  >
                    <option value="PS5">PlayStation 5</option>
                    <option value="Xbox">Xbox Series X / S</option>
                    <option value="PC">PC (EA App / Steam)</option>
                  </select>
                </div>

                <!-- Age -->
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Age *</label>
                  <input
                    type="number"
                    min="16"
                    max="60"
                    [(ngModel)]="form.age"
                    name="age"
                    placeholder="e.g. 21"
                    class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                  />
                </div>
              </div>

              <!-- Experience / Previous Clubs -->
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Competitive Experience & Former Clubs</label>
                <textarea
                  rows="3"
                  [(ngModel)]="form.experience"
                  name="experience"
                  placeholder="Share details on leagues played (VPG, other tournaments), former clubs, and achievements..."
                  class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                ></textarea>
              </div>

              @if (error()) {
                <div class="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                  {{ error() }}
                </div>
              }

              <!-- Submit -->
              <div class="flex items-center justify-end pt-2">
                <button
                  type="submit"
                  [disabled]="isSubmitting()"
                  class="px-8 py-3.5 rounded-xl bg-[#EAE905] hover:bg-[#d8d704] disabled:opacity-50 !text-black font-black text-xs uppercase tracking-wider shadow-lg shadow-[#EAE905]/15 transition transform hover:scale-105 cursor-pointer flex items-center gap-2"
                >
                  @if (isSubmitting()) {
                    <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    <span class="!text-black">Submitting Application...</span>
                  } @else {
                    <span class="!text-black">Submit Trial Request</span>
                  }
                </button>
              </div>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class RecruitmentComponent {
  private readonly api = inject(ApiService);

  readonly submitted = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  form = {
    gamertag: '',
    discordTag: '',
    primaryPosition: 'ST',
    secondaryPosition: 'CAM',
    platform: 'PS5',
    age: 21,
    experience: '',
  };

  async submitApplication(): Promise<void> {
    if (!this.form.gamertag || !this.form.discordTag) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const res = await this.api.submitRecruitment(this.form);
      if (res && res.success === false) {
        this.error.set(res.message || res.error || 'Failed to submit application to management.');
        return;
      }
      this.submitted.set(true);
    } catch (err: any) {
      console.error('Failed to submit recruitment application:', err);
      this.error.set(err.message || 'Failed to submit application. Please join our Discord server directly.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  resetForm(): void {
    this.submitted.set(false);
    this.error.set(null);
    this.form = {
      gamertag: '',
      discordTag: '',
      primaryPosition: 'ST',
      secondaryPosition: 'CAM',
      platform: 'PS5',
      age: 21,
      experience: '',
    };
  }
}
