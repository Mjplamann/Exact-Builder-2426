// BIOFIRE® FILMARRAY® panel targets → MN Pulse pathogen ids.
//
// Targets come from the RP2.1 (respiratory, 22 targets) and GI (gastrointestinal, 22 targets) panels.
// `code` is the canonical organism code used in the MN Pulse long CSV format (data/manual/biofire/README.md).
// `aliases` are the target names as BioFire writes them (exports, file names, reports); matching is done on a
// normalized form (lower case, punctuation → space), so "Influenza A/H1-2009" and "Influenza A H1 2009" match.
// Targets with `pathogen: null` are recognized (so they are not reported as unknown) but not tracked by MN Pulse.
import type { PathogenId } from '../../shared/types.ts'

export type BiofirePanel = 'RP' | 'GI'

export interface OrganismDef {
  code: string
  /** Short display name used in series labels. */
  name: string
  /** BioFire's own target name. */
  label: string
  panel: BiofirePanel
  pathogen: PathogenId | null
  /** Sub-target discriminator (series id suffix), e.g. 'h3' for Influenza A/H3. */
  variant?: string
  aliases: string[]
  /** Extra phrases recognized only in free text (USMA report narrative). */
  textAliases?: string[]
}

export const ORGANISMS: OrganismDef[] = [
  // ── Respiratory (RP2.1) ──
  { code: 'ADV', name: 'Adenovirus', label: 'Adenovirus', panel: 'RP', pathogen: 'adenovirus', aliases: ['Adenovirus', 'ADV', 'AdV'] },
  { code: 'COV', name: 'Seasonal coronaviruses', label: 'Coronavirus (229E/HKU1/NL63/OC43)', panel: 'RP', pathogen: 'seasonal-cov',
    aliases: ['Coronavirus', 'Coronaviruses', 'Seasonal Coronavirus', 'Seasonal Coronaviruses', 'Seasonal CoV', 'Seasonal CoVs', 'Human Coronavirus', 'Endemic Coronavirus', 'Endemic Coronaviruses', 'Common cold coronaviruses'] },
  { code: 'COV_229E', name: 'Seasonal coronavirus 229E', label: 'Coronavirus 229E', panel: 'RP', pathogen: 'seasonal-cov', variant: '229e', aliases: ['Coronavirus 229E', 'CoV 229E', 'HCoV 229E', 'Human Coronavirus 229E'] },
  { code: 'COV_HKU1', name: 'Seasonal coronavirus HKU1', label: 'Coronavirus HKU1', panel: 'RP', pathogen: 'seasonal-cov', variant: 'hku1', aliases: ['Coronavirus HKU1', 'CoV HKU1', 'HCoV HKU1', 'Human Coronavirus HKU1'] },
  { code: 'COV_NL63', name: 'Seasonal coronavirus NL63', label: 'Coronavirus NL63', panel: 'RP', pathogen: 'seasonal-cov', variant: 'nl63', aliases: ['Coronavirus NL63', 'CoV NL63', 'HCoV NL63', 'Human Coronavirus NL63'] },
  { code: 'COV_OC43', name: 'Seasonal coronavirus OC43', label: 'Coronavirus OC43', panel: 'RP', pathogen: 'seasonal-cov', variant: 'oc43', aliases: ['Coronavirus OC43', 'CoV OC43', 'HCoV OC43', 'Human Coronavirus OC43'] },
  { code: 'SARS2', name: 'COVID-19 (SARS-CoV-2)', label: 'Severe Acute Respiratory Syndrome Coronavirus 2 (SARS-CoV-2)', panel: 'RP', pathogen: 'covid',
    aliases: ['SARS-CoV-2', 'SARS CoV 2', 'SARSCoV2', 'Severe Acute Respiratory Syndrome Coronavirus 2', 'COVID-19'] },
  { code: 'HMPV', name: 'hMPV', label: 'Human Metapneumovirus', panel: 'RP', pathogen: 'hmpv', aliases: ['Human Metapneumovirus', 'Metapneumovirus', 'hMPV', 'MPV'] },
  { code: 'RVEV', name: 'Rhinovirus/enterovirus', label: 'Human Rhinovirus/Enterovirus', panel: 'RP', pathogen: 'rhino-entero',
    aliases: ['Human Rhinovirus/Enterovirus', 'Rhinovirus/Enterovirus', 'Human Rhinovirus Enterovirus', 'Rhinovirus Enterovirus', 'HRV/EV', 'RV/EV', 'HRV EV', 'RV EV', 'Rhino/Entero', 'Rhinovirus'] },
  { code: 'FLU', name: 'Flu (A and B)', label: 'Influenza (A and B)', panel: 'RP', pathogen: 'influenza', aliases: ['Influenza', 'Influenza A and B', 'Influenza A/B', 'Flu A/B', 'Flu'] },
  { code: 'FLUA', name: 'Flu A', label: 'Influenza A', panel: 'RP', pathogen: 'influenza-a', aliases: ['Influenza A', 'Flu A', 'FluA', 'Influenza A virus'] },
  { code: 'FLUA_H1', name: 'Flu A (H1)', label: 'Influenza A/H1', panel: 'RP', pathogen: 'influenza-a', variant: 'h1', aliases: ['Influenza A/H1', 'Influenza A H1', 'Flu A H1', 'Flu A/H1'] },
  { code: 'FLUA_H1_2009', name: 'Flu A (H1-2009)', label: 'Influenza A/H1-2009', panel: 'RP', pathogen: 'influenza-a', variant: 'h1-2009',
    aliases: ['Influenza A/H1-2009', 'Influenza A H1-2009', 'Influenza A H1 2009', 'Influenza A/H1N1pdm09', 'Influenza A H1N1pdm09', 'Flu A H1-2009', 'Flu A/H1-2009', 'H1-2009', 'H1N1pdm09'] },
  { code: 'FLUA_H3', name: 'Flu A (H3)', label: 'Influenza A/H3', panel: 'RP', pathogen: 'influenza-a', variant: 'h3', aliases: ['Influenza A/H3', 'Influenza A H3', 'Flu A H3', 'Flu A/H3', 'Influenza A/H3N2', 'Influenza A H3N2'] },
  { code: 'FLUA_NOSUB', name: 'Flu A (no subtype detected)', label: 'Influenza A (no subtype detected)', panel: 'RP', pathogen: 'influenza-a', variant: 'unsubtyped',
    aliases: ['Influenza A (no subtype detected)', 'Influenza A no subtype detected', 'Influenza A no subtype', 'Influenza A unsubtyped'] },
  { code: 'FLUB', name: 'Flu B', label: 'Influenza B', panel: 'RP', pathogen: 'influenza-b', aliases: ['Influenza B', 'Flu B', 'FluB', 'Influenza B virus'] },
  { code: 'PIV', name: 'Parainfluenza', label: 'Parainfluenza Virus (1–4)', panel: 'RP', pathogen: 'parainfluenza',
    aliases: ['Parainfluenza', 'Parainfluenza Virus', 'Parainfluenza Viruses', 'Human Parainfluenza Virus', 'PIV', 'HPIV', 'Parainfluenza 1-4', 'PIV 1-4', 'PIV1-4'] },
  { code: 'PIV1', name: 'Parainfluenza 1', label: 'Parainfluenza Virus 1', panel: 'RP', pathogen: 'parainfluenza', variant: 'piv1', aliases: ['Parainfluenza Virus 1', 'Parainfluenza 1', 'PIV1', 'PIV 1', 'HPIV1', 'HPIV 1'] },
  { code: 'PIV2', name: 'Parainfluenza 2', label: 'Parainfluenza Virus 2', panel: 'RP', pathogen: 'parainfluenza', variant: 'piv2', aliases: ['Parainfluenza Virus 2', 'Parainfluenza 2', 'PIV2', 'PIV 2', 'HPIV2', 'HPIV 2'] },
  { code: 'PIV3', name: 'Parainfluenza 3', label: 'Parainfluenza Virus 3', panel: 'RP', pathogen: 'parainfluenza', variant: 'piv3', aliases: ['Parainfluenza Virus 3', 'Parainfluenza 3', 'PIV3', 'PIV 3', 'HPIV3', 'HPIV 3'] },
  { code: 'PIV4', name: 'Parainfluenza 4', label: 'Parainfluenza Virus 4', panel: 'RP', pathogen: 'parainfluenza', variant: 'piv4', aliases: ['Parainfluenza Virus 4', 'Parainfluenza 4', 'PIV4', 'PIV 4', 'HPIV4', 'HPIV 4'] },
  { code: 'RSV', name: 'RSV', label: 'Respiratory Syncytial Virus', panel: 'RP', pathogen: 'rsv', aliases: ['Respiratory Syncytial Virus', 'RSV', 'Human Respiratory Syncytial Virus'] },
  { code: 'BPERT', name: 'Whooping cough (B. pertussis)', label: 'Bordetella pertussis (ptxP)', panel: 'RP', pathogen: 'pertussis',
    aliases: ['Bordetella pertussis', 'Bordetella pertussis (ptxP)', 'Bordetella pertussis ptxP', 'B. pertussis', 'B pertussis', 'Pertussis'] },
  { code: 'BPARA', name: 'B. parapertussis', label: 'Bordetella parapertussis (IS1001)', panel: 'RP', pathogen: null,
    aliases: ['Bordetella parapertussis', 'Bordetella parapertussis (IS1001)', 'Bordetella parapertussis IS1001', 'B. parapertussis', 'B parapertussis', 'Parapertussis'] },
  { code: 'CPNEU', name: 'Chlamydia pneumoniae', label: 'Chlamydia pneumoniae', panel: 'RP', pathogen: 'chlamydia-pneumoniae',
    aliases: ['Chlamydia pneumoniae', 'Chlamydophila pneumoniae', 'C. pneumoniae', 'C pneumoniae'] },
  { code: 'MPNEU', name: 'Mycoplasma pneumoniae', label: 'Mycoplasma pneumoniae', panel: 'RP', pathogen: 'mycoplasma',
    aliases: ['Mycoplasma pneumoniae', 'M. pneumoniae', 'M pneumoniae', 'Mycoplasma'] },

  // ── Gastrointestinal (GI) ──
  { code: 'NORO', name: 'Norovirus', label: 'Norovirus GI/GII', panel: 'GI', pathogen: 'norovirus', aliases: ['Norovirus GI/GII', 'Norovirus', 'Norovirus GI GII', 'Noro'] },
  { code: 'ROTA', name: 'Rotavirus', label: 'Rotavirus A', panel: 'GI', pathogen: 'rotavirus', aliases: ['Rotavirus A', 'Rotavirus'] },
  { code: 'SAPO', name: 'Sapovirus', label: 'Sapovirus (I, II, IV, V)', panel: 'GI', pathogen: 'sapovirus', aliases: ['Sapovirus', 'Sapovirus (I, II, IV, V)', 'Sapovirus I II IV V'] },
  { code: 'ASTRO', name: 'Astrovirus', label: 'Astrovirus', panel: 'GI', pathogen: 'astrovirus', aliases: ['Astrovirus'] },
  { code: 'ADV_F4041', name: 'Adenovirus F40/41', label: 'Adenovirus F40/41', panel: 'GI', pathogen: 'adenovirus-gi',
    aliases: ['Adenovirus F40/41', 'Adenovirus F 40/41', 'Adenovirus F40 41', 'Adenovirus F4041', 'Adenovirus 40/41', 'Adenovirus 40 41', 'Enteric Adenovirus'] },
  { code: 'SALM', name: 'Salmonella', label: 'Salmonella', panel: 'GI', pathogen: 'salmonella', aliases: ['Salmonella', 'Salmonella spp'] },
  { code: 'CAMPY', name: 'Campylobacter', label: 'Campylobacter (jejuni, coli, and upsaliensis)', panel: 'GI', pathogen: 'campylobacter',
    aliases: ['Campylobacter', 'Campylobacter (jejuni, coli, and upsaliensis)', 'Campylobacter jejuni coli and upsaliensis', 'Campylobacter spp'] },
  { code: 'STEC', name: 'Shiga toxin–producing E. coli', label: 'Shiga-like toxin-producing E. coli (STEC) stx1/stx2', panel: 'GI', pathogen: 'stec',
    aliases: ['Shiga-like toxin-producing E. coli (STEC) stx1/stx2', 'Shiga-like toxin-producing E. coli (STEC)', 'Shiga-like toxin-producing E. coli', 'Shiga toxin-producing E. coli', 'STEC', 'STEC stx1/stx2'] },
  { code: 'ECOLI_O157', name: 'E. coli O157', label: 'E. coli O157', panel: 'GI', pathogen: 'stec', variant: 'o157', aliases: ['E. coli O157', 'E coli O157', 'Escherichia coli O157', 'O157'] },
  { code: 'SHIG_EIEC', name: 'Shigella/EIEC', label: 'Shigella/Enteroinvasive E. coli (EIEC)', panel: 'GI', pathogen: 'shigella',
    aliases: ['Shigella/Enteroinvasive E. coli (EIEC)', 'Shigella/Enteroinvasive E. coli', 'Shigella/EIEC', 'Shigella EIEC', 'Shigella'] },
  { code: 'CDIFF', name: 'C. difficile', label: 'Clostridioides difficile (toxin A/B)', panel: 'GI', pathogen: 'c-diff',
    aliases: ['Clostridioides difficile (toxin A/B)', 'Clostridioides difficile toxin A/B', 'Clostridioides difficile', 'Clostridium difficile', 'C. difficile', 'C difficile', 'C. diff', 'C diff'] },
  { code: 'CYCLO', name: 'Cyclospora', label: 'Cyclospora cayetanensis', panel: 'GI', pathogen: 'cyclospora', aliases: ['Cyclospora cayetanensis', 'Cyclospora'] },
  { code: 'GIARDIA', name: 'Giardia', label: 'Giardia lamblia', panel: 'GI', pathogen: 'giardia', aliases: ['Giardia lamblia', 'Giardia duodenalis', 'Giardia'] },
  { code: 'CRYPTO', name: 'Cryptosporidium', label: 'Cryptosporidium', panel: 'GI', pathogen: 'cryptosporidium', aliases: ['Cryptosporidium', 'Crypto'] },
  // Recognized GI targets that MN Pulse does not track.
  { code: 'PLES', name: 'Plesiomonas shigelloides', label: 'Plesiomonas shigelloides', panel: 'GI', pathogen: null, aliases: ['Plesiomonas shigelloides', 'Plesiomonas'] },
  { code: 'VIBRIO', name: 'Vibrio', label: 'Vibrio (parahaemolyticus, vulnificus, and cholerae)', panel: 'GI', pathogen: null,
    aliases: ['Vibrio', 'Vibrio (parahaemolyticus, vulnificus, and cholerae)', 'Vibrio parahaemolyticus vulnificus and cholerae', 'Vibrio spp'] },
  { code: 'VCHOL', name: 'Vibrio cholerae', label: 'Vibrio cholerae', panel: 'GI', pathogen: null, aliases: ['Vibrio cholerae', 'V. cholerae'] },
  { code: 'YERS', name: 'Yersinia enterocolitica', label: 'Yersinia enterocolitica', panel: 'GI', pathogen: null, aliases: ['Yersinia enterocolitica', 'Yersinia'] },
  { code: 'EAEC', name: 'EAEC', label: 'Enteroaggregative E. coli (EAEC)', panel: 'GI', pathogen: null, aliases: ['Enteroaggregative E. coli (EAEC)', 'Enteroaggregative E. coli', 'EAEC'] },
  { code: 'EPEC', name: 'EPEC', label: 'Enteropathogenic E. coli (EPEC)', panel: 'GI', pathogen: null, aliases: ['Enteropathogenic E. coli (EPEC)', 'Enteropathogenic E. coli', 'EPEC'] },
  { code: 'ETEC', name: 'ETEC', label: 'Enterotoxigenic E. coli (ETEC) lt/st', panel: 'GI', pathogen: null,
    aliases: ['Enterotoxigenic E. coli (ETEC) lt/st', 'Enterotoxigenic E. coli (ETEC)', 'Enterotoxigenic E. coli', 'ETEC', 'ETEC lt/st'] },
  { code: 'EHIST', name: 'Entamoeba histolytica', label: 'Entamoeba histolytica', panel: 'GI', pathogen: null, aliases: ['Entamoeba histolytica', 'E. histolytica', 'Entamoeba'] },
]

