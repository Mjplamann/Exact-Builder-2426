// URL hash <-> app state: round trips and hostile input. A bad link must never throw or produce a state the
// views cannot render (it falls back to defaults instead).
import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, isAppHash, parseHash, toHash, type AppState } from '../src/lib/route'
import { AUDIENCES } from '../src/lib/audiences'

const state = (patch: Partial<AppState>): AppState => ({ ...DEFAULT_STATE, geo: { ...DEFAULT_STATE.geo }, ...patch })

describe('toHash / parseHash round trip', () => {
  const cases: AppState[] = [
    state({}),
    state({ view: 'map', geo: { type: 'county', code: '27053' } }),
    state({ view: 'trends', range: '2y', audience: 'seniors' }),
    state({ view: 'trends', geo: { type: 'county', code: '27109' }, range: '5y' }),
    state({ view: 'pathogens', category: 'gastrointestinal' }),
    state({ view: 'pathogen', pathogenId: 'rhino-entero', audience: 'infants' }),
    state({ view: 'learn' }),
    state({ view: 'sources' }),
    state({ view: 'trends', geo: { type: 'mdh-region', code: 'Metro' } }),
    state({ view: 'trends', geo: { type: 'mdh-region', code: '100%' } }),
    state({ view: 'trends', geo: { type: 'mdh-region', code: 'Central & West: a/b?c' } }),
  ]
  for (const s of cases) {
    it(`round-trips ${toHash(s)}`, () => {
      expect(parseHash(toHash(s))).toEqual(s)
    })
  }

  it('omits defaults from the hash', () => {
    expect(toHash(state({}))).toBe('#/pulse')
    expect(toHash(state({ view: 'map' }))).toBe('#/map')
  })

  it('round-trips every audience', () => {
    for (const a of AUDIENCES) expect(parseHash(toHash(state({ audience: a.id }))).audience).toBe(a.id)
  })

  it('defaults to a 6-month range', () => {
    expect(DEFAULT_STATE.range).toBe('6m')
    expect(parseHash('#/trends').range).toBe('6m')
    expect(parseHash('#/trends?range=1y').range).toBe('1y')
  })
})

describe('parseHash with hostile or stale input', () => {
  const noThrow = (hash: string) => {
    let s: AppState | undefined
    expect(() => {
      s = parseHash(hash)
    }).not.toThrow()
    return s!
  }

  it('ignores prototype keys and unknown audiences', () => {
    expect(noThrow('#/?for=constructor').audience).toBe('all')
    expect(noThrow('#/?for=__proto__').audience).toBe('all')
    expect(noThrow('#/?for=toString').audience).toBe('all')
    expect(noThrow('#/?for=martians').audience).toBe('all')
  })

  it('ignores unknown categories and ranges', () => {
    expect(noThrow('#/pathogens?cat=constructor').category).toBe('all')
    expect(noThrow('#/pathogens?cat=hasOwnProperty').category).toBe('all')
    expect(noThrow('#/trends?range=constructor').range).toBe(DEFAULT_STATE.range)
    expect(noThrow('#/trends?range=10y').range).toBe(DEFAULT_STATE.range)
  })

  it('survives malformed percent-escapes', () => {
    const s = noThrow('#/pathogens/%E0%A4%A')
    expect(s.view).toBe('pathogens')
    expect(s.pathogenId).toBeUndefined()
    expect(noThrow('#/trends?geo=mdh-region:%E0%A4%A').view).toBe('trends')
    expect(noThrow('#/%').view).toBe('pulse')
  })

  it('does not decode mdh-region twice', () => {
    // URLSearchParams decodes %25 to "%"; a second decode of "100%" used to throw "URI malformed".
    const s = noThrow('#/trends?geo=mdh-region:100%25')
    expect(s.geo).toEqual({ type: 'mdh-region', code: '100%' })
    expect(noThrow('#/trends?geo=mdh-region%3A100%2525').geo).toEqual({ type: 'mdh-region', code: '100%25' })
  })

  it('accepts only known illness ids', () => {
    expect(noThrow('#/pathogens/influenza')).toMatchObject({ view: 'pathogen', pathogenId: 'influenza' })
    for (const bad of ['#/pathogens/constructor', '#/pathogens/__proto__', '#/pathogens/not-a-bug']) {
      const s = noThrow(bad)
      expect(s.view).toBe('pathogens')
      expect(s.pathogenId).toBeUndefined()
    }
    expect(noThrow('#/pathogen').view).toBe('pathogens')
  })

  it('validates geography', () => {
    expect(noThrow('#/map?geo=county:99999').geo).toEqual({ type: 'state', code: '27' })
    expect(noThrow('#/map?geo=county:').geo).toEqual({ type: 'state', code: '27' })
    expect(noThrow('#/map?geo=planet:mars').geo).toEqual({ type: 'state', code: '27' })
    expect(noThrow(`#/map?geo=mdh-region:${'x'.repeat(500)}`).geo).toEqual({ type: 'state', code: '27' })
  })

  it('treats unknown views and in-page anchors as Pulse', () => {
    expect(noThrow('#/nowhere').view).toBe('pulse')
    expect(noThrow('#main').view).toBe('pulse')
    expect(noThrow('').view).toBe('pulse')
  })
})

describe('isAppHash', () => {
  it('owns route hashes only', () => {
    expect(isAppHash('')).toBe(true)
    expect(isAppHash('#')).toBe(true)
    expect(isAppHash('#/')).toBe(true)
    expect(isAppHash('#/trends?range=2y')).toBe(true)
    expect(isAppHash('#main')).toBe(false)
    expect(isAppHash('#sec-symptoms')).toBe(false)
  })
})
