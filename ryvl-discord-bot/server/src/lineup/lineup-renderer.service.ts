import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { FORMATIONS, FormationLayout } from './lineup-formations';

export interface KickoffRow {
  flag: 'ro' | 'uk' | string;
  text: string;
}

export interface RenderLineupOptions {
  formation: string;
  players: Record<string, string>;
  title?: string;
  kickoffAt?: Date | string | null;
  kickoffRows?: KickoffRow[];
  primaryColor?: string;
  secondaryColor?: string;
  width?: number;
  height?: number;
  showSlotTags?: boolean;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function contrastText(hexColor: string): string {
  const raw = hexColor.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? '#111111' : '#ffffff';
}

function formatTimeInZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const map = new Map(parts.map((p) => [p.type, p.value]));
    const weekday = map.get('weekday') || '';
    const day = map.get('day') || '';
    const month = map.get('month') || '';
    const year = map.get('year') || '';
    const hour = map.get('hour') || '00';
    const minute = map.get('minute') || '00';

    return `${weekday}, ${day} ${month} ${year} ${hour}:${minute}`;
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 16);
  }
}

export function formatDualKickoff(kickoffDate: Date): KickoffRow[] {
  return [
    { flag: 'ro', text: formatTimeInZone(kickoffDate, 'Europe/Bucharest') },
    { flag: 'uk', text: formatTimeInZone(kickoffDate, 'Europe/London') },
  ];
}

@Injectable()
export class LineupRendererService {
  private readonly defaultPrimary = '#EAE905';
  private readonly defaultSecondary = '#111111';