export const ORGANISM_BY_CODE = new Map(ORGANISMS.map((o) => [o.code, o]))

/** Lower-case, punctuation → single spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[®™]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const ALIAS_INDEX = new Map<string, OrganismDef[]>()
for (const o of ORGANISMS) {
  for (const a of [o.label, o.name, o.code.replace(/_/g, ' '), ...o.aliases]) {
    const k = normalizeName(a)
    const list = ALIAS_INDEX.get(k) ?? []
    if (!list.includes(o)) list.push(o)
    ALIAS_INDEX.set(k, list)
  }
}

function pick(list: OrganismDef[] | undefined, panel?: BiofirePanel): OrganismDef | null {
  if (!list?.length) return null
  if (list.length === 1) return list[0]
  return (panel && list.find((o) => o.panel === panel)) || list[0]
}

/**
 * Resolve an organism code or BioFire target name (exact match after normalization; no substring guessing).
 * `panel` disambiguates names shared by both panels: plain "Adenovirus" on the GI panel is Adenovirus F40/41.
 */
export function matchOrganism(raw: string | undefined | null, panel?: BiofirePanel): OrganismDef | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  const byCode = ORGANISM_BY_CODE.get(s.toUpperCase().replace(/[\s-]+/g, '_'))
  if (byCode) return panel === 'GI' && byCode.code === 'ADV' ? ORGANISM_BY_CODE.get('ADV_F4041')! : byCode
  const candidates = [s, s.replace(/\([^)]*\)/g, ' '), s.replace(/^human\s+/i, ''), s.replace(/\s+detection\s+rates?$/i, '')]
  for (const c of candidates) {
    const hit = pick(ALIAS_INDEX.get(normalizeName(c)), panel)
    if (hit) {
      if (panel === 'GI' && hit.code === 'ADV') return ORGANISM_BY_CODE.get('ADV_F4041')!
      return hit
    }
  }
  return null
}

