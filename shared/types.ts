// MN Pulse data contract — shared by the data pipeline (pipeline/) and the web app (src/).
//
// Everything the app renders comes from JSON files in public/data/ that match these types.
// Conventions:
//   * All weekly observations are keyed by the MMWR week-ending SATURDAY (ISO "YYYY-MM-DD").
//   * Percentages are stored as percent values (12.5 means 12.5%), never proportions.
//   * A null value means "reported as missing/suppressed"; absent weeks simply have no point.
//   * Nothing in public/data is ever synthesized: every value traces to a named public source.

/** Pathogens and syndromes tracked across sources. */
export type PathogenId =
  // respiratory viruses
  | 'influenza' // influenza A + B combined
  | 'influenza-a'
  | 'influenza-b'
  | 'rsv'
  | 'covid'
  | 'hmpv'
  | 'rhino-entero'
  | 'adenovirus'
  | 'parainfluenza'
  | 'seasonal-cov'
  // respiratory bacteria
  | 'mycoplasma'
  | 'pertussis'
  | 'chlamydia-pneumoniae'
  | 'strep-a'
  // gastrointestinal
  | 'norovirus'
  | 'rotavirus'
  | 'sapovirus'
  | 'astrovirus'
  | 'adenovirus-gi'
  | 'salmonella'
  | 'campylobacter'
  | 'stec'
  | 'shigella'
  | 'c-diff'
  | 'cyclospora'
  | 'giardia'
  | 'cryptosporidium'
  // vaccine-preventable / outbreak watch
  | 'measles'
  | 'hepatitis-a'
  | 'mpox'
  // vector-borne and zoonotic
  | 'lyme'
  | 'anaplasmosis'
  | 'babesiosis'
  | 'west-nile'
  | 'h5n1'
  // syndromes / combined indicators
  | 'respiratory-combined'
  | 'ili'

export type PathogenCategory =
  | 'respiratory-viral'
  | 'respiratory-bacterial'
  | 'gastrointestinal'
  | 'vaccine-preventable'
  | 'vector-borne'
  | 'zoonotic'
  | 'syndrome'

/** What a series measures. Units are implied by the metric (see METRIC_UNITS). */
export type MetricKind =
  | 'detection_rate' // % of multiplex panel tests detecting the organism (BioFire)
  | 'test_positivity' // % of laboratory tests positive
  | 'ed_visit_pct' // % of emergency department visits with the diagnosis (NSSP)
  | 'ili_pct' // % of outpatient visits for influenza-like illness
  | 'hosp_admissions' // new hospital admissions per week (count)
  | 'hosp_rate' // hospitalizations per 100,000 population per week
  | 'wastewater_level' // wastewater viral activity level (unitless index)
  | 'wastewater_conc' // normalized wastewater concentration (source-specific units)
  | 'cases' // reported case count
  | 'outbreaks' // reported outbreak count
  | 'deaths' // reported deaths
  | 'ww_detections' // wastewater sites (or samples) with a detection that week (count)
  | 'rt' // effective reproduction number estimate (unitless; > 1 means growing)

export type Unit = '%' | 'count' | 'per100k' | 'index' | 'ratio'

export const METRIC_UNITS: Record<MetricKind, Unit> = {
  detection_rate: '%',
  test_positivity: '%',
  ed_visit_pct: '%',
  ili_pct: '%',
  hosp_admissions: 'count',
  hosp_rate: 'per100k',
  wastewater_level: 'index',
  wastewater_conc: 'ratio',
  cases: 'count',
  outbreaks: 'count',
  deaths: 'count',
  ww_detections: 'count',
  rt: 'index',
}

export type GeoType =
  | 'national'
  | 'census-region' // e.g. Midwest (BioFire)
  | 'hhs-region' // e.g. Region 5 (NREVSS)
  | 'state'
  | 'mdh-region' // MDH SCHSAC / health-care-coalition regions (8)
  | 'mdh-district' // MDH Field Services epidemiology districts (7)
  | 'county'
  | 'sewershed' // a wastewater treatment plant catchment

