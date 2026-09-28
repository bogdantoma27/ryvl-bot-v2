import { Injectable, Logger } from '@nestjs/common';
import sharp, { OverlayOptions } from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

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
  targetPosition?: string;
}

export interface TotwPositionsMap {
  gk?: TotwPlayer[];
  cb?: TotwPlayer[];
  cdm?: TotwPlayer[];
  cm?: TotwPlayer[];
  cam?: TotwPlayer[];
  lm?: TotwPlayer[];
  rm?: TotwPlayer[];
  st?: TotwPlayer[];
  sub?: TotwPlayer[];
}

export interface RenderTotwOptions {
  leagueName: string;
  season?: number | string;
  week?: number | string | null;
  isTots?: boolean;
  players: TotwPositionsMap;
  accentColor?: string;
  showFlagBar?: boolean;
  transparentBg?: boolean;
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

  private getTotwTemplatePath(): string | null {
    const candidates = [
      path.join(__dirname, 'assets', 'totw-template.jpg'),
      path.join(__dirname, '..', 'assets', 'totw-template.jpg'),
      path.join(process.cwd(), 'src', 'assets', 'totw-template.jpg'),
      path.join(process.cwd(), 'assets', 'totw-template.jpg'),
      path.join(process.cwd(), 'dist', 'src', 'assets', 'totw-template.jpg'),
      path.join(process.cwd(), 'dist', 'assets', 'totw-template.jpg'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  // Exact coordinates matching totw-template.jpg (819 x 1024)
  private readonly pitchSlots = [
    { key: 'st', label: 'LS', cx: 349, cy: 288, idx: 0 },
    { key: 'st', label: 'RS', cx: 469, cy: 290, idx: 1 },
    { key: 'cam', label: 'CAM', cx: 385, cy: 407, idx: 0 },
    { key: 'lm', label: 'LM', cx: 168, cy: 494, idx: 0 },
    { key: 'cm', label: 'LCM', cx: 281, cy: 515, idx: 0 },
    { key: 'cm', label: 'RCM', cx: 500, cy: 514, idx: 1 },
    { key: 'rm', label: 'RM', cx: 650, cy: 494, idx: 0 },
    { key: 'cdm', label: 'CDM', cx: 383, cy: 583, idx: 0 },
    { key: 'cb', label: 'LCB', cx: 233, cy: 701, idx: 0 },
    { key: 'cb', label: 'CCB', cx: 386, cy: 701, idx: 1 },
    { key: 'cb', label: 'RCB', cx: 584, cy: 702, idx: 2 },
    { key: 'gk', label: 'GK', cx: 385, cy: 827, idx: 0 },
  ];

  private async fetchCircleAvatarBuffer(url: string | null | undefined, diameter: number): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RYVLBot/2.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      const circleSvg = `<svg width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`;
      const mask = Buffer.from(circleSvg);

      return sharp(inputBuffer)
        .resize(diameter, diameter, { fit: 'cover' })
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }

  renderSvg(options: RenderTotwOptions): string {
    const W = 819;
    const H = 1024;
    const accent = options.accentColor || '#00E5FF';
    const title = options.isTots ? 'TEAM OF THE SEASON' : 'TEAM OF THE WEEK';
    const subtitleParts = [options.leagueName];
    if (options.season) subtitleParts.push(`Season ${options.season}`);
    if (options.week) subtitleParts.push(`Week ${options.week}`);
    const subtitle = subtitleParts.join(' • ');

    let playerBadgesSvg = '';

    for (const slot of this.pitchSlots) {
      let player: TotwPlayer | undefined;
      const list = options.players[slot.key as keyof TotwPositionsMap];
      if (list && list.length > slot.idx) {
        player = list[slot.idx];
      } else if (slot.key === 'cm' && (!list || list.length <= slot.idx)) {
        // Fallback to cdm or cam if cm list has fewer entries
        const alt = options.players.cdm || options.players.cam || [];
        player = alt[slot.idx];
      }

      const playerName = player ? (player.display_name || player.username || 'PLAYER') : slot.label;
      const rating = player?.rating ? `${player.rating}` : '';
      const team = player?.team_name ? player.team_name.slice(0, 10) : '';
      const statLabel = rating ? `${rating} RTG` : team || slot.label;

      const badgeW = 92;
      const badgeH = 24;
      const bx = slot.cx - badgeW / 2;
      const by = slot.cy + 34;

      // Dynamic font size for player names to fit perfectly
      const fontSize = playerName.length > 14 ? 8 : playerName.length > 10 ? 9.5 : 11;

      playerBadgesSvg += `
        <!-- Slot ${slot.label} at (${slot.cx}, ${slot.cy}) -->
        <g id="slot-${slot.label}">
          <!-- Subtle position circle glow if no avatar -->
          <circle cx="${slot.cx}" cy="${slot.cy}" r="34" fill="#0b1728" fill-opacity="0.5" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.8" />
          <text x="${slot.cx}" y="${slot.cy + 4}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="12" fill="${accent}">
            ${slot.label}
          </text>

          <!-- Player Name Pill Badge -->
          <rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="5" fill="#08101c" fill-opacity="0.94" stroke="#1b3658" stroke-width="1.2" />
          <rect x="${bx}" y="${by}" width="3" height="${badgeH}" rx="1.5" fill="${accent}" />

          <!-- Player Name -->
          <text x="${slot.cx + 2}" y="${by + 11}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-weight="bold" font-size="${fontSize}" fill="#ffffff">
            ${escapeXml(playerName.length > 17 ? playerName.slice(0, 16) + '…' : playerName)}
          </text>

          <!-- Rating / Team Detail -->
          <text x="${slot.cx + 2}" y="${by + 20}" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="8" font-weight="700" fill="${accent}">
            ${escapeXml(statLabel)}
          </text>
        </g>
      `;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Top Accent Bar -->
        <rect x="0" y="0" width="${W}" height="4" fill="${accent}" />

        <!-- Header Titles -->
        <g id="header">
          <text x="${W / 2}" y="75" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" letter-spacing="4" fill="${accent}">
            OFFICIAL SELECTION • 3-5-2
          </text>
          <text x="${W / 2}" y="116" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="900" letter-spacing="2" fill="#ffffff" filter="url(#glow)">
            ${title}
          </text>
          <text x="${W / 2}" y="148" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" letter-spacing="1" fill="#88a0bf">
            ${escapeXml(subtitle)}
          </text>
        </g>

        <!-- Pitch Badges -->
        ${playerBadgesSvg}

        <!-- Footer -->
        <g id="footer">
          <text x="40" y="${H - 24}" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" letter-spacing="1" fill="#586f8f">
            PRO CLUBS • VPG TELEMETRY
          </text>
          <text x="${W - 40}" y="${H - 24}" text-anchor="end" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" fill="${accent}">
            RYVL BOT
          </text>
        </g>
      </svg>
    `;
  }

  async renderPng(options: RenderTotwOptions): Promise<Buffer> {
    const W = 819;
    const H = 1024;
    const templatePath = this.getTotwTemplatePath();

    const avatarOverlays: OverlayOptions[] = [];

    // Parallel avatar fetching for slots with avatar_url
    for (const slot of this.pitchSlots) {
      const list = options.players[slot.key as keyof TotwPositionsMap];
      const player = list && list.length > slot.idx ? list[slot.idx] : undefined;
      if (player?.avatar_url) {
        try {
          const avatarBuf = await this.fetchCircleAvatarBuffer(player.avatar_url, 68);
          if (avatarBuf) {
            avatarOverlays.push({
              input: avatarBuf,
              top: slot.cy - 34,
              left: slot.cx - 34,
            });
          }
        } catch {
          // ignore error and let SVG circle render
        }
      }
    }

    const svg = this.renderSvg(options);
    const svgOverlay: OverlayOptions = {
      input: Buffer.from(svg),
      top: 0,
      left: 0,
    };

    if (templatePath) {
      try {
        return sharp(templatePath)
          .resize(W, H)
          .composite([...avatarOverlays, svgOverlay])
          .png({ quality: 95, compressionLevel: 8 })
          .toBuffer();
      } catch (err: any) {
        this.logger.warn(`Failed compositing on totw-template.jpg: ${err.message}. Rendering base SVG.`);
      }
    }

    return sharp(Buffer.from(svg))
      .resize(W, H)
      .png({ quality: 95, compressionLevel: 8 })
      .toBuffer();
  }
}
