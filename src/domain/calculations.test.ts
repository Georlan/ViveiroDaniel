import { describe, expect, it } from 'vitest'
import {
  accumulatedFeedFromPeriod,
  averageWeightFromSample,
  calculateHistory,
  compareBiometriesForDisplay,
  densityPerSquareMeter,
  normalizeBiometryInputs,
  preparationDays,
  round,
  suggestFeedRatePercent,
} from './calculations'
import { reportPonds } from '../data/reportData'
import type { BiometryInput, Pond } from '../types'

const HISTORICAL_FORMULA_FIXTURE: BiometryInput[] = [
  { id: 'v01-36', date: '2026-06-13', currentWeightG: 3.5, feedRatePercent: 5, dailyFeedKg: 17, accumulatedFeedKg: 255 },
  { id: 'v01-43', date: '2026-06-20', currentWeightG: 3.6, feedRatePercent: 5, dailyFeedKg: 22, accumulatedFeedKg: 367 },
  { id: 'v01-54', date: '2026-07-01', currentWeightG: 4.9, feedRatePercent: 4.5, dailyFeedKg: 22, accumulatedFeedKg: 611 },
  { id: 'v01-62', date: '2026-07-09', currentWeightG: 5.5, feedRatePercent: 4, dailyFeedKg: 20, accumulatedFeedKg: 731 },
  { id: 'v01-68', date: '2026-07-15', currentWeightG: 7.1, feedRatePercent: 3.5, dailyFeedKg: 18, accumulatedFeedKg: 788 },
  { id: 'v01-75', date: '2026-07-22', currentWeightG: 9.1, feedRatePercent: 3.5, dailyFeedKg: 15, accumulatedFeedKg: 857 },
]

const HISTORICAL_FORMULA_POND: Pond = {
  dataVersion: 2,
  id: 'formula-fixture',
  name: 'Fixture',
  areaHa: 0.5,
  initialPopulation: 150000,
  laboratory: 'fixture',
  stockingDate: '2026-05-09',
  cycleStartDate: '2026-04-09',
  cycle: 1,
  feeder: '',
  plPerGram: null,
  biometries: HISTORICAL_FORMULA_FIXTURE,
}

describe('pond calculations', () => {
  const v01 = reportPonds[0]

  it('starts the current V01 as a clean first-biometry setup', () => {
    expect(reportPonds).toHaveLength(1)
    expect(v01.dataVersion).toBe(2)
    expect(v01.initialPopulation).toBe(220000)
    expect(v01.laboratory).toBe('ACQUAVALE')
    expect(v01.stockingDate).toBe('2026-09-04')
    expect(v01.cycle).toBe(5)
    expect(v01.biometries).toEqual([])
    expect(v01.plannedBiometries).toEqual([])
    expect(v01.reportReferenceDate).toBeNull()
  })

  it('calculates current static pond facts from the configured data', () => {
    expect(densityPerSquareMeter(v01)).toBe(44)
    expect(preparationDays(v01)).toBe(16)
  })

  it('reconstructs the simple manual workflow from a formula fixture', () => {
    expect(averageWeightFromSample(303, 33)).toBeCloseTo(9.1818, 4)
    expect(accumulatedFeedFromPeriod(788, 69)).toBe(857)

    const suggested = suggestFeedRatePercent(9.18, HISTORICAL_FORMULA_FIXTURE)
    expect(suggested).toBe(3.5)
  })

  it('does not invent a feed-rate suggestion without real cycle history', () => {
    expect(suggestFeedRatePercent(0, HISTORICAL_FORMULA_FIXTURE)).toBeNull()
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

  it('keeps explicit accumulated values as anchors when rebuilding the chain', () => {
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

  it('keeps last-change summaries consistent with the historical formula fixture', () => {
    const history = calculateHistory(HISTORICAL_FORMULA_POND)
    const delta = compareBiometriesForDisplay(history[4], history[5])

    expect(delta).toEqual({
      weightG: 2,
      biomassKg: -85,
      survivalPercentagePoints: -17,
      fca: 0.47,
    })
  })

  it('keeps the original formula reconstruction covered without exposing it as current data', () => {
    const history = calculateHistory(HISTORICAL_FORMULA_POND)
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
