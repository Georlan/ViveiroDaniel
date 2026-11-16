import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BiometryEstimates } from './BiometryEstimates'
import { demonstrationPonds } from '../data/demonstration'
import type { BiometryInput, Pond } from '../types'

const baseline: Pond = { ...demonstrationPonds()[0], initialPopulation: 150000, populationMovements: [] }
const measurement: BiometryInput = {
  id: 'example', date: '2026-07-22', currentWeightG: 9.1,
  dailyFeedKg: 15, accumulatedFeedKg: 857, feedRatePercent: 3.5,
}
const render = (pond: Pond, current: BiometryInput, previous?: BiometryInput) =>
  renderToStaticMarkup(<BiometryEstimates pond={pond} current={current} previous={previous}/>)

describe('biometry estimates: visible but evidence-aware', () => {
  it('restores the three historical fields for a coherent record', () => {
    const html = render(baseline, measurement)
    expect(html).toContain('Biomassa est.')
    expect(html).toContain('Sobrevivência est.')
    expect(html).toContain('FCA est. (histórico)')
    expect(html).toContain('429 kg')
    expect(html).toContain('31%')
    expect(html).toContain('2,00')
    expect(html).toContain('não é FCA validado')
  })
  it('shows calculations with warnings for inverted daily and period feed', () => {
    const invalid = { ...measurement, currentWeightG: 328 / 70, dailyFeedKg: 152, periodFeedKg: 25, accumulatedFeedKg: 407, feedRatePercent: 3.6 }
    const html = render({ ...baseline, initialPopulation: 220000 }, invalid)
    expect(html).toContain('Biomassa est.')
    expect(html).toContain('Sobrevivência est.')
    expect(html).toContain('FCA est.')
    expect(html).toContain('Ração do dia maior que o total do período')
    expect(html).toContain('4.222 kg')
    expect(html).toContain('FCA estimado =')
  })
  it('shows greater-than-100% arithmetic with an explicit warning', () => {
    const html = render({ ...baseline, initialPopulation: 220000 }, { ...measurement, currentWeightG: 3.14, dailyFeedKg: 32, feedRatePercent: 4.5 })
    expect(html).toContain('Hipótese incompatível')
    expect(html).toContain('103%')
    expect(html).toContain('não aumento real da população')
  })
  it('keeps the historical ratio available after transfers with an allocation warning', () => {
    const moved = { ...baseline, populationMovements: [{
      transferId: 't1', date: '2026-07-01', direction: 'in' as const, animals: 1000,
      averageWeightG: 8, biomassKg: 8, counterpartPondId: 'other', counterpartPondName: 'V02',
    }] }
    const html = render(moved, measurement)
    expect(html).toContain('429 kg')
    expect(html).toContain('não separa a ração entre os lotes')
    expect(html).toContain('2,00')
  })
  it('uses the reference table when the stored rate is missing', () => {
    const html = render(baseline, { ...measurement, feedRatePercent: 0 })
    expect(html).toContain('Taxa de referência por peso aplicada automaticamente.')
    expect(html).toContain('536 kg')
  })
})
