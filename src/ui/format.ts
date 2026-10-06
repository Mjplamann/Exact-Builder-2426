/**
 * Pure formatting helpers (no DOM). Everything a person reads goes through here so units,
 * pluralization and wording stay consistent across panels.
 */
import { MS_PER_DAY, TIME_SCALES } from '../core/clock';

export type Units = 'metric' | 'imperial';

const CM_PER_IN = 2.54;
const L_PER_USGAL = 3.785411784;

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** "1,284" with locale grouping. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString();
}

function trimNum(v: number, digits: number): string {
  // 3.0 → "3", 3.25 → "3.3" (digits=1); keeps small values readable.
  const s = v.toFixed(digits);
  return digits > 0 ? s.replace(/\.?0+$/, '') : s;
}

/** Length of an animal or object: "3.5 cm" / "1.4 in". Small sizes keep a decimal. */
export function formatLength(cm: number, units: Units): string {
  if (units === 'imperial') {
    const inch = cm / CM_PER_IN;
    return `${trimNum(inch, inch < 10 ? 1 : 0)} in`;
  }
  return `${trimNum(cm, cm < 10 ? 1 : 0)} cm`;
}

export function toDisplayTemp(c: number, units: Units): number {
  return units === 'imperial' ? (c * 9) / 5 + 32 : c;
}

export function tempUnit(units: Units): string {
  return units === 'imperial' ? '°F' : '°C';
}

export function formatTemp(c: number, units: Units, digits = 1): string {
  return `${toDisplayTemp(c, units).toFixed(digits)} ${tempUnit(units)}`;
}

export function formatTempRange(r: readonly [number, number], units: Units): string {
  const a = Math.round(toDisplayTemp(r[0], units));
  const b = Math.round(toDisplayTemp(r[1], units));
  return `${a}–${b} ${tempUnit(units)}`;
}

export function formatLiters(l: number, units: Units): string {
  if (units === 'imperial') return `${formatCount(l / L_PER_USGAL)} gal`;
  return `${formatCount(l)} L`;
}

/** Volume flow: "1,500 L/h" / "396 gal/h". */
export function formatFlow(lph: number, units: Units): string {
  return units === 'imperial' ? `${formatCount(lph / L_PER_USGAL)} gal/h` : `${formatCount(lph)} L/h`;
}

const C_TO_F = (c: number) => (c * 9) / 5 + 32;
const decimals = (s: string) => (s.includes('.') ? s.split('.')[1].length : 0);

/**
 * Messages written by other modules (compatibility notes, journal entries, sim notifications)
 * use metric units. For imperial viewers, rewrite the quantities in place: "23–29 °C" → "73–84 °F",
 * "25.5 °C" → "77.9 °F", "6 cm" → "2.4 in", "300 L" → "79 gal", "1,500 L/h" → "396 gal/h".
 * Metric text is returned unchanged.
 */
export function localizeUnits(text: string, units: Units): string {
  if (units !== 'imperial' || !text) return text;
  const num = (s: string) => Number(s.replace(/,/g, ''));
  return text
    .replace(/(-?\d+(?:\.\d+)?)\s?[–-]\s?(-?\d+(?:\.\d+)?)\s?°C/g, (_m, a: string, b: string) => `${Math.round(C_TO_F(num(a)))}–${Math.round(C_TO_F(num(b)))} °F`)
    .replace(/(-?\d+(?:\.\d+)?)\s?°C/g, (_m, a: string) => `${C_TO_F(num(a)).toFixed(decimals(a))} °F`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?cm\b/g, (_m, a: string) => formatLength(num(a), 'imperial'))
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?L\/h\b/g, (_m, a: string) => formatFlow(num(a), 'imperial'))
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?L\b(?!\/)/g, (_m, a: string) => formatLiters(num(a), 'imperial'));
}

export function formatRange(r: readonly [number, number], digits = 1): string {
  return `${trimNum(r[0], digits)}–${trimNum(r[1], digits)}`;
}

/** Human age from a duration in ms: "a few hours", "5 days", "3 weeks", "4 months", "2 years 3 months". */
export function formatAge(ms: number): string {
  const days = ms / MS_PER_DAY;
  if (days < 0.5) return 'a few hours';
  if (days < 1.5) return '1 day';
  if (days < 14) return `${Math.round(days)} days`;
  if (days < 60) {
    const w = Math.round(days / 7);
    return `${w} ${plural(w, 'week')}`;
  }
  const months = days / 30.44;
  if (months < 23.5) {
    const m = Math.round(months);
    return `${m} ${plural(m, 'month')}`;
  }
  const years = Math.floor(months / 12);
  const rem = Math.round(months - years * 12);
  if (rem === 0 || years >= 6) return `${years} ${plural(years, 'year')}`;
  if (rem === 12) return `${years + 1} years`;
  return `${years} ${plural(years, 'year')} ${rem} ${plural(rem, 'month')}`;
}

