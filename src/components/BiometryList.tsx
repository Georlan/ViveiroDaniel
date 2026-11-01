import type { Pond } from '../types'
import { calculateHistory,densityPerSquareMeter,populationAtDate,isFeedPeriodInconsistent } from '../domain/calculations'
import { compareMeasurements,feedScenario,validMeasurement } from '../domain/biometryReview'
import { formatDate,formatNumber,formatSigned } from '../format'
import { BiometryRecordDetails } from './BiometryRecordDetails'
import { FeedSimulation } from './FeedSimulation'

export function BiometryList({pond,onEdit}:{pond:Pond;onEdit:(id:string)=>void}) {
  const history=calculateHistory(pond)
  if(!history.length) return null
  return <section className="biometry-full-list" aria-label="Lista completa de biometrias">
    <div className="section-heading"><div><h2>Biometrias realizadas</h2><p>{history.length+' '+(history.length===1?'registro':'registros')}</p></div></div>
    <p className="list-density-note">Animais/m² usa o saldo cadastral na data de cada pesagem. Não é contagem de animais vivos.</p>
    <div className="biometry-list-rows">{[...history].reverse().map(row=>{
      const index=history.indexOf(row),previous=index>0?history[index-1]:undefined
      const comparison=compareMeasurements(previous??null,row,pond.populationMovements??[])
      const population=populationAtDate(pond,row.date)
      const scenario=feedScenario(population,row)
      const inverted=row.periodFeedKg!=null && isFeedPeriodInconsistent(row.dailyFeedKg,row.periodFeedKg)
      return <article className="biometry-list-row" key={row.id}>
        <div className="biometry-row-heading"><div><strong>{formatDate(row.date)}</strong><span>Dia {row.cultivationDay} de cultivo</span></div><button className="history-edit-button" onClick={()=>onEdit(row.id)} aria-label={'Editar biometria de '+formatDate(row.date)}>Editar</button></div>
        <div className="list-measurements">
          <div><span>Peso médio</span><strong>{validMeasurement(row)?formatNumber(row.currentWeightG,2):'Revisar'}<small>{validMeasurement(row)?'g por camarão':''}</small></strong></div>
          <div><span>Desde a anterior</span><strong>{comparison?formatSigned(comparison.weightChangeG,2):'—'}<small>{comparison?'g em '+comparison.days+' dias':'Sem comparação'}</small></strong></div>
          <div><span>Animais por área</span><strong>{formatNumber(densityPerSquareMeter(pond,population),1)}<small>animais/m²</small></strong></div>
        </div>
        <p className="list-feed-line"><span>Ração diária: <strong>{formatNumber(row.dailyFeedKg,Number.isInteger(row.dailyFeedKg)?0:2)} kg</strong></span><span>Acumulada: <strong>{formatNumber(row.accumulatedFeedKg,Number.isInteger(row.accumulatedFeedKg)?0:2)} kg</strong></span></p>
        {inverted ? <p className="list-record-warning" role="status">Ração do dia maior que o total do período. Confira os dois valores.</p> : comparison?.feedInconsistent ? <p className="list-record-warning">Ração do período e acumulados não conferem. Revise este registro.</p> : scenario.status==='inconsistent' ? <p className="list-record-warning">Simulação incompatível com o saldo cadastral. Revise ração e taxa.</p>:null}
        {comparison?.compositionChanged && <p className="list-record-warning">Há transferência na janela destas biometrias. A composição da amostra pode ter mudado.</p>}
        <BiometryRecordDetails record={row}/><FeedSimulation pond={pond} current={row} previous={previous}/>
      </article>
    })}</div>
  </section>
}