/** Normalize a free-text panel value ('RP2.1', 'Respiratory', 'GI', ...). */
export function normalizePanel(raw: string | undefined | null): BiofirePanel | undefined {
  if (!raw) return undefined
  const s = raw.trim().toLowerCase()
  if (!s) return undefined
  if (/^(gi|gastro)/.test(s)) return 'GI'
  if (/^(rp|resp)/.test(s)) return 'RP'
  return undefined
}

// ── Free-text matching (report narrative) ──

interface TextPattern {
  def: OrganismDef
  re: RegExp
  len: number
}

function phraseRegex(phrase: string): RegExp {
  const body = phrase
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[-\\s]?').replace(/\//g, '\\s*\\/\\s*'))
    .join('[\\s-]+')
  // Very short all-caps tokens (RSV, PIV, EV...) are matched case-sensitively to avoid hitting ordinary words.
  const caseSensitive = phrase.length <= 5 && phrase === phrase.toUpperCase()
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, caseSensitive ? 'g' : 'gi')
}

const TEXT_PATTERNS: TextPattern[] = (() => {
  const out: TextPattern[] = []
  const skip = new Set(['flu', 'crypto', 'noro', 'o157', 'mpv', 'coronavirus', 'rhinovirus', 'mycoplasma', 'pertussis', 'shigella', 'entamoeba', 'yersinia', 'plesiomonas', 'vibrio'])
  for (const o of ORGANISMS) {
    const phrases = new Set([o.label, ...o.aliases, ...(o.textAliases ?? [])])
    for (const p of phrases) {
      const n = normalizeName(p)
      if (n.length < 3 || skip.has(n) || /\(/.test(p)) continue
      out.push({ def: o, re: phraseRegex(p), len: p.length })
    }
  }
  // Generic single words are allowed in text only when nothing longer matched at that position.
  for (const [word, code] of [
    ['Mycoplasma', 'MPNEU'], ['Pertussis', 'BPERT'], ['Shigella', 'SHIG_EIEC'], ['Rhinovirus', 'RVEV'], ['norovirus', 'NORO'],
  ] as const) {
    out.push({ def: ORGANISM_BY_CODE.get(code)!, re: phraseRegex(word), len: word.length })
  }
  return out.sort((a, b) => b.len - a.len)
})()

export interface TextOrganismHit {
  def: OrganismDef
  index: number
  length: number
  /**
   * True for plain "adenovirus" when the panel is unknown: it could be respiratory adenovirus or GI
   * Adenovirus F40/41, so callers must not use the value.
   */
  ambiguous?: boolean
}

/** Panel named explicitly in a piece of text ("GI panels", "gastrointestinal", "respiratory panel", "RP2.1"). */
export function panelInText(text: string): BiofirePanel | undefined {
  const gi = /\b(?:GI|gastrointestinal)\s+(?:panels?|tests?|testing|pathogens?|results?|samples?|specimens?)\b|\bgastrointestinal\b|\bgastroenteritis\b|\bstool\b/i.test(text)
  const rp = /\brespiratory\s+(?:panels?|tests?|testing|pathogens?|results?|samples?|specimens?|viruses?|season)\b|\bRP2(?:\.1)?\b/i.test(text)
  return gi === rp ? undefined : gi ? 'GI' : 'RP'
}

/** Panel from a report file name ("...-Respiratory-Report-...", "...-GI-Report-..."). */
export function panelFromName(name: string): BiofirePanel | undefined {
  const gi = /gastro|(?:^|[^A-Za-z])GI(?:[^A-Za-z]|$)/i.test(name)
  const rp = /respiratory|(?:^|[^A-Za-z])RP(?:2|[^A-Za-z]|$)/i.test(name)
  return gi === rp ? undefined : gi ? 'GI' : 'RP'
}

/**
 * Find organism mentions in free text, longest phrase first, without overlaps. Plain "adenovirus" is the
 * respiratory target on the RP panel, Adenovirus F40/41 on the GI panel, and `ambiguous` when `panel` is unknown.
 */
export function findOrganismsInText(text: string, panel?: BiofirePanel): TextOrganismHit[] {
  const taken: boolean[] = new Array(text.length).fill(false)
  const hits: TextOrganismHit[] = []
  for (const p of TEXT_PATTERNS) {
    p.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = p.re.exec(text))) {
      const start = m.index
      const end = start + m[0].length
      let free = true
      for (let i = start; i < end; i++) if (taken[i]) { free = false; break }
      if (!free) continue
      for (let i = start; i < end; i++) taken[i] = true
      const hit: TextOrganismHit = { def: p.def, index: start, length: m[0].length }
      if (p.def.code === 'ADV') {
        if (panel === 'GI') hit.def = ORGANISM_BY_CODE.get('ADV_F4041')!
        else if (!panel) hit.ambiguous = true
      }
      hits.push(hit)
    }
  }
  return hits.sort((a, b) => a.index - b.index)
}
