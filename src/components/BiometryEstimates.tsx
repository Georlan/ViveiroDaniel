import type { BiometryInput, Pond } from '../types'
import { isFeedPeriodInconsistent, populationAtDate, technicalMetricsStatus } from '../domain/calculations'
import { compareMeasurements } from '../domain/biometryReview'
import { formatNumber } from '../format'

/** Exibe a aritmética histórica sem tratá-la como estoque medido ou FCA validado. */
export function BiometryEstimates({
  pond, current, previous,
}: { pond: Pond; current: BiometryInput; previous?: BiometryInput }) {
  const metrics = technicalMetricsStatus(pond, {
    ...current,
    populationAtDate: populationAtDate(pond, current.date),
  })
  const invertedFeed = current.periodFeedKg != null &&
    isFeedPeriodInconsistent(current.dailyFeedKg, current.periodFeedKg)
  const periodMismatch = previous
    ? compareMeasurements(previous, current, pond.populationMovements ?? [])?.feedInconsistent === true
    : current.periodFeedKg != null &&
      Math.abs(current.accumulatedFeedKg - current.periodFeedKg) > 1e-6
  const canShow = metrics.hasCalculatedValues && metrics.isPlausible &&
    !invertedFeed && !periodMismatch
  const historicalRatio = canShow ? metrics.feedToStandingBiomassRatio : null

  const message = invertedFeed
    ? 'Ração do dia maior que o total do período. Confira os dois valores antes de usar as estimativas.'
    : periodMismatch
      ? 'Ração do período e acumulados não conferem. Revise os registros antes de usar as estimativas.'
      : !metrics.hasFeedRate
        ? 'Sem taxa de alimentação informada. Informe uma taxa confirmada para simular biomassa e sobrevivência.'
        : !metrics.hasCalculatedValues
          ? 'Dados insuficientes para simular biomassa e sobrevivência pela ração.'
          : !metrics.isPlausible
            ? 'Hipótese incompatível com o saldo cadastral: a ração e a taxa implicariam mais de 100%. Revise os dados sem alterar o registro automaticamente.'
            : null

  return <section className="biometry-estimates" aria-label="Estimativas da biometria">
    <div className="biometry-estimates-head">
      <h3>Estimativas da biometria</h3><span>Hipótese pela ração</span>
    </div>
    <div className="biometry-estimates-grid">
      <div><span>Biomassa est.</span><strong>{canShow ? formatNumber(metrics.biomassKg!,0)+' kg' : '—'}</strong><small>{canShow ? 'Inferida pela ração' : 'Não validada'}</small></div>
      <div><span>Sobrevivência est.</span><strong>{canShow ? formatNumber(metrics.survivalPercent!,0)+'%' : '—'}</strong><small>{canShow ? 'Equivalente ao saldo cadastral' : 'Não validada'}</small></div>
      <div><span>FCA est. (histórico)*</span><strong>{historicalRatio !== null ? formatNumber(historicalRatio,2) : '—'}</strong><small>{historicalRatio !== null ? 'Razão do relatório antigo' : 'Sem razão confiável'}</small></div>
    </div>
    {message
      ? <p className="biometry-estimates-alert" role="status">{message}</p>
      : <p className="biometry-estimates-note">Estimativas condicionadas à taxa informada ({formatNumber(current.feedRatePercent,2)}%). Não medem a quantidade de animais vivos.</p>}
    <p className="biometry-estimates-footnote">* A razão histórica é ração acumulada ÷ biomassa inferida pela própria ração; não é FCA validado. O FCA real exige ganho de biomassa independente e ajuste por transferências.</p>
  </section>
}
