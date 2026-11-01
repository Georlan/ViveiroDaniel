import type { BiometryInput, Pond } from '../types'
import { feedScenario } from '../domain/biometryReview'
import { populationAtDate } from '../domain/calculations'
import { formatNumber, formatSigned } from '../format'
import { FeedReferencePanel } from './FeedReferencePanel'

export function FeedSimulation({pond,current,previous}:{pond:Pond;current:BiometryInput;previous?:BiometryInput}) {
  const scenario=feedScenario(populationAtDate(pond,current.date),current)
  const prior=previous?feedScenario(populationAtDate(pond,previous.date),previous):null
  const rateChanged=previous && Math.abs(previous.feedRatePercent-current.feedRatePercent)>1e-8
  return <details className="detail-disclosure feed-simulation">
    <summary>Simulação pela ração<span className="method-tag">Hipótese</span></summary>
    <div className="simulation-body">
      <p>Esta conta usa a ração fornecida e uma taxa assumida para inferir estoque. Não mede animais vivos nem comprova mortalidade.</p>
      {scenario.status==='insufficient' ? <p className="simulation-note">Sem simulação disponível. É preciso ter peso, saldo cadastral, ração diária maior que zero e uma taxa informada. Um dia sem ração não significa estoque zero.</p> : <>
        <div className="simulation-assumption"><span>Taxa usada nesta pesagem</span><strong>{formatNumber(current.feedRatePercent,2)}%</strong></div>
        <p className="simulation-note">Com o saldo cadastral inteiro e o peso desta amostra, essa taxa corresponderia a {formatNumber(scenario.referenceFeedKg!,3)} kg/dia. Foram registrados {formatNumber(current.dailyFeedKg,2)} kg/dia.</p>
        {scenario.status==='inconsistent' ? <div className="simulation-warning" role="status"><strong>Hipótese incompatível: {formatNumber(scenario.impliedStockPercent!,1)}%</strong><p>A conta ultrapassa o saldo cadastral. Não é sobrevivência real. A diferença para a hipótese de 100% é {formatSigned(current.dailyFeedKg-scenario.referenceFeedKg!,3)} kg/dia. Revise a taxa, o peso, a ração e as movimentações.</p></div> : <div className="simulation-results"><div><span>Biomassa inferida</span><strong>{formatNumber(scenario.biomassKg!,1)} kg</strong></div><div><span>Equivale a</span><strong>{formatNumber(scenario.impliedStockPercent!,1)}% <small>do saldo cadastral</small></strong></div></div>}
        {previous && rateChanged && <p className="simulation-note">A taxa mudou de {formatNumber(previous.feedRatePercent,2)}% para {formatNumber(current.feedRatePercent,2)}%. As duas simulações usam hipóteses diferentes; a mudança de biomassa não comprova perda ou ganho real.</p>}
        {previous && !rateChanged && prior?.status==='conditional' && scenario.status==='conditional' && <p className="simulation-note">Com a mesma taxa, a biomassa inferida passou de {formatNumber(prior.biomassKg!,1)} para {formatNumber(scenario.biomassKg!,1)} kg. Como ambas são inferidas da ração, a diferença não comprova mortalidade nem produção.</p>}
      </>}
      <div className="fca-explanation"><strong>Por que o FCA não aparece?</strong><p>Precisamos do ganho de biomassa obtido por um método independente da ração e dos registros de entradas e saídas no mesmo período. A ração dividida por uma biomassa calculada da própria ração não comprova eficiência alimentar.</p></div>
      <FeedReferencePanel weightG={current.currentWeightG}/>
    </div>
  </details>
}
