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
  /** Origem da taxa aplicada; registros antigos podem não informar a origem. */
  feedRateSource?: 'table' | 'manual'
}

export type PlannedBiometry = {
  date: string
  cultivationDay: number
}

export type ProductUsage = {
  id: string
  date: string
  product: string
  quantity: number
  unit: 'g' | 'kg' | 'mL' | 'L'
  note?: string
}

export type PopulationMovement = {
  transferId: string
  date: string
  direction: 'in' | 'out'
  animals: number
  averageWeightG: number
  biomassKg: number
  counterpartPondId: string
  counterpartPondName: string
}

export type Pond = {
  dataVersion?: number
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
  productUsages?: ProductUsage[]
  populationMovements?: PopulationMovement[]
}

export type CalculatedBiometry = BiometryInput & {
  cultivationDay: number
  previousWeightG: number | null
  growthG: number | null
  intervalDays: number | null
  growthPerDayG: number | null
  averageGrowthPerWeekG: number | null
  feedFor100Kg: number
  survivalPercent: number
  biomassKg: number
  /** Não disponível sem ganho independente de biomassa. */
  fca: null
  /** Razão apenas para reconciliação do relatório antigo; não é FCA. */
  feedToStandingBiomassRatio: number | null
  populationAtDate: number
}
