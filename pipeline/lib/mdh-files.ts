// Dedicated parsers for MDH files whose real layouts the generic normalizer cannot read honestly.
// Each was written against the header and first rows recorded by the CI run of 2026-10-07
// (public/data/diagnostics/mdh.json) and returns the same NormalizedSeries/NormalizeDiag shapes as
// normalizeTable, so the source module treats every file alike.
//
//   * mls_othervirus.csv  — Minnesota Laboratory System molecular test counts by county and week
//                           (single-target flu/COVID/RSV assays and multiplex panels, "MMP").
//   * tsys.csv / tsysreg.csv — syndromic surveillance (UTF-16LE): % of ED and inpatient visits.
//   * hospflu_bytype.csv  — influenza hospitalizations by week and influenza type/subtype.
import type { GeoRef, PathogenId, Point } from '../../shared/types.ts'
import { mmwrWeekEnding, weekEndingSaturday } from '../../shared/mmwr.ts'
import { num } from './csv.ts'
import { countyGeo, detectRegionScheme, regionGeo } from './mdh-geo.ts'
import {
  normHeader, parseDateCell, parseSeason, parseYearWeek, roundValue, seasonWeekEnding,
  type NormalizeDiag, type NormalizedSeries, type NormalizeOptions,
} from './mdh-normalize.ts'
import { STATE_GEO } from './series.ts'

/** What a dedicated parser returns. `checks` are computed series used only to verify the file against MDH's own published numbers. */
export interface FileParse {
  series: NormalizedSeries[]
  diag: NormalizeDiag
  /** Computed counterparts of series MDH publishes elsewhere (never published themselves). */
  checks?: Record<string, NormalizedSeries>
  /** Alternative series for a different reading of the file, chosen by the source module after the checks. */
  alternates?: Record<string, NormalizedSeries[]>
  /** Extra diagnostics. */
  extra?: Record<string, unknown>
}

const emptyDiag = (rows: number, dateStrategy: string | null): NormalizeDiag => ({
  dateStrategy,
  geo: { level: 'state' },
  valueColumns: [],
  rows,
  rowsUsed: 0,
  skipped: {},
  unparsed: [],
  series: 0,
})

const latestOf = (series: NormalizedSeries[]) =>
  series.reduce<string | undefined>((m, s) => {
    const d = s.points[s.points.length - 1]?.[0]
    return d && (!m || d > m) ? d : m
  }, undefined)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]

// ───────────────────────── MLS molecular testing (mls_othervirus.csv) ─────────────────────────

type MlsGroup = 'molecular' | 'singleplex' | 'mmp'
type MlsTarget = PathogenId | 'ignore'

/** Target part of an MLS column name ("FluAH3", "PIV2", "CoV_OC43") -> pathogen. */
export function mlsTarget(target: string): { pathogen?: MlsTarget; subtype?: string } {
  const t = target.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (/indeterminate|invalid|inconclusive|equivocal/.test(t)) return { pathogen: 'ignore' }
  if (/^flu_?a/.test(t)) {
    const sub = t.replace(/^flu_?a_?/, '')
    const subtype =
      sub === 'unk' || sub === 'unknown' ? 'not subtyped'
        : /^h1_?2009|^h1_?pdm/.test(sub) ? 'A(H1N1)pdm09'
          : /^h1_?seasonal/.test(sub) ? 'A(H1) seasonal'
            : /^h3/.test(sub) ? 'A(H3)'
              : /^h5/.test(sub) ? 'A(H5)'
                : /non_?typeable|untypeable/.test(sub) ? 'not typeable'
                  : sub || 'A'
    return { pathogen: 'influenza-a', subtype }
  }
  if (/^flu_?b/.test(t)) return { pathogen: 'influenza-b' }
  if (/^rsv/.test(t)) return { pathogen: 'rsv' }
  if (/^covid|^sars_?cov_?2/.test(t)) return { pathogen: 'covid' }
  if (/^h?mpv$|metapneumo/.test(t)) return { pathogen: 'hmpv' }
  if (/rhino|entero/.test(t)) return { pathogen: 'rhino-entero' }
  if (/^piv_?\d?$|parainfluenza/.test(t)) return { pathogen: 'parainfluenza' }
  if (/^adeno/.test(t)) return { pathogen: 'adenovirus' }
  if (/^h?cov_?(hku1|nl63|229e|oc43)$/.test(t)) return { pathogen: 'seasonal-cov' }
  if (/mycoplasma/.test(t)) return { pathogen: 'mycoplasma' }
  if (/chlamyd/.test(t)) return { pathogen: 'chlamydia-pneumoniae' }
  if (/parapertussis|holmesii/.test(t)) return { pathogen: 'ignore' }
  if (/pertussis|bordetella/.test(t)) return { pathogen: 'pertussis' }
  return {}
}

