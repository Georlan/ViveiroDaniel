import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BiometryList } from './components/BiometryList'
import { PondDetail } from './App'
import { demonstrationPonds } from './data/demonstration'
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
    expect(html.match(/Registrar pesagem/g)).toHaveLength(1)
    expect(html).toContain('Transferir')
    expect(html).toContain('Produtos')
    expect(html).not.toContain('Produtos e consumo')
    expect(html).not.toContain('Como o app calcula os indicadores')
  })

  it('makes both comparison and the complete list available without hidden older-only history', () => {
    const html=renderPond(samplePond)
    expect(html).toContain('Visualização das biometrias')
    expect(html).toContain('Lista completa (2)')
    const list=renderToStaticMarkup(<BiometryList pond={samplePond} onEdit={vi.fn()}/>)
    expect(list).toContain('17/10/2026')
    expect(list).toContain('28/10/2026')
    expect(list).toContain('2 registros')
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
    expect(html).toContain('Hipótese incompatível')
    expect(html).not.toContain('Biomassa est.')
    expect(html).toContain('50,00 kg/dia')
  })

  it('does not ask twice for a first biometry', () => {
    const html = renderPond({ ...samplePond, biometries: [] })
    expect(html.match(/Registrar pesagem/g)).toHaveLength(1)
    expect(html).toContain('Comece pela primeira pesagem')
    expect(html).not.toContain('Pesagens anteriores')
  })
})


describe('evidence-aware operator view',()=>{
  it('shows the actual report interval, measured chart and conditional estimates separately',()=>{
    const html=renderPond(demonstrationPonds()[0])
    const text=html.replace(/<[^>]*>/g,' ')
    expect(text).toContain('Evolução do peso médio da amostra')
    expect(text).toContain('+2,00')
    expect(text).toContain('g em 7 dias')
    expect(text).toContain('69,00 kg')
    expect(text).toContain('Simulação pela ração')
    expect(text).toContain('Por que o FCA não aparece?')
    expect(html).not.toContain('FCA est.')
  })
  it('shows no growth from a single sample and preserves its recorded feed',()=>{
    const pond=demonstrationPonds()[0]
    const html=renderPond({...pond,biometries:[pond.biometries[0]]})
    expect(html).toContain('Não há crescimento calculado a partir de um único registro')
    expect(html).not.toContain('Variação do peso médio')
    expect(html).toContain('17,00 kg')
  })
})


it('does not repair contradictory feed evidence before showing it to the operator',()=>{
  const pond=demonstrationPonds()[0]
  const html=renderPond({...pond,biometries:[pond.biometries[1],{...pond.biometries[2],periodFeedKg:200}]})
  const text=html.replace(/<[^>]*>/g,' ')
  expect(text).toContain('O total do período e os acumulados não conferem')
  expect(text).toContain('611,00 kg')
  expect(text).not.toContain('567,00 kg')
})

it('shows an unavailable historical interval instead of zero growth for duplicate dates',()=>{
  const pond=demonstrationPonds()[0]
  const first=pond.biometries[0]
  const historical=renderToStaticMarkup(<BiometryList pond={{...pond,biometries:[first,{...first,id:'duplicate-date',currentWeightG:3.6},pond.biometries[2]]}} onEdit={vi.fn()}/>)
  expect(historical).not.toContain('0,00 g')
})
