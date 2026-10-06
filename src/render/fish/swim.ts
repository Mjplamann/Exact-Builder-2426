import type { Locomotion, Species } from '../../core/types';
import type { ResolvedBody } from './archetypes';

/**
 * Body-wave parameters per locomotion mode, from fish kinematics literature:
 *  - amplitude envelopes A(s) (fraction of body length, at full effort) follow Videler & Hess
 *    (1984) for saithe/mackerel: A = 0.02 − 0.08 s + 0.16 s² (subcarangiform) and
 *    0.02 − 0.12 s + 0.20 s² (carangiform); eels carry ~0.04–0.1 L along the whole body;
 *    thunniform motion is confined to the peduncle.
 *  - wavelengths λ ≈ 0.6 L (anguilliform) … ~1 L (carangiform) … 1.25 L (thunniform).
 *  - median/paired fin swimmers keep the body nearly rigid at low effort and recruit the body
 *    and tail only when bursting (rigidity factor).
 */

export const SWIM_MODE = { undulate: 0, ostraciiform: 1, rajiform: 2, seahorse: 3, invertebrate: 4 } as const;

export interface SwimParams {
  /** A(s) = c0 + c1 s + c2 s^p. */
  env: [number, number, number, number];
  /** Wave number (rad per SL). */
  k: number;
  /** Rotation pivot (centre of mass), SL from the snout. */
  pivot: number;
  mode: number;
  /** Body-wave fraction used at low effort (1 = full undulation). */
  rigid: number;
  /** Max turning curvature (rad per SL) at |bend| = 1. */
  bendMax: number;
  /** Ribbon-fin undulation: which fins (1 dorsal, 2 anal, 3 both), base range, waves, amplitude. */
  ribbonFins: number;
  ribbonStart: number;
  ribbonEnd: number;
  ribbonWaves: number;
  ribbonAmp: number;
  /** Dorsal + anal sculling in phase (puffers, boxfish). */
  scull: boolean;
  /** Pectoral rowing gain. */
  pectoralGain: number;
}

const TAU = Math.PI * 2;

export function swimParams(sp: Species, body: ResolvedBody): SwimParams {
  const base: SwimParams = {
    env: [0.02, -0.08, 0.16, 2],
    k: TAU / 0.95,
    pivot: 0.34,
    mode: SWIM_MODE.undulate,
    rigid: 1,
    bendMax: 2.2,
    ribbonFins: 0,
    ribbonStart: 0,
    ribbonEnd: 1,
    ribbonWaves: 2,
    ribbonAmp: 0,
    scull: false,
    pectoralGain: 1,
  };
  if (body.kind !== 'fish' && body.kind !== 'ray' && body.kind !== 'seahorse') {
    return { ...base, mode: SWIM_MODE.invertebrate, rigid: 0, bendMax: 0 };
  }
  if (body.kind === 'seahorse') return { ...base, mode: SWIM_MODE.seahorse, rigid: 0, bendMax: 0, pectoralGain: 0.6 };
  if (body.kind === 'ray') return { ...base, mode: SWIM_MODE.rajiform, rigid: 1, bendMax: 0.7, pivot: 0.3 };

  const loco: Locomotion = sp.locomotion;
  const ribbon = (fins: number, waves: number, amp: number): Partial<SwimParams> => {
    const f = fins === 2 ? body.anal : body.dorsal;
    return {
      ribbonFins: fins,
      ribbonStart: f?.start ?? 0.3,
      ribbonEnd: f?.end ?? 0.95,
      ribbonWaves: waves,
      ribbonAmp: amp,
    };
  };
  switch (loco) {
    case 'anguilliform':
      return { ...base, env: [0.035, 0.03, 0.035, 2], k: TAU / 0.62, pivot: 0.4, bendMax: 3.2 };
    case 'subcarangiform':
      return base;
    case 'carangiform':
      return { ...base, env: [0.02, -0.12, 0.2, 2], k: TAU / 1.05, bendMax: 1.8 };
    case 'thunniform':
      return { ...base, env: [0.008, 0, 0.092, 4], k: TAU / 1.25, pivot: 0.36, bendMax: 1.2 };
    case 'ostraciiform':
      return { ...base, mode: SWIM_MODE.ostraciiform, bendMax: 0.5, pectoralGain: 1.2, scull: true };
    case 'labriform':
      return { ...base, rigid: 0.35, bendMax: 2.0, pectoralGain: 1.3 };
    case 'tetraodontiform':
      return { ...base, rigid: 0.12, bendMax: 0.9, scull: true, pectoralGain: 1.2 };
    case 'balistiform':
      return { ...base, rigid: 0.12, bendMax: 1.0, ...ribbon(3, 1.3, 0.5) };
    case 'amiiform':
      return { ...base, rigid: 0.2, bendMax: 1.5, ...ribbon(1, 2.5, 0.42) };
    case 'gymnotiform':
      return { ...base, rigid: 0.06, bendMax: 1.2, ...ribbon(2, 2.6, 0.5) };
    case 'rajiform':
      return { ...base, mode: SWIM_MODE.rajiform, bendMax: 0.7 };
    case 'seahorse':
      return { ...base, rigid: 0.1, bendMax: 0.6, ...ribbon(1, 1.5, 0.3) };
    case 'walker':
    case 'crawler':
    case 'sessile':
    default:
      return { ...base, rigid: 0.4 };
  }
}