/** Pathogens whose test total is named by a subject ("FluTestTotal" covers flu A and B). */
const SUBJECT_OF: Partial<Record<PathogenId, string>> = { 'influenza-a': 'flu', 'influenza-b': 'flu', covid: 'covid', rsv: 'rsv' }

/** Fewer tests than this in a week give a null (too few to compute a percent). */
const MIN_TESTS = 30

const MLS_NAMES: Partial<Record<PathogenId, string>> = {
  'influenza-a': 'influenza A', 'influenza-b': 'influenza B', covid: 'SARS-CoV-2 (COVID-19)', rsv: 'RSV', hmpv: 'human metapneumovirus',
  'rhino-entero': 'rhinovirus/enterovirus', parainfluenza: 'parainfluenza viruses 1–4', adenovirus: 'adenovirus',
  'seasonal-cov': 'seasonal coronaviruses (229E, HKU1, NL63, OC43)', mycoplasma: 'Mycoplasma pneumoniae', 'chlamydia-pneumoniae': 'Chlamydia pneumoniae',
  pertussis: 'Bordetella pertussis',
}

const mlsNote = (name: string, assays: string) =>
  `Percent of molecular tests positive for ${name}: positives ÷ tests from ${assays}, summed over the Minnesota Laboratory System labs that report weekly counts to MDH (computed by MN Pulse; MDH publishes its own percentages only for flu overall and RSV). Labs report voluntarily; recent weeks are preliminary.`

export type MlsDefinition = 'combined' | 'dedicated'
const CORE: PathogenId[] = ['influenza-a', 'influenza-b', 'covid', 'rsv']

/**
 * Statewide weekly percent positive from MLS molecular test counts (all reporting counties summed):
 *   * flu A, flu B and COVID-19: (single-target + multiplex panel positives) ÷ (their test totals);
 *     the "dedicated" alternative leaves the multiplex panels out;
 *   * viruses only multiplex panels detect (hMPV, rhinovirus/enterovirus, parainfluenza 1–4, adenovirus,
 *     seasonal coronaviruses, ...): panel positives ÷ panel test total.
 * Overall influenza and RSV are computed only as checks against MDH's own published percentages.
 * Columns that are not "<Group>_<Target>" counts (the trailing F53–F62 notes columns) are ignored.
 */