export interface GeoRef {
  type: GeoType
  /** Stable code: 'US', 'Midwest', 'HHS5', '27', county FIPS '27053', region name, or a site id. */
  code: string
  name: string
  /** County FIPS codes covered (sewersheds, regions) when known. */
  counties?: string[]
  /** [lon, lat] for point features such as wastewater plants. */
  coord?: [number, number]
  /** Population served/covered when known. */
  population?: number
}

export type AgeGroupId =
  | 'all'
  | 'infants' // under 1 year
  | 'children' // 1–17
  | 'adults' // 18–49
  | 'older-adults' // 50–64
  | 'seniors' // 65+
  | 'pregnant'
  | 'immunocompromised'

/** One weekly observation: [week-ending Saturday ISO date, value]. */
export type Point = [string, number | null]

export interface Series {
  /** Globally unique and stable, e.g. "cdc-nssp:ed:influenza:county:27053". */
  id: string
  /** Source id (see SourceStatus.id). */
  source: string
  /** Dataset id within the source, e.g. "nssp-ed-county". */
  dataset: string
  pathogen: PathogenId
  metric: MetricKind
  unit: Unit
  geo: GeoRef
  /** Age band when the series is age-specific (raw label from the source, e.g. "0-4 years"). */
  age?: string
  /** Short human label, e.g. "Flu — % of ED visits". */
  label: string
  /** Sorted ascending by date, unique dates. */
  points: Point[]
  /** Points on/after this date are preliminary and likely to be revised. */
  provisionalFrom?: string
  /** Free-text caveat shown with the chart. */
  note?: string
  /**
   * The publisher's own classification of the latest week, when it provides one
   * (e.g. CDC NSSP trend "Increasing", CDC wastewater category "Moderate", CDC Rt "Likely growing").
   * The analysis prefers these over its own computed level/trend.
   */
  official?: {
    level?: ActivityLevel
    trend?: TrendDirection
    /** Publisher's wording, shown verbatim (e.g. "Likely growing"). */
    label?: string
    /** Week the classification applies to. */
    asOf?: string
    /** e.g. "CDC NSSP", "CDC NWSS WVAL". */
    by?: string
  }
  /** Extra identifying attributes (e.g. HSA name, plant name, assay) shown in tooltips. */
  attrs?: Record<string, string>
  /**
   * Plain-language fact derived by MN Pulse from the source (not the publisher's own wording),
   * e.g. "119 cases so far in 2026 vs 1,125 by this week in 2025".
   */
  summary?: string
  /**
   * Publisher-defined activity cut-points for this exact measure and place (lower bounds of each
   * level), e.g. CDC's PRISM respiratory-activity thresholds for Minnesota. Used to classify the
   * latest value and drawn as reference bands on charts.
   */
  thresholds?: ActivityThresholds
}

export interface ActivityThresholds {
  low: number
  moderate: number
  high: number
  veryHigh: number
  /** Who defined them, e.g. "CDC respiratory activity levels (PRISM, 2026-09-04)". */
  by: string
}

/** A dataset file: public/data/series/<file>.json */
export interface SeriesFile {
  source: string
  dataset: string
  generatedAt: string
  series: Series[]
}

export interface QuantileForecastPoint {
  /** Target week-ending date. */
  date: string
  horizon: number
  median: number
  lo50: number
  hi50: number
  lo80?: number
  hi80?: number
  lo95: number
  hi95: number
}

export interface Forecast {
  id: string
  /** 'mn-pulse' for our own projection; 'cdc-flusight' / 'cdc-covidhub' / 'cdc-rsvhub' for CDC ensembles. */
  source: string
  model: string
  /** Series this forecast extends (same metric/geo/units). */
  seriesId: string
  pathogen: PathogenId
  metric: MetricKind
  geo: GeoRef
  /** Last observed week used (or the hub reference date). */
  referenceDate: string
  issuedAt: string
  points: QuantileForecastPoint[]
  /** Backtest skill of our projection by horizon, when computed. */
  skill?: { horizon: number; n: number; mae: number; relMae: number; coverage95: number }[]
  method?: string
  note?: string
}

