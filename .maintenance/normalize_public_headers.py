"""Apply the reviewed presentation-only edits to the isolated validation checkout."""
from pathlib import Path
import re

root = Path('ryvl-discord-bot/web/src/app/features/public')
changed = []

def replace(text, old, new, count=1):
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f'Expected {count} matches, found {actual}: {old[:100]}')
    return text.replace(old, new)

def block(text, start, end, replacement):
    left, right = text.index(start), text.index(end, text.index(start) + len(start))
    return text[:left] + replacement + '\n\n      ' + text[right:]

def header(heading, description=None, eyebrow='RYVL Esports', action=None):
    attrs = f'heading="{heading}" eyebrow="{eyebrow}"'
    if description:
        attrs += f' description="{description}"'
    if action:
        return f'<app-public-page-header {attrs}>\n        {action}\n      </app-public-page-header>'
    return f'<app-public-page-header {attrs} />'

for name in ['club', 'team', 'recruitment', 'about', 'contact', 'performance', 'live']:
    path = root / f'{name}.component.ts'
    text = path.read_text()
    controller = text[text.index('export class '):]
    text = "import { PublicPageHeaderComponent } from './public-page-header.component';\n" + text
    text, count = re.subn(r'imports: \[([^\]]*)\]', r'imports: [\1, PublicPageHeaderComponent]', text, count=1)
    assert count == 1, name
    text, count = re.subn(r'(template:\s*`\s*)<div class="[^"]+">', r'\1<div class="public-page space-y-8">', text, count=1)
    assert count == 1, name

    if name == 'team':
        text = block(text, '<!-- Section Header -->', '<!-- Filter Tabs -->', header(
            'RYVL Active Roster', action='<button header-actions type="button" class="public-button" (click)="loadRoster()" [disabled]="isLoading()">Refresh</button>'))
    elif name == 'club':
        text = block(text, '<!-- Section Header -->', '<!-- Distinguish outages', header(
            'RYVL Club Tracker', eyebrow='EA SPORTS FC 27 Pro Clubs', action='<button header-actions type="button" class="public-button" (click)="refreshData()" [disabled]="isLoadingMatches() || isLoadingConfig()">Refresh</button>'))
        text = replace(text, '<span class="text-slate-400 font-normal">Bucharest Telemetry</span>', '')
        text = replace(text, '<span>•</span>\n                <span>Tier: <span class="text-white font-bold">Elite 11v11</span></span>', '')
        text = replace(text, '<div class="text-[11px] text-slate-400 mt-0.5">Match Shutouts</div>', '')
        text = replace(text, '<p class="text-xs text-slate-400">All-time competitive performance recorded on official EA servers.</p>', '')
        for old, new in [
            ('Recent Match Clashes', 'Recent matches'), ('Campaign Telemetry', 'Club statistics'),
            ('Campaign Record', 'Match record'), ('Match Aggregate Comparison', 'Match statistics'),
            ('Win Efficiency', 'Win rate'), ('Attack Output', 'Goals scored'), ('Defensive Rigor', 'Clean sheets'),
            ('EA Pro Clubs Member Statistics', 'Player statistics'),
            ('Calculated across {{ totalMatches() }} competitive 11v11 fixtures recorded on EA SPORTS FC 27 Pro Clubs.', '{{ totalMatches() }} matches played.'),
        ]:
            # A matching comment can legitimately share a label with its section.
            text = replace(text, old, new, text.count(old))
        text, count = re.subn(r'\s*<p class="text-xs text-slate-400 leading-relaxed">\s*Match clean sheets registered without conceding a single opposition goal\.\s*</p>', '', text)
        assert count == 1
    elif name == 'recruitment':
        text = block(text, '<!-- Header -->', '<!-- Criteria & Expectations -->', header(
            'Recruitment &amp; Trials', 'Apply for a place in the RYVL squad.'))
        text = replace(text, '<span class="text-xs font-mono font-bold text-[#EAE905] uppercase tracking-widest">Trial Application</span>', '')
        text = replace(text, 'Submit Your Dossier', 'Apply for a trial')
        text = replace(text, 'Our captaincy team reviews submissions within 24–48 hours.', 'We will use your Discord username to contact you about your application.')
        text = replace(text, 'Submit Trial Request', 'Submit application')
        text = replace(text, 'Submitting Application...', 'Submitting...')
        text = replace(text, 'e.g. your_discord#0000', 'e.g. your_discord')
        text = replace(text, 'None (Pure Specialist)', 'None')
        text = replace(text, 'p-8 sm:p-12', 'p-5 sm:p-8')
    elif name == 'about':
        text = block(text, '<!-- Header -->', '<!-- Core Story & Philosophy -->', header('About RYVL Esports'))
        text = block(text, '<!-- Technological Edge -->', '<!-- Call to Action -->', '')
        text = replace(text, '#WERYVL • Founded 2024', '#WERYVL')
        text = replace(text, '<span class="text-[11px] font-mono text-[#EAE905] uppercase tracking-widest">Visual Identity</span>', '')
        text = replace(text, 'RYVL Esports was founded on an unapologetic belief: elite competitive performance is not an accident of talent, but the result of relentless daily discipline and tactical cohesion.', 'RYVL Esports brings players together for competitive EA SPORTS FC 27 Pro Clubs.')
        text = replace(text, 'Competing in the highest tier of European EA FC 11v11 Pro Clubs and VPG competitions, our squad represents modern digital athletics. Every formation, pressing trigger, and set piece is rehearsed to automatic perfection.', 'We focus on teamwork, communication and improving together in our VPG competitions.')
        text = replace(text, 'class="flex items-center justify-center gap-4 pt-2"', 'class="flex flex-wrap items-center justify-center gap-4 pt-2"')
    elif name == 'contact':
        text = block(text, '<!-- Header -->', '<div class="grid grid-cols-1 lg:grid-cols-3 gap-10">', header(
            'Contact RYVL Esports', 'Get in touch about friendly matches, tournaments, partnerships or other enquiries.'))
        text = replace(text, 'Fastest response time for players, scrim inquiries, and community members.', 'For players, friendly matches and community questions.')
        text = replace(text, 'We arrange high-level 11v11 test matches on non-game nights (Wednesdays & Weekends).', 'Contact us to arrange a friendly 11v11 match.')
        for address, label in [('scrims', 'Arrange a match on Discord'), ('partners', 'Discuss a partnership on Discord')]:
            text = replace(text, f'<span class="text-xs font-mono text-slate-300">{address}&#64;ryvl.gg</span>', f'<a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="text-sm text-[#EAE905] hover:underline">{label}</a>')
        text = replace(text, 'Your dispatch has been routed to RYVL management.', 'Your message has been sent to RYVL management.')
        text = replace(text, 'Leave us your details and we will reply promptly.', 'Include your Discord username or email so we can reply.')
        text = replace(text, '<span>Transmitting...</span>', '<span>Sending...</span>')
        text = replace(text, '<span>Send Transmission</span>', '<span>Send message</span>')
        text = replace(text, 'lg:col-span-2 p-8 sm:p-10', 'lg:col-span-2 min-w-0 p-5 sm:p-8')
    elif name == 'performance':
        start = text.index('<header ')
        end = text.index('</header>', start) + len('</header>')
        text = text[:start] + header('Team performance', 'Results, fixtures and league progress from our VPG competitions.', action='<button header-actions type="button" class="public-button" (click)="loadPerformance()" [disabled]="isLoading()">{{ isLoading() ? \'Refreshing…\' : \'Refresh\' }}</button>') + text[end:]
    elif name == 'live':
        start = text.index('<header ')
        end = text.index('</header>', start) + len('</header>')
        text = text[:start] + header('Match Center', "Today’s fixtures and confirmed results.", eyebrow='VPG Superliga România', action='<button header-actions type="button" class="public-button" (click)="refresh()" [disabled]="isLoading()">{{ isLoading() ? \'Refreshing…\' : \'Refresh\' }}</button>') + text[end:]

    # Match section heading weight to the established public typography without
    # changing metric sizes, scoreboards, form fields, event handlers or API calls.
    if name in ['club', 'team', 'recruitment', 'about', 'contact']:
        def soften_heading(match):
            classes = match.group(2).split()
            classes = ['font-semibold' if value in ['font-black', 'font-extrabold', 'font-bold'] else value for value in classes if value != 'uppercase']
            return match.group(1) + ' '.join(classes) + match.group(3)
        text = re.sub(r'(<h[23]\b[^>]*class=")([^"]+)(")', soften_heading, text)
    assert text[text.index('export class '):] == controller, f'{name}: controller unexpectedly changed'
    path.write_text(text)
    changed.append(str(path))

# Allow flex/grid cards to shrink on small screens rather than push the viewport.
styles = Path('ryvl-discord-bot/web/src/styles.css')
css = styles.read_text()
css = replace(css, '.public-page { width: 100%; max-width:', '.public-page { width: 100%; min-width: 0; max-width:')
styles.write_text(css)
print('Updated presentation only:')
print('\n'.join(changed))
