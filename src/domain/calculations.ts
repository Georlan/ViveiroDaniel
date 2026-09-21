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
  const ordered = [...pond.biometries].sort((a, b) => a.date.localeCompare(b.date))
  return ordered.map((input, index) =>
    calculateBiometry(
      pond,
      input,
      index > 0 ? ordered[index - 1].currentWeightG : null,
    ),
  )
}

export function round(value: number, decimals = 0) {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}