/** An age range that reads naturally: "4–7 months", "3 weeks – 2 months", "5 months". */
export function formatAgeRange(minMs: number, maxMs: number): string {
  const a = formatAge(minMs);
  const b = formatAge(maxMs);
  if (a === b) return a;
  const ma = /^(\d+) (\w+)$/.exec(a);
  const mb = /^(\d+) (\w+)$/.exec(b);
  if (ma && mb && ma[2].replace(/s$/, '') === mb[2].replace(/s$/, '')) return `${ma[1]}–${mb[1]} ${mb[2]}`;
  return `${a} – ${b}`;
}

/** "about 5 years", "about 18 months", "about 8 months". */
export function formatLifespan(years: number): string {
  if (years < 1.5) {
    const m = Math.round(years * 12);
    return `about ${m} ${plural(m, 'month')}`;
  }
  return `about ${trimNum(years, years < 3 ? 1 : 0)} years`;
}

export function formatMonths(months: number): string {
  if (months < 1) {
    const w = Math.max(1, Math.round(months * 4.35));
    return `${w} ${plural(w, 'week')}`;
  }
  if (months < 24) {
    const m = Math.round(months);
    return `${m} ${plural(m, 'month')}`;
  }
  return `${trimNum(months / 12, 1)} years`;
}

/** Relative duration ("3 hours", "2 days") for "last fed …" style lines. */
export function formatDuration(ms: number): string {
  const min = ms / 60000;
  if (min < 1.5) return 'a moment';
  if (min < 90) return `${Math.round(min)} min`;
  const hours = min / 60;
  if (hours < 36) {
    const hr = Math.round(hours);
    return `${hr} ${plural(hr, 'hour')}`;
  }
  return formatAge(ms);
}

/**
 * Is a light schedule on at `hour`? Handles schedules that run past midnight (on 18:00 → off
 * 02:00). Equal on/off hours mean "always off".
 */
export function scheduleIsOn(hour: number, onHour: number, offHour: number): boolean {
  const wrap = (x: number) => ((x % 24) + 24) % 24;
  const len = wrap(offHour - onHour);
  return len > 0 && wrap(hour - onHour) < len;
}

let hourFmt: Intl.DateTimeFormat | null = null;

/** Clock time for a fractional hour in the viewer's locale: 9.5 → "9:30 AM" / "09:30". */
export function formatHour(h: number): string {
  const total = Math.round((((h % 24) + 24) % 24) * 60);
  hourFmt ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return hourFmt.format(new Date(2000, 0, 1, Math.floor(total / 60) % 24, total % 60));
}

let dateFmt: Intl.DateTimeFormat | null = null;
let longDateFmt: Intl.DateTimeFormat | null = null;
let clockFmt: Intl.DateTimeFormat | null = null;

/** "Tue 14 Oct" (locale aware). */
export function formatSimDate(ms: number): string {
  dateFmt ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return dateFmt.format(ms);
}

/** "Tuesday, 14 October 2026". */
export function formatLongDate(ms: number): string {
  longDateFmt ??= new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return longDateFmt.format(ms);
}

/** "13:42" (or "1:42 PM" in 12-hour locales). */
export function formatSimClock(ms: number): string {
  clockFmt ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return clockFmt.format(ms);
}

/** Calendar day key for grouping journal entries. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today", "Yesterday" or the date, relative to `now` (both sim ms). */
export function relativeDay(ms: number, now: number): string {
  const k = dayKey(ms);
  if (k === dayKey(now)) return 'Today';
  if (k === dayKey(now - MS_PER_DAY)) return 'Yesterday';
  return formatLongDate(ms);
}

