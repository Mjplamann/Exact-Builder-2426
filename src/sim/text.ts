import type { FishState, Species } from '../core/types';
import { MS_PER_DAY } from '../core/clock';

/**
 * Gentle, natural-language phrasing for journal entries and the welcome-back summary.
 */

/** Words that stay capitalized mid-sentence (proper nouns/adjectives in common names). */
const PROPER = new Set([
  'african', 'amano', 'amazon', 'american', 'asian', 'australian', 'banggai', 'bolivian', 'borneo', 'brazilian',
  'burmese', 'celebes', 'chinese', 'colombian', 'congo', 'endler', "endler's", 'german', 'hawaiian', 'indian',
  'japanese', 'madagascar', 'malawi', 'malaysian', 'mexican', 'peruvian', 'rio', 'siamese', 'sumatra', 'sumatran',
  'tanganyika', 'thai', 'venezuelan',
]);

/** "Neon tetra" → "neon tetra"; "German blue ram" stays. */
export function lowerName(commonName: string): string {
  const first = commonName.split(/[\s-]/, 1)[0] ?? '';
  if (PROPER.has(first.toLowerCase())) return commonName;
  // Keep acronyms / internal capitals ("L-number", "GBR").
  if (first.length > 1 && first[1] === first[1].toUpperCase() && /[A-Z]/.test(first[1])) return commonName;
  return commonName.charAt(0).toLowerCase() + commonName.slice(1);
}

const INVARIANT_ENDINGS = ['fish', 'shrimp', 'fry', 'corydoras', 'bass', 'trout', 'salmon', 'species', 'sheep'];

/** English plural of a common name: guppy → guppies, neon tetra → neon tetras, cherry shrimp → cherry shrimp. */
export function pluralName(name: string): string {
  const lower = name.toLowerCase();
  for (const end of INVARIANT_ENDINGS) if (lower.endsWith(end)) return name;
  if (/(s|x|z|ch|sh)$/i.test(name)) return /s$/i.test(name) && /(us|is)$/i.test(name) ? name : `${name}es`;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

/** "a neon tetra" / "an angelfish". */
export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** Count + noun: "1 guppy", "3 guppies". */
export function countOf(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : pluralName(singular)}`;
}

/** "Pip the neon tetra" or "A neon tetra" (sentence start). */
export function fishTitle(s: FishState, sp: Species, sentenceStart = true): string {
  const n = lowerName(sp.commonName);
  if (s.name) return `${s.name} the ${n}`;
  const a = withArticle(n);
  return sentenceStart ? a.charAt(0).toUpperCase() + a.slice(1) : a;
}

/** "6 years 2 months", "3 months", "2 weeks", "5 days". */
export function formatAge(ms: number): string {
  const days = Math.max(0, ms / MS_PER_DAY);
  if (days < 1) return 'less than a day';
  if (days < 14) {
    const d = Math.round(days);
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  if (days < 61) {
    const w = Math.round(days / 7);
    return `${w} week${w === 1 ? '' : 's'}`;
  }
  const totalMonths = Math.floor(days / 30.44);
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  const ys = y > 0 ? `${y} year${y === 1 ? '' : 's'}` : '';
  const msx = m > 0 ? `${m} month${m === 1 ? '' : 's'}` : '';
  return [ys, msx].filter(Boolean).join(' ') || '1 month';
}

/** "3 hours", "3 days", "2 weeks", "4 months", "a year and 2 months". */
export function formatDuration(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) {
    const m = Math.max(1, Math.round(seconds / 60));
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  if (h < 36) {
    const r = Math.round(h);
    return `${r} hour${r === 1 ? '' : 's'}`;
  }
  const d = h / 24;
  if (d < 14) {
    const r = Math.round(d);
    return `${r} day${r === 1 ? '' : 's'}`;
  }
  if (d < 60) {
    const r = Math.round(d / 7);
    return `${r} week${r === 1 ? '' : 's'}`;
  }
  const months = Math.round(d / 30.44);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y === 1 ? 'a year' : `${y} years`;
  return m ? `${ys} and ${m} month${m === 1 ? '' : 's'}` : ys;
}

/** "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Death cause id → respectful phrase used after "passed away". */
export function deathPhrase(cause: string): string {
  switch (cause) {
    case 'old age':
      return 'peacefully of old age';
    case 'starvation':
      return 'after going hungry for too long';
    case 'ammonia':
      return 'from ammonia in the water';
    case 'nitrite':
      return 'from nitrite in the water';
    case 'nitrate':
      return 'after a long time in nitrate-heavy water';
    case 'low oxygen':
      return 'when the water ran short of oxygen';
    case 'too warm':
      return 'because the water was too warm';
    case 'too cold':
      return 'because the water was too cold';
    case 'ph':
      return 'because the water chemistry did not suit it';
    case 'salinity':
      return 'because it could not live in this water';
    case 'tankmates':
      return 'worn down by stressful tankmates';
    default:
      return 'after a period of poor health';
  }
}

/** Plain capitalize. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
