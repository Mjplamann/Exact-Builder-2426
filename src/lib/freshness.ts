// How current the published snapshot is. Freshness is otherwise judged only when the pipeline runs, so the app
// checks again in the browser: a page left open (or a pipeline that stopped running) must not look current.
import type { MetricKind, PathogenId, PulseFile } from '../../shared/types'
import { daysAgo, formatDate } from './format'

/** The three illnesses whose official cut-points set the statewide respiratory level. */
export const HEADLINE_PATHOGENS: PathogenId[] = ['influenza', 'covid', 'rsv']

const isWastewater = (m: MetricKind) => m === 'wastewater_conc' || m === 'wastewater_level' || m === 'ww_detections'

/**
 * Dates for the hero. The statewide level comes from the flu, COVID-19 and RSV primaries, so the hero is dated
 * from those (newest of the three), with the newest statewide wastewater week mentioned separately when later.
 */
export function headlineDates(pulse: PulseFile): { week?: string; wastewater?: string } {
  let week: string | undefined
  let ww: string | undefined
  for (const p of pulse.pathogens) {
    const d = p.primary?.latestDate ?? p.asOf
    if (HEADLINE_PATHOGENS.includes(p.pathogen) && d && (!week || d > week)) week = d
    for (const s of p.signals ?? []) {
      if (isWastewater(s.metric) && s.geo.type === 'state' && s.latestDate && (!ww || s.latestDate > ww)) ww = s.latestDate
    }
  }
  return { week, wastewater: ww && (!week || ww > week) ? ww : undefined }
}

/** Pipeline output older than this many days is flagged. */
export const MAX_SNAPSHOT_AGE_DAYS = 2
/** A newest headline week older than this many days is flagged (normal reporting lag is about 1–2 weeks). */
export const MAX_WEEK_AGE_DAYS = 21

export interface StaleNotice {
  snapshotDays?: number
  weekDays?: number
  message: string
}

/** A plain-language warning when the snapshot or its newest headline week is too old, else undefined. */
export function staleNotice(generatedAt: string | undefined, pulse: PulseFile | undefined, now = new Date()): StaleNotice | undefined {
  const snapshotDays = daysAgo(generatedAt, now)
  const week = pulse ? headlineDates(pulse).week : undefined
  const weekDays = daysAgo(week, now)
  const oldSnapshot = snapshotDays != null && Number.isFinite(snapshotDays) && snapshotDays > MAX_SNAPSHOT_AGE_DAYS
  const oldWeek = weekDays != null && Number.isFinite(weekDays) && weekDays > MAX_WEEK_AGE_DAYS
  if (!oldSnapshot && !oldWeek) return undefined
  const message = oldSnapshot
    ? `This snapshot is ${snapshotDays} days old; levels may not reflect current activity.`
    : `The newest flu, COVID-19 and RSV numbers are for the week ending ${formatDate(week, true)} (${weekDays} days ago); levels may not reflect current activity.`
  return { snapshotDays, weekDays, message }
}