/** Label for a time-scale value: the friendly label for known scales, else "×N". */
export function timeScaleLabel(scale: number): string {
  const known = TIME_SCALES.find((t) => t.value === scale);
  if (known) return known.label;
  return `×${formatCount(scale)}`;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Common names are Title Case in data ("Neon Tetra"); in running prose use lower case except proper nouns. */
export function proseName(commonName: string): string {
  // Keep words that start with a capital and look like proper nouns (Siamese, Rio, Malawi…) is
  // impossible to know in general — lower-casing only the last word reads naturally:
  // "3 Neon tetra fry", "your Cardinal tetras".
  const parts = commonName.split(' ');
  if (parts.length < 2) return commonName;
  const last = parts[parts.length - 1];
  if (/^[A-Z][a-z]+$/.test(last)) parts[parts.length - 1] = last.toLowerCase();
  return parts.join(' ');
}

/**
 * Indefinite article for a name in running prose: "a Neon tetra", "an Otocinclus", "an Endler's
 * livebearer", "a Uaru" (a "yoo" sound), "an hour". Heuristic, tuned for animal common names.
 */
export function article(name: string): 'a' | 'an' {
  const w = name.trim().toLowerCase();
  if (/^(u[bcfhjkqrstn][aeiou]|uni|use|usu|uaru|eu|one|once)/.test(w)) return 'a';
  if (/^(hour|honest|heir|honou?r)/.test(w)) return 'an';
  return /^[aeiou]/.test(w) ? 'an' : 'a';
}

/** "a Neon tetra" / "an Otocinclus" (prose case, with the right article). */
export function aName(commonName: string): string {
  const p = proseName(commonName);
  return `${article(p)} ${p}`;
}

/** Naive English plural for a common name ("Neon Tetra" → "Neon Tetras", "Goby" → "Gobies"). */
export function pluralName(name: string): string {
  if (/(fish|shrimp|sheep|deer|fry|koi|discus|corydoras|otocinclus|ancistrus)$/i.test(name)) return name;
  if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

/**
 * Behavior labels come from the behavior module ("forage", "school-cruise", "rest"…). Turn the
 * known ones into calm phrases and humanize anything else.
 */
const ACTIVITY_WORDS: [RegExp, string][] = [
  [/startle|flee|escape|panic/, 'Startled — darting for cover'],
  [/sleep|night-rest/, 'Sleeping'],
  [/rest|idle|still/, 'Resting'],
  [/hide|shelter|cover/, 'Sheltering'],
  [/forag|sift|dig/, 'Foraging'],
  [/graz|rasp/, 'Grazing'],
  [/eat|feed|food/, 'Feeding'],
  [/chase|attack|nip/, 'Chasing a rival'],
  [/court|display|flare|spawn/, 'Displaying'],
  [/patrol|territor/, 'Patrolling its territory'],
  [/school|shoal/, 'Swimming with the shoal'],
  [/hover|scull/, 'Hovering'],
  [/perch/, 'Perching'],
  [/hop/, 'Hopping along the bottom'],
  [/cling|attach|glass/, 'Holding onto a surface'],
  [/gulp|breath|air/, 'Gulping air at the surface'],
  [/climb/, 'Climbing'],
  [/walk|crawl/, 'Wandering'],
  [/explor|curious|investig/, 'Exploring'],
  [/cruise|wander|swim|roam/, 'Cruising'],
];

export function humanActivity(label: string | undefined): string {
  if (!label) return 'Settling in';
  const l = label.toLowerCase();
  for (const [re, phrase] of ACTIVITY_WORDS) if (re.test(l)) return phrase;
  return capitalize(l.replace(/[-_]+/g, ' '));
}

/**
 * Dissolved-oxygen saturation (mg/L) at 1 atm — Benson & Krause (1984), the USGS standard:
 * ln C* = −139.34411 + 1.575701e5/T − 6.642308e7/T² + 1.2438e10/T³ − 8.621949e11/T⁴
 *         − S·(0.017674 − 10.754/T + 2140.7/T²), T in kelvin, S salinity in ‰.
 * Salinity from specific gravity at ~25 °C: S ≈ (SG − 1)·1330 (SG 1.0264 ≈ 35 ‰).
 */
export function oxygenSaturationMgL(tempC: number, salinitySG: number): number {
  const T = tempC + 273.15;
  const S = Math.max(0, (salinitySG - 1) * 1330);
  const ln =
    -139.34411 + 1.575701e5 / T - 6.642308e7 / T ** 2 + 1.2438e10 / T ** 3 - 8.621949e11 / T ** 4 -
    S * (0.017674 - 10.754 / T + 2140.7 / T ** 2);
  return Math.exp(ln);
}

/**
 * Free (un-ionized) ammonia NH₃ from total ammonia nitrogen, pH and temperature
 * (Emerson et al. 1975: pKa = 0.09018 + 2729.92 / T[K]). This, not total ammonia, is what harms fish.
 */
export function freeAmmonia(totalAmmonia: number, ph: number, tempC: number): number {
  const pKa = 0.09018 + 2729.92 / (tempC + 273.15);
  return totalAmmonia / (1 + 10 ** (pKa - ph));
}

/** Correlated color temperature (K) → an sRGB hex approximation (Tanner Helland's fit). */
export function kelvinToHex(k: number): string {
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592;
    g = 288.1221695283 * (t - 60) ** -0.0755148492;
    b = 255;
  }
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
