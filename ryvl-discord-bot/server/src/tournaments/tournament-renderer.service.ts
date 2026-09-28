import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

export interface TournamentPlayerPick {
  userId: string;
  displayName: string;
  gamertag?: string;
  position: string;
  isManager?: boolean;
}

export interface TournamentTeamRoster {
  id: string;
  name: string;
  crestUrl?: string;
  managerName?: string;
  picks: TournamentPlayerPick[];
}

export interface TournamentStandingsRow {
  rank: number;
  team: string;
  crestUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

function escapeXml(unsafe: any): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

@Injectable()
export class TournamentRendererService {
  private readonly logger = new Logger(TournamentRendererService.name);

  /**
   * Renders a Starting XI Roster Card matching media_1790597927581.png:
   * - Vertical 800 x 1050 format
   * - Top Crest Badge & "STARTING XI."
   * - Team Name Subheader
   * - Bold numbered list 1 to 11 with Player Names & Positions
   * - Bottom Division Banner ("THE ROAD TO DIVISION 1" / Tournament Banner)
   */
  renderRosterSvg(team: TournamentTeamRoster, tournamentName = 'FC DRAFT RO'): string {
    const W = 800;
    const H = 1050;
    const teamName = team.name.toUpperCase();

    // Standard starting positions or picks
    const players = team.picks || [];
    let playerRowsSvg = '';

    for (let i = 0; i < 11; i++) {
      const num = i + 1;
      const pick = players[i];
      const pName = pick ? (pick.displayName || pick.gamertag || 'TBD').toUpperCase() : 'VACANT';
      const pos = pick ? (pick.position || '') : '';
      const isMgr = pick?.isManager ? ' (M)' : '';
      const y = 260 + i * 54;

      playerRowsSvg += `
        <g>
          <!-- Player Name on the Left -->
          <text x="360" y="${y}" text-anchor="end" font-family="'Impact', 'Arial Black', sans-serif" font-size="34" letter-spacing="1.5" fill="#FFFFFF">
            ${escapeXml(pName.length > 15 ? pName.slice(0, 14) + '…' : pName)}
          </text>
          
          <!-- Position Tag (Optional small) -->
          ${pos ? `
            <text x="360" y="${y + 14}" text-anchor="end" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="11" fill="#a4b8d1">
              ${escapeXml(pos)}${isMgr}
            </text>
          ` : ''}

          <!-- Jersey Number on the Right -->
          <text x="395" y="${y}" text-anchor="start" font-family="'Impact', 'Arial Black', sans-serif" font-size="36" fill="#FFFFFF">
            ${num}
          </text>
        </g>
      `;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#070a11" />
            <stop offset="40%" stop-color="#0c1424" />
            <stop offset="100%" stop-color="#05080e" />
          </linearGradient>
          <linearGradient id="bannerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#2a0845" />
            <stop offset="100%" stop-color="#141a29" />
          </linearGradient>
          <filter id="cardGlow">
            <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Dark Textured Backdrop -->
        <rect width="${W}" height="${H}" fill="url(#bgGradient)" />

        <!-- Subdued pitch texture lines on right half -->
        <rect x="470" y="80" width="300" height="780" rx="16" fill="#111c2e" fill-opacity="0.25" stroke="#1f3652" stroke-width="1.5" />
        <circle cx="620" cy="470" r="100" fill="none" stroke="#1f3652" stroke-width="1.5" stroke-dasharray="8 6" opacity="0.4" />
        <line x1="470" y1="470" x2="770" y2="470" stroke="#1f3652" stroke-width="1.5" opacity="0.4" />

        <!-- Header Crest & STARTING XI -->
        <g id="header">
          <!-- Crest Shield -->
          <polygon points="375,50 425,50 435,95 400,125 365,95" fill="#4B0082" stroke="#EAE905" stroke-width="4" />
          <text x="400" y="93" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF">
            ${escapeXml(teamName.slice(0, 2))}
          </text>

          <text x="400" y="165" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="900" letter-spacing="4" fill="#FFFFFF">
            STARTING XI.
          </text>
          <text x="400" y="195" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" letter-spacing="2" fill="#7d93b0">
            ${escapeXml(teamName)}
          </text>
        </g>

        <!-- Numbered Players Roster -->
        ${playerRowsSvg}

        <!-- Bottom Banner: THE ROAD TO DIVISION 1 -->
        <g id="footer-banner">
          <rect x="0" y="880" width="${W}" height="95" fill="url(#bannerGrad)" stroke="#3e1b64" stroke-width="2" />
          
          <!-- Laurel Badge Crest -->
          <circle cx="160" cy="927" r="30" fill="#7a1c1c" stroke="#EAE905" stroke-width="2" />
          <text x="160" y="934" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF">
            1
          </text>

          <text x="210" y="915" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" letter-spacing="3" fill="#cfb274">
            ${escapeXml(tournamentName.toUpperCase())}
          </text>
          <text x="210" y="948" font-family="'Impact', 'Arial Black', sans-serif" font-size="28" letter-spacing="1.5" fill="#FFFFFF">
            THE ROAD TO DIVISION 1
          </text>
        </g>

        <!-- Brand Footer Tag -->
        <text x="25" y="1030" font-family="'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700" letter-spacing="2" fill="#3f5878">
          RYVL ESPORTS • TOURNAMENT SYSTEM
        </text>
      </svg>
    `;
  }

  async renderRosterPng(team: TournamentTeamRoster, tournamentName = 'FC DRAFT RO'): Promise<Buffer> {
    const svg = this.renderRosterSvg(team, tournamentName);
    return sharp(Buffer.from(svg))
      .png({ quality: 95, compressionLevel: 8 })
      .toBuffer();
  }

  /**
   * Renders Standings Table matching the FC Draft RO standard:
   * # | TEAM | P | W | D | L | GF | GA | GD | PTS
   */
  renderStandingsSvg(tournamentName: string, rows: TournamentStandingsRow[]): string {
    const W = 1100;
    const rowH = 65;
    const headerH = 150;
    const H = headerH + Math.max(rows.length, 1) * rowH + 90;

    let rowsSvg = '';
    const numericCols = [
      { key: 'P', x: 590 },
      { key: 'W', x: 650 },
      { key: 'D', x: 710 },
      { key: 'L', x: 770 },
      { key: 'GF', x: 840 },
      { key: 'GA', x: 900 },
      { key: 'GD', x: 960 },
      { key: 'PTS', x: 1040 },
    ];

    rows.forEach((row, i) => {
      const y = headerH + i * rowH;
      const bgFill = i % 2 === 0 ? '#0d1726' : '#111e33';
      const isTop = row.rank <= 2;
      const rankColor = row.rank === 1 ? '#FCD116' : row.rank === 2 ? '#C0C0C0' : '#88a0bf';

      rowsSvg += `
        <rect x="40" y="${y}" width="${W - 80}" height="${rowH - 4}" rx="10" fill="${bgFill}" stroke="#1c304d" stroke-width="1" />
        
        <!-- Rank -->
        <text x="75" y="${y + 40}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="18" fill="${rankColor}">
          ${row.rank}
        </text>

        <!-- Team Name -->
        <text x="120" y="${y + 40}" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="18" fill="#FFFFFF">
          ${escapeXml(row.team)}
        </text>

        <!-- Stats Columns -->
        <text x="590" y="${y + 40}" text-anchor="middle" font-family="'Consolas', monospace" font-size="16" fill="#88a0bf">${row.played}</text>
        <text x="650" y="${y + 40}" text-anchor="middle" font-family="'Consolas', monospace" font-size="16" fill="#22c55e">${row.wins}</text>
        <text x="710" y="${y + 40}" text-anchor="middle" font-family="'Consolas', monospace" font-size="16" fill="#eab308">${row.draws}</text>
        <text x="770" y="${y + 40}" text-anchor="middle" font-family="'Consolas', monospace" font-size="16" fill="#ef4444">${row.losses}</text>
        <text x="840" y="${y + 40}" text-anchor="middle" font-family="'Consolas', monospace" font-size="16" fill="#88a0bf">${row.goalsFor}</text>
        <text x="900" y="${y + 40}" text-anchor="middle" font-family="'Consolas', monospace" font-size="16" fill="#88a0bf">${row.goalsAgainst}</text>
        <text x="960" y="${y + 40}" text-anchor="middle" font-family="'Consolas', monospace" font-size="16" font-weight="bold" fill="${row.goalDifference >= 0 ? '#22c55e' : '#ef4444'}">${row.goalDifference > 0 ? '+' : ''}${row.goalDifference}</text>
        <text x="1040" y="${y + 40}" text-anchor="middle" font-family="'Consolas', monospace" font-weight="900" font-size="20" fill="${isTop ? '#FCD116' : '#FFFFFF'}">${row.points}</text>
      `;
    });

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#080e18" />
            <stop offset="100%" stop-color="#040810" />
          </linearGradient>
          <linearGradient id="thGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#192841" />
            <stop offset="100%" stop-color="#141f33" />
          </linearGradient>
        </defs>

        <rect width="${W}" height="${H}" fill="url(#bgGrad)" />

        <!-- Header -->
        <text x="50" y="55" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" letter-spacing="3" fill="#00E5FF">
          TOURNAMENT STANDINGS
        </text>
        <text x="50" y="95" font-family="'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="900" fill="#FFFFFF">
          ${escapeXml(tournamentName)}
        </text>

        <!-- Table Header Bar -->
        <rect x="40" y="115" width="${W - 80}" height="32" rx="6" fill="url(#thGrad)" />
        <text x="75" y="136" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" fill="#758ea8">#</text>
        <text x="120" y="136" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" fill="#758ea8">TEAM</text>
        ${numericCols.map((c) => `<text x="${c.x}" y="136" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" fill="#758ea8">${c.key}</text>`).join('')}

        <!-- Rows -->
        ${rowsSvg}

        <!-- Footer -->
        <text x="50" y="${H - 25}" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" fill="#465e7d">
          P: Matches Played • W: Wins • D: Draws • L: Losses • GF: Goals For • GA: Goals Against • GD: Goal Difference • PTS: Points
        </text>
      </svg>
    `;
  }

  async renderStandingsPng(tournamentName: string, rows: TournamentStandingsRow[]): Promise<Buffer> {
    const svg = this.renderStandingsSvg(tournamentName, rows);
    return sharp(Buffer.from(svg))
      .png({ quality: 95, compressionLevel: 8 })
      .toBuffer();
  }
}
