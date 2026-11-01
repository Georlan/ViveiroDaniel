import { round } from './domain/calculations'
export function formatDate(value?: string | null) {
  if (!value) return '—'
  const [year,month,day]=value.split('-')
  return `${day}/${month}/${year}`
}
export function formatNumber(value:number,decimals=0) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(Number(value.toPrecision(15)))
}
export function formatSigned(value:number,decimals=0) {
  const rounded=round(value,decimals)
  return (rounded>0?'+':'')+formatNumber(rounded,decimals)
}
