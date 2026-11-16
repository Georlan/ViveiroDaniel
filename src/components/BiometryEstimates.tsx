import type { BiometryInput, Pond } from '../types'
import { isFeedPeriodInconsistent, populationAtDate, recalculateBiometryInput, technicalMetricsStatus } from '../domain/calculations'
import { compareMeasurements } from '../domain/biometryReview'
import { formatNumber } from '../format'

/** Alertas não apagam resultados calculáveis nem modificam os dados registrados. */
export function BiometryEstimates({
  pond, current: recorded, previous,
}: { pond: Pond; current: BiometryInput; previous?: BiometryInput }) {
  const current = recalculateBiometryInput(recorded)
  const metrics = technicalMetricsStatus(pond, {
    ...current, populationAtDate: populationAtDate(pond, current.date),
  })
  const invertedFeed = current.periodFeedKg != null &&
    isFeedPeriodInconsistent(current.dailyFeedKg, current.periodFeedKg)
  const periodMismatch = previous
    ? compareMeasurements(previous, current, pond.populationMovements ?? [])?.feedInconsistent === true
    : current.periodFeedKg != null && Math.abs(current.accumulatedFeedKg - current.periodFeedKg) > 1e-6
  const canShow = metrics.hasCalculatedValues
  const historicalRatio = canShow ? metrics.feedToStandingBiomassRatio : null
  const transferred = (pond.populationMovements ?? []).some(m => m.date <= current.date)
  const alerts = [
    invertedFeed ? 'Ração do dia maior que o total do período. Confira os dois valores.' : null,
    periodMismatch ? 'Ração do período e acumulados não conferem. O FCA estimado usa o acumulado registrado.' : null,
    !metrics.hasFeedRate ? 'Sem taxa disponível para este peso. Informe a taxa de alimentação usada no manejo.' : null,
    metrics.hasFeedRate && !canShow ? 'Dados insuficientes: é preciso peso e ração diária maiores que zero para estimar biomassa.' : null,
    canShow && !metrics.isPlausible ? 'Hipótese incompatível com o saldo cadastral. O valor calculado é exibido para conferência; revise peso, ração, taxa e transferências.' : null,
    transferred ? 'Há transferências neste ciclo. O FCA estimado não separa a ração entre os lotes.' : null,
  ].filter(Boolean)
  return <section className="biometry-estimates" aria-label="Estimativas da biometria">
    <div className="biometry-estimates-head"><h3>Estimativas da biometria</h3><span>Taxa {current.feedRatePercent > 0 ? formatNumber(current.feedRatePercent,2)+'%' : 'indisponível'}</span></div>
    <div className="biometry-estimates-grid">
      <div><span>Biomassa est.</span><strong>{canShow ? formatNumber(metrics.biomassKg!,0)+' kg' : '—'}</strong><small>{canShow ? 'Inferida pela ração' : 'Dados insuficientes'}</small></div>
      <div><span>Sobrevivência est.</span><strong>{canShow && metrics.maximumBiomassKg > 0 ? formatNumber(metrics.survivalPercent!,0)+'%' : '—'}</strong><small>Equivalente ao saldo cadastral</small></div>
      <div><span>FCA est. (histórico)*</span><strong>{historicalRatio !== null ? formatNumber(historicalRatio,2) : '—'}</strong><small>{historicalRatio !== null ? 'Razão do relatório antigo' : 'Dados insuficientes'}</small></div>
      <div><span>Ração para 100%</span><strong>{metrics.hasFeedRate && metrics.maximumBiomassKg > 0 ? formatNumber(metrics.feedFor100Kg!,2)+' kg/dia' : '—'}</strong><small>Referência do saldo cadastral</small></div>
    </div>
    <p className="biometry-estimates-note">{current.feedRateSource === 'table' ? 'Taxa de referência por peso aplicada automaticamente.' : 'Taxa informada no registro.'} Estimativas recalculadas a partir desta biometria.</p>
    {alerts.map(message => <p key={message} className="biometry-estimates-alert" role="status">{message}</p>)}
    <p className="biometry-estimates-footnote">* FCA estimado = ração acumulada ÷ biomassa estimada, conforme o controle histórico; não é FCA validado por ganho independente de biomassa. Sobrevivência acima de 100% indica divergência da hipótese e não aumento real da população.</p>
  </section>
}