export function parseMlsMolecular(header: string[], rows: string[][], opts: NormalizeOptions): FileParse {
  const diag = emptyDiag(rows.length, null)
  const h = header.map((x) => x.trim())
  const dateIdx = h.findIndex((x) => /\bweek\b/i.test(x) && /\bdate\b|\bof\b|\bstart/i.test(x))
  const countyIdx = h.findIndex((x) => /^county$/i.test(x))
  if (dateIdx < 0) {
    diag.unparsed.push('no "Week of date" column')
    return { series: [], diag }
  }
  diag.dateStrategy = `week start date column "${h[dateIdx]}" (moved to the MMWR week-ending Saturday)`
  diag.geo = { level: 'state', column: countyIdx >= 0 ? h[countyIdx] : undefined }

  const tests: { idx: number; group: MlsGroup; subject: string }[] = []
  const pos: { idx: number; group: MlsGroup; pathogen: PathogenId; subtype?: string }[] = []
  const ignored: string[] = []
  const unknown: string[] = []
  h.forEach((col, idx) => {
    const m = /^(molecular|singleplex|mmp)_(.+)$/i.exec(col)
    if (!m) {
      if (idx !== dateIdx && idx !== countyIdx && !/^year$/i.test(col)) ignored.push(col)
      return
    }
    const group = m[1].toLowerCase() as MlsGroup
    if (/testtotal$|_?tests?_?total$/i.test(m[2])) {
      tests.push({ idx, group, subject: m[2].replace(/_?tests?_?total$/i, '').toLowerCase() })
      return
    }
    const t = mlsTarget(m[2])
    if (!t.pathogen) unknown.push(col)
    else if (t.pathogen === 'ignore') ignored.push(col)
    else pos.push({ idx, group, pathogen: t.pathogen, subtype: t.subtype })
  })
  /** The test-total column that covers a pathogen within a group (a named subject first, then a bare total). */
  const testsFor = (group: MlsGroup, p: PathogenId) => {
    const inGroup = tests.filter((t) => t.group === group)
    return inGroup.find((t) => t.subject && t.subject === SUBJECT_OF[p]) ?? inGroup.find((t) => !t.subject)
  }
  const usable = pos.filter((c) => testsFor(c.group, c.pathogen))
  for (const c of pos) {
    if (!usable.includes(c)) diag.valueColumns.push({ column: h[c.idx], role: 'positives', pathogen: c.pathogen, status: 'no test total covers this column; not used' })
  }
  if (!usable.length) {
    diag.unparsed.push('no positives column with a matching test total')
    return { series: [], diag }
  }
  if (unknown.length) diag.unparsed.push(`unrecognized test columns (not used): ${unknown.join(', ')}`)

  // Weekly sums. Rows labelled statewide (if MDH ever adds them) are kept apart from county rows.
  interface Week { tests: Map<number, number>; pos: Map<number, number>; counties: Set<string>; stateRows: number }
  const weeks = new Map<string, { county: Week; state: Week }>()
  const newWeek = (): Week => ({ tests: new Map(), pos: new Map(), counties: new Set(), stateRows: 0 })
  const wd: Record<string, number> = {}
  const unmatchedCounties = new Map<string, number>()
  const notes = new Map<string, number>()
  const countyWeekRows = new Map<string, number>()
  let rowsWithPosOverTests = 0
  // Per-county panel facts (for the dilution diagnostic): panel tests and non-core detections.
  const countyPanel = new Map<string, { tests: number; nonCore: number }>()
  const mmpTotal = tests.find((t) => t.group === 'mmp' && !t.subject)
  const nonCorePanel = usable.filter((c) => c.group === 'mmp' && !CORE.includes(c.pathogen))
  for (const r of rows) {
    const iso = parseDateCell(r[dateIdx] ?? '')
    if (!iso) {
      diag.skipped['no parseable week'] = (diag.skipped['no parseable week'] ?? 0) + 1
      continue
    }
    wd[weekday(iso)] = (wd[weekday(iso)] ?? 0) + 1
    const date = weekEndingSaturday(iso)
    if (date < opts.historyStart || date > opts.maxDate) {
      diag.skipped['outside the history window'] = (diag.skipped['outside the history window'] ?? 0) + 1
      continue
    }
    const county = countyIdx >= 0 ? (r[countyIdx] ?? '').trim() : ''
    const g = county ? countyGeo(county) : STATE_GEO
    if (county && !g) unmatchedCounties.set(county, (unmatchedCounties.get(county) ?? 0) + 1)
    if (!weeks.has(date)) weeks.set(date, { county: newWeek(), state: newWeek() })
    countyWeekRows.set(`${date}|${county}`, (countyWeekRows.get(`${date}|${county}`) ?? 0) + 1)
    const isState = g?.type === 'state' && !!county
    const w = isState ? weeks.get(date)!.state : weeks.get(date)!.county
    if (isState) w.stateRows++
    else if (county) w.counties.add(county)
    let any = false
    for (const t of tests) {
      const v = num(r[t.idx])
      if (v == null) continue
      w.tests.set(t.idx, (w.tests.get(t.idx) ?? 0) + v)
      any = any || v > 0
    }
    for (const c of usable) {
      const v = num(r[c.idx])
      if (v == null) continue
      w.pos.set(c.idx, (w.pos.get(c.idx) ?? 0) + v)
    }
    // Row sanity: positives of one test total never exceed it.
    for (const t of tests) {
      const tv = num(r[t.idx]) ?? 0
      const pv = usable.filter((c) => testsFor(c.group, c.pathogen) === t).reduce((a, c) => a + (num(r[c.idx]) ?? 0), 0)
      if (pv > tv && pv > 0) {
        rowsWithPosOverTests++
        break
      }
    }
    for (let i = 0; i < h.length; i++) {
      if (/^F\d+$/.test(h[i]) && (r[i] ?? '').trim() && notes.size < 40) {
        const k = (r[i] ?? '').trim().slice(0, 60)
        notes.set(k, (notes.get(k) ?? 0) + 1)
      }
    }
    if (mmpTotal && county && !isState) {
      const cp = countyPanel.get(county) ?? { tests: 0, nonCore: 0 }
      cp.tests += num(r[mmpTotal.idx]) ?? 0
      cp.nonCore += nonCorePanel.reduce((a, c) => a + (num(r[c.idx]) ?? 0), 0)
      countyPanel.set(county, cp)
    }
    if (any) diag.rowsUsed++
  }
  diag.weekdays = wd
  if (rowsWithPosOverTests) (diag.warnings ??= []).push(`${rowsWithPosOverTests} county-week rows report more positives than tests for one assay group`)
  const [topDay, topN] = Object.entries(wd).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const nDates = Object.values(wd).reduce((a, b) => a + b, 0)
  if (nDates && (topDay !== 'Sun' || topN / nDates < 0.8)) (diag.warnings ??= []).push(`"${h[dateIdx]}" dates are mostly ${topDay}days, not Sundays (week start); used the MMWR week containing each date`)

  const sortedWeeks = [...weeks.keys()].sort()
  const pick = (date: string) => {
    const w = weeks.get(date)!
    return w.state.stateRows ? w.state : w.county
  }
  /** Weekly positives/tests for a pathogen from the chosen assay groups. */
  const ratio = (p: PathogenId | 'influenza', groups: MlsGroup[]) => {
    const pts: Point[] = []
    const counts: { date: string; pos: number; tests: number }[] = []
    const members: PathogenId[] = p === 'influenza' ? ['influenza-a', 'influenza-b'] : [p]
    for (const date of sortedWeeks) {
      const w = pick(date)
      let pv = 0
      let tv = 0
      let used = false
      for (const group of groups) {
        const t = testsFor(group, members[0])
        const cols = usable.filter((c) => c.group === group && members.includes(c.pathogen))
        if (!t || !cols.length) continue
        used = true
        tv += w.tests.get(t.idx) ?? 0
        for (const c of cols) pv += w.pos.get(c.idx) ?? 0
      }
      if (!used || tv <= 0) continue
      counts.push({ date, pos: pv, tests: tv })
      pts.push([date, tv < MIN_TESTS || pv > tv ? null : roundValue((pv / tv) * 100, 'test_positivity')])
    }
    return { pts, counts }
  }
  const groupsWith = (p: PathogenId) => (['molecular', 'singleplex', 'mmp'] as MlsGroup[]).filter((g) => usable.some((c) => c.group === g && c.pathogen === p) && testsFor(g, p))
  const colsOf = (p: PathogenId, groups: MlsGroup[]) => usable.filter((c) => c.pathogen === p && groups.includes(c.group)).map((c) => h[c.idx])
  const testColsOf = (p: PathogenId, groups: MlsGroup[]) => groups.map((g) => testsFor(g, p)).filter(Boolean).map((t) => h[t!.idx])

  const build = (p: PathogenId, groups: MlsGroup[], what: string, computed: string, note: string, extraAttrs: Record<string, string> = {}): NormalizedSeries | null => {
    const { pts, counts } = ratio(p, groups)
    if (!pts.some((x) => x[1] != null)) return null
    const last = counts[counts.length - 1]
    const attrs: Record<string, string> = { mlsAssays: groups.map((g) => (g === 'mmp' ? 'multiplex panels' : g === 'singleplex' ? 'single-target COVID-19 assays' : 'single-target molecular assays')).join(' + '), ...extraAttrs }
    if (last) Object.assign(attrs, { testsLatestWeek: String(last.tests), positivesLatestWeek: String(last.pos) })
    const lastWeek = weeks.get(last?.date ?? '')
    if (lastWeek) attrs.countiesLatestWeek = String(lastWeek.county.counties.size)
    return {
      pathogen: p,
      metric: 'test_positivity',
      geo: STATE_GEO,
      points: pts,
      columns: [...colsOf(p, groups), ...testColsOf(p, groups)],
      computed,
      what,
      note,
      attrs,
    }
  }

  // Influenza A subtype counts over the latest four weeks (from the same file).
  const subtypeAttrs = (): Record<string, string> => {
    const recent = sortedWeeks.slice(-4)
    const totals = new Map<string, number>()
    for (const d of recent) {
      const w = pick(d)
      for (const c of usable) if (c.pathogen === 'influenza-a' && c.subtype) totals.set(c.subtype, (totals.get(c.subtype) ?? 0) + (w.pos.get(c.idx) ?? 0))
    }
    const parts = [...totals].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`)
    return recent.length ? { fluASubtypesLast4Weeks: parts.length ? `${parts.join(', ')} (weeks ending ${recent[0]} to ${recent[recent.length - 1]})` : `none detected (weeks ending ${recent[0]} to ${recent[recent.length - 1]})` } : {}
  }

  const series: NormalizedSeries[] = []
  const alternates: NormalizedSeries[] = []
  const COMBINED = '% of molecular tests positive'
  for (const p of ['influenza-a', 'influenza-b', 'covid'] as PathogenId[]) {
    const groups = groupsWith(p)
    if (!groups.length) continue
    const extra = p === 'influenza-a' ? subtypeAttrs() : {}
    const name = MLS_NAMES[p] ?? p
    const s = build(p, groups, COMBINED, 'MDH positive tests ÷ tests (single-target and multiplex-panel assays)', mlsNote(name, 'single-target assays and multiplex panels'), extra)
    if (s) series.push(s)
    const ded = groups.filter((g) => g !== 'mmp')
    if (ded.length && ded.length < groups.length) {
      const a = build(p, ded, COMBINED, 'MDH positive tests ÷ tests (single-target assays)', mlsNote(name, 'single-target assays (multiplex panels left out, matching how MDH computes its flu and RSV percentages)'), extra)
      if (a) alternates.push(a)
    }
  }
  const panelOnly = [...new Set(usable.filter((c) => c.group === 'mmp' && !CORE.includes(c.pathogen)).map((c) => c.pathogen))]
  for (const p of panelOnly) {
    const name = MLS_NAMES[p] ?? p
    const s = build(
      p,
      ['mmp'],
      '% of multiplex panel tests positive',
      'MDH multiplex-panel positives ÷ all multiplex-panel tests',
      `Percent of multiplex respiratory panel tests positive for ${name}, summed over the Minnesota Laboratory System labs that report weekly counts to MDH (computed by MN Pulse). MDH's panel test total appears to also count smaller flu/COVID-19/RSV-only multiplex assays that cannot detect ${name} (some labs report hundreds of panel tests a week with no other virus detected), so the level understates positivity among full respiratory panels and depends on the assay mix: compare weeks with each other, not with other sources. Labs report voluntarily; recent weeks are preliminary.`,
    )
    if (s) series.push(s)
  }
  for (const s of series) diag.valueColumns.push({ column: s.columns.join(' + ').slice(0, 120), role: 'positives', pathogen: s.pathogen, metric: s.metric, status: 'mapped (computed)' })

  // Checks against MDH's published flu and RSV percentages, under both readings.
  const checks: Record<string, NormalizedSeries> = {}
  for (const [name, p] of [['influenza', 'influenza'], ['rsv', 'rsv']] as const) {
    const allGroups = [...new Set([...groupsWith(p === 'influenza' ? 'influenza-a' : 'rsv'), ...(p === 'influenza' ? groupsWith('influenza-b') : [])])]
    for (const [def, groups] of [['combined', allGroups], ['dedicated', allGroups.filter((g) => g !== 'mmp')]] as [MlsDefinition, MlsGroup[]][]) {
      if (!groups.length) continue
      const { pts } = ratio(p, groups)
      if (pts.length) checks[`${name}:${def}`] = { pathogen: p, metric: 'test_positivity', geo: STATE_GEO, points: pts, columns: [], computed: def }
    }
  }

  // Panel dilution diagnostic: share of panel tests (within the history window) from counties that never
  // reported a non-flu/COVID/RSV panel detection, i.e. most likely flu/COVID/RSV-only multiplex assays.
  const panel = [...countyPanel.values()].reduce((a, c) => ({ tests: a.tests + c.tests, never: a.never + (c.nonCore === 0 ? c.tests : 0) }), { tests: 0, never: 0 })
  const byTests = [...countyPanel].sort((a, b) => b[1].tests - a[1].tests).slice(0, 8).map(([k, v]) => `${k} ${v.tests} tests/${v.nonCore} non-core detections`)
  const extra: Record<string, unknown> = {
    weeks: sortedWeeks.length,
    firstWeek: sortedWeeks[0],
    lastWeek: sortedWeeks[sortedWeeks.length - 1],
    countiesLatestWeek: sortedWeeks.length ? weeks.get(sortedWeeks[sortedWeeks.length - 1])!.county.counties.size : 0,
    // Several rows for one county and week would mean rows are per reporting lab, i.e. "County" is probably
    // where the lab is rather than where patients live (county-level positivity is not published either way).
    rowsPerWeek: sortedWeeks.length ? Math.round((10 * [...countyWeekRows.values()].reduce((a, b) => a + b, 0)) / sortedWeeks.length) / 10 : 0,
    countyWeeksWithSeveralRows: [...countyWeekRows.values()].filter((n) => n > 1).length,
    ignoredColumns: ignored.slice(0, 20),
    notesColumnValues: Object.fromEntries([...notes].slice(0, 12)),
    unmatchedCounties: Object.fromEntries([...unmatchedCounties].slice(0, 10)),
    panelTestsFromCountiesWithNoNonCoreDetection: panel.tests ? `${Math.round((1000 * panel.never) / panel.tests) / 10}% of ${panel.tests}` : undefined,
    topPanelCounties: byTests,
  }
  diag.series = series.length
  diag.latest = latestOf(series)
  if (!series.length) diag.unparsed.push('no week had enough tests to compute a percent positive')
  return { series, diag, checks, alternates: alternates.length ? { dedicated: alternates } : undefined, extra }
}

