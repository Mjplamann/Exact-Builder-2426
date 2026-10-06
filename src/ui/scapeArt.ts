/**
 * Tiny swatch illustrations for the aquascape palette: one drawn glyph per decor kind and per
 * plant/coral growth form, tinted with the item's own colors.
 */
import type { BackgroundKind, DecorKind, PlantForm, PlantSpecies, SubstrateKind, WaterType } from '../core/types';

/** Natural colors of known hardscape variants (the decor module may add more; unknown → earthy hash). */
const VARIANT_COLORS: Record<string, string> = {
  seiryu: '#7c868e',
  'dragon-stone': '#9a7a50',
  lava: '#4b2f2a',
  slate: '#3e4449',
  'river-stone': '#a0988a',
  ohko: '#8b704f',
  'petrified-wood': '#8d6f50',
  'texas-holey': '#d7d0c0',
  'live-rock': '#b78567',
  'frodo-stone': '#8a8478',
  'black-lava': '#2d2a29',
  spiderwood: '#a37a52',
  mopani: '#6c4529',
  manzanita: '#8c4b36',
  malaysian: '#4b3121',
  cholla: '#b99b6f',
  branch: '#6f5339',
  redmoor: '#7b4c34',
  'slate-cave': '#41474c',
  coconut: '#6b4b31',
  'clay-tube': '#b5663f',
  'rock-cave': '#7e7b73',
  catappa: '#8a5a2b',
  oak: '#7a5530',
  conch: '#e1c9a6',
  'snail-shells': '#d8c6a3',
  cylinder: '#9aa7ae',
  disc: '#9aa7ae',
};

