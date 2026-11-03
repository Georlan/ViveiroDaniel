import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup } from '../storage'
import { populationAtDate, removePondWithTransfers } from './calculations'
import { reportPonds } from '../data/reportData'
import type { Pond, PopulationMovement } from '../types'

const outgoing: PopulationMovement = {
  transferId: 'tx-to-v02', date: '2026-10-22', direction: 'out',
  animals: 78_000, averageWeightG: 3.4, biomassKg: 265.2,
  counterpartPondId: 'v02', counterpartPondName: 'Viveiro 2',
}
const incoming: PopulationMovement = {
  ...outgoing, direction: 'in', counterpartPondId: 'v01', counterpartPondName: 'V01',
}
const unrelated: PopulationMovement = {
  ...outgoing, transferId: 'tx-to-v03', animals: 3_000,
  counterpartPondId: 'v03', counterpartPondName: 'V03',
}
const origin: Pond = {
  ...reportPonds[0], id: 'v01', initialPopulation: 156_000,
  populationMovements: [outgoing, unrelated], biometries: [...reportPonds[0].biometries],
}
const destination: Pond = {
  ...reportPonds[0], id: 'v02', name: 'Viveiro 2', initialPopulation: 78_000,
  populationMovements: [incoming], productUsages: [
    { id:'used', date:'2026-10-22', product:'Produto teste', quantity:1, unit:'kg' },
  ],
}
const sibling: Pond = { ...reportPonds[0], id: 'v03', name: 'V03', populationMovements: [] }

describe('explicit pond deletion', () => {
  it('deletes only the selected pond and undoes linked bookkeeping movements', () => {
    const original = [origin, destination, sibling]
    const priorStock = populationAtDate(origin, '2026-11-03')
    const next = removePondWithTransfers(original, 'v02')
    expect(next.map(p => p.id)).toEqual(['v01', 'v03'])
    expect(next[0].populationMovements).toEqual([unrelated])
    expect(populationAtDate(next[0], '2026-11-03')).toBe(priorStock + 78_000)
    expect(next[0].biometries).toEqual(origin.biometries)
    expect(next[1]).toBe(sibling)
    expect(original).toHaveLength(3)
    expect(origin.populationMovements).toEqual([outgoing, unrelated])
    expect(parseBackup(createBackup(next)).map(p => p.id)).toEqual(['v01', 'v03'])
  })

  it('preserves unrelated transfers and does not touch data for an unknown ID', () => {
    const original = [origin, destination, sibling]
    expect(removePondWithTransfers(original, 'missing')).toBe(original)
    const afterOriginDeletion = removePondWithTransfers(original, 'v01')
    expect(afterOriginDeletion.map(p => p.id)).toEqual(['v02', 'v03'])
    expect(afterOriginDeletion[0].populationMovements).toEqual([])
    expect(destination.populationMovements).toEqual([incoming])
  })

  it('deletes only the requested pond even when names match', () => {
    const other = { ...sibling, name: 'Viveiro 2' }
    expect(removePondWithTransfers([destination, other], 'v02')).toEqual([other])
  })
})
