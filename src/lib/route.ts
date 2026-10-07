// URL hash <-> app state. Pure (no DOM, no React) so it can be unit-tested and so hostile or stale links can
// never crash the app: every value read from the hash is validated against a known list and falls back to the
// default when it is not recognised.
//   #/map?geo=county:27053&range=1y&for=seniors
import type { AgeGroupId, PathogenCategory, PathogenId } from '../../shared/types'
import { PATHOGEN_INFO } from '../../shared/pathogens'
import { AUDIENCE_IDS } from './audiences'

export type View = 'pulse' | 'map' | 'trends' | 'pathogens' | 'pathogen' | 'learn' | 'sources'
export type TimeRange = '3m' | '6m' | '1y' | '2y' | '5y'
export type GeoSelection = { type: 'state'; code: '27' } | { type: 'county'; code: string } | { type: 'mdh-region'; code: string }

export interface AppState {
  view: View
  pathogenId?: PathogenId
  geo: GeoSelection
  range: TimeRange
  audience: AgeGroupId
  category: PathogenCategory | 'all'
}

/**
 * Default range is 6 months: long enough to show the current season's rise and the projection, short enough
 * that last winter's peak does not squash this week's numbers into a sliver. 1y/2y/All stay one click away.
 */
export const DEFAULT_STATE: AppState = {
  view: 'pulse',
  geo: { type: 'state', code: '27' },
  range: '6m',
  audience: 'all',
  category: 'all',
}

export const RANGE_WEEKS: Record<TimeRange, number> = { '3m': 13, '6m': 26, '1y': 52, '2y': 104, '5y': 261 }

const VIEWS: readonly View[] = ['pulse', 'map', 'trends', 'pathogens', 'pathogen', 'learn', 'sources']
const PATHOGEN_IDS: ReadonlySet<string> = new Set(Object.keys(PATHOGEN_INFO))
/** Every category used by a tracked illness (the canonical id -> category mapping lives in shared/pathogens). */
const CATEGORIES: ReadonlySet<string> = new Set(Object.values(PATHOGEN_INFO).map((p) => p.category))

const own = (set: ReadonlySet<string>, v: string | null | undefined): v is string => v != null && set.has(v)

/** decodeURIComponent that returns undefined instead of throwing on malformed escapes (e.g. "%E0%A4%A"). */
function safeDecode(s: string): string | undefined {
  try {
    return decodeURIComponent(s)
  } catch {
    return undefined
  }
}

/** True for hashes this app owns ("", "#", "#/…"). In-page anchors such as "#main" are left alone. */
export function isAppHash(hash: string): boolean {
  return hash === '' || hash === '#' || hash.startsWith('#/')
}

export function parseHash(hash: string): AppState {
  const raw = hash.replace(/^#\/?/, '')
  const qi = raw.indexOf('?')
  const pathPart = qi === -1 ? raw : raw.slice(0, qi)
  const query = qi === -1 ? '' : raw.slice(qi + 1)
  const segs = pathPart.split('/').filter(Boolean)
  const s: AppState = { ...DEFAULT_STATE, geo: { ...DEFAULT_STATE.geo } }

  if ((segs[0] === 'pathogens' || segs[0] === 'pathogen') && segs[1]) {
    const id = safeDecode(segs[1])
    if (own(PATHOGEN_IDS, id)) {
      s.view = 'pathogen'
      s.pathogenId = id as PathogenId
    } else {
      // Unknown or garbled illness id: show the library rather than a broken page.
      s.view = 'pathogens'
    }
  } else if (segs[0] === 'pathogen') {
    s.view = 'pathogens'
  } else if (VIEWS.includes(segs[0] as View)) {
    s.view = segs[0] as View
  }

  // URLSearchParams already percent-decodes values (and never throws on bad escapes): do not decode again.
  const q = new URLSearchParams(query)
  const geo = q.get('geo')
  if (geo) {
    const i = geo.indexOf(':')
    const type = i === -1 ? geo : geo.slice(0, i)
    const code = i === -1 ? '' : geo.slice(i + 1)
    if (type === 'county' && /^27\d{3}$/.test(code)) s.geo = { type: 'county', code }
    else if (type === 'mdh-region' && code && code.length <= 80) s.geo = { type: 'mdh-region', code }
  }
  const range = q.get('range')
  if (range && Object.prototype.hasOwnProperty.call(RANGE_WEEKS, range)) s.range = range as TimeRange
  const aud = q.get('for')
  if (own(AUDIENCE_IDS, aud)) s.audience = aud as AgeGroupId
  const cat = q.get('cat')
  if (own(CATEGORIES, cat)) s.category = cat as PathogenCategory
  return s
}

export function toHash(s: AppState): string {
  const path = s.view === 'pathogen' && s.pathogenId ? `pathogens/${encodeURIComponent(s.pathogenId)}` : s.view === 'pathogen' ? 'pathogens' : s.view
  const q = new URLSearchParams()
  if (s.geo.type !== 'state') q.set('geo', `${s.geo.type}:${s.geo.code}`)
  if (s.range !== DEFAULT_STATE.range) q.set('range', s.range)
  if (s.audience !== 'all') q.set('for', s.audience)
  if (s.category !== 'all') q.set('cat', s.category)
  const qs = q.toString()
  return `#/${path}${qs ? `?${qs}` : ''}`
}

/** Tab title for each view. The illness page title is set from its profile (see App). */
export const VIEW_TITLE: Record<Exclude<View, 'pathogen'>, string> = {
  pulse: 'MN Pulse: Minnesota’s infectious disease pulse',
  map: 'Map: what’s going around where · MN Pulse',
  trends: 'Trends and projections · MN Pulse',
  pathogens: 'Illnesses: symptoms, risks and treatment · MN Pulse',
  learn: 'Understand the numbers · MN Pulse',
  sources: 'Data sources and freshness · MN Pulse',
}
