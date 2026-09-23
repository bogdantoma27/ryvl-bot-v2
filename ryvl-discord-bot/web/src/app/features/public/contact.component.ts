import { PublicPageHeaderComponent } from './public-page-header.component';
import { SOCIAL_LINKS } from './presentation';
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
  selector: 'app-public-contact',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, PublicPageHeaderComponent],
  template: `
    <div class="public-page space-y-8">
      <app-public-page-header heading="Contact RYVL Esports" eyebrow="RYVL Esports" description="Get in touch about friendly matches, tournaments, partnerships or other enquiries." />

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <!-- Direct Inquiries Cards -->
        <div class="space-y-6">
          <div class="p-6 rounded-2xl bg-[#0c0c0e] border border-white/10 space-y-2">
            <div class="text-xs font-mono text-[#EAE905] uppercase tracking-wider">Discord Community</div>
            <h3 class="text-base font-semibold text-white">Official Server</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
              For players, friendly matches and community questions.
            </p>
            <a
              [href]="social.discord"
              target="_blank"
              class="social-brand-link inline-flex items-center gap-1.5 text-xs font-bold text-[#5865F2] hover:underline pt-1"
             rel="noopener noreferrer"><img src="/assets/brands/discord.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />
              <span>Join our Discord</span>
              <span>↗</span>
            </a>
          </div>

          <div class="p-6 rounded-2xl bg-[#0c0c0e] border border-white/10 space-y-2">
            <div class="text-xs font-mono text-[#EAE905] uppercase tracking-wider">Competitive Scrims</div>
            <h3 class="text-base font-semibold text-white">Friendly Match Inquiries</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
              Contact us to arrange a friendly 11v11 match.
            </p>
            <a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="text-sm text-[#EAE905] hover:underline">Arrange a match on Discord</a>
          </div>

          <div class="p-6 rounded-2xl bg-[#0c0c0e] border border-white/10 space-y-2">
            <div class="text-xs font-mono text-[#EAE905] uppercase tracking-wider">Partnerships</div>
            <h3 class="text-base font-semibold text-white">Sponsorships & Brand Deals</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
              Opportunities for jersey placement, stream overlays, and community activations.
            </p>
            <a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="text-sm text-[#EAE905] hover:underline">Discuss a partnership on Discord</a>
          </div>
        </div>

        <!-- Interactive Contact Form -->
        <div class="lg:col-span-2 min-w-0 p-5 sm:p-8 rounded-3xl bg-[#0c0c0e] border border-white/10 relative shadow-xl">
          <h2 class="text-xl font-semibold text-white tracking-tight mb-1">Send A Message</h2>
          <p class="text-xs text-slate-400 mb-6">Include your Discord username or email so we can reply.</p>

          @if(sent()) {
            <div class="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
              <div class="text-3xl">📨</div>
              <h3 class="text-base font-semibold text-emerald-300">Message Delivered!</h3>
              <p class="text-xs text-slate-300 max-w-md mx-auto">
                Thank you, <strong>{{ form.name }}</strong>. Your message has been sent to RYVL management.
              </p>
              <button
                type="button"
                (click)="resetForm()"
                class="px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold uppercase mt-2 cursor-pointer"
              >
                Send Another Message
              </button>
            </div>
          } @else {
            <form (ngSubmit)="sendMessage()" class="space-y-5">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Your Name *</label>
                  <input
                    type="text"
                    required
                    [(ngModel)]="form.name"
                    name="name"
                    placeholder="e.g. Alex Ionescu"
                    class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Discord / Email *</label>
                  <input
                    type="text"
                    required
                    [(ngModel)]="form.contact"
                    name="contact"
                    placeholder="e.g. user_tag or email@domain.com"
                    class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Topic *</label>
                <select
                  [(ngModel)]="form.topic"
                  name="topic"
                  class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                >
                  <option value="Scrims">Competitive Scrim Scheduling</option>
                  <option value="Trials">Trials / Squad Inquiries</option>
                  <option value="Partnership">Sponsorship & Commercial</option>
                  <option value="General">General Inquiries</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Message *</label>
                <textarea
                  rows="5"
                  required
                  [(ngModel)]="form.message"
                  name="message"
                  placeholder="How can we collaborate or assist you?..."
                  class="w-full bg-[#141419] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
                ></textarea>
              </div>

              @if(error()) {
                <div class="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                  {{ error() }}
                </div>
              }

              <div class="flex items-center justify-end pt-2">
                <button
                  type="submit"
                  [disabled]="isSubmitting()"
                  class="btn-yellow px-8 py-3.5 rounded-xl disabled:opacity-50 font-black text-xs uppercase tracking-wider shadow-lg shadow-[#EAE905]/15 transition transform hover:scale-105 cursor-pointer flex items-center gap-2"
                >
                  @if(isSubmitting()) {
                    <span class="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    <span>Sending...</span>
                  } @else {
                    <span>Send message</span>
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
export class ContactComponent {
  readonly social = SOCIAL_LINKS;
  private readonly api = inject(ApiService);

  readonly sent = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  form = {
    name: '',
    contact: '',
    topic: 'Scrims',
    message: '',
  };

  async sendMessage(): Promise<void> {
    if (!this.form.name || !this.form.contact || !this.form.message) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const res = await this.api.submitContact(this.form);
      if (res && res.success === false) {
        this.error.set(res.message || res.error || 'Failed to dispatch message to management.');
        return;
      }
      this.sent.set(true);
    } catch (err: any) {
      console.error('Failed to dispatch contact transmission:', err);
      this.error.set(err.message || 'Failed to dispatch message. Please reach out on Discord.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  resetForm(): void {
    this.sent.set(false);
    this.error.set(null);
    this.form = {
      name: '',
      contact: '',
      topic: 'Scrims',
      message: '',
    };
  }
}
