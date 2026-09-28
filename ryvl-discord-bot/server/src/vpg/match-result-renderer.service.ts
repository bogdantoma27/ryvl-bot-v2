import { Injectable, Logger } from '@nestjs/common';
import sharp, { OverlayOptions } from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

export interface RenderMatchResultOptions {
  homeClubName: string;
  awayClubName: string;
  homeScore: number;
  awayScore: number;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  competitionName?: string;
  matchType?: string;
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
export class MatchResultRendererService {
  private readonly logger = new Logger(MatchResultRendererService.name);

  private getTemplatePath(): string | null {
    const candidates = [
      path.join(__dirname, 'assets', 'match-result-template.jpg'),
      path.join(__dirname, '..', 'assets', 'match-result-template.jpg'),
      path.join(process.cwd(), 'src', 'assets', 'match-result-template.jpg'),
      path.join(process.cwd(), 'assets', 'match-result-template.jpg'),
      path.join(process.cwd(), 'dist', 'src', 'assets', 'match-result-template.jpg'),
      path.join(process.cwd(), 'dist', 'assets', 'match-result-template.jpg'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private async fetchCircleLogoBuffer(url: string | null | undefined, diameter: number): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RYVLBot/2.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      // Create circular mask
      const circleSvg = `<svg width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`;
      const mask = Buffer.from(circleSvg);

      return sharp(inputBuffer)
        .resize(diameter, diameter, { fit: 'contain', background: { r: 12, g: 15, b: 24, alpha: 1 } })
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }

  async renderMatchCard(options: RenderMatchResultOptions): Promise<Buffer> {
    const W = 1024;
    const H = 576;
    const templatePath = this.getTemplatePath();

    // Coordinates identified from template:
    // Home crest: center (185, 285), diameter 130
    // Away crest: center (838, 285), diameter 130
    // Home team name box: (73, 351, 218x44)
    // Away team name box: (733, 351, 218x44)
    // Center score: box is 306..717. Home score at 440, hyphen at 512, Away score at 584

    const homeName = options.homeClubName || 'Home Team';
    const awayName = options.awayClubName || 'Away Team';

    const homeFontSize = homeName.length > 18 ? 13 : homeName.length > 13 ? 15 : 18;
    const awayFontSize = awayName.length > 18 ? 13 : awayName.length > 13 ? 15 : 18;

    const competition = options.competitionName ? options.competitionName.toUpperCase() : 'VPG MATCH RESULT';

    const overlaySvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <defs>
          <filter id="scoreGlow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Competition Header -->
        <text x="512" y="145" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="900" letter-spacing="3" fill="#00e5ff">
          ${escapeXml(competition)}
        </text>

        <!-- Home Team Name (centered in box 73..291, y=351..395) -->
        <text x="182" y="378" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="${homeFontSize}" font-weight="800" fill="#ffffff" letter-spacing="0.5">
          ${escapeXml(homeName)}
        </text>

        <!-- Away Team Name (centered in box 733..951, y=351..395) -->
        <text x="842" y="378" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="${awayFontSize}" font-weight="800" fill="#ffffff" letter-spacing="0.5">
          ${escapeXml(awayName)}
        </text>

        <!-- Score Line -->
        <g id="scores" filter="url(#scoreGlow)">
          <!-- Home Score -->
          <text x="440" y="322" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="62" font-weight="900" fill="#ffffff">
            ${options.homeScore}
          </text>
          <!-- Hyphen Divider -->
          <text x="512" y="318" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="900" fill="#00e5ff">
            -
          </text>
          <!-- Away Score -->
          <text x="584" y="322" text-anchor="middle" font-family="'Segoe UI', Roboto, sans-serif" font-size="62" font-weight="900" fill="#ffffff">
            ${options.awayScore}
          </text>
        </g>
      </svg>
    `;

    const composites: OverlayOptions[] = [
      { input: Buffer.from(overlaySvg), top: 0, left: 0 },
    ];

    // Fetch logos in parallel if present
    const [homeLogoBuf, awayLogoBuf] = await Promise.all([
      this.fetchCircleLogoBuffer(options.homeLogoUrl, 130),
      this.fetchCircleLogoBuffer(options.awayLogoUrl, 130),
    ]);

    if (homeLogoBuf) {
      composites.unshift({
        input: homeLogoBuf,
        top: Math.round(285 - 65),
        left: Math.round(185 - 65),
      });
    }

    if (awayLogoBuf) {
      composites.unshift({
        input: awayLogoBuf,
        top: Math.round(285 - 65),
        left: Math.round(838 - 65),
      });
    }

    if (templatePath) {
      return sharp(templatePath)
        .resize(W, H)
        .composite(composites)
        .png({ quality: 95 })
        .toBuffer();
    }

    // Fallback if template image is missing: render on dark canvas
    return sharp({
      create: {
        width: W,
        height: H,
        channels: 4,
        background: { r: 10, g: 15, b: 26, alpha: 1 },
      },
    })
      .composite(composites)
      .png({ quality: 95 })
      .toBuffer();
  }
}