export interface ForecastFile {
  generatedAt: string
  forecasts: Forecast[]
}

export type SourceState = 'ok' | 'stale' | 'error' | 'disabled' | 'pending'

export interface SourceStatus {
  id: string
  name: string
  publisher: string
  url: string
  description: string
  geography: string
  cadence: string
  state: SourceState
  /** ISO datetime of the last successful fetch. */
  lastSuccess?: string
  lastAttempt?: string
  /** Most recent observation date across this source's series. */
  latestData?: string
  message?: string
  seriesCount: number
  datasets: string[]
  attribution?: string
}

export interface Manifest {
  generatedAt: string
  /** Data files available, relative to public/data/. */
  files: { path: string; source: string; dataset: string; series: number; bytes: number }[]
  sources: SourceStatus[]
}

// ───────────────────────── Derived "pulse" analytics (public/data/pulse.json) ─────────────────────────

export type ActivityLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'very-high' | 'unknown'
export type TrendDirection = 'rising-fast' | 'rising' | 'steady' | 'falling' | 'falling-fast' | 'unknown'

export interface SignalSummary {
  seriesId: string
  source: string
  /** Short publisher/system name for display, e.g. "CDC NSSP (ER visits)". */
  sourceName: string
  label: string
  metric: MetricKind
  unit: Unit
  geo: GeoRef
  latestDate: string
  latestValue: number
  previousValue?: number
  /** Relative change vs. ~2 weeks earlier (0.25 = +25%). */
  change2w?: number
  /** Percentile (0–100) of the latest value within this series' historical weekly values. */
  percentile?: number
  /** Latest value divided by the median of the past ~3 years (e.g. 3.2 = "3.2× its usual level"). */
  vsTypical?: number
  level: ActivityLevel
  trend: TrendDirection
  /** How the level was determined, e.g. "MDH RESP-NET threshold" or "vs. 3 prior seasons". */
  levelBasis: string
  /** Last ~16 points for sparklines. */
  spark: Point[]
  stale: boolean
  /** Copied from the series for tooltips/headlines (e.g. HSA, plants). */
  attrs?: Record<string, string>
  note?: string
}

export interface PathogenPulse {
  pathogen: PathogenId
  level: ActivityLevel
  trend: TrendDirection
  /** 0–100 composite used for ranking the watch list. */
  score: number
  headline: string
  primary?: SignalSummary
  signals: SignalSummary[]
  /** Projected direction over the next ~3 weeks from the primary signal's forecast. */
  outlook?: { direction: TrendDirection; text: string; forecastId: string }
  asOf?: string
}

export interface CountyMetric {
  seriesId: string
  value: number | null
  date: string
  level?: ActivityLevel
  trend?: TrendDirection
}

export interface CountyPulse {
  fips: string
  /** Keyed by map layer id, e.g. "ed:influenza", "ed:covid", "ww:covid". */
  metrics: Record<string, CountyMetric>
}

export interface MapLayer {
  id: string
  /** 'county' = choropleth over counties; 'site' = point markers (e.g. wastewater plants). */
  kind: 'county' | 'site'
  label: string
  pathogen: PathogenId
  metric: MetricKind
  unit: Unit
  source: string
  description: string
  latestDate?: string
}

/** A point feature such as a wastewater treatment plant. */
export interface SitePulse {
  id: string
  name: string
  coord?: [number, number]
  counties?: string[]
  population?: number
  /** Keyed by layer id, e.g. "ww:covid". */
  metrics: Record<string, CountyMetric>
}

export interface PulseFile {
  generatedAt: string
  statewide: {
    level: ActivityLevel
    trend: TrendDirection
    headline: string
    watchList: PathogenId[]
  }
  pathogens: PathogenPulse[]
  mapLayers: MapLayer[]
  counties: CountyPulse[]
  sites: SitePulse[]
}
