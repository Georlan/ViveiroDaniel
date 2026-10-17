import type { BiometryInput, CalculatedBiometry, Pond } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

function utcDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function daysBetween(start: string, end: string) {
  return Math.round((utcDay(end) - utcDay(start)) / DAY_MS)
}

export function densityPerSquareMeter(pond: Pick<Pond, 'areaHa' | 'initialPopulation'>) {
  if (pond.areaHa <= 0) return 0
  return pond.initialPopulation / (pond.areaHa * 10_000)
}

export function preparationDays(pond: Pick<Pond, 'cycleStartDate' | 'stockingDate'>) {
  return daysBetween(pond.cycleStartDate, pond.stockingDate)
}

export function cultivationDaysAtReference(
  pond: Pick<Pond, 'stockingDate' | 'reportReferenceDate'>,
) {
  if (!pond.reportReferenceDate) return null
  return Math.max(0, daysBetween(pond.stockingDate, pond.reportReferenceDate))
}

export function cycleDaysAtReference(
  pond: Pick<Pond, 'cycleStartDate' | 'reportReferenceDate'>,
) {
  if (!pond.reportReferenceDate) return null
  return Math.max(0, daysBetween(pond.cycleStartDate, pond.reportReferenceDate))
}

export function averageWeightFromSample(totalWeightG: number, sampleCount: number) {
  if (totalWeightG <= 0 || sampleCount <= 0) return 0
  return totalWeightG / sampleCount
}

export function accumulatedFeedFromPeriod(previousAccumulatedKg: number, periodFeedKg: number) {
  return Math.max(0, previousAccumulatedKg) + Math.max(0, periodFeedKg)
}

export const FEED_RATE_BY_WEIGHT = [
  { weightG: 0.2, ratePercent: 8.6 },
  { weightG: 0.5, ratePercent: 7.6 },
  { weightG: 1, ratePercent: 6.9 },
  { weightG: 2, ratePercent: 5.3 },
  { weightG: 3, ratePercent: 4.5 },
  { weightG: 4, ratePercent: 4.1 },
  { weightG: 5, ratePercent: 3.6 },
  { weightG: 6, ratePercent: 3.4 },
  { weightG: 7, ratePercent: 3.1 },
  { weightG: 8, ratePercent: 2.9 },
  { weightG: 9, ratePercent: 2.8 },
  { weightG: 10, ratePercent: 2.7 },
  { weightG: 11, ratePercent: 2.5 },
  { weightG: 12, ratePercent: 2.4 },
  { weightG: 13, ratePercent: 2.3 },
  { weightG: 14, ratePercent: 2.3 },
  { weightG: 15, ratePercent: 2.2 },
  { weightG: 16, ratePercent: 2.1 },
  { weightG: 17, ratePercent: 2.1 },
  { weightG: 18, ratePercent: 2.0 },
  { weightG: 19, ratePercent: 2.0 },
  { weightG: 20, ratePercent: 1.9 },
  { weightG: 21, ratePercent: 1.9 },
  { weightG: 22, ratePercent: 1.8 },
  { weightG: 23, ratePercent: 1.8 },
  { weightG: 24, ratePercent: 1.8 },
  { weightG: 25, ratePercent: 1.7 },
  { weightG: 26, ratePercent: 1.7 },
  { weightG: 27, ratePercent: 1.6 },
  { weightG: 28, ratePercent: 1.6 },
  { weightG: 29, ratePercent: 1.6 },
  { weightG: 30, ratePercent: 1.5 },
] as const

export function feedRateFromWeightTable(currentWeightG: number) {
  if (
    currentWeightG < FEED_RATE_BY_WEIGHT[0].weightG ||
    currentWeightG > FEED_RATE_BY_WEIGHT[FEED_RATE_BY_WEIGHT.length - 1].weightG
  ) {
    return null
  }

  return FEED_RATE_BY_WEIGHT.reduce((nearest, item) => {
    const nearestDistance = Math.abs(nearest.weightG - currentWeightG)
    const itemDistance = Math.abs(item.weightG - currentWeightG)
    return itemDistance < nearestDistance ? item : nearest
  })
}

export function suggestFeedRatePercent(
  currentWeightG: number,
  reference: Array<Pick<BiometryInput, 'currentWeightG' | 'feedRatePercent'>>,
) {
  const usableReference = reference.filter((item) => item.feedRatePercent > 0)
  if (currentWeightG <= 0 || usableReference.length === 0) return null

  return usableReference.reduce((nearest, item) => {
    const nearestDistance = Math.abs(nearest.currentWeightG - currentWeightG)
    const itemDistance = Math.abs(item.currentWeightG - currentWeightG)
    return itemDistance < nearestDistance ? item : nearest
  }).feedRatePercent
}

