import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

export interface TotwPlayer {
  username: string;
  display_name?: string;
  team_name?: string;
  team_logo?: string;
  avatar_url?: string;
  nationality?: string;
  rating?: number | string;
  goals?: number;
  assists?: number;
  clean_sheets?: number;
  matches_played?: number;
}

export interface TotwPositionsMap {
  gk: TotwPlayer[];
  cb: TotwPlayer[];
  cdm: TotwPlayer[];
  cam: TotwPlayer[];
  lm: TotwPlayer[];
  rm: TotwPlayer[];
  st: TotwPlayer[];
}

export interface RenderTotwOptions {
  leagueName: string;
  season?: number | string;
  week?: number | string | null;
  isTots?: boolean;
  players: TotwPositionsMap;
  accentColor?: string;
  showFlagBar?: boolean;
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
export class TotwRendererService {
  private readonly logger = new Logger(TotwRendererService.name);

  // Formation coordinate definitions: relX (0..1), relY (0..1)
  // Attack is at top (relY ~0.14), defense at bottom (relY ~0.84)
  private readonly slots = [
    { key: 'gk', label: 'GK', relX: 0.50, relY: 0.86, idx: 0 },
    { key: 'cb', label: 'CB', relX: 0.22, relY: 0.69, idx: 0 },
    { key: 'cb', label: 'CB', relX: 0.50, relY: 0.69, idx: 1 },
    { key: 'cb', label: 'CB', relX: 0.78, relY: 0.69, idx: 2 },
    { key: 'lm', label: 'LM', relX: 0.16, relY: 0.44, idx: 0 },
    { key: 'cdm', label: 'CDM', relX: 0.36, relY: 0.53, idx: 0 },
    { key: 'cdm', label: 'CDM', relX: 0.64, relY: 0.53, idx: 1 },
    { key: 'rm', label: 'RM', relX: 0.84, relY: 0.44, idx: 0 },
    { key: 'cam', label: 'CAM', relX: 0.50, relY: 0.34, idx: 0 },
    { key: 'st', label: 'ST', relX: 0.34, relY: 0.16, idx: 0 },
    { key: 'st', label: 'ST', relX: 0.66, relY: 0.16, idx: 1 },
  ];