  renderSvg(options: RenderLineupOptions): string {
    const layout: FormationLayout = FORMATIONS[options.formation] || FORMATIONS['433'];
    const primary = safeColor(options.primaryColor, this.defaultPrimary);
    const secondary = safeColor(options.secondaryColor, this.defaultSecondary);
    const title = options.title?.trim() || 'RYVL Match Lineup';
    const showSlotTags = options.showSlotTags !== false;

    let kickoffRows = options.kickoffRows;
    if (!kickoffRows && options.kickoffAt) {
      const dt = typeof options.kickoffAt === 'string' ? new Date(options.kickoffAt) : options.kickoffAt;
      if (!isNaN(dt.getTime())) {
        kickoffRows = formatDualKickoff(dt);
      }
    }
    if (!kickoffRows || kickoffRows.length === 0) {
      kickoffRows = [
        { flag: 'ro', text: 'Kickoff pending' },
        { flag: 'uk', text: 'Kickoff pending' },
      ];
    }

    const width = 900;
    const height = 1400;
    const headerHeight = 176;

    // Build SVG fragments
    const stripesSvg = this.generatePitchStripes(headerHeight, height, width);
    const linesSvg = this.generatePitchLines(headerHeight, height, width);
    const headerSvg = this.generateHeader(
      title,
      layout.label,
      primary,
      kickoffRows,
      width,
      headerHeight,
    );
    const playersSvg = this.generatePlayers(
      layout,
      options.players || {},
      primary,
      secondary,
      showSlotTags,
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" style="width: 100%; max-width: 100%; height: auto; display: block;">
  <defs>
    <style>
      .txt-title { font-family: 'Segoe UI', Arial, sans-serif; font-weight: 700; fill: #ffffff; }
      .txt-pill { font-family: 'Segoe UI', Arial, sans-serif; font-weight: 700; fill: ${primary}; font-size: 26px; }
      .txt-kickoff { font-family: 'Segoe UI', Arial, sans-serif; font-weight: 700; fill: #d9d9d9; font-size: 18px; }
      .txt-num { font-family: 'Segoe UI', Arial, sans-serif; font-weight: 800; font-size: 24px; text-anchor: middle; dominant-baseline: central; }
      .txt-name { font-family: 'Segoe UI', Arial, sans-serif; font-weight: 700; font-size: 16px; fill: #ffffff; text-anchor: middle; dominant-baseline: central; }
      .txt-pos { font-family: 'Segoe UI', Arial, sans-serif; font-weight: 700; font-size: 14px; fill: #111111; text-anchor: middle; dominant-baseline: central; }
    </style>
  </defs>

  <!-- Pitch Canvas Background -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="#040404" />
  <rect x="0" y="${headerHeight}" width="${width}" height="${height - headerHeight}" fill="#2f8a0d" />

  <!-- Pitch Stripes -->
  ${stripesSvg}

  <!-- Pitch Markings -->
  ${linesSvg}

  <!-- Header -->
  ${headerSvg}

  <!-- Players -->
  ${playersSvg}
</svg>`;
  }

  async renderPng(options: RenderLineupOptions): Promise<Buffer> {
    const svg = this.renderSvg(options);
    const targetWidth = options.width && options.width >= 900 ? options.width : 900;
    const targetHeight = options.height && options.height >= 1400 ? options.height : 1400;

    let pipeline = sharp(Buffer.from(svg));
    if (targetWidth !== 900 || targetHeight !== 1400) {
      pipeline = pipeline.resize(targetWidth, targetHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      });
    }

    return pipeline.png().toBuffer();
  }

  private generatePitchStripes(headerHeight: number, height: number, width: number): string {
    const stripeH = (height - (headerHeight + 50)) / 11;
    let stripes = '';
    for (let i = 0; i < 11; i++) {
      if (i % 2 === 0) {
        const top = Math.floor(headerHeight + i * stripeH);
        const h = Math.floor(stripeH);
        stripes += `<rect x="0" y="${top}" width="${width}" height="${h}" fill="#267b09" />\n  `;
      }
    }
    return stripes;
  }

  private generatePitchLines(headerHeight: number, height: number, width: number): string {
    const margin = 70;
    const top = headerHeight + 55; // 231
    const bottom = height - 55;    // 1345
    const centre = (top + bottom) / 2; // 788
    const penaltyWidth = 460;
    const penaltyHeight = 190;
    const left = (width - penaltyWidth) / 2; // 220

    return `
    <!-- Outer boundary -->
    <rect x="${margin}" y="${top}" width="${width - margin * 2}" height="${bottom - top}" fill="none" stroke="#ffffff" stroke-width="5" />
    <!-- Halfway line -->
    <line x1="${margin}" y1="${centre}" x2="${width - margin}" y2="${centre}" stroke="#ffffff" stroke-width="5" />
    <!-- Center circle and spot -->
    <circle cx="${width / 2}" cy="${centre}" r="90" fill="none" stroke="#ffffff" stroke-width="5" />
    <circle cx="${width / 2}" cy="${centre}" r="5" fill="#ffffff" />
    <!-- Top penalty box -->
    <rect x="${left}" y="${top}" width="${penaltyWidth}" height="${penaltyHeight}" fill="none" stroke="#ffffff" stroke-width="5" />
    <!-- Bottom penalty box -->
    <rect x="${left}" y="${bottom - penaltyHeight}" width="${penaltyWidth}" height="${penaltyHeight}" fill="none" stroke="#ffffff" stroke-width="5" />
    `;
  }

  private renderFlagSvg(flag: string, x: number, y: number, w = 24, h = 16): string {
    if (flag === 'ro') {
      const stripe = w / 3;
      return `
      <g transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${stripe}" height="${h}" fill="#002B7F" />
        <rect x="${stripe}" y="0" width="${stripe}" height="${h}" fill="#FCD116" />
        <rect x="${stripe * 2}" y="0" width="${stripe}" height="${h}" fill="#CE1126" />
        <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#b5b5b5" stroke-width="1" />
      </g>`;
    }
    if (flag === 'uk') {
      return `
      <g transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${w}" height="${h}" fill="#012169" />
        <!-- White diagonals -->
        <line x1="0" y1="0" x2="${w}" y2="${h}" stroke="#ffffff" stroke-width="5" />
        <line x1="${w}" y1="0" x2="0" y2="${h}" stroke="#ffffff" stroke-width="5" />
        <!-- Red diagonals -->
        <line x1="0" y1="0" x2="${w}" y2="${h}" stroke="#C8102E" stroke-width="2.5" />
        <line x1="${w}" y1="0" x2="0" y2="${h}" stroke="#C8102E" stroke-width="2.5" />
        <!-- White cross -->
        <rect x="${w / 2 - 3}" y="0" width="6" height="${h}" fill="#ffffff" />
        <rect x="0" y="${h / 2 - 3}" width="${w}" height="6" fill="#ffffff" />
        <!-- Red cross -->
        <rect x="${w / 2 - 1.8}" y="0" width="3.6" height="${h}" fill="#C8102E" />
        <rect x="0" y="${h / 2 - 1.8}" width="${w}" height="3.6" fill="#C8102E" />
        <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#b5b5b5" stroke-width="1" />
      </g>`;
    }
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#444444" stroke="#b5b5b5" stroke-width="1" />`;
  }

  private generateHeader(
    title: string,
    formationLabel: string,
    primary: string,
    kickoffRows: KickoffRow[],
    width: number,
    headerHeight: number,
  ): string {
    const pillTextLen = formationLabel.length * 15;
    const pillWidth = Math.max(128, pillTextLen + 40);
    const pillX = width - pillWidth - 40;
    const pillY = 38;

    const titleX = 40;
    const titleY = 62;

    const row1 = kickoffRows[0] || { flag: 'ro', text: 'Kickoff pending' };
    const row2 = kickoffRows[1] || { flag: 'uk', text: 'Kickoff pending' };

    const flagW = 24;
    const flagH = 16;

    const flag1Svg = this.renderFlagSvg(row1.flag, titleX, 100 - 12, flagW, flagH);
    const flag2Svg = this.renderFlagSvg(row2.flag, titleX, 130 - 12, flagW, flagH);

    return `
    <!-- Header Background -->
    <rect x="0" y="0" width="${width}" height="${headerHeight}" fill="#050505" />
    <rect x="0" y="${headerHeight - 8}" width="${width}" height="8" fill="${primary}" />

    <!-- Formation Pill -->
    <rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="52" rx="18" fill="#121212" stroke="${primary}" stroke-width="2" />
    <text x="${pillX + pillWidth / 2}" y="${pillY + 34}" class="txt-pill" text-anchor="middle">${escapeXml(formationLabel)}</text>

    <!-- Title -->
    <text x="${titleX}" y="${titleY}" class="txt-title" font-size="38">${escapeXml(title)}</text>

    <!-- Dual Kickoff Rows -->
    ${flag1Svg}
    <text x="${titleX + flagW + 12}" y="99" class="txt-kickoff" dominant-baseline="middle">${escapeXml(row1.text)}</text>

    ${flag2Svg}
    <text x="${titleX + flagW + 12}" y="129" class="txt-kickoff" dominant-baseline="middle">${escapeXml(row2.text)}</text>
    `;
  }

  private generatePlayers(
    layout: FormationLayout,
    players: Record<string, string>,
    primary: string,
    secondary: string,
    showSlotTags: boolean,
  ): string {
    const numColor = contrastText(primary);
    return layout.positions
      .map((position, index) => {
        const [x, baseY] = layout.coords[position.key];
        const y = baseY + 108; // Legacy shirt offset
        const playerName = players[position.key]?.trim() || position.label;
        const playerNumber = index + 1;
        return this.renderSinglePlayer(
          x,
          y,
          position.label,
          playerName,
          playerNumber,
          primary,
          secondary,
          numColor,
          showSlotTags,
        );
      })
      .join('\n');
  }

  private renderSinglePlayer(
    x: number,
    y: number,
    positionLabel: string,
    playerName: string,
    number: number,
    primary: string,
    secondary: string,
    numColor: string,
    showSlotTags: boolean,
  ): string {
    const topY = y - 13;
    const sleeveBottomY = y + 23;
    const bodyHalf = 27;
    const sleeveOuterTop = 48;
    const sleeveOuterBottom = 43;
    const sleeveInner = 30;

    // Sleeve left
    const leftSleevePoints = `${x - bodyHalf},${topY} ${x - sleeveOuterTop},${y - 5} ${x - sleeveOuterBottom},${sleeveBottomY} ${x - sleeveInner},${y + 18} ${x - bodyHalf},${y + 8}`;
    // Sleeve right
    const rightSleevePoints = `${x + bodyHalf},${topY} ${x + sleeveOuterTop},${y - 5} ${x + sleeveOuterBottom},${sleeveBottomY} ${x + sleeveInner},${y + 18} ${x + bodyHalf},${y + 8}`;
    // Body polygon
    const bodyPoints = `${x - bodyHalf},${topY} ${x - 12},${topY} ${x},${y - 7} ${x + 12},${topY} ${x + bodyHalf},${topY} ${x + bodyHalf},${y + 74} ${x + 14},${y + 88} ${x - 14},${y + 88} ${x - bodyHalf},${y + 74}`;

    // Nameplate
    const displayName = playerName.length > 22 ? playerName.slice(0, 20) + '..' : playerName;
    const approxTextLen = displayName.length * 9;
    const plateWidth = Math.max(104, Math.min(164, approxTextLen + 28));
    const plateHeight = 34;
    const plateY = y + 66;

    // Position tag
    const tagWidth = Math.max(46, positionLabel.length * 10 + 20);
    const tagHeight = 26;
    const tagY = plateY + plateHeight + 8;

    return `
    <!-- Player ${number} (${positionLabel}) -->
    <g id="player-${number}">
      <!-- Left Sleeve -->
      <polygon points="${leftSleevePoints}" fill="${primary}" stroke="${secondary}" stroke-width="2" />
      <!-- Right Sleeve -->
      <polygon points="${rightSleevePoints}" fill="${primary}" stroke="${secondary}" stroke-width="2" />
      <!-- Jersey Body -->
      <polygon points="${bodyPoints}" fill="${primary}" stroke="${secondary}" stroke-width="2" />
      <!-- Neck curve -->
      <path d="M ${x - 14} ${topY} Q ${x} ${y + 5} ${x + 14} ${topY}" fill="none" stroke="${secondary}" stroke-width="2" />
      <!-- Shirt Number -->
      <text x="${x}" y="${y + 38}" class="txt-num" fill="${numColor}">${number}</text>

      <!-- Nameplate -->
      <rect x="${x - plateWidth / 2}" y="${plateY}" width="${plateWidth}" height="${plateHeight}" rx="12" fill="#0b0b0b" stroke="#252525" stroke-width="1" />
      <text x="${x}" y="${plateY + plateHeight / 2}" class="txt-name">${escapeXml(displayName)}</text>

      <!-- Position Tag -->
      ${
        showSlotTags
          ? `<rect x="${x - tagWidth / 2}" y="${tagY}" width="${tagWidth}" height="${tagHeight}" rx="10" fill="#EAE905" />
             <text x="${x}" y="${tagY + tagHeight / 2}" class="txt-pos">${escapeXml(positionLabel)}</text>`
          : ''
      }
    </g>`;
  }
}
