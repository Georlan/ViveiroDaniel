import { describe, expect, it } from 'vitest'
import {
  accumulatedFeedFromPeriod,
  averageWeightFromSample,
  calculateHistory,
  compareBiometriesForDisplay,
  cultivationDaysAtReference,
  cycleDaysAtReference,
  densityPerSquareMeter,
  normalizeBiometryInputs,
  preparationDays,
  round,
  suggestFeedRatePercent,
} from './calculations'
import { reportPonds } from '../data/reportData'

describe('report-backed calculations', () => {
  const v01 = reportPonds[0]
  it('reproduces the current V01 general information from the report', () => {
    expect(reportPonds).toHaveLength(1)
    expect(densityPerSquareMeter(v01)).toBe(30)
    expect(preparationDays(v01)).toBe(30)
    expect(cultivationDaysAtReference(v01)).toBe(74)
    expect(cycleDaysAtReference(v01)).toBe(104)
    expect(v01.initialPopulation).toBe(150000)
  })

  it('keeps summary cultivation days separate from inclusive biometry day numbering', () => {
    const latest = calculateHistory(v01)[5]
    expect(cultivationDaysAtReference(v01)).toBe(74)
    expect(latest.cultivationDay).toBe(75)
  })

  it('reconstructs the simple manual workflow from the operational example', () => {
    expect(averageWeightFromSample(303, 33)).toBeCloseTo(9.1818, 4)
    expect(accumulatedFeedFromPeriod(788, 69)).toBe(857)

    const suggested = suggestFeedRatePercent(9.18, v01.biometries)
    expect(suggested).toBe(3.5)
  })

  it('suggests only from observed rate points and leaves the value editable in the UI', () => {
    expect(suggestFeedRatePercent(4.9, v01.biometries)).toBe(4.5)
    expect(suggestFeedRatePercent(0, v01.biometries)).toBeNull()
    expect(suggestFeedRatePercent(5, [])).toBeNull()
  })

  it('recalculates later accumulated feed when an older simple biometry is corrected', () => {
    const chain = normalizeBiometryInputs([
      {
        id: 'legacy',
        date: '2026-07-15',
        currentWeightG: 7.1,
        feedRatePercent: 3.5,
        dailyFeedKg: 18,
        accumulatedFeedKg: 788,
      },
      {
        id: 'simple-1',
        date: '2026-07-22',
        currentWeightG: 0,
        feedRatePercent: 3.5,
        dailyFeedKg: 15,
        accumulatedFeedKg: 0,
        sampleTotalWeightG: 303,
        sampleCount: 33,
        periodFeedKg: 70,
      },
      {
        id: 'simple-2',
        date: '2026-07-29',
        currentWeightG: 0,
        feedRatePercent: 3.5,
        dailyFeedKg: 20,
        accumulatedFeedKg: 0,
        sampleTotalWeightG: 663,
        sampleCount: 65,
        periodFeedKg: 90,
      },
    ])

    expect(chain[1].currentWeightG).toBeCloseTo(9.1818, 4)
    expect(chain[1].accumulatedFeedKg).toBe(858)
    expect(chain[2].currentWeightG).toBeCloseTo(10.2, 4)
    expect(chain[2].accumulatedFeedKg).toBe(948)
  })

  it('keeps explicit legacy accumulated values as anchors when rebuilding the chain', () => {
    const chain = normalizeBiometryInputs([
      {
        id: 'simple-before',
        date: '2026-06-01',
        currentWeightG: 0,
        feedRatePercent: 5,
        dailyFeedKg: 10,
        accumulatedFeedKg: 0,
        sampleTotalWeightG: 100,
        sampleCount: 20,
        periodFeedKg: 50,
      },
      {
        id: 'legacy-anchor',
        date: '2026-06-08',
        currentWeightG: 6,
        feedRatePercent: 4,
        dailyFeedKg: 12,
        accumulatedFeedKg: 300,
      },
      {
        id: 'simple-after',
        date: '2026-06-15',
        currentWeightG: 0,
        feedRatePercent: 4,
        dailyFeedKg: 13,
        accumulatedFeedKg: 0,
        sampleTotalWeightG: 140,
        sampleCount: 20,
        periodFeedKg: 40,
      },
    ])

    expect(chain[0].accumulatedFeedKg).toBe(50)
    expect(chain[1].accumulatedFeedKg).toBe(300)
    expect(chain[2].accumulatedFeedKg).toBe(340)
  })

  it('keeps last-change summaries consistent with displayed report values', () => {
    const history = calculateHistory(v01)
    const delta = compareBiometriesForDisplay(history[4], history[5])

    expect(delta).toEqual({
      weightG: 2,
      biomassKg: -85,
      survivalPercentagePoints: -17,
      fca: 0.47,
    })
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
