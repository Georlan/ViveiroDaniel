export type BiometryInput = {
  id: string
  date: string
  currentWeightG: number
  feedRatePercent: number
  dailyFeedKg: number
  accumulatedFeedKg: number
  sampleTotalWeightG?: number | null
  sampleCount?: number | null
  periodFeedKg?: number | null
}

export type PlannedBiometry = {
  date: string
  cultivationDay: number
}

export type Pond = {
  id: string
  name: string
  areaHa: number
  initialPopulation: number
  laboratory: string
  stockingDate: string
  cycleStartDate: string
  cycle: number
  feeder: string
  plPerGram: number | null
  reportReferenceDate?: string | null
  plannedBiometries?: PlannedBiometry[]
  biometries: BiometryInput[]
}

export type CalculatedBiometry = BiometryInput & {
  cultivationDay: number
  previousWeightG: number | null
  growthG: number
  averageGrowthPerWeekG: number
  feedFor100Kg: number
  survivalPercent: number
  biomassKg: number
  fca: number
}
