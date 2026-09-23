from pathlib import Path
import re

web = Path('ryvl-discord-bot/web')
public = web / 'src/app/features/public'

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('Expected exactly one reviewed source block: ' + old[:100])
    return text.replace(old, new, 1)

def write(relative, content):
    file = web / relative
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content, encoding='utf-8')

styles_file = web / 'src/styles.css'
styles = styles_file.read_text()
button = re.search(r'(?m)^\.public-button \{[^\n]+\}$', styles)
if not button:
    raise RuntimeError('Shared button rule not found')
# A reusable component must not override Tailwind responsive display utilities.
styles = styles[:button.start()] + '@layer components {\n  ' + button.group(0) + '\n}\n' + styles[button.end():]
styles += '''
/* Reserve the viewport scrollbar width on ALL routes, including administration.
   The fallback retains a classic gutter in browsers without scrollbar-gutter. */
@layer base {
  html { overflow-y: auto; scrollbar-gutter: stable; }
  @supports not (scrollbar-gutter: stable) {
    html { overflow-y: scroll; }
  }
}
@layer components {
  .social-brand-link { display: inline-flex; align-items: center; gap: .5rem; }
  .social-brand-icon { display: inline-block; width: 1.5rem; height: 1.5rem; flex-shrink: 0; object-fit: contain; }
}
/* Compact spacing at the first desktop breakpoint keeps the full navigation usable. */
@media (min-width: 1024px) and (max-width: 1279px) {
  .public-site header .public-nav-link { padding-inline: .4rem; }
}
.legal-staff-note { padding: 1rem 1.25rem; border: 1px solid rgb(255 255 255 / 12%); border-radius: .75rem; }
.legal-staff-note summary { color: #e2e8f0; cursor: pointer; font-weight: 600; }
.legal-staff-note summary:focus-visible { outline: 2px solid #EAE905; outline-offset: 4px; }
'''
styles_file.write_text(styles)

shell_file = public / 'public-shell.component.ts'
shell = shell_file.read_text()
shell = replace_once(shell, "import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';", "import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';")
shell = shell.replace('xl:flex', 'lg:flex').replace('xl:hidden', 'lg:hidden')
shell = replace_once(shell, 'h-[76px] flex items-center justify-between gap-5', 'h-[76px] flex items-center justify-between gap-3')
shell = replace_once(shell, 'class="text-xl font-bold tracking-wide text-white">RYVL', 'class="text-xl font-bold tracking-wide text-white lg:hidden xl:inline">RYVL')
shell = replace_once(shell, 'type="button" class="lg:hidden public-button"', 'type="button" #menuToggle class="lg:hidden public-button"')
shell = replace_once(shell, 'id="public-mobile-navigation" class=', 'id="public-mobile-navigation" (keydown.escape)="mobileNavOpen.set(false); menuToggle.focus()" class=')
shell = replace_once(shell, "  constructor() { inject(Router).events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.mobileNavOpen.set(false)); }", '''  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Navigation closes the drawer; the subscription is disposed with this shell.
    inject(Router).events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(() => this.mobileNavOpen.set(false));

    // CSS controls visibility. Clear the mobile state when returning to desktop,
    // so resizing back to mobile cannot reopen a stale drawer. Browser-only API.
    afterNextRender(() => {
      const desktop = window.matchMedia('(min-width: 64rem)');
      const closeOnDesktop = () => {
        if (desktop.matches) this.mobileNavOpen.set(false);
      };
      closeOnDesktop();
      desktop.addEventListener('change', closeOnDesktop);
      this.destroyRef.onDestroy(() => desktop.removeEventListener('change', closeOnDesktop));
    });
  }''')
shell_file.write_text(shell)

# Normalize visible loading text, not API request logic or diagnostic log messages.
loading_changes = 0
for file in (web / 'src/app').rglob('*.component.ts'):
    text = file.read_text()
    def loading(match):
        global loading_changes
        loading_changes += 1
        print('Loading copy:', file, repr(match.group(0)))
        return '>Loading...<'
    updated = re.sub(r'>\s*(?:Synchroniz(?:ing|ation)|Syncing)[^<>]*?(?:\.\.\.|…)\s*<', loading, text, flags=re.I)
    if updated != text:
        file.write_text(updated)
if not loading_changes:
    raise RuntimeError('No reviewed loading copy was changed')

# These are unchanged Simple Icons brand silhouettes, rendered in monochrome.
# Keep them local: there is no runtime third-party icon fetch or icon-font dependency.
paths = {
'discord': 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
'twitch': 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z',
'youtube': 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
}
for brand, data in paths.items():
    title = {'discord': 'Discord', 'twitch': 'Twitch', 'youtube': 'YouTube'}[brand]
    write('public/assets/brands/' + brand + '.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff"><title>' + title + '</title><path d="' + data + '"/></svg>\n')