export function normalizeBiometryInputs(biometries: BiometryInput[]) {
  const ordered = [...biometries].sort((a, b) => a.date.localeCompare(b.date))
  let previousAccumulatedKg = 0

  return ordered.map((input) => {
    const normalized: BiometryInput = { ...input }

    if (
      input.sampleTotalWeightG != null &&
      input.sampleCount != null &&
      input.sampleTotalWeightG > 0 &&
      input.sampleCount > 0
    ) {
      normalized.currentWeightG = averageWeightFromSample(
        input.sampleTotalWeightG,
        input.sampleCount,
      )
    }

    if (input.periodFeedKg != null) {
      normalized.accumulatedFeedKg = accumulatedFeedFromPeriod(
        previousAccumulatedKg,
        input.periodFeedKg,
      )
    }

    previousAccumulatedKg = normalized.accumulatedFeedKg
    return normalized
  })
}

export function theoreticalBiomassAt100Kg(
  pond: Pick<Pond, 'initialPopulation'>,
  currentWeightG: number,
) {
  if (pond.initialPopulation <= 0 || currentWeightG <= 0) return 0
  return (pond.initialPopulation * currentWeightG) / 1000
}

export function technicalMetricsStatus(
  pond: Pick<Pond, 'initialPopulation'>,
  input: Pick<BiometryInput, 'currentWeightG' | 'feedRatePercent' | 'dailyFeedKg' | 'accumulatedFeedKg'>,
) {
  const maximumBiomassKg = theoreticalBiomassAt100Kg(pond, input.currentWeightG)

  if (input.feedRatePercent <= 0) {
    return {
      hasFeedRate: false,
      isPlausible: false,
      maximumBiomassKg,
      biomassKg: null,
      survivalPercent: null,
      feedFor100Kg: null,
      fca: null,
    }
  }

  const feedRate = input.feedRatePercent / 100
  const feedFor100Kg = maximumBiomassKg * feedRate
  const biomassKg = input.dailyFeedKg / feedRate
  const survivalPercent = feedFor100Kg > 0 ? (input.dailyFeedKg / feedFor100Kg) * 100 : 0
  const fca = biomassKg > 0 ? input.accumulatedFeedKg / biomassKg : 0
  const tolerance = 0.000001
  const isPlausible =
    biomassKg <= maximumBiomassKg + tolerance &&
    survivalPercent <= 100 + tolerance

  return {
    hasFeedRate: true,
    isPlausible,
    maximumBiomassKg,
    biomassKg,
    survivalPercent,
    feedFor100Kg,
    fca,
  }
}

export function calculateBiometry(
  pond: Pick<Pond, 'initialPopulation' | 'stockingDate'>,
  input: BiometryInput,
  previousWeightG: number | null,
): CalculatedBiometry {
  const cultivationDay = Math.max(1, daysBetween(pond.stockingDate, input.date) + 1)
  const feedRate = input.feedRatePercent / 100

  const theoreticalBiomassAt100 = theoreticalBiomassAt100Kg(pond, input.currentWeightG)
  const feedFor100Kg = theoreticalBiomassAt100 * feedRate
  const survivalPercent = feedFor100Kg > 0 ? (input.dailyFeedKg / feedFor100Kg) * 100 : 0
  const biomassKg = feedRate > 0 ? input.dailyFeedKg / feedRate : 0
  const fca = biomassKg > 0 ? input.accumulatedFeedKg / biomassKg : 0

  return {
    ...input,
    cultivationDay,
    previousWeightG,
    growthG:
      previousWeightG === null
        ? input.currentWeightG
        : input.currentWeightG - previousWeightG,
    averageGrowthPerWeekG: input.currentWeightG / (cultivationDay / 7),
    feedFor100Kg,
    survivalPercent,
    biomassKg,
    fca,
  }
}

export function calculateHistory(pond: Pond) {
  const ordered = normalizeBiometryInputs(pond.biometries)
  return ordered.map((input, index) =>
    calculateBiometry(
      pond,
      input,
      index > 0 ? ordered[index - 1].currentWeightG : null,
    ),
  )
}

export function compareBiometriesForDisplay(
  previous: CalculatedBiometry,
  current: CalculatedBiometry,
) {
  return {
    weightG: round(current.currentWeightG, 1) - round(previous.currentWeightG, 1),
    biomassKg: round(current.biomassKg) - round(previous.biomassKg),
    survivalPercentagePoints:
      round(current.survivalPercent) - round(previous.survivalPercent),
    fca: round(
      round(current.fca, 2) - round(previous.fca, 2),
      2,
    ),
  }
}

export function round(value: number, decimals = 0) {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}
