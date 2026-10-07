// Clinical / public-health content model for pathogen profiles.
// Content is written for the general public (about 8th-grade reading level), is Minnesota-aware,
// and every profile cites authoritative sources (CDC, MDH, AAP, IDSA, ACOG, FDA labels).
// It is educational, not medical advice.
import type { AgeGroupId, PathogenCategory, PathogenId } from '../../shared/types'

export type RiskTier = 'lower' | 'moderate' | 'higher' | 'highest'

/** Age/population groups that get tailored guidance (everything except 'all'). */
export type GuidanceGroup = Exclude<AgeGroupId, 'all'>

export interface AgeGuidance {
  /** Relative risk of severe illness for this group compared with the general population. */
  risk: RiskTier
  /** What this pathogen typically means for this group (1–3 plain-language sentences). */
  summary: string
  /** Specific, actionable steps for this group (2–5 short imperative bullets). */
  actions: string[]
}

export interface TreatmentOption {
  /** e.g. "Oseltamivir (Tamiflu)". */
  name: string
  type: 'antiviral' | 'antibiotic' | 'antiparasitic' | 'monoclonal-antibody' | 'supportive' | 'other'
  /** When and how it is used, timing windows, key cautions. */
  detail: string
  /** Who it is recommended for. */
  who?: string
}

export interface VaccineInfo {
  name: string
  /** Who is eligible/recommended, in plain language. */
  who: string
  notes?: string
}

export interface SourceLink {
  label: string
  url: string
}

export interface PathogenProfile {
  id: PathogenId
  /** Full display name, e.g. "Respiratory syncytial virus (RSV)". */
  name: string
  /** Compact label for cards and chart legends, e.g. "RSV". */
  shortName: string
  aka?: string[]
  category: PathogenCategory
  kind: 'virus' | 'bacterium' | 'parasite' | 'syndrome'
  /** BioFire FilmArray panel target names covered by this profile (exact panel wording). */
  biofireTargets?: string[]
  /** ≤ 140 characters, plain language. */
  oneLiner: string
  /** 2–4 sentences: what it is and why it matters. */
  overview: string
  seasonality: {
    /** Minnesota-specific timing in plain language. */
    summary: string
    /** Typical peak months in Minnesota, 1 = January. */
    peakMonths: number[]
  }
  transmission: string
  incubation: string
  contagiousPeriod: string
  symptoms: {
    common: string[]
    lessCommon: string[]
    /** Emergency warning signs — seek care immediately. */
    emergencyWarningSigns: string[]
  }
  ageGroups: Record<GuidanceGroup, AgeGuidance>
  treatment: {
    summary: string
    options: TreatmentOption[]
    /** Whether antibiotics help: 'no' for viruses (unless a secondary bacterial infection). */
    antibioticsHelp: 'yes' | 'no' | 'sometimes'
  }
  prevention: {
    vaccines: VaccineInfo[]
    everyday: string[]
  }
  /** How it is diagnosed/tested, incl. home tests where relevant. */
  testing: string
  /** When to call a clinician (non-emergency) vs. go to urgent care. */
  whenToSeekCare: string[]
  /**
   * How to read this pathogen's surveillance numbers: what typical off-season vs. peak values look like
   * for test positivity / BioFire detection rate / ED visits, and what a rise means for an average person.
   */
  readingTheNumbers: string
  /** Current Minnesota-relevant notes as of lastReviewed (outbreaks, new products, guidance changes). */
  watchNotes?: string[]
  sources: SourceLink[]
  /** ISO date the content was last checked against sources. */
  lastReviewed: string
}
