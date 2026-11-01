import type { BiometryInput, CalculatedBiometry, Pond } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

function utcDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function daysBetween(start: string, end: string) {
  return Math.round((utcDay(end) - utcDay(start)) / DAY_MS)
}

const SQUARE_METERS_PER_HECTARE = 10_000

export function squareMetersFromHectares(areaHa: number) {
  return areaHa * SQUARE_METERS_PER_HECTARE
}

export function hectaresFromSquareMeters(areaM2: number) {
  return areaM2 / SQUARE_METERS_PER_HECTARE
}

// A densidade é a população registrada dividida pela área do viveiro.
// Pode ser calculada para a população inicial ou para o saldo após transferências.
// Não representa uma contagem dos animais vivos.
export function densityPerSquareMeter(
  pond: Pick<Pond, 'areaHa' | 'initialPopulation'>,
  population = pond.initialPopulation,
) {
  if (pond.areaHa <= 0 || population < 0 || !Number.isFinite(population)) return 0
  return population / squareMetersFromHectares(pond.areaHa)
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

export function biomassFromAnimals(animals: number, averageWeightG: number) {
  // Quantidade × gramas por animal = gramas; 1 kg = 1.000 g.
  return animals * averageWeightG / 1_000
}

export function averageWeightFromSample(totalWeightG: number, sampleCount: number) {
  if (totalWeightG <= 0 || sampleCount <= 0) return 0
  return totalWeightG / sampleCount
}

// A prévia e o salvamento só devem considerar campos realmente preenchidos.
// Number('') seria 0 e geraria um resultado enganoso antes de informar a ração.
export function isCompleteSimpleBiometryDraft(draft: {
  date: string
  sampleTotalWeightG: string
  sampleCount: string
  dailyFeedKg: string
  periodFeedKg: string
}) {
  const values = [
    draft.sampleTotalWeightG,
    draft.sampleCount,
    draft.dailyFeedKg,
    draft.periodFeedKg,
  ]

  if (!draft.date || values.some((value) => !value.trim())) return false

  const [sampleWeight, sampleCount, dailyFeed, periodFeed] = values.map(Number)
  return (
    Number.isFinite(sampleWeight) && sampleWeight > 0 &&
    Number.isInteger(sampleCount) && sampleCount > 0 &&
    Number.isFinite(dailyFeed) && dailyFeed >= 0 &&
    Number.isFinite(periodFeed) && periodFeed >= 0
  )
}

// O total acumulado no intervalo inclui o dia da biometria. Por definição,
 // a soma de vários dias não pode ser menor que o consumo do dia informado.
export function isFeedPeriodInconsistent(dailyFeedKg: number, periodFeedKg: number) {
  return (
    Number.isFinite(dailyFeedKg) &&
    Number.isFinite(periodFeedKg) &&
    dailyFeedKg > 0 &&
    periodFeedKg >= 0 &&
    periodFeedKg + 1e-9 < dailyFeedKg
  )
}

export function accumulatedFeedFromPeriod(previousAccumulatedKg: number, periodFeedKg: number) {
  return Math.max(0, previousAccumulatedKg) + Math.max(0, periodFeedKg)
}

/** Referência legada, sem procedência validada; não aplicar automaticamente. */
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

// Ao editar, uma taxa armazenada precisa continuar explícita. A tabela interna
// histórica não tem contexto validado e não deve reinterpretar o registro.
export function manualFeedRateForEdit(initial?: BiometryInput) {
  return initial && Number.isFinite(initial.feedRatePercent) && initial.feedRatePercent>0
    ? String(initial.feedRatePercent) : ''
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

// Cada transferId representa um único evento em cada direção. Registros
// repetidos no mesmo viveiro não podem duplicar a população do controle.
export function populationBalanceAtDate(pond: Pick<Pond, 'initialPopulation' | 'populationMovements'>, date: string) {
  const counted = new Set<string>()
  let incomingAnimals = 0
  let outgoingAnimals = 0

  for (const movement of pond.populationMovements ?? []) {
    if (movement.date > date) continue
    const key = movement.transferId + ':' + movement.direction
    if (counted.has(key)) continue
    counted.add(key)
    if (movement.direction === 'in') incomingAnimals += movement.animals
    else outgoingAnimals += movement.animals
  }

  return {
    initialPopulation: pond.initialPopulation,
    incomingAnimals,
    outgoingAnimals,
    population: pond.initialPopulation + incomingAnimals - outgoingAnimals,
  }
}

export function populationAtDate(pond: Pick<Pond, 'initialPopulation' | 'populationMovements'>, date: string) {
  return populationBalanceAtDate(pond, date).population
}

export function technicalMetricsStatus(
  pond: Pick<Pond, 'initialPopulation' | 'populationMovements'>,
  input: Pick<BiometryInput, 'currentWeightG' | 'feedRatePercent' | 'dailyFeedKg' | 'accumulatedFeedKg'> & { populationAtDate?: number; date?: string },
) {
  const population = typeof input.populationAtDate === 'number'
    ? input.populationAtDate
    : pond.initialPopulation
  const maximumBiomassKg = theoreticalBiomassAt100Kg({ initialPopulation: population }, input.currentWeightG)

  if (input.feedRatePercent <= 0) {
    return {
      hasFeedRate: false,
      hasCalculatedValues: false,
      isPlausible: false,
      maximumBiomassKg,
      biomassKg: null,
      survivalPercent: null,
      feedFor100Kg: null,
      fca: null,
      feedToStandingBiomassRatio: null,
    }
  }

  const feedRate = input.feedRatePercent / 100
  const feedFor100Kg = maximumBiomassKg * feedRate
  const biomassKg = input.dailyFeedKg / feedRate
  const survivalPercent = feedFor100Kg > 0 ? (input.dailyFeedKg / feedFor100Kg) * 100 : 0
  // Sem histórico de ração atribuído a cada lote, o consumo acumulado
  // não pode ser dividido apenas pela biomassa atual após transferências.
  const hasTransfers = !!input.date && (pond.populationMovements ?? []).some(
    (movement) => movement.date <= input.date!,
  )
  const feedToStandingBiomassRatio = hasTransfers ? null : biomassKg > 0 ? input.accumulatedFeedKg / biomassKg : null
  const tolerance = 0.000001
  // Um cálculo pode existir matematicamente, mesmo sem validar a hipótese de taxa.
  // Separar disponibilidade de plausibilidade evita deixar o painel sem informação.
  const hasCalculatedValues =
    input.dailyFeedKg > 0 &&
    maximumBiomassKg > 0 &&
    Number.isFinite(biomassKg) &&
    Number.isFinite(survivalPercent) &&
    (feedToStandingBiomassRatio === null || Number.isFinite(feedToStandingBiomassRatio))
  const isPlausible =
    hasCalculatedValues &&
    biomassKg <= maximumBiomassKg + tolerance &&
    survivalPercent <= 100 + tolerance

  return {
    hasFeedRate: true,
    hasCalculatedValues,
    isPlausible,
    maximumBiomassKg,
    biomassKg,
    survivalPercent,
    feedFor100Kg,
    fca: null,
    feedToStandingBiomassRatio,
  }
}

export function calculateBiometry(
  pond: Pick<Pond, 'initialPopulation' | 'stockingDate' | 'populationMovements'>,
  input: BiometryInput,
  previousWeightG: number | null,
  previousDate?: string | null,
): CalculatedBiometry {
  const cultivationDay = Math.max(1, daysBetween(pond.stockingDate, input.date) + 1)
  const feedRate = input.feedRatePercent / 100

  const populationAtMeasurement = populationAtDate(pond, input.date)
  const theoreticalBiomassAt100 = theoreticalBiomassAt100Kg(
    { initialPopulation: populationAtMeasurement }, input.currentWeightG,
  )
  const feedFor100Kg = theoreticalBiomassAt100 * feedRate
  const survivalPercent = feedFor100Kg > 0 ? (input.dailyFeedKg / feedFor100Kg) * 100 : 0
  const biomassKg = feedRate > 0 ? input.dailyFeedKg / feedRate : 0
  // Razão histórica reproduz o relatório, mas não é um FCA validado:
  // o denominador é inferido da própria ração, sem ganho independente.
  const feedToStandingBiomassRatio = biomassKg > 0 ? input.accumulatedFeedKg / biomassKg : null
  const elapsed = previousDate ? daysBetween(previousDate,input.date) : null
  const comparable = elapsed!==null && elapsed>0 && previousWeightG!==null &&
    Number.isFinite(previousWeightG) && previousWeightG>0 && Number.isFinite(input.currentWeightG) && input.currentWeightG>0
  const growthG = comparable ? input.currentWeightG-previousWeightG! : null

  return {
    ...input,
    cultivationDay,
    previousWeightG,
    growthG,
    intervalDays: comparable ? elapsed : null,
    growthPerDayG: growthG!==null && elapsed ? growthG/elapsed : null,
    averageGrowthPerWeekG: growthG!==null && elapsed ? growthG/elapsed*7 : null,
    feedFor100Kg,
    survivalPercent,
    biomassKg,
    fca: null,
    feedToStandingBiomassRatio,
    populationAtDate: populationAtMeasurement,
  }
}

export function calculateHistory(pond: Pond) {
  // Leitura não reconstrói os acumulados: valores contraditórios são evidência
  // que o operador precisa revisar. A normalização da cadeia é explícita ao salvar.
  const ordered = [...pond.biometries].sort((a,b)=>a.date.localeCompare(b.date)).map(input=>({
    ...input,
    currentWeightG: input.sampleTotalWeightG!=null && input.sampleCount!=null &&
      Number.isFinite(input.sampleTotalWeightG) && input.sampleTotalWeightG>0 &&
      Number.isInteger(input.sampleCount) && input.sampleCount>0
      ? averageWeightFromSample(input.sampleTotalWeightG,input.sampleCount) : input.currentWeightG,
  }))
  return ordered.map((input, index) =>
    calculateBiometry(
      pond,
      input,
      index > 0 ? ordered[index - 1].currentWeightG : null,
      index > 0 ? ordered[index - 1].date : null,
    ),
  )
}

export function compareBiometriesForDisplay(
  previous: CalculatedBiometry,
  current: CalculatedBiometry,
) {
  return {
    // Arredonde só a diferença: 3,14 - 2,27 = 0,87, não 3,1 - 2,3 = 0,8.
    weightG: round(current.currentWeightG - previous.currentWeightG, 2),
    biomassKg: round(current.biomassKg) - round(previous.biomassKg),
    survivalPercentagePoints:
      round(current.survivalPercent) - round(previous.survivalPercent),
    fca: null,
  }
}

export function round(value: number, decimals = 0) {
  const factor = 10 ** decimals
  // Apenas apresentação: elimina ruído binário na meia unidade decimal.
  // Empates são arredondados para longe de zero, também em diferenças negativas.
  const scaled=Number((value*factor).toPrecision(15))
  return Math.sign(scaled)*Math.round(Math.abs(scaled))/factor
}
