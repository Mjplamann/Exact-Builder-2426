/**
 * Resolve how a plant species looks (leaf outline, venation, petiole, spots, translucency,
 * flexibility…) from its data fields plus a few well-known species ids. Works for any valid
 * PlantSpecies — unknown species fall back to sensible defaults for their form and leaf shape.
 */
import type { PlantForm, PlantSpecies } from '../../../core/types';
import { hashString } from '../../../core/rng';
import type { LeafOutline, LeafTexSpec } from '../textures';

export interface LeafLook {
  tex: LeafTexSpec;
  /** Leaf strip geometry. */
  rows: number;
  fold: number;
  ruffle: number;
  ruffleFreq: number;
  cup: number;
  /** Backlit translucency. */
  transl: number;
  roughness: number;
}

function lighten(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

const has = (sp: PlantSpecies, re: RegExp) => re.test(sp.id) || re.test(sp.scientificName.toLowerCase());

/** Does color2 describe the growing tips (red tips under strong light) rather than spots/undersides? */
export function tipColored(sp: PlantSpecies): boolean {
  if (!sp.color2) return false;
  if (has(sp, /ozelot|zenkeri|lotus|nymphoides|tiger|ludwigia-repens|pinnatifida|aromatica|coffeefolia|brownie|salvinia|phyllanthus|microsorum|bolbitis/)) return false;
  return sp.form === 'stem' || sp.form === 'fine-stem' || sp.form === 'rosette' || sp.form === 'grass' || sp.form === 'carpet' || sp.form === 'ribbon' || sp.form === 'bulb';
}

/** Primary leaf look for a species. */
export function leafLook(sp: PlantSpecies): LeafLook {
  const seed = hashString(sp.id);
  const shape = sp.leafShape ?? defaultShape(sp.form);
  let outline: LeafOutline = (
    {
      lanceolate: 'lanceolate', ovate: 'ovate', round: 'round', needle: 'needle', strap: 'strap', feathery: 'feather-whorl', heart: 'heart', lobed: 'lobed-hygro',
    } as const
  )[shape];
  let veins: LeafTexSpec['veins'] = 'pinnate';
  let petiole = 0;
  let wavy = 0;
  let spots: LeafTexSpec['spots'];
  let bands: LeafTexSpec['bands'];
  let sparkle: string | undefined;
  let tip = tipColored(sp) ? sp.color2 : lighten(sp.color, 1.12);
  let rows = 6, fold = 0.04, ruffle = 0, ruffleFreq = 8, cup = 0;
  let transl = 0.45, roughness = 0.6;
  let w = 64, h = 256;

  switch (sp.form) {
    case 'rosette':
      petiole = has(sp, /echinodorus|lagenandra/) ? 0.32 : has(sp, /cryptocoryne/) ? 0.22 : 0.08;
      wavy = has(sp, /cryptocoryne|pogostemon-helferi/) ? 0.12 : 0.02;
      if (has(sp, /pogostemon-helferi/)) ruffle = 0.06;
      if (has(sp, /ceratopteris/)) outline = 'lobed-hygro';
      rows = 8;
      fold = 0.05;
      w = 96;
      break;
    case 'ribbon':
    case 'seagrass':
      outline = 'strap';
      veins = 'parallel';
      rows = 22;
      fold = 0.0;
      w = 32;
      h = 512;
      transl = 0.6;
      if (has(sp, /balansae|crinum/)) {
        ruffle = 0.006;
        ruffleFreq = 60;
      }
      if (has(sp, /tiger/)) bands = { color: sp.color2 ?? '#5a3a20', count: 90 };
      break;
    case 'stem':
      petiole = has(sp, /hydrocotyle/) ? 0.35 : 0.04;
      rows = 3;
      w = 64;
      h = 128;
      if (shape === 'round' || shape === 'ovate') h = 96;
      transl = 0.5;
      break;
    case 'fine-stem':
      rows = 3;
      w = 64;
      h = 128;
      if (shape === 'needle') outline = 'needle-fork';
      if (has(sp, /cabomba/)) {
        outline = 'fan';
        w = 128;
        h = 128;
      }
      transl = 0.55;
      break;
    case 'epiphyte-fern':
      petiole = 0.06;
      rows = 8;
      roughness = 0.5;
      transl = has(sp, /bolbitis/) ? 0.5 : 0.25;
      veins = 'net';
      if (has(sp, /windelov/)) outline = 'windelov';
      else if (has(sp, /trident/)) outline = 'trident';
      else if (has(sp, /bolbitis/)) outline = 'pinnate';
      w = 96;
      wavy = 0.06;
      break;
    case 'epiphyte-broadleaf':
      petiole = has(sp, /anubias/) ? 0.3 : 0.12;
      rows = 6;
      roughness = 0.32;
      transl = 0.1;
      cup = 0.06;
      if (has(sp, /coffeefolia/)) {
        ruffle = 0.03;
        ruffleFreq = 10;
      }
      if (has(sp, /bucephalandra/)) {
        sparkle = '#a8c8e8';
        wavy = has(sp, /wavy/) ? 0.15 : 0.04;
      }
      w = 128;
      h = 256;
      break;
    case 'carpet':
      rows = 2;
      w = 64;
      h = 64;
      petiole = 0;
      if (has(sp, /marsilea/)) outline = 'clover4';
      else if (has(sp, /hydrocotyle/)) outline = 'clover3';
      else if (shape === 'ovate') outline = 'spoon';
      transl = 0.45;
      break;
    case 'grass':
      outline = shape === 'lanceolate' ? 'lanceolate' : 'strap';
      veins = 'parallel';
      rows = 6;
      fold = 0;
      w = 16;
      h = 256;
      transl = 0.55;
      break;
    case 'moss':
      outline = has(sp, /montagnei|fissidens/) ? 'fern-frond' : 'moss';
      rows = 2;
      w = 64;
      h = 128;
      transl = 0.35;
      roughness = 0.8;
      break;
    case 'floating':
      rows = 2;
      w = 128;
      h = 128;
      cup = 0.15;
      roughness = has(sp, /salvinia|pistia/) ? 0.85 : 0.35;
      transl = 0.35;
      if (has(sp, /pistia/)) {
        outline = 'spoon';
        veins = 'parallel';
        rows = 5;
        cup = 0.25;
        h = 256;
      }
      if (has(sp, /riccia/)) outline = 'needle-fork';
      break;
    case 'lily':
      outline = 'sagittate';
      petiole = 0.55;
      rows = 7;
      w = 128;
      h = 256;
      transl = 0.4;
      if (has(sp, /zenkeri|lotus|tiger/)) spots = { color: has(sp, /zenkeri/) ? '#2a0e10' : sp.color2 ?? '#5a2a20', density: 1.2, size: 0.05 };
      break;
    case 'bulb':
      outline = has(sp, /madagascariensis/) ? 'lace' : 'strap';
      petiole = 0.2;
      veins = has(sp, /madagascariensis/) ? 'none' : 'pinnate';
      rows = 14;
      ruffle = has(sp, /madagascariensis/) ? 0 : has(sp, /boivinianus|crispus/) ? 0.03 : 0.022;
      ruffleFreq = 26;
      transl = 0.65;
      w = 64;
      h = 512;
      break;
    case 'ball':
      break;
    case 'macroalgae':
      rows = 6;
      transl = 0.6;
      w = 64;
      h = 128;
      if (has(sp, /chaeto/)) {
        outline = 'squiggle';
        w = 128;
        h = 128;
      } else if (has(sp, /halymenia|ulva/)) {
        outline = 'lobed-hygro';
        ruffle = 0.08;
        ruffleFreq = 6;
        veins = 'none';
        w = 128;
      } else if (has(sp, /sertularioides|feather/)) outline = 'pinnate';
      else if (has(sp, /prolifera/)) {
        outline = 'strap';
        veins = 'none';
        rows = 8;
      }
      break;
    default:
      break;
  }
  if (has(sp, /ozelot/)) spots = { color: sp.color2 ?? '#6a3020', density: 1.6, size: 0.05 };
  if (sp.form === 'rosette' && has(sp, /rubin/)) tip = lighten(sp.color, 1.15);
  return {
    tex: { outline, width: w, height: h, base: sp.color, tip, vein: lighten(sp.color, 1.3), veins, petiole, spots, bands, wavy, sparkle, seed },
    rows,
    fold,
    ruffle,
    ruffleFreq,
    cup,
    transl,
    roughness,
  };
}

function defaultShape(form: PlantForm): NonNullable<PlantSpecies['leafShape']> {
  switch (form) {
    case 'ribbon':
    case 'seagrass':
    case 'bulb':
      return 'strap';
    case 'grass':
      return 'needle';
    case 'carpet':
    case 'floating':
      return 'round';
    case 'moss':
    case 'fine-stem':
      return 'feathery';
    case 'lily':
      return 'heart';
    default:
      return 'lanceolate';
  }
}

/** Flexibility (sway amplitude) by form — tall, thin and soft sways most. */
export function flexOf(sp: PlantSpecies): number {
  switch (sp.form) {
    case 'ribbon':
      return 1.0;
    case 'seagrass':
      return 0.7;
    case 'grass':
      return sp.maxHeightCm > 20 ? 0.8 : 0.45;
    case 'fine-stem':
      return 0.55;
    case 'stem':
      return 0.38;
    case 'bulb':
      return 0.6;
    case 'rosette':
      return 0.22;
    case 'lily':
      return 0.35;
    case 'epiphyte-fern':
      return 0.22;
    case 'epiphyte-broadleaf':
      return 0.1;
    case 'moss':
      return 0.15;
    case 'carpet':
      return 0.06;
    case 'floating':
      return 0.5;
    case 'macroalgae':
      return 0.4;
    case 'soft-coral':
      return 0.3;
    case 'gorgonian':
      return 0.45;
    case 'anemone':
      return 0.6;
    case 'lps-coral':
      return 0.7;
    case 'zoanthid':
    case 'mushroom-coral':
      return 0.15;
    default:
      return 0.05;
  }
}