// ───────────────────────── Syndromic surveillance (tsys.csv, tsysreg.csv) ─────────────────────────

/**
 * Weekly percent of emergency department and inpatient visits (hospital ADT messages) with a COVID-19
 * diagnosis or influenza-like illness, statewide or by MDH region. Symptom-only columns (cough,
 * shortness of breath) name no pathogen and are not mapped.
 */
export function parseSyndromic(header: string[], rows: string[][], opts: NormalizeOptions): FileParse {
  const diag = emptyDiag(rows.length, null)
  const h = header.map((x) => x.trim())
  const share = (idx: number, fn: (s: string) => unknown) => {
    const vals = rows.map((r) => (r[idx] ?? '').trim()).filter(Boolean)
    return vals.length ? vals.filter(fn).length / vals.length : 0
  }
  const dateIdx = h.findIndex((x, i) => /\bweek\b|\bdate/i.test(x) && share(i, parseDateCell) >= 0.8)
  if (dateIdx < 0) {
    diag.unparsed.push('no week date column')
    return { series: [], diag }
  }
  diag.dateStrategy = `date column "${h[dateIdx]}"`
  const regionIdx = h.findIndex((x) => /\bregions?\b|\bdistricts?\b/i.test(x))
  let scheme: ReturnType<typeof detectRegionScheme> = null
  if (regionIdx >= 0) {
    const labels = [...new Set(rows.map((r) => (r[regionIdx] ?? '').trim()).filter(Boolean))]
    scheme = detectRegionScheme(labels)
    if (!scheme) {
      diag.unparsed.push(`region labels not recognized as an MDH scheme: ${labels.slice(0, 12).join(', ')}`)
      return { series: [], diag }
    }
    diag.geo = { level: 'region', column: h[regionIdx], scheme }
  }
  const vcols: { idx: number; pathogen: PathogenId; what: string }[] = []
  h.forEach((col, idx) => {
    if (idx === dateIdx || idx === regionIdx || !col || /^column_\d+$/.test(col)) return
    const n = normHeader(col)
    const pct = /%|percent/.test(n)
    if (/covid|sars cov 2/.test(n) && pct) vcols.push({ idx, pathogen: 'covid', what: '% of ED and inpatient visits with a COVID-19 diagnosis' })
    else if (/influenza like|\bili\b/.test(n) && pct) vcols.push({ idx, pathogen: 'ili', what: '% of ED and inpatient visits for influenza-like illness' })
    else diag.valueColumns.push({ column: col, role: 'percent', status: 'symptom or measure without a tracked pathogen; not mapped' })
  })
  if (!vcols.length) {
    diag.unparsed.push('no COVID-19 or influenza-like illness percentage column')
    return { series: [], diag }
  }
  const wd: Record<string, number> = {}
  const groups = new Map<string, { pathogen: PathogenId; geo: GeoRef; what: string; col: string; byDate: Map<string, number | null>; conflict?: string }>()
  const unmatched = new Map<string, number>()
  for (const r of rows) {
    const iso = parseDateCell(r[dateIdx] ?? '')
    if (!iso) {
      diag.skipped['no parseable week'] = (diag.skipped['no parseable week'] ?? 0) + 1
      continue
    }
    wd[weekday(iso)] = (wd[weekday(iso)] ?? 0) + 1
    const date = weekEndingSaturday(iso)
    if (date < opts.historyStart || date > opts.maxDate) continue
    let geo: GeoRef | null = STATE_GEO
    if (regionIdx >= 0) {
      const raw = (r[regionIdx] ?? '').trim()
      geo = scheme ? regionGeo(raw, scheme) : null
      if (!geo) {
        unmatched.set(raw, (unmatched.get(raw) ?? 0) + 1)
        continue
      }
      if (geo.population != null) {
        // A share of hospital visits, not a population measure: keep the counties, drop the population.
        const { population: _p, ...rest } = geo
        geo = rest
      }
    }
    let used = false
    for (const v of vcols) {
      const cell = (r[v.idx] ?? '').trim()
      if (!cell) continue
      const val = num(cell)
      const key = `${v.pathogen}|${geo.type}|${geo.code}`
      if (!groups.has(key)) groups.set(key, { pathogen: v.pathogen, geo, what: v.what, col: h[v.idx], byDate: new Map() })
      const g = groups.get(key)!
      const prev = g.byDate.get(date)
      if (prev !== undefined && prev !== val && !g.conflict) g.conflict = `${date}: ${prev} vs ${val}`
      g.byDate.set(date, val == null ? null : roundValue(val, 'ed_visit_pct'))
      used = true
    }
    if (used) diag.rowsUsed++
  }
  diag.weekdays = wd
  if (unmatched.size) diag.skipped[`unmatched region (${[...unmatched.keys()].slice(0, 5).join(', ')})`] = [...unmatched.values()].reduce((a, b) => a + b, 0)
  const series: NormalizedSeries[] = []
  for (const g of groups.values()) {
    if (g.conflict) {
      diag.unparsed.push(`${g.pathogen}/${g.geo.code}: two different values in one week (${g.conflict})`)
      continue
    }
    const points = [...g.byDate].sort(([a], [b]) => (a < b ? -1 : 1)) as Point[]
    if (!points.some((p) => p[1] != null)) continue
    series.push({ pathogen: g.pathogen, metric: 'ed_visit_pct', geo: g.geo, points, columns: [g.col], what: g.what })
    if (!diag.valueColumns.some((c) => c.column === g.col)) diag.valueColumns.push({ column: g.col, role: 'percent', pathogen: g.pathogen, metric: 'ed_visit_pct', status: 'mapped' })
  }
  diag.series = series.length
  diag.latest = latestOf(series)
  if (!series.length && !diag.unparsed.length) diag.unparsed.push('no values in range')
  return { series, diag }
}

