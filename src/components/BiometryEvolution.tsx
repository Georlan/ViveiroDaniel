import { useEffect, useId, useState } from 'react'
import type { CalculatedBiometry, Pond } from '../types'
import { calculateHistory, daysBetween } from '../domain/calculations'
import { compareMeasurements, validMeasurement } from '../domain/biometryReview'
import { formatDate, formatNumber, formatSigned } from '../format'
import { FeedSimulation } from './FeedSimulation'
import { BiometryRecordDetails } from './BiometryRecordDetails'

function WeightChart({history,selectedIndex}:{history:CalculatedBiometry[];selectedIndex:number}) {
  const titleId=useId(),descriptionId=useId()
  const first=history[0],last=history[history.length-1]
  const span=daysBetween(first.date,last.date)
  if(span<=0) return null
  const ceiling=Math.max(1,Math.ceil(Math.max(...history.map(row=>row.currentWeightG))))
  const point=(row:CalculatedBiometry)=>({x:40+daysBetween(first.date,row.date)/span*264,y:145-row.currentWeightG/ceiling*118})
  const path=history.map((row,index)=>`${index?'L':'M'}${point(row).x},${point(row).y}`).join(' ')
  const from=point(history[selectedIndex-1]),to=point(history[selectedIndex])
  return <figure className="weight-trend">
    <div className="chart-title"><h3>Peso médio ao longo do tempo</h3><span>g por camarão</span></div>
    <svg viewBox="0 0 324 193" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>Evolução do peso médio da amostra</title>
      <desc id={descriptionId}>Eixo horizontal: datas das biometrias. Eixo vertical: gramas por camarão, de zero a {ceiling}. {history.map(row=>`${formatDate(row.date)}: ${formatNumber(row.currentWeightG,2)} g`).join('; ')}. O trecho destacado é o intervalo selecionado.</desc>
      {[0,.5,1].map(fraction=><g key={fraction}><line x1="40" x2="304" y1={145-fraction*118} y2={145-fraction*118} className="chart-grid"/><text x="31" y={149-fraction*118} textAnchor="end" className="chart-label">{formatNumber(ceiling*fraction,ceiling%2&&fraction===.5?1:0)}</text></g>)}
      <path d={path} className="chart-line"/>
      <path d={`M${from.x},${from.y} L${to.x},${to.y}`} className="chart-highlight"/>
      {history.map((row,index)=><circle key={row.id} cx={point(row).x} cy={point(row).y} r={index===selectedIndex||index===selectedIndex-1?5:3.5} className={index===selectedIndex||index===selectedIndex-1?'chart-dot selected':'chart-dot'}/>)}
      <text x="40" y="168" className="chart-label">{formatDate(first.date).slice(0,5)}</text>
      <text x="304" y="168" textAnchor="end" className="chart-label">{formatDate(last.date).slice(0,5)}</text>
      <text x="172" y="188" textAnchor="middle" className="chart-axis-title">Datas das biometrias</text>
    </svg>
    <figcaption>Pontos medidos; a linha apenas liga as datas. Não há pesagens estimadas entre os pontos.</figcaption>
  </figure>
}

