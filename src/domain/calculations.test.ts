import { describe, expect, it } from 'vitest'
import { calculateHistory, densityPerSquareMeter, preparationDays, round } from './calculations'
import { reportPonds } from '../data/reportData'

describe('report-backed calculations', () => {
  const v01 = reportPonds[0]

  it('reproduces V01 general information', () => {
    expect(densityPerSquareMeter(v01)).toBe(30)
    expect(preparationDays(v01)).toBe(30)
  })

  it('reproduces all six populated V01 rows after display rounding', () => {
    const history = calculateHistory(v01)

    const expected = [
      { day: 36, growth: 3.5, avg: 0.68, survival: 65, feed100: 26, biomass: 340, fca: 0.75 },
      { day: 43, growth: 0.1, avg: 0.59, survival: 81, feed100: 27, biomass: 440, fca: 0.83 },
      { day: 54, growth: 1.3, avg: 0.64, survival: 67, feed100: 33, biomass: 489, fca: 1.25 },
      { day: 62, growth: 0.6, avg: 0.62, survival: 61, feed100: 33, biomass: 500, fca: 1.46 },
      { day: 68, growth: 1.6, avg: 0.73, survival: 48, feed100: 37, biomass: 514, fca: 1.53 },
      { day: 75, growth: 2.0, avg: 0.85, survival: 31, feed100: 48, biomass: 429, fca: 2.0 },
    ]

    history.forEach((row, index) => {
      expect(row.cultivationDay).toBe(expected[index].day)
      expect(round(row.growthG, 1)).toBe(expected[index].growth)
      expect(round(row.averageGrowthPerWeekG, 2)).toBe(expected[index].avg)
      expect(round(row.survivalPercent)).toBe(expected[index].survival)
      expect(round(row.feedFor100Kg)).toBe(expected[index].feed100)
      expect(round(row.biomassKg)).toBe(expected[index].biomass)
      expect(round(row.fca, 2)).toBe(expected[index].fca)
    })
  })
})
