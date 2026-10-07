// STUB — replaced by the map implementation. Props are the stable contract other views use.
import type { PulseFile } from '../../../shared/types'

export interface CountyMapProps {
  pulse: PulseFile
  /** Map layer id from pulse.mapLayers (county or site layer). */
  layerId: string
  /** Selected county FIPS. */
  selected?: string | null
  onSelect?: (fips: string | null) => void
  /** Color counties by activity level (default) or by raw value. */
  mode?: 'level' | 'value'
  /** Overlay wastewater sites from pulse.sites. */
  showSites?: boolean
  height?: number
  /** Compact = no legend/controls (used for the mini map on the overview). */
  compact?: boolean
}

export function CountyMap({ height = 480 }: CountyMapProps) {
  return <div style={{ height }} />
}
