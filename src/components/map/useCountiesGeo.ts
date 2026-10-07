// Loads the 87-county Minnesota outline once per session, and measures container width.
import { useEffect, useRef, useState } from 'react'
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'

export interface CountyProps {
  fips: string
  name: string
  areaSqMi: number
}

export type CountyFeature = Feature<Polygon | MultiPolygon, CountyProps>
export type CountyCollection = FeatureCollection<Polygon | MultiPolygon, CountyProps>

let geoPromise: Promise<CountyCollection> | null = null

export function loadCountiesGeo(): Promise<CountyCollection> {
  if (!geoPromise) {
    const p = fetch(`${import.meta.env.BASE_URL}geo/mn-counties.geojson`).then((r) => {
      if (!r.ok) throw new Error(`Could not load the county map (HTTP ${r.status})`)
      return r.json() as Promise<CountyCollection>
    })
    p.catch(() => {
      geoPromise = null
    })
    geoPromise = p
  }
  return geoPromise
}

export function useCountiesGeo(): { geo?: CountyCollection; error?: Error } {
  const [state, setState] = useState<{ geo?: CountyCollection; error?: Error }>({})
  useEffect(() => {
    let alive = true
    loadCountiesGeo().then(
      (geo) => alive && setState({ geo }),
      (error: Error) => alive && setState({ error }),
    )
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** Observe an element's content width (0 until measured). */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      setWidth((prev) => (Math.abs(prev - w) >= 1 ? w : prev))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
