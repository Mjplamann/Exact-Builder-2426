// Pathogen profile registry. Every file in ./pathogens/ default-exports a PathogenProfile and is
// picked up automatically.
import type { PathogenId } from '../../shared/types'
import type { PathogenProfile } from './types'

const modules = import.meta.glob<{ default: PathogenProfile }>('./pathogens/*.ts', { eager: true })

export const PROFILES: PathogenProfile[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name))

const BY_ID = new Map<PathogenId, PathogenProfile>(PROFILES.map((p) => [p.id, p]))

/** Sub-types that share a parent profile. */
const ALIASES: Partial<Record<PathogenId, PathogenId>> = {
  'influenza-a': 'influenza',
  'influenza-b': 'influenza',
}

export function getProfile(id: PathogenId | undefined): PathogenProfile | undefined {
  if (!id) return undefined
  return BY_ID.get(id) ?? BY_ID.get(ALIASES[id] ?? id)
}

/** Display name for any pathogen id, falling back to a readable version of the id. */
export function pathogenName(id: PathogenId, short = true): string {
  const p = getProfile(id)
  if (p && (id === p.id || !ALIASES[id])) return short ? p.shortName : p.name
  const FALLBACK: Partial<Record<PathogenId, string>> = {
    'influenza-a': 'Flu A',
    'influenza-b': 'Flu B',
    'respiratory-combined': 'Respiratory illness (all)',
    ili: 'Influenza-like illness',
  }
  return FALLBACK[id] ?? id.replace(/-/g, ' ')
}
