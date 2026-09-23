import { describe, expect, it } from 'vitest'
import {
  aggregateProductUsages,
  findRegisteredProduct,
  formatProductAmount,
} from './productUsage'

describe('product usage registry', () => {
  const usages = [
    { id: '1', date: '2026-09-06', product: 'TCP', quantity: 2, unit: 'L' as const },
    { id: '2', date: '2026-09-16', product: 'tcp', quantity: 500, unit: 'mL' as const },
    { id: '3', date: '2026-08-20', product: 'N-AQUA', quantity: 200, unit: 'g' as const },
    { id: '4', date: '2026-09-11', product: 'N-AQUA', quantity: 0.3, unit: 'kg' as const },
  ]

  it('registers a product once and accumulates every use', () => {
    const products = aggregateProductUsages(usages, '2026-09')
    const tcp = products.find((item) => item.product.toLowerCase() === 'tcp')

    expect(tcp?.uses).toBe(2)
    expect(tcp?.totalBase).toBe(2500)
    expect(tcp?.monthBase).toBe(2500)
    expect(tcp?.lastDate).toBe('2026-09-16')
  })

  it('converts compatible units before accumulating', () => {
    const products = aggregateProductUsages(usages, '2026-09')
    const aqua = products.find((item) => item.product === 'N-AQUA')

    expect(aqua?.totalBase).toBe(500)
    expect(aqua?.monthBase).toBe(300)
  })

  it('finds an already registered product without caring about case', () => {
    const found = findRegisteredProduct(usages, '  Tcp ')
    expect(found?.date).toBe('2026-09-16')
    expect(found?.unit).toBe('mL')
  })

  it('formats accumulated totals for planning purchases', () => {
    expect(formatProductAmount(2500, 'volume')).toEqual({ value: 2.5, unit: 'L' })
    expect(formatProductAmount(500, 'mass')).toEqual({ value: 500, unit: 'g' })
  })
})
