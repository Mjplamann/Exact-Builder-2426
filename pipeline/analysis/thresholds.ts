// Official, publisher-defined activity thresholds. Only thresholds verified against the
// publisher's own documentation belong here; everything else is ranked against its own history.
import type { ActivityLevel, Series } from '../../shared/types.ts'
import { levelFromCuts } from '../../shared/risk.ts'

export interface OfficialLevel {
  level: ActivityLevel
  basis: string
}

/** CDC NWSS Wastewater Viral Activity Level categories are published as text. */
const WVAL_LABELS: Record<string, ActivityLevel> = {
  'very low': 'minimal',
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  'very high': 'very-high',
}

export function wvalCategory(label: string): ActivityLevel | undefined {
  return WVAL_LABELS[label.trim().toLowerCase()]
}

/**
 * Returns an official level for the latest value when the publisher defines one.
 * (Extended as sources with verified cut-points are added.)
 */
export function officialLevel(s: Series, value: number): OfficialLevel | null {
  if (s.thresholds) {
    const t = s.thresholds
    return { level: levelFromCuts(value, [t.low, t.moderate, t.high, t.veryHigh]), basis: t.by }
  }
  return null
}