const KIND_DEFAULT: Record<DecorKind, string> = {
  rock: '#86817a',
  driftwood: '#7a5636',
  cave: '#6e6a63',
  pebbles: '#9a9182',
  'leaf-litter': '#86562a',
  shell: '#dac8a6',
  airstone: '#9aa7ae',
  'coral-skeleton': '#ebe5d6',
};

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function decorColor(kind: DecorKind, variant: string): string {
  const c = VARIANT_COLORS[variant];
  if (c) return c;
  const base = KIND_DEFAULT[kind] ?? '#857a6c';
  // Nudge lightness a little per variant so siblings are distinguishable.
  const v = parseInt(base.slice(1), 16);
  const f = 0.85 + (hashHue(variant) % 30) / 100;
  const ch = (s: number) => Math.min(255, Math.round(((v >> s) & 255) * f));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

export function decorGlyph(kind: DecorKind, color: string): string {
  const hi = '<path d="M8 11c2-2 5-2.6 7-1.6" stroke="#fff" stroke-opacity=".25" fill="none"/>';
  let body: string;
  switch (kind) {
    case 'rock':
      body = `<path d="M3 20c.6-4.6 3.6-8.4 8-9.6 3.6-1 6.8.4 8.6 3.4 1.2 2 1.6 4 1.6 6.2z" fill="${color}"/>${hi}`;
      break;
    case 'driftwood':
      body = `<path d="M2.5 19c4.5-.8 7.6-3 9.6-6.2 2-3.2 4.4-5.4 9-6.4" stroke="${color}" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M10.5 14.2c-1.4-2.2-1.6-4.6-.6-7M15.5 9.6c1.6.6 3 1.8 3.6 3.6" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      break;
    case 'cave':
      body = `<path d="M2.5 20c0-6.4 4.2-10.6 9.5-10.6S21.5 13.6 21.5 20h-5.2c0-2.8-1.9-4.8-4.3-4.8s-4.3 2-4.3 4.8z" fill="${color}"/>`;
      break;
    case 'pebbles':
      body = `<ellipse cx="7" cy="17.5" rx="4" ry="2.8" fill="${color}"/><ellipse cx="15" cy="18" rx="3.4" ry="2.4" fill="${color}" opacity=".8"/><ellipse cx="11.5" cy="13.8" rx="3" ry="2.2" fill="${color}" opacity=".9"/><ellipse cx="18.5" cy="14.5" rx="2.2" ry="1.7" fill="${color}" opacity=".7"/>`;
      break;
    case 'leaf-litter':
      body = `<path d="M3 18c2-6 7-9 13-9-1 6-6 10-13 9z" fill="${color}"/><path d="M3 18l9-6" stroke="#000" stroke-opacity=".25"/><path d="M11 20c2-3 5-5 10-5-1 3-4 5-10 5z" fill="${color}" opacity=".75"/>`;
      break;
    case 'shell':
      body = `<path d="M4 18c0-6 4-11 9-11 4 0 7 3 7 6.5 0 3-2.5 5.5-6 5.5H4z" fill="${color}"/><path d="M13 9.5a3.6 3.6 0 1 1-3.6 3.6M13 12.4a1 1 0 1 1-1 1" stroke="#000" stroke-opacity=".25" fill="none"/>`;
      break;
    case 'airstone':
      body = `<rect x="8" y="16" width="8" height="4" rx="1.4" fill="${color}"/><circle cx="12" cy="12" r="1.5" fill="none" stroke="${color}"/><circle cx="10.6" cy="8" r="1.1" fill="none" stroke="${color}"/><circle cx="13" cy="4.6" r=".9" fill="none" stroke="${color}"/>`;
      break;
    case 'coral-skeleton':
      body = `<path d="M12 21V12M12 15l-4-4V7M12 13l4-4V5M8 11l-3-2M16 9l3-1" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      break;
    default:
      body = `<circle cx="12" cy="14" r="6" fill="${color}"/>`;
  }
  return `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">${body}</svg>`;
}

type FormGlyph = 'leafy' | 'grassy' | 'stem' | 'carpet' | 'floating' | 'branching' | 'disc' | 'lps' | 'anemone' | 'algae';

const FORM_GLYPH: Record<PlantForm, FormGlyph> = {
  rosette: 'leafy',
  ribbon: 'grassy',
  stem: 'stem',
  'fine-stem': 'stem',
  'epiphyte-fern': 'leafy',
  'epiphyte-broadleaf': 'leafy',
  carpet: 'carpet',
  grass: 'grassy',
  moss: 'carpet',
  floating: 'floating',
  lily: 'floating',
  bulb: 'leafy',
  ball: 'carpet',
  macroalgae: 'algae',
  seagrass: 'grassy',
  'soft-coral': 'branching',
  'mushroom-coral': 'disc',
  zoanthid: 'disc',
  'lps-coral': 'lps',
  'sps-coral': 'branching',
  gorgonian: 'branching',
  anemone: 'anemone',
};

export function plantGlyph(p: PlantSpecies): string {
  const a = p.color;
  const b = p.color2 ?? p.color;
  let body: string;
  switch (FORM_GLYPH[p.form] ?? 'leafy') {
    case 'leafy':
      body = `<path d="M12 21c-4.4-3-6.4-8-5.4-13.6 3.4 3 5.4 8 5.4 13.6z" fill="${a}"/><path d="M12 21c4.4-3 6.4-8 5.4-13.6-3.4 3-5.4 8-5.4 13.6z" fill="${b}"/><path d="M12 21c-1.2-5.6-.4-11 0-16.6.8 5.6 1.2 11 0 16.6z" fill="${a}"/>`;
      break;
    case 'grassy':
      body = `<path d="M7 21C7 14 5 9 3 4M10 21c0-7 0-12 1-17M13.5 21c0-6 1.4-11 3.4-15M17 21c.6-5 2.6-8.6 4.6-10.6" stroke="${a}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      break;
    case 'stem':
      body = `<path d="M12 21V3" stroke="${b}" stroke-width="1.2"/>${[5, 9, 13, 17].map((y) => `<ellipse cx="9" cy="${y}" rx="3" ry="1.2" fill="${a}" transform="rotate(-20 9 ${y})"/><ellipse cx="15" cy="${y}" rx="3" ry="1.2" fill="${a}" transform="rotate(20 15 ${y})"/>`).join('')}`;
      break;
    case 'carpet':
      body = `<path d="M2.5 20c1-4 4-6.4 9.5-6.4s8.5 2.4 9.5 6.4z" fill="${a}"/>${[5, 8, 11, 14, 17, 19].map((x, i) => `<circle cx="${x}" cy="${16 - (i % 2) * 1.2}" r="1.6" fill="${b}"/>`).join('')}`;
      break;
    case 'floating':
      body = `<path d="M2 9h20" stroke="#9fc4d0" stroke-opacity=".4"/><ellipse cx="7" cy="8.6" rx="3.8" ry="1.8" fill="${a}"/><ellipse cx="15.5" cy="8.8" rx="3" ry="1.5" fill="${b}"/><path d="M7 10.5v5M15.5 10.5v4M6 10.5l-1 4" stroke="${a}" stroke-opacity=".6"/>`;
      break;
    case 'branching':
      body = `<path d="M12 21V13M12 15l-4.5-4.5V6M12 13l4.5-4.5V4.5M7.5 10.5L4.5 8.5M16.5 8.5l3-1.2" stroke="${a}" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="7.5" cy="5.6" r="1.4" fill="${b}"/><circle cx="16.5" cy="4.2" r="1.4" fill="${b}"/>`;
      break;
    case 'disc':
      body = `<ellipse cx="8" cy="15" rx="5" ry="3" fill="${a}"/><ellipse cx="16.5" cy="13" rx="4.2" ry="2.6" fill="${b}"/><circle cx="8" cy="14.6" r="1" fill="${b}"/><circle cx="16.5" cy="12.6" r=".9" fill="${a}"/>`;
      break;
    case 'lps':
      body = `<path d="M4 20c0-5.6 3.6-9 8-9s8 3.4 8 9z" fill="${a}"/>${[6, 9, 12, 15, 18].map((x) => `<circle cx="${x}" cy="${12 + Math.abs(x - 12) * 0.5}" r="1.5" fill="${b}"/>`).join('')}`;
      break;
    case 'anemone':
      body = `<rect x="9" y="15" width="6" height="6" rx="2" fill="${b}"/>${[-60, -35, -12, 12, 35, 60].map((d) => `<path d="M12 15q${(Math.sin((d * Math.PI) / 180) * 9).toFixed(1)} -4 ${(Math.sin((d * Math.PI) / 180) * 9).toFixed(1)} -10" stroke="${a}" stroke-width="2" fill="none" stroke-linecap="round"/>`).join('')}`;
      break;
    case 'algae':
    default:
      body = `<path d="M6 21c-1-4 2-6 0-10s1-6 3-7M12 21c1-4-2-6 0-10s3-5 1-8M18 21c-1-3 2-5 0-8" stroke="${a}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">${body}</svg>`;
}

export const SUBSTRATES: { value: SubstrateKind; label: string; color: string; note: string; water: WaterType[] }[] = [
  { value: 'river-sand', label: 'River sand', color: '#b49c78', note: 'Soft, natural — loved by sand-sifters', water: ['freshwater', 'brackish'] },
  { value: 'beige-sand', label: 'Beige sand', color: '#cfba96', note: 'Warm, bright', water: ['freshwater', 'brackish', 'marine'] },
  { value: 'white-sand', label: 'White sand', color: '#e8e3d7', note: 'Bright and clean-looking', water: ['freshwater', 'brackish', 'marine'] },
  { value: 'black-sand', label: 'Black sand', color: '#2c2c2d', note: 'Makes colors glow', water: ['freshwater', 'brackish', 'marine'] },
  { value: 'aqua-soil', label: 'Aqua soil', color: '#3b2f26', note: 'Nutrient-rich; softens and acidifies', water: ['freshwater'] },
  { value: 'fine-gravel', label: 'Fine gravel', color: '#8e8373', note: 'Natural mixed grit', water: ['freshwater', 'brackish'] },
  { value: 'pea-gravel', label: 'Pea gravel', color: '#a8957d', note: 'Rounded pebbles', water: ['freshwater', 'brackish'] },
  { value: 'black-gravel', label: 'Black gravel', color: '#232324', note: 'Dark and dramatic', water: ['freshwater', 'brackish'] },
  { value: 'crushed-coral', label: 'Crushed coral', color: '#e6dcc8', note: 'Buffers pH and hardness up', water: ['marine', 'brackish', 'freshwater'] },
  { value: 'aragonite', label: 'Aragonite', color: '#efe8da', note: 'Reef sand; buffers pH', water: ['marine', 'brackish'] },
  { value: 'bare', label: 'Bare glass', color: 'transparent', note: 'Easy to clean, nothing to sift', water: ['freshwater', 'brackish', 'marine'] },
];

export const BACKGROUNDS: { value: BackgroundKind; label: string; css: string }[] = [
  { value: 'black', label: 'Black', css: '#060809' },
  { value: 'deep-blue', label: 'Deep blue', css: '#0b2c4d' },
  { value: 'gradient-blue', label: 'Blue gradient', css: 'linear-gradient(180deg,#2a6b9a,#05182a)' },
  { value: 'dark-green', label: 'Dark green', css: '#0f2a1d' },
  { value: 'frosted', label: 'Frosted', css: 'linear-gradient(180deg,#e6ecee,#bfcbd0)' },
  { value: 'clear', label: 'Clear glass', css: 'repeating-conic-gradient(#2a3338 0 25%, #1a2125 0 50%) 0 0/10px 10px' },
];
