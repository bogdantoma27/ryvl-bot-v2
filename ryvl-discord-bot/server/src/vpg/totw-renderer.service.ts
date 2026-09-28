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

  // Exact coordinates calibrated to totw-template.jpg (819 x 1024)
  private readonly pitchSlots = [
    { key: 'st', label: 'LS', cx: 326, cy: 247, py: 300, idx: 0 },
    { key: 'st', label: 'RS', cx: 493, cy: 247, py: 300, idx: 1 },
    { key: 'cam', label: 'CAM', cx: 410, cy: 363, py: 414, idx: 0 },
    { key: 'lm', label: 'LM', cx: 152, cy: 457, py: 498, idx: 0 },
    { key: 'cm', label: 'LCM', cx: 292, cy: 476, py: 518, idx: 0 },
    { key: 'cm', label: 'RCM', cx: 528, cy: 476, py: 518, idx: 1 },
    { key: 'rm', label: 'RM', cx: 667, cy: 457, py: 498, idx: 0 },
    { key: 'cdm', label: 'CDM', cx: 410, cy: 538, py: 585, idx: 0 },
    { key: 'cb', label: 'LCB', cx: 255, cy: 658, py: 704, idx: 0 },
    { key: 'cb', label: 'CCB', cx: 410, cy: 658, py: 704, idx: 1 },
    { key: 'cb', label: 'RCB', cx: 565, cy: 658, py: 704, idx: 2 },
    { key: 'gk', label: 'GK', cx: 410, cy: 784, py: 828, idx: 0 },
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

  private getDefaultAvatarBuffer(diameter: number): Buffer {
    const r = diameter / 2;
    const svg = `
      <svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${r}" cy="${r}" r="${r}" fill="#0d111d"/>
        <!-- Head -->
        <circle cx="${r}" cy="${r * 0.72}" r="${r * 0.32}" fill="#2a354d"/>
        <!-- Shoulders / Torso -->
        <path d="M ${r * 0.28} ${diameter} C ${r * 0.28} ${r * 1.2}, ${r * 1.72} ${r * 1.2}, ${r * 1.72} ${diameter} Z" fill="#2a354d"/>
      </svg>
    `;
    return Buffer.from(svg);
  }

  renderSvg(options: RenderTotwOptions): string {
    const W = 819;
    const H = 1024;
    const subtitleParts = [options.leagueName];
    if (options.season) subtitleParts.push(`Season ${options.season}`);
    if (options.week) subtitleParts.push(`Week ${options.week}`);
    const subtitle = subtitleParts.join(' • ');

    let playerNamesSvg = '';

    for (const slot of this.pitchSlots) {
      let player: TotwPlayer | undefined;
      const list = options.players[slot.key as keyof TotwPositionsMap];
      if (list && list.length > slot.idx) {
        player = list[slot.idx];
      } else if (slot.key === 'cm' && (!list || list.length <= slot.idx)) {
        const alt = options.players.cdm || options.players.cam || [];
        player = alt[slot.idx];
      }

      const displayName = player ? (player.display_name || player.username || 'PLAYER') : slot.label;
      const cleanName = displayName.toUpperCase().trim();
      const rating = player?.rating ? ` ${player.rating}` : '';
      const labelText = cleanName + (rating ? ` (${rating})` : '');
      const fontSize = labelText.length > 15 ? 9 : labelText.length > 11 ? 10.5 : 12;

      // Position text exactly in the middle of the dark purple nameplate (py)
      playerNamesSvg += `
        <text x="${slot.cx}" y="${slot.py || (slot.cy + 64)}" text-anchor="middle" font-family="'Segoe UI', Roboto, 'Arial Black', sans-serif" font-weight="800" font-size="${fontSize}" fill="#ffffff" letter-spacing="0.5">
          ${escapeXml(labelText.length > 18 ? labelText.slice(0, 17) + '…' : labelText)}
        </text>
      `;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <!-- Subtitle below existing 3D "TEAM OF THE WEEK" title -->
        <text x="${W / 2}" y="194" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="#FACC15">
          ${escapeXml(subtitle.toUpperCase())}
        </text>

        <!-- Player Names on existing purple nameplates -->
        ${playerNamesSvg}

        <!-- Footer League Name Override -->
        <rect x="240" y="924" width="339" height="24" rx="4" fill="#0c071e" fill-opacity="0.95" />
        <text x="${W / 2}" y="941" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" letter-spacing="2" fill="#EAE905">
          ${escapeXml(options.leagueName.toUpperCase())}
        </text>
      </svg>
    `;
  }

  async renderPng(options: RenderTotwOptions): Promise<Buffer> {
    const W = 819;
    const H = 1024;
    const diameter = 76;
    const radius = diameter / 2;
    const templatePath = this.getTotwTemplatePath();

    const avatarOverlays: OverlayOptions[] = [];
    const defaultAvatarBuf = this.getDefaultAvatarBuffer(diameter);

    // Parallel avatar fetching for slots
    for (const slot of this.pitchSlots) {
      const list = options.players[slot.key as keyof TotwPositionsMap];
      const player = list && list.length > slot.idx ? list[slot.idx] : undefined;

      let avatarBuf: Buffer | null = null;
      if (player?.avatar_url) {
        try {
          avatarBuf = await this.fetchCircleAvatarBuffer(player.avatar_url, diameter);
        } catch {
          // ignore error
        }
      }

      avatarOverlays.push({
        input: avatarBuf || defaultAvatarBuf,
        top: Math.round(slot.cy - radius),
        left: Math.round(slot.cx - radius),
      });
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
        this.logger.warn(`Failed compositing on totw-template.jpg: ${err.message}. Rendering fallback.`);
      }
    }

    return sharp(Buffer.from(svg))
      .resize(W, H)
      .png({ quality: 95, compressionLevel: 8 })
      .toBuffer();
  }
}
