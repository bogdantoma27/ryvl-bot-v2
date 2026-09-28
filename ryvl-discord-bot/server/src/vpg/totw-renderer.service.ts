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
    { key: 'st', label: 'LS', cx: 325, cy: 245, r: 35, py: 310, idx: 0 },
    { key: 'st', label: 'RS', cx: 493, cy: 245, r: 35, py: 310, idx: 1 },
    { key: 'cam', label: 'CAM', cx: 409, cy: 362, r: 35, py: 428, idx: 0 },
    { key: 'lm', label: 'LM', cx: 145, cy: 448, r: 35, py: 514, idx: 0 },
    { key: 'cm', label: 'LCM', cx: 293, cy: 469, r: 35, py: 532, idx: 0 },
    { key: 'cm', label: 'RCM', cx: 525, cy: 468, r: 35, py: 532, idx: 1 },
    { key: 'rm', label: 'RM', cx: 673, cy: 448, r: 35, py: 514, idx: 0 },
    { key: 'cdm', label: 'CDM', cx: 409, cy: 537, r: 34, py: 601, idx: 0 },
    { key: 'cb', label: 'LCB', cx: 258, cy: 657, r: 34, py: 721, idx: 0 },
    { key: 'cb', label: 'CCB', cx: 409, cy: 652, r: 36, py: 721, idx: 1 },
    { key: 'cb', label: 'RCB', cx: 561, cy: 657, r: 34, py: 721, idx: 2 },
    { key: 'gk', label: 'GK', cx: 409, cy: 774, r: 40, py: 847, idx: 0 },
  ];

  private async fetchCircleAvatarBuffer(url: string | null | undefined, r: number): Promise<Buffer | null> {
    if (!url) return null;
    const D = r * 2;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RYVLBot/2.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      // Arch cutout at bottom follows the golden position arch badge
      const maskSvg = Buffer.from(
        `<svg width="${D}" height="${D}"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="#fff"/><path d="M ${r - 20} ${D} Q ${r} ${D - 6} ${r + 20} ${D} Z" fill="#000"/></svg>`
      );

      return sharp(inputBuffer)
        .resize(D, D, { fit: 'cover' })
        .composite([{ input: maskSvg, blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }

  private async getDefaultAvatarBuffer(r: number): Promise<Buffer> {
    const D = r * 2;
    const maskSvg = Buffer.from(
      `<svg width="${D}" height="${D}"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="#fff"/><path d="M ${r - 20} ${D} Q ${r} ${D - 6} ${r + 20} ${D} Z" fill="#000"/></svg>`
    );
    const svg = `
      <svg width="${D}" height="${D}" viewBox="0 0 ${D} ${D}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${D}" height="${D}" fill="#111828"/>
        <circle cx="${r}" cy="${r * 0.72}" r="${r * 0.32}" fill="#2a354d"/>
        <path d="M ${r * 0.28} ${D} C ${r * 0.28} ${r * 1.2}, ${r * 1.72} ${r * 1.2}, ${r * 1.72} ${D} Z" fill="#2a354d"/>
      </svg>
    `;
    return sharp(Buffer.from(svg))
      .composite([{ input: maskSvg, blend: 'dest-in' }])
      .png()
      .toBuffer();
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

      // If no player has been selected for this position, do not render any placeholder label
      if (!player) continue;

      const displayName = player.display_name || player.username || '';
      const cleanName = displayName.toUpperCase().trim();
      if (!cleanName) continue;

      const rating = player?.rating ? ` ${player.rating}` : '';
      const labelText = cleanName + (rating ? ` (${rating})` : '');
      const fontSize = labelText.length > 15 ? 9 : labelText.length > 11 ? 10.5 : 12;

      // Position text centered inside the purple nameplate box (py)
      playerNamesSvg += `
        <text x="${slot.cx}" y="${slot.py}" text-anchor="middle" dominant-baseline="central" font-family="'Segoe UI', Roboto, 'Arial Black', sans-serif" font-weight="800" font-size="${fontSize}" fill="#ffffff" letter-spacing="0.5">
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
      </svg>
    `;
  }

  async renderPng(options: RenderTotwOptions): Promise<Buffer> {
    const W = 819;
    const H = 1024;
    const templatePath = this.getTotwTemplatePath();

    const avatarOverlays: OverlayOptions[] = [];

    // Parallel avatar fetching for slots
    for (const slot of this.pitchSlots) {
      const list = options.players[slot.key as keyof TotwPositionsMap];
      const player = list && list.length > slot.idx ? list[slot.idx] : undefined;

      let avatarBuf: Buffer | null = null;
      if (player?.avatar_url) {
        try {
          avatarBuf = await this.fetchCircleAvatarBuffer(player.avatar_url, slot.r);
        } catch {
          // ignore error
        }
      }

      if (!avatarBuf) {
        avatarBuf = await this.getDefaultAvatarBuffer(slot.r);
      }

      avatarOverlays.push({
        input: avatarBuf,
        top: Math.round(slot.cy - slot.r),
        left: Math.round(slot.cx - slot.r),
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
          .composite([...avatarOverlays, svgOverlay])
          .png({ quality: 100, compressionLevel: 6 })
          .toBuffer();
      } catch (err: any) {
        this.logger.warn(`Failed compositing on totw-template.jpg: ${err.message}. Rendering fallback.`);
      }
    }

    return sharp(Buffer.from(svg))
      .resize(W, H)
      .png({ quality: 100, compressionLevel: 6 })
      .toBuffer();
  }
}
