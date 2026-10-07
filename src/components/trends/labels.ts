// Small display labels used by the Trends explorer and its CSV export. Kept free of React, the content
// registry and the DOM so the CSV module (and its tests) stay light.
import type { Forecast, GeoRef } from '../../../shared/types'
import { MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'

export function geoLabel(g: GeoRef): string {
  if (g.type === 'county') {
    const c = MN_COUNTY_BY_FIPS[g.code]
    if (c) return `${c.name} County`
  }
  return g.name
}

export function forecastSourceName(f: Pick<Forecast, 'source' | 'model'>): string {
  switch (f.source) {
    case 'mn-pulse':
      return 'MN Pulse projection'
    case 'cdc-flusight':
      return 'CDC FluSight ensemble'
    case 'cdc-covidhub':
      return 'CDC COVID-19 Forecast Hub ensemble'
    case 'cdc-rsvhub':
      return 'CDC RSV Forecast Hub ensemble'
    default:
      return f.model
  }
}
