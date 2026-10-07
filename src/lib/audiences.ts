// Audience ("Guidance for") choices. Pure data so the URL parser can validate `for=` without pulling in UI code.
import type { AgeGroupId } from '../../shared/types'

export const AUDIENCES: { id: AgeGroupId; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'infants', label: 'Infants (<1)' },
  { id: 'children', label: 'Children (1–17)' },
  { id: 'adults', label: 'Adults (18–49)' },
  { id: 'older-adults', label: 'Adults 50–64' },
  { id: 'seniors', label: '65 and older' },
  { id: 'pregnant', label: 'Pregnant' },
  { id: 'immunocompromised', label: 'Immunocompromised' },
]

export const AUDIENCE_IDS: ReadonlySet<string> = new Set(AUDIENCES.map((a) => a.id))