export function BiometryEvolution({pond,onEdit}:{pond:Pond;onEdit:(id:string)=>void}) {
  const history=calculateHistory(pond).filter(validMeasurement)
  const lastId=history[history.length-1]?.id??''
  const [selectedId,setSelectedId]=useState(lastId)
  useEffect(()=>setSelectedId(lastId),[pond.id,lastId])
  if(history.length<2) return null
  const selectedIndex=Math.max(1,history.findIndex(row=>row.id===selectedId))
  const current=history[selectedIndex],previous=history[selectedIndex-1]
  const comparison=compareMeasurements(previous,current,pond.populationMovements??[])
  const prior=selectedIndex>1?compareMeasurements(history[selectedIndex-2],previous,pond.populationMovements??[]):null
  const dailyRateChange=prior && comparison && !prior.compositionChanged && !comparison.compositionChanged ? comparison.dailyChangeG-prior.dailyChangeG:null
  return <section className="biometry-evolution" aria-label="Mudanças entre biometrias">
    <div className="section-heading"><div><h2>O que mudou?</h2><p>Compare as amostras e a ração entre duas datas.</p></div></div>
    <WeightChart history={history} selectedIndex={selectedIndex}/>
    <div className="interval-picker">
      <label><span>Comparar intervalo terminado em</span><select value={current.id} onChange={event=>setSelectedId(event.target.value)}>{history.slice(1).map(row=><option key={row.id} value={row.id}>{formatDate(row.date)} · {formatNumber(row.currentWeightG,2)} g</option>)}</select></label>
      <div className="interval-navigation"><button className="secondary-button" disabled={selectedIndex<=1} onClick={()=>setSelectedId(history[selectedIndex-1].id)} aria-label="Comparar intervalo anterior">‹ Anterior</button><span>{selectedIndex} de {history.length-1}</span><button className="secondary-button" disabled={selectedIndex>=history.length-1} onClick={()=>setSelectedId(history[selectedIndex+1].id)} aria-label="Comparar próximo intervalo">Próximo ›</button></div>
    </div>
    {comparison ? <div className="interval-comparison" aria-live="polite" aria-atomic="true">
      <div className="comparison-dates"><span>{formatDate(previous.date)}</span><span aria-hidden="true">→</span><span>{formatDate(current.date)}</span></div>
      <div className="comparison-main"><span>Variação do peso médio</span><strong>{formatSigned(comparison.weightChangeG,2)} <small>g em {comparison.days} dias</small></strong></div>
      <div className="weight-before-after"><div><span>Amostra anterior</span><strong>{formatNumber(previous.currentWeightG,2)} g</strong></div><div><span>Amostra atual</span><strong>{formatNumber(current.currentWeightG,2)} g</strong></div></div>
      <div className="growth-rates"><div><span>Média no intervalo</span><strong>{formatSigned(comparison.dailyChangeG,3)} g/dia</strong></div><div><span>Equivalente em 7 dias</span><strong>{formatSigned(comparison.weeklyEquivalentG,2)} g</strong></div></div>
      {dailyRateChange!==null && <p className="rate-context">{Math.abs(dailyRateChange)<.0005?'Mesmo ritmo médio do intervalo anterior.':`${dailyRateChange>0?'Aumento':'Redução'} de ${formatNumber(Math.abs(dailyRateChange),3)} g/dia em relação ao intervalo anterior.`}</p>}
      {comparison.compositionChanged && <p className="comparison-caution">Há transferência na janela destas biometrias, incluindo suas datas. A composição do lote pode ter mudado. A variação das médias não comprova o crescimento dos mesmos animais.</p>}
      {comparison.weightChangeG<0 && <p className="comparison-caution">O peso médio da amostra diminuiu. Confira a amostragem e as movimentações; isso, sozinho, não identifica a causa.</p>}
      <div className="feed-comparison"><h3>Ração no intervalo</h3><div className="feed-change"><span>Ração diária registrada</span><strong>{formatNumber(previous.dailyFeedKg,2)} → {formatNumber(current.dailyFeedKg,2)} <small>kg/dia</small></strong><span>{comparison.feedDailyChangeKg===null?'Confira os valores diários.':formatSigned(comparison.feedDailyChangeKg,2)+' kg/dia de diferença'}</span></div><div className="period-feed"><span>Total fornecido no período</span><strong>{comparison.feedInPeriodKg===null?'Revisar registros':formatNumber(comparison.feedInPeriodKg,2)+' kg'}</strong></div><p>{comparison.feedInconsistent?'O total do período e os acumulados não conferem. Revise os registros antes de usar este total.':comparison.feedBasis==='recorded-period'?'Total informado no registro.':'Total calculado pela diferença dos acumulados.'} Ração fornecida não equivale a consumo medido.</p></div>
      <div className="comparison-edit"><button className="text-button" onClick={()=>onEdit(previous.id)}>Editar {formatDate(previous.date).slice(0,5)}</button><button className="text-button" onClick={()=>onEdit(current.id)}>Editar {formatDate(current.date).slice(0,5)}</button></div>
    </div> : <p className="comparison-caution">Não é possível comparar estas datas. Confira se há duas biometrias válidas em dias diferentes.</p>}
    <BiometryRecordDetails record={current}/>
    <FeedSimulation pond={pond} current={current} previous={previous}/>
    <p className="sample-footnote">Cada pesagem representa uma amostra. A coleta e a composição do lote podem alterar a média.</p>
  </section>
}
