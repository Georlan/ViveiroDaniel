import { describe,it,expect,vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PondDetail,PondCard,PondForm,TransferForm,StorageMessageContext } from './App'
import { BiometryList } from './components/BiometryList'
import { demonstrationPonds } from './data/demonstration'
import { densityPerSquareMeter,populationAtDate } from './domain/calculations'
import { feedScenario } from './domain/biometryReview'
import type { Pond } from './types'

const transfer={transferId:'78000',date:'2026-10-22',direction:'in' as const,animals:78000,averageWeightG:3.39,biomassKg:264.42,counterpartPondId:'source',counterpartPondName:'V01'}
const recipient:Pond={...demonstrationPonds()[1],areaHa:.5,initialPopulation:0,stockingDate:'2026-10-22',plPerGram:3.39,populationMovements:[transfer,{...transfer}]}
const renderDetail=(pond:Pond)=>renderToStaticMarkup(<PondDetail pond={pond} onTransfer={vi.fn()} onAddBiometry={vi.fn()} onEditBiometry={vi.fn()} onEditPond={vi.fn()} onProducts={vi.fn()}/> )

describe('operator voice notes and old screenshot regressions',()=>{
  it('shows 78,000 transferred animals as 15.6 per square meter in summary and pond',()=>{
    const population=populationAtDate(recipient,'2026-11-01')
    expect(population).toBe(78000)
    expect(densityPerSquareMeter(recipient,population)).toBe(15.6)
    const detail=renderDetail(recipient)
    const card=renderToStaticMarkup(<PondCard pond={recipient} onOpen={vi.fn()}/> )
    expect(detail).toContain('15,6')
    expect(card).toContain('15,6')
    expect(detail).not.toContain('31,2')
    expect(detail).toContain('3,39')
  })
  it('lists all six biometries including the latest, with meaningful dates and no clipped estimate cells',()=>{
    const pond=demonstrationPonds()[0]
    const html=renderToStaticMarkup(<BiometryList pond={pond} onEdit={vi.fn()}/> )
    expect(html).toContain('6 registros')
    expect(html.match(/class="biometry-list-row"/g)).toHaveLength(6)
    expect(html).toContain('22/07/2026')
    expect(html).toContain('13/06/2026')
    expect(html).toContain('30,0')
    expect(html).not.toContain('Revisar esti...')
    expect(html).not.toContain('FCA est.')
  })
  it('flags the old 152 kg/day versus 25 kg period and does not show inferred 4,222 kg as valid biomass',()=>{
    const pond:Pond={...recipient,initialPopulation:220000,populationMovements:[],stockingDate:'2026-09-04',biometries:[
      {id:'before',date:'2026-10-17',currentWeightG:3.14,dailyFeedKg:32,feedRatePercent:4.5,accumulatedFeedKg:382},
      {id:'inverted',date:'2026-10-28',currentWeightG:328/70,sampleTotalWeightG:328,sampleCount:70,dailyFeedKg:152,periodFeedKg:25,feedRatePercent:3.6,accumulatedFeedKg:407},
    ]}
    const scenario=feedScenario(220000,pond.biometries[1])
    expect(scenario.status).toBe('inconsistent')
    expect(scenario.impliedStockPercent).toBeGreaterThan(400)
    const list=renderToStaticMarkup(<BiometryList pond={pond} onEdit={vi.fn()}/>)
    expect(list).toContain('Ração do dia maior que o total do período')
    const detail=renderDetail(pond)
    expect(detail).not.toContain('4.222')
    expect(detail).not.toContain('FCA est.')
    expect(detail).toContain('Hipótese incompatível')
  })
  it('allows decimal PL/g and makes transfer-only setup explicit',()=>{
    const html=renderToStaticMarkup(<PondForm initial={recipient} onClose={vi.fn()} onSave={vi.fn()}/>)
    expect(html).toContain('step="any"')
    expect(html).toContain('3.39')
    expect(html).toContain('Recebidos por transferência')
    expect(html).toContain('Não some aqui os animais que já entraram por transferência')
  })
})


it('requires explicit confirmation when transferred animals would add to an existing destination balance',()=>{
  const source=demonstrationPonds()[0]
  const target={...recipient,initialPopulation:78000,populationMovements:[]}
  const html=renderToStaticMarkup(<TransferForm ponds={[source,target]} source={source} onClose={vi.fn()} onSave={async()=>true}/>)
  expect(html).toContain('O destino já tem 78.000 animais cadastrados')
  expect(html).toContain('type="checkbox" required=""')
  expect(html).toContain('Sim, estou adicionando outros animais a esse saldo.')
  const empty=renderToStaticMarkup(<TransferForm ponds={[source,{...target,initialPopulation:0}]} source={source} onClose={vi.fn()} onSave={async()=>true}/>)
  expect(empty).not.toContain('type="checkbox"')
})

it('shows local save failures inside the open form',()=>{
  const html=renderToStaticMarkup(<StorageMessageContext.Provider value="Não foi possível salvar neste navegador."><PondForm onClose={vi.fn()} onSave={vi.fn()}/></StorageMessageContext.Provider>)
  expect(html).toContain('role="alert"')
  expect(html).toContain('Não foi possível salvar neste navegador.')
})
