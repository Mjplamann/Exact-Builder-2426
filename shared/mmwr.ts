// MMWR (CDC epidemiological) week utilities.
//
// Rules: MMWR weeks run Sunday through Saturday. Week 1 of an MMWR year is the
// first week that has at least four days in the calendar year — equivalently,
// the Sunday–Saturday week that contains January 4. Surveillance data are
// conventionally labeled by the week-ending Saturday.
//
// A respiratory "season" follows CDC convention: MMWR week 40 through week 39
// of the following year. Season "2026-27" starts with MMWR week 40 of 2026.
//
// All dates here are calendar dates handled in UTC to avoid DST/timezone drift.

const DAY_MS = 86_400_000

export interface MmwrWeek {
  year: number
  week: number
}

/** Parse an ISO date (YYYY-MM-DD, extra time portion ignored) into a UTC Date at midnight. */
export function parseISODate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) throw new Error(`Invalid ISO date: ${iso}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + days * DAY_MS))
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS)
}

/** Sunday that starts MMWR week 1 of the given year. */
export function mmwrYearStart(year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  return new Date(jan4.getTime() - jan4.getUTCDay() * DAY_MS)
}

/** MMWR year/week for a calendar date. */
export function mmwrWeekOf(iso: string): MmwrWeek {
  const d = parseISODate(iso)
  let year = d.getUTCFullYear()
  if (d.getTime() < mmwrYearStart(year).getTime()) year -= 1
  else if (d.getTime() >= mmwrYearStart(year + 1).getTime()) year += 1
  const week = Math.floor((d.getTime() - mmwrYearStart(year).getTime()) / (7 * DAY_MS)) + 1
  return { year, week }
}

/** Number of MMWR weeks (52 or 53) in an MMWR year. */
export function weeksInMmwrYear(year: number): number {
  return Math.round((mmwrYearStart(year + 1).getTime() - mmwrYearStart(year).getTime()) / (7 * DAY_MS))
}

/** Saturday (week-ending date) of an MMWR week. */
export function mmwrWeekEnding(year: number, week: number): string {
  return toISODate(new Date(mmwrYearStart(year).getTime() + ((week - 1) * 7 + 6) * DAY_MS))
}

/** The Saturday ending the Sunday–Saturday week that contains the date. */
export function weekEndingSaturday(iso: string): string {
  const d = parseISODate(iso)
  return toISODate(new Date(d.getTime() + (6 - d.getUTCDay()) * DAY_MS))
}

/** Season label (e.g. "2026-27") for a date, using the MMWR week 40 boundary. */
export function seasonOf(iso: string): string {
  const { year, week } = mmwrWeekOf(iso)
  const start = week >= 40 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** First calendar year of a season label ("2026-27" → 2026). */
export function seasonStartYear(season: string): number {
  return Number(season.slice(0, 4))
}

/** Zero-based week index within the season (MMWR week 40 → 0). */
export function weekOfSeason(iso: string): number {
  const { year, week } = mmwrWeekOf(iso)
  if (week >= 40) return week - 40
  return weeksInMmwrYear(year - 1) - 40 + week
}

/** Week-ending Saturday for a season label and zero-based week-of-season index. */
export function seasonWeekEnding(season: string, index: number): string {
  const start = mmwrWeekEnding(seasonStartYear(season), 40)
  return addDays(start, index * 7)
}

/** Epiweek as a compact integer, e.g. 202640. */
export function epiweekNumber(iso: string): number {
  const { year, week } = mmwrWeekOf(iso)
  return year * 100 + week
}

/** Week-ending Saturday for a compact epiweek integer (202640 → 2026-10-03). */
export function epiweekToDate(epiweek: number): string {
  return mmwrWeekEnding(Math.floor(epiweek / 100), epiweek % 100)
}
