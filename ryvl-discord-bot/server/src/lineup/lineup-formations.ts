export interface FormationPosition {
  key: string;
  label: string;
  description: string;
}

export interface FormationLayout {
  key: string;
  label: string;
  positions: FormationPosition[];
  coords: Record<string, [number, number]>;
}

export const SLOT_LABELS: Record<string, string> = {
  gk: 'GK',
  lb: 'LB',
  lcb: 'LCB',
  cb: 'CB',
  rcb: 'RCB',
  rb: 'RB',
  cdm: 'CDM',
  lcdm: 'LCDM',
  rcdm: 'RCDM',
  lm: 'LM',
  lcm: 'LCM',
  cm: 'CM',
  rcm: 'RCM',
  rm: 'RM',
  lam: 'LAM',
  cam: 'CAM',
  ram: 'RAM',
  lw: 'LW',
  lf: 'LF',
  cf: 'CF',
  rf: 'RF',
  rw: 'RW',
  ls: 'LS',
  st: 'ST',
  rs: 'RS',
};

export const Y_ATTACK = 210;
export const Y_SUPPORT = 380;
export const Y_MIDFIELD = 570;
export const Y_HOLDING = 760;
export const Y_DEFENCE = 930;

function xPositions(count: number): number[] {
  if (count === 1) {
    return [450];
  }
  const left = count >= 4 ? 145 : count === 3 ? 220 : 330;
  const right = 900 - left;
  return Array.from({ length: count }, (_, index) =>
    Math.round(left + ((right - left) * index) / (count - 1)),
  );
}

function makeFormation(
  key: string,
  label: string,
  rows: [number, string[]][],
): FormationLayout {
  const coords: Record<string, [number, number]> = {
    gk: [450, 1120],
  };

  for (const [y, slots] of rows) {
    const xs = xPositions(slots.length);
    slots.forEach((slot, index) => {
      coords[slot] = [xs[index], y];
    });
  }

  const reversedRowsSlots = [...rows].reverse().flatMap(([, slots]) => slots);
  const orderedKeys = ['gk', ...reversedRowsSlots];

  const positions: FormationPosition[] = orderedKeys.map((slot) => ({
    key: slot,
    label: SLOT_LABELS[slot] || slot.toUpperCase(),
    description: SLOT_LABELS[slot] || slot.toUpperCase(),
  }));

  return { key, label, positions, coords };
}