for file in public.glob('*.component.ts'):
    if file.name == 'legal.component.ts':
        continue  # Inline legal prose is not a social-navigation control.
    text = file.read_text()
    def brand_link(match):
        attrs, body = match.group(1), match.group(2)
        brand_match = re.search(r'social\.(discord|twitch|youtube)', attrs)
        if not brand_match:
            return match.group(0)
        brand = brand_match.group(1)
        body = re.sub(r'<svg\b[^>]*>.*?</svg>', '', body, flags=re.S)
        if 'class="' in attrs:
            attrs = attrs.replace('class="', 'class="social-brand-link ', 1)
        else:
            attrs += ' class="social-brand-link"'
        if 'target="_blank"' in attrs and 'rel=' not in attrs:
            attrs += ' rel="noopener noreferrer"'
        icon = '<img src="/assets/brands/' + brand + '.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />'
        return '<a' + attrs + '>' + icon + body + '</a>'
    text = re.sub(r'<a\b([^>]*)>(.*?)</a>', brand_link, text, flags=re.S)
    # The link was fixed earlier, but the displayed invite text must not advertise a different invite.
    text = text.replace('Join discord.gg/ryvl', 'Join our Discord')
    file.write_text(text)

write('public/assets/brands/NOTICE.md', '''# Brand icon sources

Discord, Twitch and YouTube silhouettes are from the Simple Icons project's SVG assets:
- https://github.com/simple-icons/simple-icons/blob/develop/icons/discord.svg (blob 9d7796b8a3068f33744f39640c84b40138c81cf0)
- https://github.com/simple-icons/simple-icons/blob/develop/icons/twitch.svg (blob 8aaa4a9ad01706b87b878ba62212a3c033daa887)
- https://github.com/simple-icons/simple-icons/blob/develop/icons/youtube.svg (blob 0492366a2be42c6f0372a64b8c6f4f6b2cb660f7)

Simple Icons distributes its project under CC0-1.0; individual brand marks remain subject to their owners' rights and usage guidelines. These icons link to RYVL's respective community/channel and do not imply endorsement. The silhouettes are unmodified; white monochrome is used on the dark site.
See https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md and each brand's guidelines.

RYVL favicons are generated from the existing `../branding/ryvl-mark.png`, without redrawing the logo. Run `node scripts/generate-favicons.cjs` from web after installing server dependencies; generated assets are committed and do not require runtime generation.
''')

write('src/app/features/public/legal.component.ts', '''import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
''')

# The old smoke assertion exposed an implementation detail deliberately removed from public copy.
smoke = web / 'test/browser-smoke.cjs'
smoke.write_text(replace_once(smoke.read_text(), "await expect(page.getByText('ryvl_token',{exact:true})).toBeVisible();", "await expect(page.getByText('Public browsing does not require an account.',{exact:true})).toBeVisible();"))

index = web / 'src/index.html'
index.write_text(replace_once(index.read_text(), '<link rel="icon" type="image/x-icon" href="favicon.ico">', '''<!-- Versioned URLs prevent the old starter favicon from surviving a deployment. -->
  <link rel="icon" type="image/png" sizes="32x32" href="/ryvl-favicon-32.png?v=1">
  <link rel="icon" type="image/x-icon" href="/favicon.ico?v=ryvl-1">
  <link rel="apple-touch-icon" sizes="180x180" href="/ryvl-apple-touch-icon.png?v=1">
  <meta name="theme-color" content="#080808">'''))

write('scripts/generate-favicons.cjs', ''''use strict';
// Generate committed favicon assets from the existing RYVL artwork. No logo redesign.
// Uses the backend's existing Sharp dependency; the web app adds no image library.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../server/node_modules/sharp');
const publicDir = path.resolve(__dirname, '../public');
async function main() {
  const source = await sharp(path.join(publicDir, 'assets/branding/ryvl-mark.png')).trim().png().toBuffer();
  async function icon(size) {
    const padding = Math.max(1, Math.round(size / 16));
    const mark = await sharp(source).resize(size - padding * 2, size - padding * 2, { fit: 'inside' }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: '#080808' } })
      .composite([{ input: mark, gravity: 'centre' }]).png().toBuffer();
  }
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(icon));
  // ICO permits PNG image payloads. The directory retains real 16/32/48px entries.
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = sizes[index]; directory[entry + 1] = sizes[index];
    directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), Buffer.concat([directory, ...images]));
  await fs.writeFile(path.join(publicDir, 'ryvl-favicon-32.png'), images[1]);
  await fs.writeFile(path.join(publicDir, 'ryvl-apple-touch-icon.png'), await icon(180));
  console.log('Generated RYVL favicons from existing artwork: ICO 16/32/48, PNG 32, touch icon 180.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
''')
print('Prepared reviewed public UI corrections without changing backend, OAuth, database or deployment configuration.')
