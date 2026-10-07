import { describe, expect, it } from 'vitest'
import {
  epiweekNumber, epiweekToDate, mmwrWeekEnding, mmwrWeekOf, seasonOf, seasonWeekEnding,
  weekEndingSaturday, weekOfSeason, weeksInMmwrYear,
} from '../shared/mmwr'

describe('mmwr', () => {
  it('computes week 1 boundaries', () => {
    expect(mmwrWeekOf('2023-12-31')).toEqual({ year: 2024, week: 1 })
    expect(mmwrWeekOf('2024-01-06')).toEqual({ year: 2024, week: 1 })
    expect(mmwrWeekOf('2024-12-29')).toEqual({ year: 2025, week: 1 })
    expect(mmwrWeekOf('2026-01-03')).toEqual({ year: 2025, week: 53 })
    expect(mmwrWeekOf('2026-01-04')).toEqual({ year: 2026, week: 1 })
  })
  it('knows 53-week years', () => {
    expect(weeksInMmwrYear(2020)).toBe(53)
    expect(weeksInMmwrYear(2025)).toBe(53)
    expect(weeksInMmwrYear(2024)).toBe(52)
    expect(mmwrWeekEnding(2020, 53)).toBe('2021-01-02')
  })
  it('maps week-ending dates and epiweeks', () => {
    expect(mmwrWeekEnding(2026, 40)).toBe('2026-10-10')
    expect(weekEndingSaturday('2026-10-07')).toBe('2026-10-10')
    expect(weekEndingSaturday('2026-10-10')).toBe('2026-10-10')
    expect(epiweekNumber('2026-10-07')).toBe(202640)
    expect(epiweekToDate(202640)).toBe('2026-10-10')
  })
  it('handles seasons', () => {
    expect(seasonOf('2026-10-10')).toBe('2026-27')
    expect(seasonOf('2026-10-03')).toBe('2025-26')
    expect(seasonOf('2027-03-01')).toBe('2026-27')
    expect(weekOfSeason('2026-10-10')).toBe(0)
    expect(weekOfSeason('2026-01-03')).toBe(13) // 2025 has 53 weeks: wk53 → 53-40
    expect(weekOfSeason('2026-01-10')).toBe(14)
    expect(seasonWeekEnding('2026-27', 0)).toBe('2026-10-10')
    expect(seasonWeekEnding('2026-27', 1)).toBe('2026-10-17')
  })
})
