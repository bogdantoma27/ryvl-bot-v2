import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SOCIAL_LINKS } from './presentation';

@Component({
  selector: 'app-legal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <article class="public-page max-w-3xl space-y-7">
      <header class="border-b border-white/10 pb-6">
        <p class="public-eyebrow">RYVL Esports</p>
        <h1 class="public-title">{{ privacy ? 'Privacy Policy' : 'Terms of Service' }}</h1>
        <p class="mt-3 text-xs text-slate-500">Last updated: 23 September 2026</p>
      </header>
      @if(privacy) {
        <section class="legal-section">
          <h2>About this notice</h2>
          <p>Public browsing does not require an account.</p>
          <p>This notice explains how RYVL Esports handles information through its website and connected community tools. For questions, use our <a routerLink="/contact">contact page</a> or contact the administrators through the <a [href]="social.discord" target="_blank" rel="noopener noreferrer">official Discord server</a>.</p>
        </section>
        <section class="legal-section">
          <h2>Information you share</h2>
          <p>Contact and recruitment forms collect the information you choose to submit, such as your name, contact details and message. These submissions are forwarded to the Discord channels managed by RYVL staff so they can respond to enquiries and applications. Do not send passwords, payment details or other sensitive information.</p>
          <p>Using the connected event, attendance and lineup tools may record your community identifier, display name, attendance choices and lineup content. Public competition information, including player and club names, transfers, fixtures and results, comes from VPG and EA.</p>
        </section>
        <section class="legal-section">
          <h2>Service providers and external content</h2>
          <p>Authorized staff and the service providers needed to run the website and its community tools may process relevant records and technical information, such as IP addresses and operational logs, to deliver and protect the service.</p>
          <p>The website loads fonts and some club images from external providers. These providers receive the network information needed to deliver that content. Discord, Twitch, YouTube and VPG links lead to services with their own privacy practices.</p>
        </section>
        <section class="legal-section">
          <h2>Access and retention</h2>
          <p>RYVL staff manage access to submissions and community records. Retention depends on the feature and administrative management; there is no single automatic deletion schedule for all records and forwarded messages. Contact us to request a review or removal.</p>
        </section>
        <!-- Staff sign-in exists today, so its disclosure stays available without suggesting
             that public visitors have to register. Future MEMBER sign-in copy belongs here
             only after that feature is actually implemented and its data use is reviewed. -->
        <details class="legal-section legal-staff-note">
          <summary>Information for staff signing in</summary>
          <p>Discord sign-in is used for the staff area. It provides the account identifier, display name, avatar and server information needed to identify staff and check access. Public visitors do not need to use this sign-in.</p>
          <p>Staff sign-in stores a temporary authentication token in the browser to maintain the session. Signing out removes the stored token. We do not ask for your Discord password; authentication takes place on Discord.</p>
        </details>
        <section class="legal-section">
          <h2>Questions, correction and removal</h2>
          <p>Contact the administrators about information relating to you, to request a correction or to request removal of application-held records. Include enough information to identify the relevant submission, but never send an authentication token. Information published by VPG or EA may also need to be corrected with the original provider.</p>
        </section>
      } @else {
        <section class="legal-section"><h2>Using the website</h2><p>The RYVL Esports website provides team information, competition updates and community tools. Public pages are available without an account. Use the website and bot lawfully and respectfully; do not bypass access controls, interfere with the service, submit spam or impersonate others.</p></section>
        <section class="legal-section"><h2>Staff access</h2><p>Administration features are reserved for authorized staff. Signing in does not by itself grant administrative permissions. Keep staff accounts and devices secure, and report suspected unauthorized activity through the <a routerLink="/contact">contact page</a>.</p></section>
        <section class="legal-section"><h2>Competition information</h2><p>Fixtures, transfers, standings and results are obtained from VPG and EA. They may be delayed, corrected or temporarily unavailable. The website does not replace the organizer's official decisions or rules. Kickoff times are presented in Europe/Bucharest unless stated otherwise.</p></section>
        <section class="legal-section"><h2>Submissions and community features</h2><p>Only submit information and content you have permission to provide. Recruitment applications do not guarantee a team place. Administrators may moderate inappropriate content or restrict access to protect the community and service.</p></section>
        <section class="legal-section"><h2>Availability and external services</h2><p>Features may change, require maintenance or become unavailable. External links and integrations are operated by their respective providers under their own terms. RYVL does not control the availability of those services.</p></section>
        <section class="legal-section"><h2>Contact and updates</h2><p>Send questions through our <a routerLink="/contact">contact page</a> or the <a [href]="social.discord" target="_blank" rel="noopener noreferrer">official Discord server</a>. These terms will be updated when features or operating practices change. See the <a routerLink="/privacy">Privacy Policy</a> for information about data handling.</p></section>
      }
    </article>
  `,
})
export class LegalComponent {
  readonly privacy = inject(ActivatedRoute).snapshot.data['kind'] === 'privacy';
  readonly social = SOCIAL_LINKS;
}