  renderSvg(options: RenderTotwOptions): string {
    const W = 1300;
    const H = 1600;
    const accent = options.accentColor || '#00E5FF';
    const title = options.isTots ? 'TEAM OF THE SEASON' : 'TEAM OF THE WEEK';
    const subtitleParts = [options.leagueName];
    if (options.season) subtitleParts.push(`Season ${options.season}`);
    if (options.week) subtitleParts.push(`Week ${options.week}`);
    const subtitle = subtitleParts.join(' • ');

    // Pitch dimensions
    const pitchL = 60;
    const pitchT = 180;
    const pitchW = W - pitchL * 2;
    const pitchH = 1340;

    let playerBadgesSvg = '';

    for (const slot of this.slots) {
      const list = options.players[slot.key as keyof TotwPositionsMap] || [];
      const player = list[slot.idx];
      const cx = Math.round(pitchL + pitchW * slot.relX);
      const cy = Math.round(pitchT + pitchH * slot.relY);

      const playerName = player ? (player.display_name || player.username || 'TBD') : 'VACANT';
      const teamName = player?.team_name || '';
      const statDetail = player?.goals !== undefined && player.goals > 0
        ? `${player.goals}G ${player.assists || 0}A`
        : player?.clean_sheets !== undefined && player.clean_sheets > 0
        ? `${player.clean_sheets} CS`
        : player?.rating
        ? `${player.rating} RTG`
        : '';

      const cardW = 190;
      const cardH = 50;
      const cardX = cx - cardW / 2;
      const cardY = cy + 18;

      playerBadgesSvg += `
        <!-- Slot ${slot.label} at (${cx}, ${cy}) -->
        <g>
          <!-- Subtle position glow circle -->
          <circle cx="${cx}" cy="${cy}" r="38" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-width="2" stroke-opacity="0.5" />
          <circle cx="${cx}" cy="${cy}" r="30" fill="#0d1929" stroke="#1f3652" stroke-width="2" />
          <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="14" fill="${accent}">${slot.label}</text>

          <!-- Player Name Badge -->
          <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="8" fill="#0c1827" fill-opacity="0.95" stroke="#1f3652" stroke-width="1.5" />
          <rect x="${cardX}" y="${cardY}" width="4" height="${cardH}" rx="2" fill="${accent}" />
          
          <text x="${cx}" y="${cardY + 22}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="bold" font-size="15" fill="#ffffff">
            ${escapeXml(playerName.length > 18 ? playerName.slice(0, 17) + '…' : playerName)}
          </text>
          
          <text x="${cx}" y="${cardY + 40}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" fill="#88a0bf">
            ${escapeXml(teamName ? (statDetail ? `${teamName.slice(0, 12)} • ${statDetail}` : teamName.slice(0, 20)) : (statDetail || slot.label))}
          </text>
        </g>
      `;
    }

    const flagBarSvg = options.showFlagBar !== false
      ? `
        <!-- Romanian Tricolour Top Accent Bar -->
        <rect x="0" y="0" width="${W * 0.333}" height="6" fill="#002B7F" />
        <rect x="${W * 0.333}" y="0" width="${W * 0.334}" height="6" fill="#FCD116" />
        <rect x="${W * 0.667}" y="0" width="${W * 0.333}" height="6" fill="#CE1126" />
      `
      : '';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#080e18" />
            <stop offset="100%" stop-color="#040810" />
          </linearGradient>
          <linearGradient id="pitchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0a1526" stop-opacity="0.9" />
            <stop offset="100%" stop-color="#070f1c" stop-opacity="0.9" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Base Background -->
        <rect width="${W}" height="${H}" fill="url(#bgGrad)" />
        ${flagBarSvg}

        <!-- Header Banner -->
        <g id="header">
          <text x="${W / 2}" y="70" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" letter-spacing="4" fill="${accent}">
            OFFICIAL LEAGUE SELECTION
          </text>
          <text x="${W / 2}" y="115" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="900" letter-spacing="2" fill="#ffffff" filter="url(#glow)">
            ${title}
          </text>
          <text x="${W / 2}" y="150" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" letter-spacing="1" fill="#88a0bf">
            ${escapeXml(subtitle)}
          </text>
        </g>

        <!-- Soccer Pitch Visual -->
        <g id="pitch">
          <!-- Pitch Canvas -->
          <rect x="${pitchL}" y="${pitchT}" width="${pitchW}" height="${pitchH}" rx="24" fill="url(#pitchGrad)" stroke="#1a2d47" stroke-width="2" />
          
          <!-- Pitch Markings -->
          <rect x="${pitchL + 20}" y="${pitchT + 20}" width="${pitchW - 40}" height="${pitchH - 40}" rx="16" fill="none" stroke="#162942" stroke-width="2" stroke-dasharray="10 6" opacity="0.6" />
          
          <!-- Halfway line -->
          <line x1="${pitchL + 20}" y1="${pitchT + pitchH / 2}" x2="${pitchL + pitchW - 20}" y2="${pitchT + pitchH / 2}" stroke="#1c3555" stroke-width="2" />
          <!-- Center circle -->
          <circle cx="${pitchL + pitchW / 2}" cy="${pitchT + pitchH / 2}" r="110" fill="none" stroke="#1c3555" stroke-width="2" />
          <circle cx="${pitchL + pitchW / 2}" cy="${pitchT + pitchH / 2}" r="4" fill="${accent}" />

          <!-- Top Penalty Box (Attacking) -->
          <rect x="${pitchL + pitchW / 2 - 200}" y="${pitchT + 20}" width="400" height="180" fill="none" stroke="#162942" stroke-width="2" />
          <!-- Bottom Penalty Box (Defending/GK) -->
          <rect x="${pitchL + pitchW / 2 - 200}" y="${pitchT + pitchH - 200}" width="400" height="180" fill="none" stroke="#162942" stroke-width="2" />
        </g>

        <!-- Player Cards on Pitch -->
        ${playerBadgesSvg}

        <!-- Footer -->
        <g id="footer">
          <line x1="${pitchL}" y1="${pitchT + pitchH + 20}" x2="${pitchL + pitchW}" y2="${pitchT + pitchH + 20}" stroke="#132338" stroke-width="1" />
          <text x="${pitchL + 10}" y="${pitchT + pitchH + 46}" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" letter-spacing="1" fill="#586f8f">
            PRO CLUBS • FORMATION 3-4-3 • VPG TELEMETRY
          </text>
          <text x="${pitchL + pitchW - 10}" y="${pitchT + pitchH + 46}" text-anchor="end" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" fill="${accent}">
            RYVL ESPORTS BOT
          </text>
        </g>
      </svg>
    `;
  }

  async renderPng(options: RenderTotwOptions): Promise<Buffer> {
    const svg = this.renderSvg(options);
    return sharp(Buffer.from(svg))
      .png({ quality: 95, compressionLevel: 8 })
      .toBuffer();
  }
}
