import { describe, expect, it } from 'vitest'
import { describeRevision } from './audit'
import type { Pond } from '../types'

function pond(): Pond {
  return {
    id: 'v01',
    name: 'V01',
    areaHa: 0.5,
    initialPopulation: 220_000,
    laboratory: 'ACQUAVALE',
    stockingDate: '2026-09-04',
    cycleStartDate: '2026-08-19',
    cycle: 5,
    feeder: 'Ermeson',
    plPerGram: 152,
    biometries: [{
      id: 'bio-1',
      date: '2026-10-17',
      currentWeightG: 3.14,
      sampleTotalWeightG: 157,
      sampleCount: 50,
      dailyFeedKg: 32,
      periodFeedKg: 224,
      accumulatedFeedKg: 382,
      feedRatePercent: 4.5,
    }],
  }
}

describe('auditoria do viveiro', () => {
  it('descreve alterações reais de ração e população mantendo 220 mil', () => {
    const before = pond()
    const after = {
      ...pond(),
      biometries: [{ ...pond().biometries[0], dailyFeedKg: 33, periodFeedKg: 230 }],
    }
    const changes = describeRevision([before], [after])
    expect(changes.map(c => c.description)).toEqual([
      'Biometria de 2026-10-17 — Ração por dia: 32 kg/dia → 33 kg/dia',
      'Biometria de 2026-10-17 — Ração no período: 224 kg → 230 kg',
    ])
    expect(after.initialPopulation).toBe(220_000)
  })

  it('mostra entradas novas mesmo sem uma revisão anterior da biometria', () => {
    const current = pond()
    const before = { ...current, biometries: [] }
    const changes = describeRevision([before], [current])
    expect(changes).toHaveLength(1)
    expect(changes[0].description).toContain('32 kg/dia')
    expect(changes[0].description).toContain('224 kg no período')
  })

  it('reporta mudanças na população sem adicionar bônus hipotético', () => {
    const current = { ...pond(), initialPopulation: 220_000 }
    const previous = { ...current, initialPopulation: 200_000 }
    const changes = describeRevision([previous], [current])
    expect(changes[0].description).toBe('População inicial: 200.000 → 220.000')
  })
})
