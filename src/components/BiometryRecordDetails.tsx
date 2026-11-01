import type { BiometryInput } from '../types'
import { formatDate, formatNumber } from '../format'

export function BiometryRecordDetails({record}:{record:BiometryInput}) {
  return <details className="detail-disclosure record-details">
    <summary>Dados da biometria de {formatDate(record.date).slice(0,5)}</summary>
    <dl className="record-facts">
      <div><dt>Peso médio</dt><dd>{formatNumber(record.currentWeightG,2)} g</dd></div>
      {record.sampleTotalWeightG!=null && <div><dt>Peso da amostra</dt><dd>{formatNumber(record.sampleTotalWeightG,2)} g</dd></div>}
      {record.sampleCount!=null && <div><dt>Camarões amostrados</dt><dd>{formatNumber(record.sampleCount)}</dd></div>}
      <div><dt>Ração diária fornecida</dt><dd>{formatNumber(record.dailyFeedKg,2)} kg</dd></div>
      {record.periodFeedKg!=null && <div><dt>Ração informada no período</dt><dd>{formatNumber(record.periodFeedKg,2)} kg</dd></div>}
      <div><dt>Ração acumulada</dt><dd>{formatNumber(record.accumulatedFeedKg,2)} kg</dd></div>
    </dl>
    {record.sampleCount==null && <p className="sample-footnote">Este registro informa apenas o peso médio, sem os dados da amostra.</p>}
  </details>
}
