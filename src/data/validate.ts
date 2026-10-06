import type { Appearance, BodyPlan, FinLook, FinSpec, Pattern, PlantSpecies, Species } from '../core/types';
import {
  ACTIVITIES, ARCHETYPES, CAUDAL_SHAPES, DIETS, FIN_SHAPES, GROUPS, LOCOMOTION, MOUTHS, PATTERN_TYPES,
  PLANT_FORMS, REPRODUCTION, SNOUTS, SOCIAL, TEMPERAMENTS, TRAITS, WATER_TYPES, ZONES,
} from '../core/enums';

/**
 * Structural + plausibility validation for authored data. Returns a list of human-readable
 * problems (empty = valid). Used by tests/speciesData.test.ts and optionally at load time.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function inEnum(errs: string[], field: string, v: unknown, allowed: readonly string[]) {
  if (typeof v !== 'string' || !allowed.includes(v)) errs.push(`${field}: "${String(v)}" not one of the allowed values`);
}
function num(errs: string[], field: string, v: unknown, min: number, max: number) {
  if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${field}: must be a number`);
  else if (v < min || v > max) errs.push(`${field}: ${v} outside plausible range [${min}, ${max}]`);
}
function optNum(errs: string[], field: string, v: unknown, min: number, max: number) {
  if (v !== undefined) num(errs, field, v, min, max);
}
function color(errs: string[], field: string, v: unknown, optional = false) {
  if (v === undefined && optional) return;
  if (typeof v !== 'string' || !HEX.test(v)) errs.push(`${field}: "${String(v)}" is not a #rrggbb color`);
}
function str(errs: string[], field: string, v: unknown, minLen = 1) {
  if (typeof v !== 'string' || v.trim().length < minLen) errs.push(`${field}: must be a non-empty string`);
}
function range(errs: string[], field: string, v: unknown, min: number, max: number) {
  if (!Array.isArray(v) || v.length !== 2) {
    errs.push(`${field}: must be [min, max]`);
    return;
  }
  num(errs, `${field}[0]`, v[0], min, max);
  num(errs, `${field}[1]`, v[1], min, max);
  if (typeof v[0] === 'number' && typeof v[1] === 'number' && v[0] > v[1]) errs.push(`${field}: min > max`);
}

function validatePattern(errs: string[], field: string, p: Pattern) {
  if (!p || typeof p !== 'object') {
    errs.push(`${field}: not an object`);
    return;
  }
  inEnum(errs, `${field}.type`, p.type, PATTERN_TYPES);
  color(errs, `${field}.color`, (p as { color?: string }).color);
  const anyP = p as unknown as Record<string, unknown>;
  for (const k of ['x0', 'x1', 'x']) optNum(errs, `${field}.${k}`, anyP[k], -0.2, 1.2);
  for (const k of ['y0', 'y1', 'y']) optNum(errs, `${field}.${k}`, anyP[k], -1.2, 1.2);
  for (const k of ['width', 'size', 'rx', 'ry', 'thickness', 'softness', 'jitter', 'amount', 'contrast', 'glow', 'wavy'])
    optNum(errs, `${field}.${k}`, anyP[k], 0, 2);
  optNum(errs, `${field}.density`, anyP.density, 0, 400);
  optNum(errs, `${field}.count`, anyP.count, 1, 60);
  optNum(errs, `${field}.scale`, anyP.scale, 0.01, 50);
  optNum(errs, `${field}.slant`, anyP.slant, -1.5, 1.5);
  if (anyP.ring !== undefined) color(errs, `${field}.ring`, anyP.ring);
}

function validateFinSpec(errs: string[], field: string, f: FinSpec | null | undefined) {
  if (f === undefined || f === null) return;
  num(errs, `${field}.start`, f.start, 0, 1);
  num(errs, `${field}.end`, f.end, 0, 1.05);
  num(errs, `${field}.height`, f.height, 0, 3);
  if (f.start > f.end) errs.push(`${field}: start > end`);
  if (f.shape !== undefined) inEnum(errs, `${field}.shape`, f.shape, FIN_SHAPES);
  optNum(errs, `${field}.trail`, f.trail, 0, 4);
}

function validateBody(errs: string[], b: BodyPlan) {
  if (!b || typeof b !== 'object') {
    errs.push('body: missing');
    return;
  }
  inEnum(errs, 'body.archetype', b.archetype, ARCHETYPES);
  optNum(errs, 'body.depth', b.depth, 0.02, 1.6);
  optNum(errs, 'body.width', b.width, 0.02, 1.6);
  optNum(errs, 'body.depthPos', b.depthPos, 0, 1);
  optNum(errs, 'body.headLength', b.headLength, 0.05, 0.6);
  if (b.snout !== undefined) inEnum(errs, 'body.snout', b.snout, SNOUTS);
  if (b.mouth !== undefined) inEnum(errs, 'body.mouth', b.mouth, MOUTHS);
  optNum(errs, 'body.eyeSize', b.eyeSize, 0, 0.7);
  optNum(errs, 'body.peduncle', b.peduncle, 0.05, 1);
  optNum(errs, 'body.belly', b.belly, 0, 1);
  optNum(errs, 'body.backArch', b.backArch, -1, 1);
  optNum(errs, 'body.hump', b.hump, 0, 1);
  optNum(errs, 'body.barbels', b.barbels, 0, 12);
  optNum(errs, 'body.barbelLength', b.barbelLength, 0, 2);
  optNum(errs, 'body.scaleSize', b.scaleSize, 0, 1);
  if (b.caudal) {
    inEnum(errs, 'body.caudal.shape', b.caudal.shape, CAUDAL_SHAPES);
    optNum(errs, 'body.caudal.size', b.caudal.size, 0, 4);
  }
  for (const k of ['dorsal', 'dorsal2', 'anal', 'pelvic', 'pectoral'] as const) validateFinSpec(errs, `body.${k}`, b[k]);
}

function validateFinLook(errs: string[], field: string, f: FinLook | undefined) {
  if (!f) return;
  color(errs, `${field}.color`, f.color, true);
  color(errs, `${field}.edge`, f.edge, true);
  optNum(errs, `${field}.opacity`, f.opacity, 0, 1);
  optNum(errs, `${field}.edgeWidth`, f.edgeWidth, 0, 1);
  f.patterns?.forEach((p, i) => validatePattern(errs, `${field}.patterns[${i}]`, p));
}

function validateLook(errs: string[], prefix: string, l: Partial<Appearance>, partial: boolean) {
  if (!l || typeof l !== 'object') {
    errs.push(`${prefix}: missing`);
    return;
  }
  color(errs, `${prefix}.base`, l.base, partial);
  color(errs, `${prefix}.fin`, l.fin, partial);
  if (!partial) num(errs, `${prefix}.finOpacity`, l.finOpacity, 0, 1);
  else optNum(errs, `${prefix}.finOpacity`, l.finOpacity, 0, 1);
  color(errs, `${prefix}.dorsal`, l.dorsal, true);
  color(errs, `${prefix}.ventral`, l.ventral, true);
  color(errs, `${prefix}.eye`, l.eye, true);
  color(errs, `${prefix}.iridescenceColor`, l.iridescenceColor, true);
  optNum(errs, `${prefix}.metallic`, l.metallic, 0, 1);
  optNum(errs, `${prefix}.iridescence`, l.iridescence, 0, 1);
  optNum(errs, `${prefix}.translucency`, l.translucency, 0, 1);
  if (l.patterns !== undefined) {
    if (!Array.isArray(l.patterns)) errs.push(`${prefix}.patterns: must be an array`);
    else l.patterns.forEach((p, i) => validatePattern(errs, `${prefix}.patterns[${i}]`, p));
  }
  if (l.fins) for (const [k, f] of Object.entries(l.fins)) validateFinLook(errs, `${prefix}.fins.${k}`, f);
}

export function validateSpecies(s: Species): string[] {
  const errs: string[] = [];
  if (!s || typeof s !== 'object') return ['not an object'];
  if (typeof s.id !== 'string' || !ID.test(s.id)) errs.push(`id: "${s.id}" must be kebab-case [a-z0-9-]`);
  str(errs, 'commonName', s.commonName);
  str(errs, 'scientificName', s.scientificName);
  str(errs, 'family', s.family);
  inEnum(errs, 'group', s.group, GROUPS);
  inEnum(errs, 'water', s.water, WATER_TYPES);
  str(errs, 'region', s.region);
  str(errs, 'description', s.description, 20);
  num(errs, 'adultLengthCm', s.adultLengthCm, 0.5, 250);
  num(errs, 'birthLengthCm', s.birthLengthCm, 0.05, 40);
  if (s.birthLengthCm >= s.adultLengthCm * 0.6) errs.push('birthLengthCm: implausibly large relative to adult length');
  num(errs, 'maturityMonths', s.maturityMonths, 0.5, 240);
  optNum(errs, 'growthK', s.growthK, 0.02, 25);
  num(errs, 'lifespanYears', s.lifespanYears, 0.2, 100);
  if (s.lifespanYears * 12 < s.maturityMonths) errs.push('lifespanYears: shorter than maturity age');
  range(errs, 'tempC', s.tempC, 0, 40);
  range(errs, 'ph', s.ph, 4, 10);
  if (s.dGH !== undefined) range(errs, 'dGH', s.dGH, 0, 40);
  num(errs, 'minTankLiters', s.minTankLiters, 1, 20000);
  inEnum(errs, 'temperament', s.temperament, TEMPERAMENTS);
  inEnum(errs, 'zone', s.zone, ZONES);
  inEnum(errs, 'social', s.social, SOCIAL);
  num(errs, 'groupSize', s.groupSize, 1, 100);
  inEnum(errs, 'diet', s.diet, DIETS);
  inEnum(errs, 'activity', s.activity, ACTIVITIES);
  inEnum(errs, 'reproduction', s.reproduction, REPRODUCTION);
  inEnum(errs, 'locomotion', s.locomotion, LOCOMOTION);
  num(errs, 'cruiseSpeed', s.cruiseSpeed, 0.01, 6);
  num(errs, 'burstSpeed', s.burstSpeed, 0.05, 30);
  if (s.burstSpeed < s.cruiseSpeed) errs.push('burstSpeed: lower than cruiseSpeed');
  if (!Array.isArray(s.traits)) errs.push('traits: must be an array');
  else s.traits.forEach((t, i) => inEnum(errs, `traits[${i}]`, t, TRAITS));
  validateBody(errs, s.body);
  validateLook(errs, 'look', s.look, false);
  for (const sex of ['male', 'female'] as const) {
    const o = s[sex];
    if (!o) continue;
    optNum(errs, `${sex}.lengthScale`, o.lengthScale, 0.2, 3);
    if (o.look) validateLook(errs, `${sex}.look`, o.look, true);
    if (o.body?.archetype !== undefined) inEnum(errs, `${sex}.body.archetype`, o.body.archetype, ARCHETYPES);
  }
  if (s.variantOf !== undefined && (typeof s.variantOf !== 'string' || !ID.test(s.variantOf)))
    errs.push('variantOf: must be a species id');
  if (s.availability !== undefined) inEnum(errs, 'availability', s.availability, ['common', 'uncommon', 'rare']);
  if (s.water === 'freshwater' && s.group === 'fish' && ['clownfish', 'tang', 'marine-angel', 'anthias'].includes(s.body?.archetype))
    errs.push('body.archetype: marine archetype on a freshwater fish');
  return errs;
}

export function validatePlant(p: PlantSpecies): string[] {
  const errs: string[] = [];
  if (typeof p.id !== 'string' || !ID.test(p.id)) errs.push(`id: "${p.id}" must be kebab-case`);
  str(errs, 'commonName', p.commonName);
  str(errs, 'scientificName', p.scientificName);
  inEnum(errs, 'water', p.water, WATER_TYPES);
  inEnum(errs, 'form', p.form, PLANT_FORMS);
  inEnum(errs, 'placement', p.placement, ['foreground', 'midground', 'background', 'epiphyte', 'floating']);
  color(errs, 'color', p.color);
  color(errs, 'color2', p.color2, true);
  num(errs, 'maxHeightCm', p.maxHeightCm, 0.2, 300);
  num(errs, 'spreadCm', p.spreadCm, 0.2, 200);
  num(errs, 'growthCmPerWeek', p.growthCmPerWeek, 0, 50);
  inEnum(errs, 'light', p.light, ['low', 'medium', 'high']);
  optNum(errs, 'leafLength', p.leafLength, 0.05, 150);
  optNum(errs, 'leafWidth', p.leafWidth, 0.01, 40);
  if (p.leafShape !== undefined)
    inEnum(errs, 'leafShape', p.leafShape, ['lanceolate', 'ovate', 'round', 'needle', 'strap', 'feathery', 'heart', 'lobed']);
  if (typeof p.palatable !== 'boolean') errs.push('palatable: must be boolean');
  str(errs, 'description', p.description, 20);
  return errs;
}
