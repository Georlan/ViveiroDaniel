import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadLocalPonds, STORAGE_KEY } from './storage'
import { calculateHistory, feedRateFromWeightTable, technicalMetricsStatus } from './domain/calculations'
import { reportPonds } from './data/reportData'
import { BiometryEvolution } from './components/BiometryEvolution'

const pond = {
  ...reportPonds[0],
  biometries: [
    { id: 'a', date: '2026-10-10', currentWeightG: 99, sampleTotalWeightG: 230, sampleCount: 100, feedRatePercent: 0, dailyFeedKg: 20, accumulatedFeedKg: 227 },
    { id: 'b', date: '2026-10-17', currentWeightG: 3.14, feedRatePercent: 4.5, feedRateSource: 'manual' as const, dailyFeedKg: 32, accumulatedFeedKg: 382 },
  ],
}

describe('recalculation over existing local data', () => {
  it.each(['viveiro-daniel:v4','viveiro-daniel:v3','viveiro-daniel:v2','viveiro-daniel:v1'])('loads %s without replacing records with defaults', key => {
    const raw = JSON.stringify([pond])
    const values = new Map([[key,raw]])
    const storage = { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name,value) } }
    const loaded = loadLocalPonds(storage)
    expect(loaded.blocked).toBe(false)
    expect(loaded.ponds[0].biometries).toEqual(pond.biometries)
    const history = calculateHistory(loaded.ponds[0])
    expect(history[0].currentWeightG).toBe(2.3)
    expect(history[0].feedRatePercent).toBe(5.3)
    expect(history[1].feedRatePercent).toBe(4.5)
    expect(history[1].biomassKg).toBeCloseTo(711.111,2)
    expect(history[1].feedToStandingBiomassRatio).toBeCloseTo(0.5372,3)
    expect(values.get(key)).toBe(raw)
    expect(calculateHistory(loaded.ponds[0])).toEqual(history)
  })

  it('does not write current local data while recalculating the display', () => {
    const raw = JSON.stringify([pond])
    const setItem = vi.fn()
    const loaded = loadLocalPonds({getItem: name => name === STORAGE_KEY ? raw : null,setItem})
    calculateHistory(loaded.ponds[0])
    expect(setItem).not.toHaveBeenCalled()
  })

  it('reapplies table rates to the measured weight and preserves manual overrides', () => {
    const row = pond.biometries[0]
    const history = calculateHistory({...pond,biometries:[{...row,feedRateSource:'table',feedRatePercent:1}]})
    expect(history[0].feedRatePercent).toBe(5.3)
    expect(pond.biometries[0].currentWeightG).toBe(99)
    expect(feedRateFromWeightTable(NaN)).toBeNull()
    expect(feedRateFromWeightTable(31)).toBeNull()
  })

  it('shows all dates and indicators in the evolution table even above 100 percent', () => {
    const html = renderToStaticMarkup(<BiometryEvolution pond={pond} onEdit={vi.fn()}/>)
    expect(html).toContain('Tabela de evolução das biometrias')
    expect(html).toContain('10/10')
    expect(html).toContain('17/10')
    expect(html).toContain('711')
    expect(html).toContain('103%')
    expect(html).toContain('0,54')
    expect(html).toContain('Hipótese incompatível')
  })

  it('leaves unavailable arithmetic empty rather than using infinity or zero-stock assumptions', () => {
    const status = technicalMetricsStatus(pond,{...pond.biometries[1],dailyFeedKg:0})
    expect(status.hasCalculatedValues).toBe(false)
    expect(technicalMetricsStatus(pond,{...pond.biometries[1],currentWeightG:31,feedRatePercent:0}).hasFeedRate).toBe(false)
  })
})
