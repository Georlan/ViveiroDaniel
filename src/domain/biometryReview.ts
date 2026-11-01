import type { BiometryInput, PopulationMovement } from '../types'
import { daysBetween } from './calculations'
import { suppliedFeedReference } from '../data/feedReference'

export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const timestamp = Date.parse(date + 'T00:00:00Z')
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === date
}

export function validMeasurement(input: Pick<BiometryInput,'date'|'currentWeightG'>) {
  return validDate(input.date) && Number.isFinite(input.currentWeightG) && input.currentWeightG > 0
}

export function compareMeasurements(
  previous: BiometryInput | null,
  current: BiometryInput,
  movements: PopulationMovement[],
) {
  if (!previous || !validMeasurement(previous) || !validMeasurement(current)) return null
  const days = daysBetween(previous.date,current.date)
  if (days <= 0) return null
  const weightChangeG = current.currentWeightG - previous.currentWeightG
  const accumulationAvailable = Number.isFinite(current.accumulatedFeedKg) && Number.isFinite(previous.accumulatedFeedKg)
  const difference = current.accumulatedFeedKg - previous.accumulatedFeedKg
  const recorded = current.periodFeedKg
  const candidate = recorded ?? (accumulationAvailable ? difference : null)
  const feedInconsistent = (accumulationAvailable && (previous.accumulatedFeedKg<0 || current.accumulatedFeedKg<0 || difference < 0)) ||
    (recorded != null && (!Number.isFinite(recorded) || recorded < 0 ||
      (accumulationAvailable && Math.abs(difference-recorded)>1e-6))) ||
    (candidate != null && Number.isFinite(current.dailyFeedKg) && current.dailyFeedKg>candidate+1e-6)
  const feedInPeriodKg = feedInconsistent ? null : recorded != null ? recorded :
    accumulationAvailable && difference>=0 ? difference : null
  const dailyFeedsValid = [previous.dailyFeedKg,current.dailyFeedKg].every(v=>Number.isFinite(v)&&v>=0)
  const transfersInWindow = new Set(movements.filter(m=>validDate(m.date) && m.date>=previous.date && m.date<=current.date).map(m=>m.transferId+':'+m.direction)).size
  return {
    days,
    weightChangeG,
    dailyChangeG: weightChangeG/days,
    weeklyEquivalentG: weightChangeG/days*7,
    feedInPeriodKg,
    feedBasis: recorded != null ? 'recorded-period' as const : 'accumulated-difference' as const,
    feedInconsistent,
    feedDailyChangeKg: dailyFeedsValid ? current.dailyFeedKg-previous.dailyFeedKg : null,
    transfersInWindow,
    compositionChanged: transfersInWindow>0,
  }
}

/** Simulação condicional: ração fornecida / taxa assumida, não medição de estoque. */
export function feedScenario(population: number, input: Pick<BiometryInput,'currentWeightG'|'feedRatePercent'|'dailyFeedKg'>) {
  const empty = {status:'insufficient' as const,referenceFeedKg:null,biomassKg:null,impliedStockPercent:null}
  const {currentWeightG:weight,feedRatePercent:rate,dailyFeedKg:feed}=input
  if (![population,weight,rate,feed].every(Number.isFinite) || population<=0 || weight<=0 || rate<=0 || rate>100 || feed<=0) return empty
  const referenceBiomassKg=population*weight/1000
  const referenceFeedKg=referenceBiomassKg*rate/100
  const biomassKg=feed/(rate/100)
  const impliedStockPercent=biomassKg/referenceBiomassKg*100
  if (![referenceFeedKg,biomassKg,impliedStockPercent].every(Number.isFinite) || referenceFeedKg<=0) return empty
  return {status:impliedStockPercent>100+1e-6 ? 'inconsistent' as const:'conditional' as const,referenceFeedKg,biomassKg,impliedStockPercent}
}

export function feedReferenceIssues(row: typeof suppliedFeedReference.rows[number]) {
  return row.idealPercent<row.minPercent || row.idealPercent>row.maxPercent || row.minPercent>row.maxPercent
}

export function assessFeedReference(weightG:number) {
  const rows=suppliedFeedReference.rows.filter(row=>Math.abs(row.weightG-weightG)<1e-8)
  const status=rows.length>1?'ambiguous':rows.length===0?'no-exact-match':feedReferenceIssues(rows[0])?'inconsistent':'reference-only'
  return {status,rows}
}