export const FORMATIONS: Record<string, FormationLayout> = {
  '3142': makeFormation('3142', '3-1-4-2', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_HOLDING, ['cdm']],
    [Y_DEFENCE, ['lcb', 'cb', 'rcb']],
  ]),
  '3412': makeFormation('3412', '3-4-1-2', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_SUPPORT, ['cam']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_DEFENCE, ['lcb', 'cb', 'rcb']],
  ]),
  '3421': makeFormation('3421', '3-4-2-1', [
    [Y_ATTACK, ['st']],
    [Y_SUPPORT, ['lf', 'rf']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_DEFENCE, ['lcb', 'cb', 'rcb']],
  ]),
  '343': makeFormation('343', '3-4-3', [
    [Y_ATTACK, ['lw', 'st', 'rw']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_DEFENCE, ['lcb', 'cb', 'rcb']],
  ]),
  '343diamond': makeFormation('343diamond', '3-4-3 Diamond', [
    [Y_ATTACK, ['lw', 'st', 'rw']],
    [Y_SUPPORT, ['cam']],
    [Y_MIDFIELD, ['lm', 'rm']],
    [Y_HOLDING, ['cdm']],
    [Y_DEFENCE, ['lcb', 'cb', 'rcb']],
  ]),
  '3511': makeFormation('3511', '3-5-1-1', [
    [Y_ATTACK, ['st']],
    [Y_SUPPORT, ['cf']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_HOLDING, ['cdm']],
    [Y_DEFENCE, ['lcb', 'cb', 'rcb']],
  ]),
  '352': makeFormation('352', '3-5-2', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_SUPPORT, ['cam']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_DEFENCE, ['lcb', 'cb', 'rcb']],
  ]),
  '41212narrow': makeFormation('41212narrow', '4-1-2-1-2 Narrow', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_SUPPORT, ['cam']],
    [Y_MIDFIELD, ['lcm', 'rcm']],
    [Y_HOLDING, ['cdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '41212wide': makeFormation('41212wide', '4-1-2-1-2 Wide', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_SUPPORT, ['cam']],
    [Y_MIDFIELD, ['lm', 'rm']],
    [Y_HOLDING, ['cdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4132': makeFormation('4132', '4-1-3-2', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_MIDFIELD, ['lm', 'cm', 'rm']],
    [Y_HOLDING, ['cdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4141': makeFormation('4141', '4-1-4-1', [
    [Y_ATTACK, ['st']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_HOLDING, ['cdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4213': makeFormation('4213', '4-2-1-3', [
    [Y_ATTACK, ['lw', 'st', 'rw']],
    [Y_SUPPORT, ['cam']],
    [Y_HOLDING, ['lcdm', 'rcdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4222': makeFormation('4222', '4-2-2-2', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_SUPPORT, ['lam', 'ram']],
    [Y_HOLDING, ['lcdm', 'rcdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4231': makeFormation('4231', '4-2-3-1', [
    [Y_ATTACK, ['st']],
    [Y_SUPPORT, ['lam', 'cam', 'ram']],
    [Y_HOLDING, ['lcdm', 'rcdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4231wide': makeFormation('4231wide', '4-2-3-1 Wide', [
    [Y_ATTACK, ['st']],
    [Y_SUPPORT, ['cam']],
    [Y_MIDFIELD, ['lm', 'rm']],
    [Y_HOLDING, ['lcdm', 'rcdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '424': makeFormation('424', '4-2-4', [
    [Y_ATTACK, ['lw', 'ls', 'rs', 'rw']],
    [Y_MIDFIELD, ['lcm', 'rcm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4312': makeFormation('4312', '4-3-1-2', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_SUPPORT, ['cam']],
    [Y_MIDFIELD, ['lcm', 'cm', 'rcm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4321': makeFormation('4321', '4-3-2-1', [
    [Y_ATTACK, ['st']],
    [Y_SUPPORT, ['lf', 'rf']],
    [Y_MIDFIELD, ['lcm', 'cm', 'rcm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '433': makeFormation('433', '4-3-3', [
    [Y_ATTACK, ['lw', 'st', 'rw']],
    [Y_MIDFIELD, ['lcm', 'cm', 'rcm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '433holding': makeFormation('433holding', '4-3-3 Holding', [
    [Y_ATTACK, ['lw', 'st', 'rw']],
    [Y_MIDFIELD, ['lcm', 'rcm']],
    [Y_HOLDING, ['cdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '433defend': makeFormation('433defend', '4-3-3 Defend', [
    [Y_ATTACK, ['lw', 'st', 'rw']],
    [Y_MIDFIELD, ['cm']],
    [Y_HOLDING, ['lcdm', 'rcdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '433attack': makeFormation('433attack', '4-3-3 Attack', [
    [Y_ATTACK, ['lw', 'st', 'rw']],
    [Y_SUPPORT, ['cam']],
    [Y_MIDFIELD, ['lcm', 'rcm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '433false9': makeFormation('433false9', '4-3-3 False 9', [
    [Y_ATTACK, ['lw', 'cf', 'rw']],
    [Y_MIDFIELD, ['lcm', 'cm', 'rcm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '4411': makeFormation('4411', '4-4-1-1', [
    [Y_ATTACK, ['st']],
    [Y_SUPPORT, ['cf']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '442': makeFormation('442', '4-4-2', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_MIDFIELD, ['lm', 'lcm', 'rcm', 'rm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '442holding': makeFormation('442holding', '4-4-2 Holding', [
    [Y_ATTACK, ['ls', 'rs']],
    [Y_MIDFIELD, ['lm', 'rm']],
    [Y_HOLDING, ['lcdm', 'rcdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '451': makeFormation('451', '4-5-1', [
    [Y_ATTACK, ['st']],
    [Y_MIDFIELD, ['lm', 'lcm', 'cm', 'rcm', 'rm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
  '451attack': makeFormation('451attack', '4-5-1 Attack', [
    [Y_ATTACK, ['st']],
    [Y_SUPPORT, ['lam', 'cam', 'ram']],
    [Y_HOLDING, ['lcdm', 'rcdm']],
    [Y_DEFENCE, ['lb', 'lcb', 'rcb', 'rb']],
  ]),
};

export function formationKeys(): string[] {
  return Object.keys(FORMATIONS).sort();
}

export function formationSlots(formation: string): string[] {
  const layout = FORMATIONS[formation];
  if (!layout) {
    return [];
  }
  return layout.positions.map((p) => p.key);
}

export function slotsByFormation(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const key of formationKeys()) {
    result[key] = formationSlots(key);
  }
  return result;
}
