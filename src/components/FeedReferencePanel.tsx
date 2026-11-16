import { FEED_RATE_BY_WEIGHT, feedRateFromWeightTable } from '../domain/calculations'
import { suppliedFeedReference } from '../data/feedReference'
import { assessFeedReference, feedReferenceIssues } from '../domain/biometryReview'
import { formatNumber } from '../format'

export function FeedReferencePanel({weightG}:{weightG?:number}) {
  const applied = weightG ? feedRateFromWeightTable(weightG) : null
  const match=weightG ? assessFeedReference(weightG):null
  return <details className="feed-reference-panel">
    <summary>Consultar as tabelas de alimentação</summary>
    <h3>Referência aplicada pelo app</h3>
    <p>A referência por peso já existente no controle é usada quando não há taxa manual. A linha mais próxima é aplicada entre 0,2 e 30 g, sem extrapolação.</p>
    {applied && <p className="reference-match">Para esta amostra: {formatNumber(applied.ratePercent,2)}% · linha de {formatNumber(applied.weightG,2)} g.</p>}
    <table className="feed-reference-table"><caption>Referência do controle · % da biomassa por dia</caption><thead><tr><th scope="col">Peso (g)</th><th scope="col">Taxa (%)</th></tr></thead><tbody>{FEED_RATE_BY_WEIGHT.map(row=><tr key={row.weightG}><th scope="row">{formatNumber(row.weightG,2)}</th><td>{formatNumber(row.ratePercent,2)}%</td></tr>)}</tbody></table>
    <h3>Foto enviada anteriormente</h3>
    <p>A foto não identifica espécie, sistema ou ração. Há pesos repetidos e valores “ideais” fora da própria faixa. A tabela é apenas uma referência para conferência.</p>
    {match?.status==='reference-only' && <p className="reference-match">Para {formatNumber(weightG!,2)} g, a foto registra {formatNumber(match.rows[0].minPercent,1)}–{formatNumber(match.rows[0].maxPercent,1)}%, com “ideal” de {formatNumber(match.rows[0].idealPercent,1)}%. Isso não confirma a taxa para este cultivo.</p>}
    {match && ['ambiguous','inconsistent'].includes(match.status) && <p className="reference-match caution">O peso desta amostra corresponde a uma linha com conflito. Confira a origem antes de usar o percentual.</p>}
    <table className="feed-reference-table"><caption>Transcrição da foto • % da biomassa por dia</caption><thead><tr><th scope="col">Peso (g)</th><th scope="col">Mín.</th><th scope="col">Máx.</th><th scope="col">“Ideal”</th></tr></thead><tbody>{suppliedFeedReference.rows.map((row,index)=><tr key={index} className={feedReferenceIssues(row)?'reference-conflict':''}><th scope="row">{formatNumber(row.weightG)}</th><td>{formatNumber(row.minPercent,1)}%</td><td>{formatNumber(row.maxPercent,1)}%</td><td>{formatNumber(row.idealPercent,1)}%{feedReferenceIssues(row)&&' *'}</td></tr>)}</tbody></table>
    <p className="reference-caption">* O “ideal” está fora do mínimo/máximo. As três linhas de 1 g foram mantidas como aparecem na foto. Sem interpolação ou aplicação automática.</p>
  </details>
}
