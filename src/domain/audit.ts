import type { BiometryInput, Pond, ProductUsage } from '../types'

export type Change = {
  pond: string
  description: string
}

const pondFields: Array<[keyof Pond, string]> = [
  ['initialPopulation', 'População inicial (sem bônus)'],
  ['bonusStockedPercent', 'Bônus efetivamente povoado (%)'],
  ['areaHa', 'Área (ha)'],
  ['stockingDate', 'Data de povoamento'],
  ['cycleStartDate', 'Início do ciclo'],
  ['cycle', 'Ciclo'],
  ['laboratory', 'Laboratório'],
  ['feeder', 'Raçoador'],
  ['plPerGram', 'PL/g'],
]

const biometryFields: Array<[keyof BiometryInput, string, string]> = [
  ['date', 'Data', ''],
  ['sampleTotalWeightG', 'Peso da amostra', ' g'],
  ['sampleCount', 'Camarões amostrados', ''],
  ['currentWeightG', 'Peso médio', ' g'],
  ['dailyFeedKg', 'Ração por dia', ' kg/dia'],
  ['periodFeedKg', 'Ração no período', ' kg'],
  ['accumulatedFeedKg', 'Ração acumulada', ' kg'],
  ['feedRatePercent', 'Taxa de alimentação', '%'],
]

function displayValue(value: unknown, unit = ''): string {
  if (value === null || value === undefined || value === '') return 'não informado'
  const valueString = typeof value === 'number'
    ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value)
    : String(value)
  return valueString + unit
}

function diffBiometries(pond: string, previous: BiometryInput[], current: BiometryInput[]): Change[] {
  const changes: Change[] = []
  const beforeById = new Map(previous.map((item) => [item.id, item]))
  const afterById = new Map(current.map((item) => [item.id, item]))
  for (const value of current) {
    const before = beforeById.get(value.id)
    if (!before) {
      changes.push({
        pond,
        description: 'Biometria registrada em ' + value.date +
          ': ' + displayValue(value.currentWeightG, ' g') +
          ', ' + displayValue(value.dailyFeedKg, ' kg/dia') +
          ', ' + displayValue(value.periodFeedKg, ' kg no período') +
          ', taxa ' + displayValue(value.feedRatePercent, '%'),
      })
      continue
    }
    for (const [field, name, unit] of biometryFields) {
      if (before[field] === value[field]) continue
      changes.push({
        pond,
        description: 'Biometria de ' + value.date + ' — ' + name + ': ' +
          displayValue(before[field], unit) + ' → ' + displayValue(value[field], unit),
      })
    }
  }
  for (const value of previous) {
    if (!afterById.has(value.id)) {
      changes.push({ pond, description: 'Biometria removida: ' + value.date })
    }
  }
  return changes
}

function diffProducts(pond: string, previous: ProductUsage[], current: ProductUsage[]): Change[] {
  const changes: Change[] = []
  const priorIds = new Set(previous.map((value) => value.id))
  for (const value of current) {
    if (!priorIds.has(value.id)) {
      changes.push({
        pond,
        description: 'Produto registrado: ' + value.product + ' — ' +
          displayValue(value.quantity, ' ' + value.unit) + ', ' + value.date,
      })
    }
  }
  return changes
}

export function describeRevision(previous: Pond[], current: Pond[]): Change[] {
  const changes: Change[] = []
  const beforePonds = new Map(previous.map((pond) => [pond.id, pond]))
  const afterPonds = new Map(current.map((pond) => [pond.id, pond]))
  for (const pond of current) {
    const before = beforePonds.get(pond.id)
    if (!before) {
      changes.push({ pond: pond.name, description: 'Novo viveiro cadastrado' })
      continue
    }
    for (const [field, name] of pondFields) {
      if (before[field] === pond[field]) continue
      changes.push({
        pond: pond.name,
        description: name + ': ' + displayValue(before[field]) +
          ' → ' + displayValue(pond[field]),
      })
    }
    changes.push(...diffBiometries(pond.name, before.biometries ?? [], pond.biometries ?? []))
    changes.push(...diffProducts(pond.name, before.productUsages ?? [], pond.productUsages ?? []))
  }
  for (const pond of previous) {
    if (!afterPonds.has(pond.id)) {
      changes.push({ pond: pond.name, description: 'Viveiro removido' })
    }
  }
  return changes
}
