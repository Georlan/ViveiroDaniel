import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PondDetail } from './App'
import { reportPonds } from './data/reportData'
import type { Pond } from './types'

const samplePond: Pond = {
  ...reportPonds[0],
  populationMovements: [],
  biometries: [
    { id: 'previous', date: '2026-10-17', currentWeightG: 3.14, feedRatePercent: 4.5, dailyFeedKg: 20, accumulatedFeedKg: 200 },
    { id: 'latest', date: '2026-10-28', currentWeightG: 4.69, feedRatePercent: 3.6, dailyFeedKg: 25, accumulatedFeedKg: 407 },
  ],
}

function renderPond(pond: Pond) {
  return renderToStaticMarkup(
    <PondDetail pond={pond} onTransfer={vi.fn()} onAddBiometry={vi.fn()}
      onEditBiometry={vi.fn()} onEditPond={vi.fn()} onProducts={vi.fn()} />,
  )
}

describe('simple pond field view', () => {
  it('has one primary action, two immediate secondary actions and no duplicate product card', () => {
    const html = renderPond(samplePond)
    expect(html.match(/Registrar biometria/g)).toHaveLength(1)
    expect(html).toContain('Transferir')
    expect(html).toContain('Produtos')
    expect(html).not.toContain('Produtos e consumo')
    expect(html).not.toContain('Como o app calcula os indicadores')
  })

  it('shows earlier biometries without repeating the latest in the history', () => {
    const html = renderPond(samplePond)
    const history = html.split('class="biometry-history"')[1]
    expect(history).toContain('17/10/2026')
    expect(history).not.toContain('28/10/2026')
    expect(html).toContain('28/10/2026')
    expect(html).toContain('Dados da biometria')
  })

  it('preserves invalid-estimate warning without displaying unverified biomass', () => {
    const pond = {
      ...samplePond,
      biometries: [
        samplePond.biometries[0],
        { ...samplePond.biometries[1], dailyFeedKg: 50 },
      ],
    }
    const html = renderPond(pond)
    expect(html).toContain('Estimativas sob revisão')
    expect(html).not.toContain('Biomassa est.')
    expect(html).toContain('50 kg/dia')
  })

  it('does not ask twice for a first biometry', () => {
    const html = renderPond({ ...samplePond, biometries: [] })
    expect(html.match(/Registrar biometria/g)).toHaveLength(1)
    expect(html).toContain('Sem biometria')
    expect(html).not.toContain('Biometrias anteriores')
  })
})
