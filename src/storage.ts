import type { Pond } from './types'

export const STORAGE_KEY = 'viveiro-daniel:v4'
const LEGACY_KEYS = ['viveiro-daniel:v3', 'viveiro-daniel:v2', 'viveiro-daniel:v1']
const UPGRADE_BACKUP = 'viveiro-daniel:before-v4'
export type LocalStorage = Pick<Storage, 'getItem' | 'setItem'>
export type LocalLoad = { ponds: Pond[]; raw: string | null; blocked: boolean; message: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const text = (v: unknown): v is string => typeof v === 'string'

export function parseBackup(raw: string): Pond[] {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw Error('O arquivo não contém um backup JSON válido.') }
  if (object(value)) {
    if (value.format !== 'viveiro-daniel' || value.version !== 4) throw Error('Versão de backup não reconhecida. Os dados atuais foram preservados.')
    value = value.ponds
  }
  if (!Array.isArray(value)) throw Error('Não foi encontrada uma lista de viveiros no backup.')
  const ids = new Set<string>()
  return value.map((pond: unknown) => {
    if (!object(pond) || !text(pond.id) || !pond.id || ids.has(pond.id) || !text(pond.name) ||
      !finite(pond.areaHa) || !finite(pond.initialPopulation) || !text(pond.stockingDate) ||
      !text(pond.cycleStartDate) || !finite(pond.cycle) || !Array.isArray(pond.biometries)) {
      throw Error('Há um cadastro em formato inválido. Nenhum registro foi descartado ou substituído.')
    }
    ids.add(pond.id)
    const biometryIds = new Set<string>()
    for (const row of pond.biometries) {
      if (!object(row) || !text(row.id) || !row.id || biometryIds.has(row.id) || !text(row.date) ||
        !['currentWeightG', 'feedRatePercent', 'dailyFeedKg', 'accumulatedFeedKg'].every(k => finite(row[k])) ||
        !['sampleTotalWeightG', 'sampleCount', 'periodFeedKg'].every(k => row[k] == null || finite(row[k]))) {
        throw Error('Há uma biometria em formato inválido. Os registros originais foram preservados.')
      }
      biometryIds.add(row.id)
    }
    if (pond.plPerGram != null && !finite(pond.plPerGram)) throw Error('PL/g em formato inválido.')
    for (const key of ['laboratory', 'feeder']) if (pond[key] != null && !text(pond[key])) throw Error('Texto de cadastro inválido.')
    if (pond.productUsages != null && (!Array.isArray(pond.productUsages) || pond.productUsages.some(row =>
      !object(row) || !text(row.id) || !text(row.date) || !text(row.product) || !finite(row.quantity) || (!text(row.unit) || !['g','kg','mL','L'].includes(row.unit))))) throw Error('Uso de produto em formato inválido.')
    if (pond.populationMovements != null && (!Array.isArray(pond.populationMovements) || pond.populationMovements.some(row =>
      !object(row) || !text(row.transferId) || !text(row.date) || (!text(row.direction) || !['in','out'].includes(row.direction)) ||
      !finite(row.animals) || !finite(row.averageWeightG) || !finite(row.biomassKg) || !text(row.counterpartPondId) || !text(row.counterpartPondName)))) throw Error('Transferência em formato inválido.')
    return { ...pond, laboratory: pond.laboratory ?? '', feeder: pond.feeder ?? '', plPerGram: pond.plPerGram ?? null,
      productUsages: pond.productUsages ?? [], populationMovements: pond.populationMovements ?? [] } as Pond
  })
}

export function createBackup(ponds: Pond[]) {
  return JSON.stringify({ format: 'viveiro-daniel', version: 4, exportedAt: new Date().toISOString(), ponds }, null, 2)
}

/** Saves original bytes once, before any migration; old keys are never deleted. */
export function loadLocalPonds(storage: LocalStorage): LocalLoad {
  let raw: string | null = null
  try {
    raw = storage.getItem(STORAGE_KEY)
    if (raw !== null) return { ponds: parseBackup(raw), raw, blocked: false, message: '' }
    const sources: Record<string, string> = {}
    for (const key of LEGACY_KEYS) {
      const old = storage.getItem(key)
      if (old !== null) sources[key] = old
    }
    const source = LEGACY_KEYS.find(key => key in sources)
    if (!source) return { ponds: [], raw: null, blocked: false, message: '' }
    const ponds = parseBackup(sources[source])
    if (storage.getItem(UPGRADE_BACKUP) === null) storage.setItem(UPGRADE_BACKUP, JSON.stringify({ savedAt: new Date().toISOString(), sources }))
    const migratedRaw = createBackup(ponds)
    storage.setItem(STORAGE_KEY, migratedRaw)
    raw = migratedRaw
    return { ponds, raw, blocked: false, message: 'Seus registros anteriores foram preservados e atualizados neste aparelho.' }
  } catch {
    return { ponds: [], raw, blocked: true, message: 'Não foi possível abrir ou atualizar os dados salvos. Os originais foram preservados. Exporte a cópia de recuperação antes de continuar.' }
  }
}

export function saveLocalPonds(storage: LocalStorage, ponds: Pond[], expectedRaw: string | null) {
  if (storage.getItem(STORAGE_KEY) !== expectedRaw) throw Error('Os dados mudaram em outra aba. Recarregue a página antes de salvar; sua alteração ainda não foi gravada.')
  const next = createBackup(ponds)
  // Keep one prior local save, including before an explicit import/replacement.
  if (expectedRaw !== null) storage.setItem('viveiro-daniel:previous-save', expectedRaw)
  storage.setItem(STORAGE_KEY, next)
  return next
}

export function createRecoveryBackup(storage: LocalStorage) {
  const sources: Record<string,string> = {}
  for (const key of [STORAGE_KEY, ...LEGACY_KEYS, UPGRADE_BACKUP, 'viveiro-daniel:previous-save']) {
    const value = storage.getItem(key)
    if (value !== null) sources[key] = value
  }
  return JSON.stringify({ format:'viveiro-daniel-recovery', exportedAt:new Date().toISOString(), sources },null,2)
}

/** Web Locks serializes cooperating tabs; expectedRaw is captured before waiting. */
export async function saveLocalPondsLocked(storage: LocalStorage, ponds: Pond[], expectedRaw: string | null, locks?: Pick<LockManager, 'request'>) {
  const write = () => saveLocalPonds(storage, ponds, expectedRaw)
  return locks ? locks.request('viveiro-daniel:write', write) : write()
}

export async function loadLocalPondsLocked(storage: LocalStorage, locks?: Pick<LockManager, 'request'>) {
  const load = () => loadLocalPonds(storage)
  return locks ? locks.request('viveiro-daniel:write', load) : load()
}
