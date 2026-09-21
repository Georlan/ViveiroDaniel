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

export function suggestFeedRatePercent(
  currentWeightG: number,
  reference: Array<Pick<BiometryInput, 'currentWeightG' | 'feedRatePercent'>>,
) {
  if (currentWeightG <= 0 || reference.length === 0) return null

  return reference.reduce((nearest, item) => {
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

export function calculateBiometry(
  pond: Pick<Pond, 'initialPopulation' | 'stockingDate'>,
  input: BiometryInput,
  previousWeightG: number | null,
): CalculatedBiometry {
  const cultivationDay = Math.max(1, daysBetween(pond.stockingDate, input.date) + 1)
  const feedRate = input.feedRatePercent / 100

  const theoreticalBiomassAt100 = (pond.initialPopulation * input.currentWeightG) / 1000
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
