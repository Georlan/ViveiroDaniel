import type { ProductUsage } from '../types'

export type ProductUsageAggregate = {
  key: string
  product: string
  dimension: 'mass' | 'volume'
  totalBase: number
  monthBase: number
  uses: number
  lastDate: string
  preferredUnit: ProductUsage['unit']
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

function unitDimension(unit: ProductUsage['unit']) {
  return unit === 'g' || unit === 'kg' ? 'mass' : 'volume'
}

function toBase(quantity: number, unit: ProductUsage['unit']) {
  if (unit === 'kg' || unit === 'L') return quantity * 1000
  return quantity
}

export function aggregateProductUsages(usages: ProductUsage[], month: string) {
  const map = new Map<string, ProductUsageAggregate>()

  for (const usage of usages) {
    const dimension = unitDimension(usage.unit)
    const key = normalizeName(usage.product) + '|' + dimension
    const baseQuantity = toBase(usage.quantity, usage.unit)
    const current = map.get(key)

    if (!current) {
      map.set(key, {
        key,
        product: usage.product.trim(),
        dimension,
        totalBase: baseQuantity,
        monthBase: usage.date.slice(0, 7) === month ? baseQuantity : 0,
        uses: 1,
        lastDate: usage.date,
        preferredUnit: usage.unit,
      })
      continue
    }

    current.totalBase += baseQuantity
    if (usage.date.slice(0, 7) === month) current.monthBase += baseQuantity
    current.uses += 1

    if (usage.date >= current.lastDate) {
      current.lastDate = usage.date
      current.product = usage.product.trim()
      current.preferredUnit = usage.unit
    }
  }

  return [...map.values()].sort((a, b) => a.product.localeCompare(b.product, 'pt-BR'))
}

export function findRegisteredProduct(
  usages: ProductUsage[],
  productName: string,
) {
  const wanted = normalizeName(productName)
  if (!wanted) return null

  const matches = usages
    .filter((usage) => normalizeName(usage.product) === wanted)
    .sort((a, b) => b.date.localeCompare(a.date))

  return matches[0] ?? null
}

export function formatProductAmount(
  baseQuantity: number,
  dimension: ProductUsageAggregate['dimension'],
) {
  const useLargeUnit = baseQuantity >= 1000
  const value = useLargeUnit ? baseQuantity / 1000 : baseQuantity
  const unit =
    dimension === 'mass'
      ? useLargeUnit
        ? 'kg'
        : 'g'
      : useLargeUnit
        ? 'L'
        : 'mL'

  return { value, unit }
}