// ───────────────────────── Influenza hospitalizations by type (hospflu_bytype.csv) ─────────────────────────

/** Influenza type label as MDH writes it -> 'A' | 'B' | 'unknown'; null when it cannot be classified. */
export function fluTypeOf(label: string): 'A' | 'B' | 'unknown' | null {
  const s = label.trim().toLowerCase().replace(/^(influenza|flu)\s+/, '')
  if (!s) return null
  if (/^(unknown|untyped|not typed|unspecified|missing)\b/.test(s)) return 'unknown'
  const a = /^a\b/.test(s)
  const b = /^b\b/.test(s)
  if (a && /\bb\b/.test(s.slice(1))) return null // "A/B" co-infection
  if (a) return 'A'
  if (b) return 'B'
  return null
}

/** Weekly influenza A and B hospitalizations (sums of MDH's type rows); "Unknown" type is in neither. */
export function parseFluHospByType(header: string[], rows: string[][], opts: NormalizeOptions): FileParse {
  const diag = emptyDiag(rows.length, null)
  const h = header.map((x) => normHeader(x))
  const seasonIdx = h.findIndex((x) => /\bseason\b/.test(x))
  const weekIdx = h.findIndex((x) => /\b(mmwr )?week\b/.test(x))
  const typeIdx = h.findIndex((x) => /\b(type|subtype|strain)\b/.test(x))
  const valIdx = h.findIndex((x, i) => i !== weekIdx && /\b(frequency|count|number|hospitali[sz]ations?|cases)\b/.test(x))
  if (weekIdx < 0 || typeIdx < 0 || valIdx < 0) {
    diag.unparsed.push('expected Season, MMWR Week, Type and Frequency columns')
    return { series: [], diag }
  }
  diag.dateStrategy = seasonIdx >= 0 ? `season "${header[seasonIdx]}" + MMWR week "${header[weekIdx]}"` : `MMWR year-week "${header[weekIdx]}"`
  diag.pathogenColumn = header[typeIdx]
  const sums = { A: new Map<string, number>(), B: new Map<string, number>(), all: new Map<string, number>() }
  const unknownTypes = new Map<string, number>()
  const typesSeen = new Set<string>()
  for (const r of rows) {
    const wk = (r[weekIdx] ?? '').trim()
    let date: string | null = null
    const yw = parseYearWeek(wk)
    if (yw) date = mmwrWeekEnding(yw.year, yw.week)
    else if (seasonIdx >= 0 && /^\d{1,2}$/.test(wk)) {
      const s = parseSeason(r[seasonIdx] ?? '')
      date = s != null ? seasonWeekEnding(s, Number(wk)) : null
    }
    if (!date) {
      diag.skipped['no parseable week'] = (diag.skipped['no parseable week'] ?? 0) + 1
      continue
    }
    if (date < opts.historyStart || date > opts.maxDate) continue
    const label = (r[typeIdx] ?? '').trim()
    typesSeen.add(label)
    const v = num(r[valIdx])
    if (v == null) {
      diag.skipped['blank count'] = (diag.skipped['blank count'] ?? 0) + 1
      continue
    }
    const t = fluTypeOf(label)
    sums.all.set(date, (sums.all.get(date) ?? 0) + v)
    if (t === 'A' || t === 'B') sums[t].set(date, (sums[t].get(date) ?? 0) + v)
    else if (t == null) unknownTypes.set(label, (unknownTypes.get(label) ?? 0) + v)
    // Make sure both A and B have a (possibly zero) point in every week that has rows.
    if (!sums.A.has(date)) sums.A.set(date, 0)
    if (!sums.B.has(date)) sums.B.set(date, 0)
    diag.rowsUsed++
  }
  if (unknownTypes.size) (diag.warnings ??= []).push(`type labels not classified as A or B: ${[...unknownTypes].map(([k, n]) => `${k} (${n})`).join(', ')}`)
  const toPts = (m: Map<string, number>) => [...m].sort(([a], [b]) => (a < b ? -1 : 1)) as Point[]
  const series: NormalizedSeries[] = []
  for (const [p, key] of [['influenza-a', 'A'], ['influenza-b', 'B']] as const) {
    const pts = toPts(sums[key])
    if (!pts.length) continue
    series.push({
      pathogen: p,
      metric: 'hosp_admissions',
      geo: STATE_GEO,
      points: pts,
      columns: [header[valIdx]],
      attrs: { mdhTypes: [...typesSeen].filter((l) => fluTypeOf(l) === key).join('; ') },
    })
  }
  diag.valueColumns.push({ column: header[valIdx], role: 'hosp', pathogen: 'influenza-a/influenza-b', metric: 'hosp_admissions', status: series.length ? 'mapped (summed by type)' : 'no values in range' })
  diag.series = series.length
  diag.latest = latestOf(series)
  const checks = sums.all.size ? { 'influenza:all-types': { pathogen: 'influenza' as PathogenId, metric: 'hosp_admissions' as const, geo: STATE_GEO, points: toPts(sums.all), columns: [] } } : undefined
  return { series, diag, checks, extra: { types: [...typesSeen] } }
}
