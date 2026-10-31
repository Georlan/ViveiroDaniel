import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  accumulatedFeedFromPeriod,
  averageWeightFromSample,
  calculateBiometry,
  calculateHistory,
  compareBiometriesForDisplay,
  daysBetween,
  densityPerSquareMeter,
  hectaresFromSquareMeters,
  squareMetersFromHectares,
  normalizeBiometryInputs,
  preparationDays,
  round,
  feedRateFromWeightTable,
  isCompleteSimpleBiometryDraft,
  isFeedPeriodInconsistent,
  manualFeedRateForEdit,
  technicalMetricsStatus,
  populationAtDate,
  populationBalanceAtDate,
} from './domain/calculations'
import { reportPonds } from './data/reportData'
import {
  aggregateProductUsages,
  findRegisteredProduct,
  formatProductAmount,
} from './domain/productUsage'
import type { BiometryInput, Pond, PopulationMovement, ProductUsage } from './types'
import { describeRevision } from './domain/audit'
import {
  buildShareUrl,
  clearStoredSyncToken,
  consumeInviteTokenFromUrl,
  createSyncToken,
  fetchRemoteState,
  getStoredSyncToken,
  fetchRemoteHistory,
  saveRemoteState,
  storeSyncToken,
  SyncApiError,
  type RemoteState,
} from './sync'


type UiIconName = 'back' | 'water' | 'biometry' | 'transfer' | 'product' | 'edit' | 'calendar' | 'warning'

function UiIcon({ name }: { name: UiIconName }) {
  const shapes: Record<UiIconName, React.ReactNode> = {
    back: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
    water: <><path d="M2 8c3-3 5-3 8 0s5 3 8 0 3-3 4-3" /><path d="M2 16c3-3 5-3 8 0s5 3 8 0 3-3 4-3" /></>,
    biometry: <><path d="M12 5v14M5 12h14" strokeWidth="2.4" /></>,
    transfer: <><path d="M4 7h16m-5-4 5 4-5 4" /><path d="M20 17H4m5-4-5 4 5 4" /></>,
    product: <><path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V3" /><path d="M7 15h10" /></>,
    edit: <><path d="M12 20h9" /><path d="m16.5 3.5 4 4L9 19l-5 1 1-5z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    warning: <><path d="m12 3 9 16a1.5 1.5 0 0 1-1.3 2H4.3A1.5 1.5 0 0 1 3 19l9-16z" /><path d="M12 9v5m0 3h.01" /></>,
  }

  return (
    <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[name]}
    </svg>
  )
}

const STORAGE_KEY = 'viveiro-daniel:v3'
const LEGACY_STORAGE_KEYS = ['viveiro-daniel:v2', 'viveiro-daniel:v1']

function cloneReportData() {
  return JSON.parse(JSON.stringify(reportPonds)) as Pond[]
}

function normalizePondState(pond: Pond): Pond {
  const base = reportPonds.find((item) => item.id === pond.id)
  const isLegacyV01 = pond.id === 'v01' && pond.dataVersion !== 2

  return {
    ...pond,
    dataVersion: 2,
    reportReferenceDate: null,
    plannedBiometries: [],
    biometries: isLegacyV01 ? [] : pond.biometries ?? [],
    productUsages: pond.productUsages ?? base?.productUsages ?? [],
  }
}

function loadPonds() {
  try {
    const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]
    for (const key of keys) {
      const stored = localStorage.getItem(key)
      if (!stored) continue

      const next = (JSON.parse(stored) as Pond[])
        .filter((pond) => pond.id !== 'v02')
        .map(normalizePondState)

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    }

    return cloneReportData().map(normalizePondState)
  } catch {
    return cloneReportData().map(normalizePondState)
  }
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  return day + '/' + month + '/' + year
}

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

function formatAreaSquareMeters(areaHa: number) {
  const squareMeters = round(squareMetersFromHectares(areaHa), 2)
  return formatNumber(squareMeters, Number.isInteger(squareMeters) ? 0 : 2)
}

function formatProductUsageAmount(baseQuantity: number, dimension: 'mass' | 'volume') {
  const amount = formatProductAmount(baseQuantity, dimension)
  const decimals = Number.isInteger(amount.value) ? 0 : 2
  return formatNumber(amount.value, decimals) + ' ' + amount.unit
}

function formatSigned(value: number, decimals = 0) {
  if (value === 0) return formatNumber(0, decimals)
  return (value > 0 ? '+' : '') + formatNumber(value, decimals)
}

function id(prefix: string) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
}

function localToday() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

type Modal =
  | { kind: 'pond'; editId?: string }
  | { kind: 'biometry'; editId?: string }
  | { kind: 'products'; pondId?: string }
  | { kind: 'transfer' }
  | null

type SyncStatus = 'local' | 'connecting' | 'synced' | 'syncing' | 'error'

function syncStatusLabel(status: SyncStatus) {
  if (status === 'connecting') return 'Conectando…'
  if (status === 'syncing') return 'Salvando…'
  if (status === 'synced') return 'Compartilhado'
  if (status === 'error') return 'Verificar sync'
  return 'Neste aparelho'
}

export default function App() {
  const [ponds, setPonds] = useState<Pond[]>(loadPonds)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [selectedId])
  const [modal, setModal] = useState<Modal>(null)
  const [syncToken, setSyncToken] = useState<string | null>(() => getStoredSyncToken())
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    getStoredSyncToken() ? 'connecting' : 'local',
  )
  const [syncMessage, setSyncMessage] = useState('')
  const [syncUpdatedAt, setSyncUpdatedAt] = useState<string | null>(null)
  const syncVersionRef = useRef(0)
  const syncBusyRef = useRef(false)

  const selected = ponds.find((pond) => pond.id === selectedId) ?? null
  const editingBiometry =
    selected && modal?.kind === 'biometry' && modal.editId
      ? selected.biometries.find((item) => item.id === modal.editId) ?? null
      : null
  const editingPond =
    modal?.kind === 'pond' && modal.editId
      ? ponds.find((pond) => pond.id === modal.editId) ?? null
      : null

  function cacheLocally(next: Pond[]) {
    setPonds(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function applyRemote(remote: RemoteState) {
    const next = remote.ponds
      .filter((pond) => pond.id !== 'v02')
      .map(normalizePondState)
    syncVersionRef.current = remote.version
    cacheLocally(next)
    setSyncUpdatedAt(remote.updatedAt)
    setSyncStatus('synced')
  }

  function syncErrorMessage(error: unknown) {
    if (error instanceof SyncApiError) return error.message
    return 'Não foi possível sincronizar agora.'
  }

  useEffect(() => {
    const inviteToken = consumeInviteTokenFromUrl()
    if (!inviteToken) return

    storeSyncToken(inviteToken)
    setSyncToken(inviteToken)
    setSyncStatus('connecting')
    setSyncMessage('Entrando na fonte compartilhada…')
  }, [])

  useEffect(() => {
    if (!syncToken) {
      syncVersionRef.current = 0
      setSyncStatus('local')
      return
    }

    const token = syncToken
    let cancelled = false

    async function connect() {
      if (syncBusyRef.current) return
      syncBusyRef.current = true
      setSyncStatus('connecting')

      try {
        const remote = await fetchRemoteState(token)
        if (cancelled) return

        if (!remote) {
          setSyncStatus('error')
          setSyncMessage(
            'Este link compartilhado ainda não possui uma fonte criada. Ative o compartilhamento no aparelho principal primeiro.',
          )
          return
        }

        applyRemote(remote)
        setSyncMessage('Usando a mesma fonte de dados em todos os aparelhos com este link.')
      } catch (error) {
        if (cancelled) return
        setSyncStatus('error')
        setSyncMessage(syncErrorMessage(error))
      } finally {
        syncBusyRef.current = false
      }
    }

    void connect()

    return () => {
      cancelled = true
    }
  }, [syncToken])

  useEffect(() => {
    if (!syncToken) return

    const token = syncToken
    let stopped = false

    async function pullLatest() {
      if (
        stopped ||
        syncBusyRef.current ||
        document.visibilityState !== 'visible'
      ) {
        return
      }

      syncBusyRef.current = true
      try {
        const remote = await fetchRemoteState(token)
        if (!remote || stopped) return

        if (remote.version > syncVersionRef.current) {
          applyRemote(remote)
          setSyncMessage('Atualizado com as mudanças do outro aparelho.')
        }
      } catch (error) {
        if (!stopped) {
          setSyncStatus('error')
          setSyncMessage(syncErrorMessage(error))
        }
      } finally {
        syncBusyRef.current = false
      }
    }

    const timer = window.setInterval(() => {
      void pullLatest()
    }, 15_000)

    const onFocus = () => void pullLatest()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void pullLatest()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [syncToken])

  async function persist(next: Pond[]) {
    if (!syncToken) {
      cacheLocally(next)
      return true
    }

    if (syncBusyRef.current) {
      setSyncStatus('error')
      setSyncMessage('Aguarde a sincronização terminar e tente salvar novamente.')
      return false
    }

    syncBusyRef.current = true
    setSyncStatus('syncing')
    setSyncMessage('Salvando na fonte compartilhada…')

    try {
      const remote = await saveRemoteState(
        syncToken,
        next,
        syncVersionRef.current,
      )
      applyRemote(remote)
      setSyncMessage('Salvo. Os outros aparelhos receberão esta versão automaticamente.')
      return true
    } catch (error) {
      if (error instanceof SyncApiError && error.code === 'conflict' && error.remote) {
        applyRemote(error.remote)
        setSyncStatus('error')
        setSyncMessage(
          'O outro aparelho salvou uma mudança primeiro. A versão mais nova foi carregada; revise e salve novamente.',
        )
        return false
      }

      setSyncStatus('error')
      setSyncMessage(syncErrorMessage(error))
      return false
    } finally {
      syncBusyRef.current = false
    }
  }

  async function addPond(pond: Pond) {
    const saved = await persist([...ponds, pond])
    if (!saved) return

    setSelectedId(pond.id)
    setModal(null)
  }

  async function updatePond(pond: Pond) {
    const next = ponds.map((item) => (item.id === pond.id ? pond : item))
    const saved = await persist(next)
    if (saved) setModal(null)
  }

  async function saveProductUsage(pondId: string, usage: ProductUsage) {
    const next = ponds.map((pond) =>
      pond.id === pondId
        ? { ...pond, productUsages: [...(pond.productUsages ?? []), usage] }
        : pond,
    )
    const saved = await persist(next)
    if (saved) setModal(null)
  }

  async function saveTransfer(fromId: string, toId: string, movement: Omit<PopulationMovement, 'direction' | 'counterpartPondId' | 'counterpartPondName'>) {
    const from = ponds.find((pond) => pond.id === fromId)
    const to = ponds.find((pond) => pond.id === toId)
    if (!from || !to || fromId === toId) return false
    const out: PopulationMovement = { ...movement, direction: 'out', counterpartPondId: to.id, counterpartPondName: to.name }
    const into: PopulationMovement = { ...movement, direction: 'in', counterpartPondId: from.id, counterpartPondName: from.name }
    const next = ponds.map((pond) => pond.id === fromId
      ? { ...pond, populationMovements: [...(pond.populationMovements ?? []), out] }
      : pond.id === toId
        ? { ...pond, populationMovements: [...(pond.populationMovements ?? []), into] }
        : pond)
    const saved = await persist(next)
    if (saved) setModal(null)
    return saved
  }

  async function saveBiometry(input: BiometryInput) {
    if (!selected) return

    const next = ponds.map((pond) => {
      if (pond.id !== selected.id) return pond

      const exists = pond.biometries.some((item) => item.id === input.id)
      const biometries = exists
        ? pond.biometries.map((item) => (item.id === input.id ? input : item))
        : [...pond.biometries, input]

      return {
        ...pond,
        biometries: normalizeBiometryInputs(biometries),
      }
    })

    const saved = await persist(next)
    if (saved) setModal(null)
  }

  async function activateSharing() {
    if (syncBusyRef.current) return

    syncBusyRef.current = true
    setSyncStatus('connecting')
    setSyncMessage('Criando a fonte compartilhada…')

    const token = createSyncToken()

    try {
      const remote = await saveRemoteState(token, ponds, 0)
      storeSyncToken(token)
      setSyncToken(token)
      applyRemote(remote)
      setSyncMessage(
        'Compartilhamento ativado. Copie o link e envie apenas para quem deve editar estes dados.',
      )
    } catch (error) {
      clearStoredSyncToken()
      setSyncToken(null)
      setSyncStatus('local')
      setSyncMessage(syncErrorMessage(error))
    } finally {
      syncBusyRef.current = false
    }
  }

  async function copyShareLink() {
    if (!syncToken) return
    const url = buildShareUrl(syncToken)

    try {
      await navigator.clipboard.writeText(url)
      setSyncMessage('Link compartilhado copiado. Quem abrir esse link usará a mesma fonte.')
    } catch {
      setSyncMessage('Não foi possível copiar automaticamente. Tente novamente pelo navegador.')
    }
  }

  async function syncNow() {
    if (!syncToken || syncBusyRef.current) return

    syncBusyRef.current = true
    setSyncStatus('connecting')
    setSyncMessage('Buscando a versão mais recente…')

    try {
      const remote = await fetchRemoteState(syncToken)
      if (!remote) {
        setSyncStatus('error')
        setSyncMessage('A fonte compartilhada não foi encontrada.')
        return
      }

      applyRemote(remote)
      setSyncMessage('Dados atualizados com a fonte compartilhada.')
    } catch (error) {
      setSyncStatus('error')
      setSyncMessage(syncErrorMessage(error))
    } finally {
      syncBusyRef.current = false
    }
  }

  function disconnectSync() {
    clearStoredSyncToken()
    setSyncToken(null)
    syncVersionRef.current = 0
    setSyncUpdatedAt(null)
    setSyncStatus('local')
    setSyncMessage(
      'Este aparelho voltou ao modo local. A cópia compartilhada continua existindo para quem tiver o link.',
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        {selected ? (
          <div className="topbar-nav">
            <button className="back-button" onClick={() => setSelectedId(null)} aria-label="Voltar para viveiros">
              <UiIcon name="back" />
            </button>
            <div className="topbar-title-block">
              <span className="eyebrow">Viveiro</span>
              <h1>{selected.name}</h1>
            </div>
          </div>
        ) : (
          <div className="topbar-brand">
            <span className="eyebrow">Controle zootécnico</span>
            <h1>Viveiros</h1>
          </div>
        )}
        <span className={syncToken ? 'device-badge synced' : 'device-badge'}>
          {syncStatusLabel(syncStatus)}
        </span>
      </header>

      <main>
        {selected ? (
          <PondDetail
            pond={selected}
            onTransfer={() => setModal({ kind: 'transfer' })}
            onAddBiometry={() => setModal({ kind: 'biometry' })}
            onEditBiometry={(id) => setModal({ kind: 'biometry', editId: id })}
            onEditPond={() => setModal({ kind: 'pond', editId: selected.id })}
            onProducts={() => setModal({ kind: 'products', pondId: selected.id })}
          />
        ) : (
          <Dashboard
            ponds={ponds}
            onOpen={setSelectedId}
            onAdd={() => setModal({ kind: 'pond' })}
            syncToken={syncToken}
            syncStatus={syncStatus}
            syncMessage={syncMessage}
            syncUpdatedAt={syncUpdatedAt}
            onActivateSharing={() => void activateSharing()}
            onCopyShareLink={() => void copyShareLink()}
            onSyncNow={() => void syncNow()}
            onDisconnectSync={disconnectSync}
          />
        )}
      </main>

      {modal?.kind === 'pond' && (
        <PondForm
          initial={editingPond ?? undefined}
          onClose={() => setModal(null)}
          onSave={editingPond ? updatePond : addPond}
        />
      )}
      {modal?.kind === 'products' && (
        <ProductUsageForm
          ponds={ponds}
          initialPondId={modal.pondId}
          onClose={() => setModal(null)}
          onSave={saveProductUsage}
        />
      )}
      {modal?.kind === 'transfer' && selected && (
        <TransferForm ponds={ponds} source={selected} onClose={() => setModal(null)} onSave={saveTransfer} />
      )}
      {modal?.kind === 'biometry' && selected && (
        <BiometryForm
          pond={selected}
          initial={editingBiometry ?? undefined}
          onClose={() => setModal(null)}
          onSave={saveBiometry}
        />
      )}
    </div>
  )
}

function Dashboard({
  ponds,
  onOpen,
  onAdd,
  syncToken,
  syncStatus,
  syncMessage,
  syncUpdatedAt,
  onActivateSharing,
  onCopyShareLink,
  onSyncNow,
  onDisconnectSync,
}: {
  ponds: Pond[]
  onOpen: (id: string) => void
  onAdd: () => void
  syncToken: string | null
  syncStatus: SyncStatus
  syncMessage: string
  syncUpdatedAt: string | null
  onActivateSharing: () => void
  onCopyShareLink: () => void
  onSyncNow: () => void
  onDisconnectSync: () => void
}) {
  return (
    <section className="page">
      <div className="section-heading compact-heading">
        <div>
          <h2>Produção em andamento</h2>
        </div>
        <button className="text-button" onClick={onAdd}>Adicionar</button>
      </div>

      <div className="pond-list">
        {ponds.map((pond) => (
          <PondCard
            pond={pond}
            key={pond.id}
            onOpen={() => onOpen(pond.id)}
          />
        ))}
      </div>

      <details className="dashboard-settings">
        <summary>Compartilhamento e histórico</summary>
        <SyncPanel
          connected={Boolean(syncToken)}
          status={syncStatus}
          message={syncMessage}
          updatedAt={syncUpdatedAt}
          onActivate={onActivateSharing}
          onCopy={onCopyShareLink}
          onRefresh={onSyncNow}
          onDisconnect={onDisconnectSync}
        />
        {syncToken && <HistoryPanel key={syncToken} syncToken={syncToken} />}
      </details>

    </section>
  )
}

function SyncPanel({
  connected,
  status,
  message,
  updatedAt,
  onActivate,
  onCopy,
  onRefresh,
  onDisconnect,
}: {
  connected: boolean
  status: SyncStatus
  message: string
  updatedAt: string | null
  onActivate: () => void
  onCopy: () => void
  onRefresh: () => void
  onDisconnect: () => void
}) {
  if (!connected) {
    return (
      <div className="sync-minimal">
        <p>Os dados ficam neste aparelho. Ative para usar a mesma base em outros dispositivos.</p>
        {message && <small role="status" className="sync-message">{message}</small>}
        <button className="secondary-button" onClick={onActivate}
          disabled={status === 'connecting' || status === 'syncing'}>
          {status === 'connecting' ? 'Ativando…' : 'Ativar compartilhamento'}
        </button>
      </div>
    )
  }

  return (
    <div className={'sync-minimal' + (status === 'error' ? ' has-error' : '')}>
      <p>{syncStatusLabel(status)}{updatedAt ? ' · ' + new Date(updatedAt).toLocaleString('pt-BR') : ''}</p>
      {message && <small role="status" className="sync-message">{message}</small>}
      <div className="sync-actions">
        <button className="secondary-button" onClick={onCopy}>Copiar link</button>
        <button className="secondary-button" onClick={onRefresh}>Atualizar</button>
        <button className="sync-text-button danger" onClick={onDisconnect}>Usar só neste aparelho</button>
      </div>
    </div>
  )
}

function HistoryPanel({ syncToken }: { syncToken: string }) {
  const [revisions, setRevisions] = useState<RemoteState[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadHistory() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchRemoteHistory(syncToken)
      setRevisions(result.revisions)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao consultar alterações.')
    } finally {
      setLoading(false)
    }
  }

  const entries = revisions?.slice(0, -1).map((revision, index) => ({
    version: revision.version,
    updatedAt: revision.updatedAt,
    changes: describeRevision(revisions[index + 1].ponds, revision.ponds),
  })) ?? []

  return (
    <article className="sync-card history-panel">
      <div className="sync-card-copy">
        <span className="eyebrow">Conferência de registros</span>
        <strong>Histórico de alterações</strong>
        <p>
          Consulte o que mudou entre as versões salvas na fonte compartilhada.
          Os registros começam após esta atualização; versões antigas não podem ser recuperadas.
          O histórico mostra valores, não identifica qual pessoa digitou.
        </p>
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => void loadHistory()}
        >
          {loading ? 'Consultando…' : revisions ? 'Atualizar histórico' : 'Ver alterações salvas'}
        </button>
        {error && <small className="sync-message" role="alert">{error}</small>}
        {revisions && (
          <div className="history-revisions">
            {entries.length === 0 && (
              <small>Aguardando duas versões registradas para comparar as alterações.</small>
            )}
            {entries.map((entry) => (
              <details key={entry.version} className="technical-adjustment">
                <summary>
                  <span>
                    <strong>{new Date(entry.updatedAt).toLocaleString('pt-BR')}</strong>
                    <small>Versão {entry.version} · {entry.changes.length} alterações</small>
                  </span>
                </summary>
                <div className="technical-adjustment-body">
                  {entry.changes.length ? entry.changes.map((change, index) => (
                    <p key={index}>
                      <strong>{change.pond}: </strong>{change.description}
                    </p>
                  )) : (
                    <p>Sem mudanças detectadas nos campos acompanhados.</p>
                  )}
                </div>
              </details>
            ))}
            <small>São exibidas até 20 alterações de versão recentes, sem identificar usuários.</small>
          </div>
        )}
      </div>
    </article>
  )
}

function calculatedMetric(
  status: ReturnType<typeof technicalMetricsStatus> | null,
  kind: 'biomassKg' | 'survivalPercent' | 'fca',
) {
  if (!status?.hasCalculatedValues) return 'Sem base'
  if (!status.isPlausible) return 'Revisar estimativa'
  const value = status[kind]
  if (kind === 'fca' && value === null) return 'Após transferência'
  if (value === null || !Number.isFinite(value)) return 'Sem base'
  return kind === 'biomassKg'
    ? formatNumber(round(value)) + ' kg'
    : kind === 'survivalPercent'
      ? formatNumber(round(value)) + '%'
      : formatNumber(round(value, 2), 2)
}

function PondCard({
  pond,
  onOpen,
}: {
  pond: Pond
  onOpen: () => void
}) {
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  const previous = history.length > 1 ? history[history.length - 2] : null
  const populationInControl = populationAtDate(pond, localToday())
  const latestTechnical = latest ? technicalMetricsStatus(pond, latest) : null
  const needsReview = latest && (
    (latest.periodFeedKg != null && isFeedPeriodInconsistent(latest.dailyFeedKg, latest.periodFeedKg)) ||
    (latestTechnical?.hasCalculatedValues && !latestTechnical.isPlausible)
  )

  return (
    <article className="pond-card actionable">
      <button className="pond-card-main" onClick={onOpen} aria-label={'Abrir ' + pond.name}>
        <div className="pond-card-head">
          <span className="pond-name">{pond.name}</span>
          <span className={latest ? 'status ready' : 'status waiting'}>
            {latest ? 'Em acompanhamento' : 'Sem biometria'}
          </span>
        </div>
        <div className="pond-density-primary">
          <span>Densidade no controle</span>
          <strong>{formatNumber(round(densityPerSquareMeter(pond, populationInControl), 1), 1)} <small>animais/m²</small></strong>
        </div>
        <p className="pond-meta">
          {formatNumber(populationInControl)} animais · {formatAreaSquareMeters(pond.areaHa)} m²
        </p>

        {latest ? (
          <div className="pond-card-latest">
            <div>
              <span>Última biometria · dia {latest.cultivationDay}</span>
              <strong>{formatNumber(latest.currentWeightG, 2)} g</strong>
            </div>
            {previous && (
              <div>
                <span>Ganho</span>
                <strong>{formatSigned(round(latest.currentWeightG - previous.currentWeightG, 2), 2)} g</strong>
              </div>
            )}
          </div>
        ) : (
          <p className="pond-card-empty">Registre a primeira biometria para acompanhar o peso.</p>
        )}
        {needsReview && (
          <span className="pond-card-alert"><UiIcon name="warning" /> Conferir ração e taxa</span>
        )}
        <div className="pond-card-cta">
          <span>Ver viveiro</span>
          <span className="cta-arrow" aria-hidden="true">→</span>
        </div>
      </button>
    </article>
  )
}

function PondDetail({
  pond,
  onTransfer,
  onAddBiometry,
  onEditBiometry,
  onEditPond,
  onProducts,
}: {
  pond: Pond
  onTransfer: () => void
  onAddBiometry: () => void
  onEditBiometry: (id: string) => void
  onEditPond: () => void
  onProducts: () => void
}) {
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  const today = localToday()
  const cultivationDays = Math.max(0, daysBetween(pond.stockingDate, today))
  const balance = populationBalanceAtDate(pond, today)
  const populationInControl = balance.population
  const latestTechnical = latest ? technicalMetricsStatus(pond, latest) : null
  const latestFeedMismatch = latest?.periodFeedKg != null &&
    isFeedPeriodInconsistent(latest.dailyFeedKg, latest.periodFeedKg)

  return (
    <section className="page detail-page">
      <div className="pond-header-card">
        <div className="pond-header-top">
          <span className="hero-kicker">Dia {cultivationDays} de cultivo</span>
        </div>
        <div className="pond-density-hero">
          <span>Densidade no controle</span>
          <strong>{formatNumber(round(densityPerSquareMeter(pond, populationInControl), 1), 1)} <em>animais/m²</em></strong>
        </div>
        <p className="pond-header-meta">
          {formatNumber(populationInControl)} animais · {formatAreaSquareMeters(pond.areaHa)} m²
        </p>
      </div>

      <div className="operational-actions">
        <button className="primary-button operational-primary" onClick={onAddBiometry}>
          <UiIcon name="biometry" /> Registrar biometria
        </button>
        <div className="operational-secondary-grid">
          <button className="secondary-button" onClick={onTransfer}>
            <UiIcon name="transfer" /> <span>Transferir</span>
          </button>
          <button className="secondary-button" onClick={onProducts}>
            <UiIcon name="product" /> <span>Produtos</span>
          </button>
        </div>
      </div>

      {latest ? (
        <section className="latest-section" aria-label="Última biometria">
          <div className="section-heading latest-heading">
            <div>
              <h2>Última biometria</h2>
              <p>Dia {latest.cultivationDay} · {formatDate(latest.date)}</p>
            </div>
            <button className="text-button" onClick={() => onEditBiometry(latest.id)}>
              Editar
            </button>
          </div>

          <div className="latest-metrics">
            <Metric label="Peso médio" value={formatNumber(latest.currentWeightG, 2) + ' g'} featured />
            <Metric label="Ganho" value={latest.previousWeightG === null ? '—' : formatSigned(round(latest.growthG, 2), 2) + ' g'} />
            <Metric label="Cresc. médio" value={latest.previousWeightG === null ? '—' : formatNumber(round(latest.averageGrowthPerWeekG, 2), 2) + ' g/sem'} />
          </div>

          {(latestFeedMismatch || (latestTechnical?.hasCalculatedValues && !latestTechnical.isPlausible)) && (
            <div className="feed-integrity-callout" role="alert">
              <UiIcon name="warning" />
              <span>{latestFeedMismatch ? 'Conferir ração do período' : 'Estimativas sob revisão'}</span>
              <button type="button" className="secondary-button" onClick={() => onEditBiometry(latest.id)}>Revisar</button>
            </div>
          )}

          <details className="detail-disclosure field-disclosure">
            <summary>Dados da biometria</summary>
            <div className="field-metrics">
              {latest.sampleTotalWeightG != null && latest.sampleCount != null ? (
                <>
                  <Metric label="Peso da amostra" value={formatNumber(latest.sampleTotalWeightG) + ' g'} />
                  <Metric label="Amostra" value={formatNumber(latest.sampleCount) + ' animais'} />
                  <Metric label="Ração/dia" value={formatNumber(latest.dailyFeedKg) + ' kg'} />
                  <Metric label="Ração no período" value={formatNumber(latest.periodFeedKg ?? 0) + ' kg'} />
                </>
              ) : (
                <>
                  <Metric label="Taxa de alimentação" value={formatNumber(latest.feedRatePercent, 1) + '%'} />
                  <Metric label="Ração/dia" value={formatNumber(latest.dailyFeedKg) + ' kg'} />
                </>
              )}
              <Metric label="Ração acumulada" value={formatNumber(latest.accumulatedFeedKg) + ' kg'} />
              {latestTechnical?.hasCalculatedValues && latestTechnical.isPlausible && (
                <>
                  <Metric label="Biomassa est." value={calculatedMetric(latestTechnical, 'biomassKg')} />
                  <Metric label="Sobrev. est." value={calculatedMetric(latestTechnical, 'survivalPercent')} />
                  <Metric label="FCA est." value={calculatedMetric(latestTechnical, 'fca')} />
                </>
              )}
            </div>
            {latestFeedMismatch ? (
              <p className="technical-inline-note">
                O período ({formatNumber(latest.periodFeedKg ?? 0)} kg) é menor que a ração de um dia ({formatNumber(latest.dailyFeedKg)} kg).
              </p>
            ) : latestTechnical?.hasCalculatedValues && !latestTechnical.isPlausible ? (
              <p className="technical-inline-note">
                {formatNumber(latest.dailyFeedKg)} kg/dia superam a referência de {formatNumber(latestTechnical.feedFor100Kg ?? 0, 2)} kg/dia com taxa de {formatNumber(latest.feedRatePercent, 1)}%. Confira os dados antes de usar biomassa, sobrevivência e FCA.
              </p>
            ) : !latestTechnical?.hasCalculatedValues ? (
              <p className="technical-inline-note">Sem dados suficientes para estimar biomassa, sobrevivência e FCA.</p>
            ) : null}
            {latestTechnical?.hasCalculatedValues && latestTechnical.isPlausible && latestTechnical.fca === null && (
              <p className="technical-inline-note">FCA indisponível após transferência sem ração por lote.</p>
            )}
            <p className="estimate-footnote">Biomassa e sobrevivência são estimativas baseadas na taxa de alimentação.</p>
          </details>
        </section>
      ) : (
        <div className="empty-card">
          <h2>Sem biometria</h2>
          <p>Registre a primeira amostra.</p>
        </div>
      )}

      <HistorySection pond={pond} onEditBiometry={onEditBiometry} />

      {(pond.populationMovements ?? []).length > 0 && (
        <details className="pond-extra-details movement-history">
          <summary>Transferências</summary>
          <div className="movement-list">
            {[...(pond.populationMovements ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map((movement) => (
              <div className="movement-row" key={movement.transferId}>
                <strong>{movement.direction === 'out' ? 'Saída' : 'Entrada'} · {formatNumber(movement.animals)} animais</strong>
                <span>{formatDate(movement.date)} · {movement.counterpartPondName} · {formatNumber(movement.biomassKg, 2)} kg estimados</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="pond-extra-details">
        <summary>Dados do viveiro</summary>
        <div className="facts-grid">
          <Fact label="Área" value={formatAreaSquareMeters(pond.areaHa) + ' m²'} />
          <Fact label="População inicial" value={formatNumber(pond.initialPopulation)} />
          <Fact label="Povoamento" value={formatDate(pond.stockingDate)} />
          <Fact label="Início do ciclo" value={formatDate(pond.cycleStartDate)} />
          <Fact label="Dias de preparo" value={preparationDays(pond) + ' dias'} />
          <Fact label="Ciclo" value={String(pond.cycle)} />
          <Fact label="Laboratório" value={pond.laboratory || '—'} />
          <Fact label="PL/g" value={pond.plPerGram === null ? '—' : formatNumber(pond.plPerGram)} />
          <Fact label="Raçoador" value={pond.feeder || '—'} />
        </div>
        {(balance.incomingAnimals > 0 || balance.outgoingAnimals > 0) && (
          <p className="balance-caption">
            Saldo: {formatNumber(balance.initialPopulation)} + {formatNumber(balance.incomingAnimals)} − {formatNumber(balance.outgoingAnimals)} = {formatNumber(populationInControl)} animais.
          </p>
        )}
        <button className="secondary-button" onClick={onEditPond}>Editar cadastro</button>
      </details>
    </section>
  )
}

function HistorySection({
  pond,
  onEditBiometry,
}: {
  pond: Pond
  onEditBiometry: (id: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const history = calculateHistory(pond)
  if (!history.length) return null

  const recent = [...history].reverse()
  const visible = showAll ? recent : recent.slice(0, 3)

  return (
    <section className="biometry-history" aria-label="Histórico de biometrias">
      <div className="section-heading history-heading">
        <h2>Histórico</h2>
        {history.length > 3 && (
          <button className="text-button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
            {showAll ? 'Ver menos' : 'Ver todas'}
          </button>
        )}
      </div>
      <div className="history-list">
        {visible.map((row) => {
          const technical = technicalMetricsStatus(pond, row)
          const needsReview = (row.periodFeedKg != null && isFeedPeriodInconsistent(row.dailyFeedKg, row.periodFeedKg)) ||
            (technical.hasCalculatedValues && !technical.isPlausible)
          return (
            <article className="history-card" key={row.id}>
              <div className="history-date">
                <strong>Dia {row.cultivationDay}</strong>
                <span>{formatDate(row.date)}</span>
              </div>
              <div className="history-values">
                <span className="history-weight">
                  <strong>{formatNumber(row.currentWeightG, 2)} g</strong>
                  <small>Peso</small>
                </span>
                <span>
                  <strong>{row.previousWeightG === null ? '—' : formatSigned(round(row.growthG, 2), 2) + ' g'}</strong>
                  <small>Ganho</small>
                </span>
              </div>
              {needsReview && <span className="history-alert"><UiIcon name="warning" /> Ração</span>}
              <button className="history-edit-button" onClick={() => onEditBiometry(row.id)}
                aria-label={'Editar biometria do dia ' + row.cultivationDay}>Editar</button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Metric({ label, value, featured = false }: { label: string; value: string; featured?: boolean }) {
  return (
    <div className={featured ? 'metric featured' : 'metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function TransferForm({
  ponds,
  source,
  onClose,
  onSave,
}: {
  ponds: Pond[]
  source: Pond
  onClose: () => void
  onSave: (fromId: string, toId: string, movement: Omit<PopulationMovement, 'direction' | 'counterpartPondId' | 'counterpartPondName'>) => Promise<boolean>
}) {
  const submittingRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const targets = ponds.filter((pond) => pond.id !== source.id)
  const sourceHistory = calculateHistory(source)
  const latest = sourceHistory[sourceHistory.length - 1]
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [date, setDate] = useState(localToday())
  const [animals, setAnimals] = useState('')
  const [weight, setWeight] = useState(latest ? String(round(latest.currentWeightG, 2)) : '')
  const [error, setError] = useState('')
  const target = targets.find((pond) => pond.id === targetId)
  const firstEligibleDate = target && target.stockingDate > source.stockingDate ? target.stockingDate : source.stockingDate
  const sourcePopulation = populationAtDate(source, date)
  const targetPopulation = target ? populationAtDate(target, date) : 0
  const count = Number(animals)
  const averageWeightG = Number(weight.replace(',', '.'))
  const biomassKg = count * averageWeightG / 1_000_000

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return
    setError('')
    if (!target) return setError('Cadastre outro viveiro antes de transferir.')
    if (date < firstEligibleDate || date > localToday()) return setError('Use uma data entre o povoamento dos dois viveiros e hoje.')
    if (!Number.isInteger(count) || count <= 0) return setError('Informe a quantidade inteira de camarões.')
    if (count > sourcePopulation) return setError('A quantidade excede a população registrada no viveiro de origem.')
    if (!Number.isFinite(averageWeightG) || averageWeightG <= 0) return setError('Informe o peso médio atual do lote transferido.')
    submittingRef.current = true
    setSaving(true)
    try {
      const saved = await onSave(source.id, target.id, {
        transferId: id('transfer'), date, animals: count, averageWeightG,
        biomassKg: round(biomassKg, 3),
      })
      if (!saved) setError('A transferência não foi salva. Confira a sincronização e tente novamente.')
    } catch {
      setError('Não foi possível registrar a transferência. Tente novamente.')
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Transferir camarões" subtitle={source.name} onClose={onClose}>
      {targets.length === 0 ? (
        <div className="empty-card">
          <h2>Falta o viveiro de destino</h2>
          <p>Cadastre outro viveiro para registrar a transferência.</p>
          
        </div>
      ) : (
        <form onSubmit={submit} className="form-grid">
          <div className="transfer-route">
            <span><small>Origem</small><strong>{source.name}</strong></span>
            <span aria-hidden="true">→</span>
            <Field label="Destino" required>
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                {targets.map((pond) => <option value={pond.id} key={pond.id}>{pond.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Data da transferência" required>
            <input required type="date" min={firstEligibleDate} max={localToday()} value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Quantidade de camarões" required>
            <input required type="number" min="1" step="1" inputMode="numeric" value={animals} onChange={(event) => setAnimals(event.target.value)} />
            <small>Disponíveis: {formatNumber(sourcePopulation)}</small>
          </Field>
          <Field label="Peso médio transferido (g)" required>
            <input required type="number" min="0.01" step="any" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} />
            
          </Field>
          {count > 0 && target && Number.isFinite(averageWeightG) && averageWeightG > 0 && (
            <div className="transfer-preview">
              <strong>{formatNumber(biomassKg, 3)} kg de biomassa estimada</strong>
              <span>{formatNumber(sourcePopulation - count)} animais ficam em {source.name} · {formatNumber(targetPopulation + count)} passam ao controle de {target.name}</span>
              
            </div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Registrar transferência'}</button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}

function PondForm({
  initial,
  onClose,
  onSave,
}: {
  initial?: Pond
  onClose: () => void
  onSave: (pond: Pond) => void
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    areaSquareMeters: initial ? String(squareMetersFromHectares(initial.areaHa)) : '',
    initialPopulation: initial ? String(initial.initialPopulation) : '',
    laboratory: initial?.laboratory ?? '',
    stockingDate: initial?.stockingDate ?? '',
    cycleStartDate: initial?.cycleStartDate ?? '',
    cycle: initial ? String(initial.cycle) : '1',
    feeder: initial?.feeder ?? '',
    plPerGram: initial?.plPerGram != null ? String(initial.plPerGram) : '',
  })

  const areaM2 = Number(form.areaSquareMeters)
  const initialAnimals = Number(form.initialPopulation)
  const initialPopulationValid = form.initialPopulation.trim() &&
    Number.isSafeInteger(initialAnimals) && initialAnimals >= 0
  const movementBalance = initial && initialPopulationValid
    ? populationBalanceAtDate({ ...initial, initialPopulation: initialAnimals }, localToday())
    : null
  const draftDensity = form.areaSquareMeters.trim() && initialPopulationValid &&
    Number.isFinite(areaM2) && areaM2 > 0
      ? (movementBalance?.population ?? initialAnimals) / areaM2
      : null

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!Number.isFinite(areaM2) || areaM2 <= 0 || !initialPopulationValid || (movementBalance && movementBalance.population < 0)) return
    onSave({
      ...(initial ?? {
        id: id('pond'),
        dataVersion: 2,
        reportReferenceDate: null,
        plannedBiometries: [],
        biometries: [],
      }),
      name: form.name.trim(),
      areaHa: hectaresFromSquareMeters(areaM2),
      initialPopulation: initialAnimals,
      laboratory: form.laboratory.trim(),
      stockingDate: form.stockingDate,
      cycleStartDate: form.cycleStartDate,
      cycle: Number(form.cycle),
      feeder: form.feeder.trim(),
      plPerGram: form.plPerGram ? Number(form.plPerGram) : null,
      dataVersion: 2,
      reportReferenceDate: null,
      plannedBiometries: [],
      productUsages: initial?.productUsages ?? [],
    })
  }

  return (
    <ModalShell
      title={initial ? 'Editar viveiro' : 'Novo viveiro'}
      subtitle=""
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-grid">
        <Field label="Nome" required><input required placeholder="Ex.: V03" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="two-cols">
          <Field label="Área do viveiro (m²)" required><input required type="number" min="0.01" step="any" inputMode="decimal" value={form.areaSquareMeters} onChange={(e) => setForm({ ...form, areaSquareMeters: e.target.value })} /></Field>
          <Field label="População inicial (sem transferências)" required>
            <input required type="number" min="0" step="1" inputMode="numeric" value={form.initialPopulation} onChange={(e) => setForm({ ...form, initialPopulation: e.target.value })} />
            <small>Se todos vieram por transferência, informe 0.</small>
          </Field>
        </div>
        {draftDensity !== null && (
          <div className="pond-form-density-preview" role="status">
            <span>{movementBalance ? 'Densidade do saldo com transferências' : 'Densidade inicial cadastrada'}</span>
            <strong>{formatNumber(round(draftDensity, 1), 1)} animais/m²</strong>

          </div>
        )}
        {movementBalance && movementBalance.incomingAnimals > 0 && initialAnimals > 0 && (
          <div className="correction-note">
            <strong>Possível duplicidade</strong>
            <span>{formatNumber(movementBalance.incomingAnimals)} animais já entraram por transferência.</span>
            <button type="button" className="secondary-button" onClick={() => setForm({ ...form, initialPopulation: '0' })}>
              Zerar população inicial
            </button>
          </div>
        )}
        <Field label="Laboratório" required><input required value={form.laboratory} onChange={(e) => setForm({ ...form, laboratory: e.target.value })} /></Field>
        <div className="two-cols">
          <Field label="Povoamento" required><input required type="date" value={form.stockingDate} onChange={(e) => setForm({ ...form, stockingDate: e.target.value })} /></Field>
          <Field label="Início do ciclo" required><input required type="date" value={form.cycleStartDate} onChange={(e) => setForm({ ...form, cycleStartDate: e.target.value })} /></Field>
        </div>
        <div className="two-cols">
          <Field label="Ciclo" required><input required type="number" min="1" inputMode="numeric" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })} /></Field>
          <Field label="PL/g"><input type="number" min="0" step="any" inputMode="decimal" value={form.plPerGram} onChange={(e) => setForm({ ...form, plPerGram: e.target.value })} /></Field>
        </div>
        <div className="modal-actions">
          <button className="primary-button" type="submit">{initial ? 'Salvar alterações' : 'Criar viveiro'}</button>
        </div>
      </form>
    </ModalShell>
  )
}

function ProductUsageForm({
  ponds,
  initialPondId,
  onClose,
  onSave,
}: {
  ponds: Pond[]
  initialPondId?: string
  onClose: () => void
  onSave: (pondId: string, usage: ProductUsage) => void
}) {
  const now = new Date()
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  const defaultMonth = today.slice(0, 7)
  const [pondId, setPondId] = useState(initialPondId ?? ponds[0]?.id ?? '')
  const [form, setForm] = useState({
    date: today,
    product: '',
    quantity: '',
    unit: 'mL' as ProductUsage['unit'],
    note: '',
    month: defaultMonth,
  })
  const [error, setError] = useState('')

  const selectedPond = ponds.find((pond) => pond.id === pondId)
  const usages = selectedPond?.productUsages ?? []
  const products = aggregateProductUsages(usages, form.month)
  const registeredNames = [...new Set(products.map((item) => item.product))]

  function handleProductChange(value: string) {
    const registered = findRegisteredProduct(usages, value)
    setForm({
      ...form,
      product: value,
      unit: registered?.unit ?? form.unit,
    })
    setError('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const quantity = Number(form.quantity)

    if (!pondId) {
      setError('Selecione o viveiro.')
      return
    }

    if (!form.date || !form.product.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Informe data, produto e uma quantidade maior que zero.')
      return
    }

    const registered = findRegisteredProduct(usages, form.product)

    onSave(pondId, {
      id: id('usage'),
      date: form.date,
      product: registered?.product ?? form.product.trim(),
      quantity,
      unit: form.unit,
      note: form.note.trim() || undefined,
    })
  }

  return (
    <ModalShell title="Produtos" subtitle="" onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <div className="two-cols">
          <Field label="Viveiro" required>
            <select
              value={pondId}
              onChange={(e) => {
                setPondId(e.target.value)
                setForm({ ...form, product: '', quantity: '' })
              }}
            >
              {ponds.map((pond) => <option key={pond.id} value={pond.id}>{pond.name}</option>)}
            </select>
          </Field>
          <Field label="Data do uso" required>
            <input
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value, month: e.target.value.slice(0, 7) })}
            />
          </Field>
        </div>

        <Field label="Produto" required>
          <input
            required
            list="registered-products"
            placeholder={registeredNames.length ? 'Digite ou escolha um produto' : 'Ex.: N-CONTROL, N-AQUA, TCP'}
            value={form.product}
            onChange={(e) => handleProductChange(e.target.value)}
          />
          <datalist id="registered-products">
            {registeredNames.map((name) => <option key={name} value={name} />)}
          </datalist>
        </Field>

        <div className="two-cols">
          <Field label="Quantidade usada" required>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </Field>
          <Field label="Unidade" required>
            <select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUsage['unit'] })}
            >
              <option value="mL">mL</option>
              <option value="L">L</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
            </select>
          </Field>
        </div>

        <Field label="Observação">
          <input
            placeholder="Opcional"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button className="primary-button" type="submit">Registrar uso</button>
        </div>

        <div className="usage-period-head product-catalog-head">
          <strong>Consumo</strong>
          <input
            className="month-input"
            type="month"
            value={form.month}
            onChange={(e) => setForm({ ...form, month: e.target.value })}
          />
        </div>

        {products.length ? (
          <div className="product-catalog">
            {products.map((product) => (
              <article className="product-consumption-card" key={product.key}>
                <div className="product-consumption-head">
                  <div>
                    <strong>{product.product}</strong>

                  </div>
                  <b>{formatProductUsageAmount(product.totalBase, product.dimension)}</b>
                </div>

                <div className="product-consumption-metrics">
                  <div>
                    <span>Usado no mês</span>
                    <strong>{formatProductUsageAmount(product.monthBase, product.dimension)}</strong>
                  </div>
                  <div>
                    <span>Último uso</span>
                    <strong>{formatDate(product.lastDate)}</strong>
                  </div>
                </div>

              </article>
            ))}
          </div>
        ) : (
          <p className="empty-inline">Nenhum uso registrado.</p>
        )}
      </form>
    </ModalShell>
  )
}

function BiometryForm({
  pond,
  initial,
  onClose,
  onSave,
}: {
  pond: Pond
  initial?: BiometryInput
  onClose: () => void
  onSave: (input: BiometryInput) => void
}) {
  const isLegacyEdit = Boolean(
    initial &&
      (initial.sampleTotalWeightG == null ||
        initial.sampleCount == null ||
        initial.periodFeedKg == null),
  )

  if (initial && isLegacyEdit) {
    return (
      <LegacyBiometryEditForm
        pond={pond}
        initial={initial}
        onClose={onClose}
        onSave={onSave}
      />
    )
  }

  return (
    <SimpleBiometryForm
      pond={pond}
      initial={initial}
      onClose={onClose}
      onSave={onSave}
    />
  )
}

function SimpleBiometryForm({
  pond,
  initial,
  onClose,
  onSave,
}: {
  pond: Pond
  initial?: BiometryInput
  onClose: () => void
  onSave: (input: BiometryInput) => void
}) {
  const history = useMemo(() => calculateHistory(pond), [pond])
  const latest = history[history.length - 1]
  const historyWithoutInitial = useMemo(
    () =>
      calculateHistory({
        ...pond,
        biometries: initial
          ? pond.biometries.filter((item) => item.id !== initial.id)
          : pond.biometries,
      }),
    [pond, initial?.id],
  )

  const [error, setError] = useState('')
  const [form, setForm] = useState({
    date: initial?.date ?? localToday(),
    sampleTotalWeightG:
      initial?.sampleTotalWeightG != null ? String(initial.sampleTotalWeightG) : '',
    sampleCount: initial?.sampleCount != null ? String(initial.sampleCount) : '',
    dailyFeedKg: initial ? String(initial.dailyFeedKg) : '',
    periodFeedKg: initial?.periodFeedKg != null ? String(initial.periodFeedKg) : '',
    feedRatePercent: manualFeedRateForEdit(initial),
  })

  const draftPrevious = [...historyWithoutInitial]
    .filter((row) => !form.date || row.date < form.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-1)[0]

  const sampleTotalWeightG = Number(form.sampleTotalWeightG)
  const sampleCount = Number(form.sampleCount)
  const currentWeightG = averageWeightFromSample(sampleTotalWeightG, sampleCount)
  const tableRate = feedRateFromWeightTable(currentWeightG)
  const effectiveRate = form.feedRatePercent.trim()
    ? Number(form.feedRatePercent)
    : tableRate?.ratePercent ?? 0
  const periodFeedKg = Number(form.periodFeedKg)
  const accumulatedFeedKg = accumulatedFeedFromPeriod(
    draftPrevious?.accumulatedFeedKg ?? 0,
    periodFeedKg,
  )

  const parsed: BiometryInput | null =
    isCompleteSimpleBiometryDraft(form)
      ? {
          ...(initial ?? {}),
          id: initial?.id ?? 'preview',
          date: form.date,
          currentWeightG,
          feedRatePercent: effectiveRate,
          feedRateSource: form.feedRatePercent.trim() ? 'manual' : 'table',
          dailyFeedKg: Number(form.dailyFeedKg),
          accumulatedFeedKg,
          sampleTotalWeightG,
          sampleCount,
          periodFeedKg,
        }
      : null

  const preview = parsed
    ? calculateBiometry(pond, parsed, draftPrevious?.currentWeightG ?? null)
    : null
  const previewTechnical = preview ? technicalMetricsStatus(pond, preview) : null

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (!isCompleteSimpleBiometryDraft(form)) {
      setError('Revise a data, a amostra e os valores de ração.')
      return
    }

    if (form.date < pond.stockingDate || form.date > localToday()) {
      setError('Use a data real da biometria, entre o povoamento e hoje.')
      return
    }

    const duplicateDate = pond.biometries.some(
      (item) => item.id !== initial?.id && item.date === form.date,
    )
    if (duplicateDate) {
      setError('Já existe uma biometria registrada nesta data.')
      return
    }

    if (!initial && latest && form.date <= latest.date) {
      setError('Para lançar uma nova biometria, use uma data posterior à última registrada.')
      return
    }

    if (sampleTotalWeightG <= 0 || sampleCount <= 0) {
      setError('Informe o peso total da amostra e a quantidade de camarões pesados.')
      return
    }

    if (periodFeedKg < 0 || Number(form.dailyFeedKg) < 0) {
      setError('Os valores de ração não podem ser negativos.')
      return
    }

    if (isFeedPeriodInconsistent(Number(form.dailyFeedKg), periodFeedKg)) {
      setError('A ração do período não pode ser menor que a ração de um dia. Confira os valores ou use Trocar valores.')
      return
    }

    if (form.feedRatePercent.trim() && (!Number.isFinite(effectiveRate) || effectiveRate <= 0)) {
      setError('Se ajustar a taxa manualmente, use um valor maior que zero.')
      return
    }

    onSave({
      ...(initial ?? {}),
      id: initial?.id ?? id('bio'),
      date: form.date,
      currentWeightG,
      feedRatePercent: effectiveRate,
      feedRateSource: form.feedRatePercent.trim() ? 'manual' : 'table',
      dailyFeedKg: Number(form.dailyFeedKg),
      accumulatedFeedKg,
      sampleTotalWeightG,
      sampleCount,
      periodFeedKg,
    })
  }

  return (
    <ModalShell
      title={initial ? 'Editar biometria' : 'Registrar biometria'}
      subtitle={pond.name}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-grid simple-biometry-form">
        <Field label="Data da biometria" required>
          <input
            required
            type="date"
            min={pond.stockingDate}
            max={localToday()}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>

        <h3 className="form-section-title">Amostra</h3>
        <div className="two-cols">
          <Field label="Peso total da amostra (g)" required>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.sampleTotalWeightG}
              onChange={(e) => setForm({ ...form, sampleTotalWeightG: e.target.value })}
            />
          </Field>
          <Field label="Quantidade de camarões" required>
            <input
              required
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={form.sampleCount}
              onChange={(e) => setForm({ ...form, sampleCount: e.target.value })}
            />
          </Field>
        </div>

        {currentWeightG > 0 && Number.isInteger(sampleCount) && sampleCount > 0 && (
          <p className="biometry-inline-result">Peso médio <strong>{formatNumber(currentWeightG, 2)} g</strong></p>
        )}

        <h3 className="form-section-title">Ração</h3>
        <Field label="Ração do dia (kg)" required>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.dailyFeedKg}
            onChange={(e) => setForm({ ...form, dailyFeedKg: e.target.value })}
          />
        </Field>
        <Field
          label={
            draftPrevious
              ? 'Ração no período (kg)'
              : 'Ração desde o povoamento (kg)'
          }
          required
        >
          <input
            required
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.periodFeedKg}
            onChange={(e) => setForm({ ...form, periodFeedKg: e.target.value })}
          />
          <small>{draftPrevious ? 'Desde a última biometria, incluindo hoje.' : 'Total desde o povoamento, incluindo hoje.'}</small>
        </Field>

        {form.dailyFeedKg.trim() && form.periodFeedKg.trim() &&
          isFeedPeriodInconsistent(Number(form.dailyFeedKg), periodFeedKg) && (
          <div className="feed-entry-review" role="alert">
            <strong>Ração do período menor que a do dia.</strong>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setForm({
                  ...form,
                  dailyFeedKg: form.periodFeedKg,
                  periodFeedKg: form.dailyFeedKg,
                })
                setError('')
              }}
            >
              Inverter valores
            </button>
          </div>
        )}

        <details className="technical-adjustment" open={!tableRate}>
          <summary>
            <span>
              <strong>Taxa de alimentação</strong>
              <small>
                {tableRate
                  ? 'Sugestão por peso'
                  : 'Informe uma taxa se souber'}
              </small>
            </span>
            <b>{effectiveRate > 0 ? formatNumber(effectiveRate, 1) + '%' : 'Sem taxa'}</b>
          </summary>
          <div className="technical-adjustment-body">
            <p>{tableRate ? 'Taxa sugerida, não medida.' : 'Peso fora da tabela de referência.'}</p>
            <Field label="Ajustar taxa manualmente (%)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder={tableRate ? 'Deixe vazio para usar ' + formatNumber(tableRate.ratePercent, 1) + '%' : 'Ex.: 3,5'}
                value={form.feedRatePercent}
                onChange={(e) => {
                  setForm({ ...form, feedRatePercent: e.target.value })
                  setError('')
                }}
              />
            </Field>
            <div className="technical-adjustment-actions">
              {form.feedRatePercent && tableRate && (
                <button
                  className="inline-reset-button"
                  type="button"
                  onClick={() => {
                    setForm({ ...form, feedRatePercent: '' })
                    setError('')
                  }}
                >
                  Usar taxa sugerida
                </button>
              )}
              {form.feedRatePercent && !tableRate && (
                <button
                  className="inline-reset-button"
                  type="button"
                  onClick={() => {
                    setForm({ ...form, feedRatePercent: '' })
                    setError('')
                  }}
                >
                  Remover taxa manual
                </button>
              )}
            </div>
          </div>
        </details>

        {error && <div className="form-error">{error}</div>}

        {preview && previewTechnical?.hasCalculatedValues && !previewTechnical.isPlausible && (
          <p className="form-estimate-warning" role="status">
            Estimativas sob revisão. Confira ração e taxa antes de usar esses indicadores.
          </p>
        )}

        <div className="modal-actions">
          <button className="primary-button" type="submit">
            {initial ? 'Salvar alterações' : 'Salvar biometria'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function LegacyBiometryEditForm({
  pond,
  initial,
  onClose,
  onSave,
}: {
  pond: Pond
  initial: BiometryInput
  onClose: () => void
  onSave: (input: BiometryInput) => void
}) {
  const historyWithoutInitial = useMemo(
    () =>
      calculateHistory({
        ...pond,
        biometries: pond.biometries.filter((item) => item.id !== initial.id),
      }),
    [pond, initial.id],
  )
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    date: initial.date,
    currentWeightG: String(initial.currentWeightG),
    feedRatePercent: String(initial.feedRatePercent),
    dailyFeedKg: String(initial.dailyFeedKg),
    accumulatedFeedKg: String(initial.accumulatedFeedKg),
  })

  const draftPrevious = [...historyWithoutInitial]
    .filter((row) => row.date < form.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-1)[0]

  const parsed: BiometryInput | null =
    form.date &&
    Number(form.currentWeightG) > 0 &&
    Number(form.feedRatePercent) > 0 &&
    Number(form.dailyFeedKg) >= 0 &&
    Number(form.accumulatedFeedKg) >= 0
      ? {
          ...initial,
          date: form.date,
          currentWeightG: Number(form.currentWeightG),
          feedRatePercent: Number(form.feedRatePercent),
          dailyFeedKg: Number(form.dailyFeedKg),
          accumulatedFeedKg: Number(form.accumulatedFeedKg),
        }
      : null

  const preview = parsed
    ? calculateBiometry(pond, parsed, draftPrevious?.currentWeightG ?? null)
    : null
  const previewTechnical = preview ? technicalMetricsStatus(pond, preview) : null

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

    const duplicateDate = pond.biometries.some(
      (item) => item.id !== initial.id && item.date === form.date,
    )
    if (duplicateDate) {
      setError('Já existe uma biometria registrada nesta data.')
      return
    }

    if (
      Number(form.currentWeightG) <= 0 ||
      Number(form.feedRatePercent) <= 0 ||
      Number(form.dailyFeedKg) < 0 ||
      Number(form.accumulatedFeedKg) < 0
    ) {
      setError('Revise os valores informados antes de salvar.')
      return
    }

    onSave({
      ...initial,
      date: form.date,
      currentWeightG: Number(form.currentWeightG),
      feedRatePercent: Number(form.feedRatePercent),
      dailyFeedKg: Number(form.dailyFeedKg),
      accumulatedFeedKg: Number(form.accumulatedFeedKg),
    })
  }

  return (
    <ModalShell title="Editar biometria" subtitle={pond.name + ' · registro histórico'} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <div className="correction-note historical">
          <strong>Registro antigo</strong>
          <span>Edite os campos disponíveis no relatório original.</span>
        </div>

        <Field label="Data da biometria" required>
          <input
            required
            type="date"
            min={pond.stockingDate}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>

        <div className="two-cols">
          <Field label="Peso médio (g)" required>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.currentWeightG}
              onChange={(e) => setForm({ ...form, currentWeightG: e.target.value })}
            />
          </Field>
          <Field label="Taxa alimentação (%)" required>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.feedRatePercent}
              onChange={(e) => setForm({ ...form, feedRatePercent: e.target.value })}
            />
          </Field>
        </div>

        <div className="two-cols">
          <Field label="Ração/dia (kg)" required>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.dailyFeedKg}
              onChange={(e) => setForm({ ...form, dailyFeedKg: e.target.value })}
            />
          </Field>
          <Field label="Ração acumulada (kg)" required>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.accumulatedFeedKg}
              onChange={(e) => setForm({ ...form, accumulatedFeedKg: e.target.value })}
            />
          </Field>
        </div>

        {error && <div className="form-error">{error}</div>}

        {preview && previewTechnical?.hasCalculatedValues && !previewTechnical.isPlausible && (
          <p className="form-estimate-warning" role="status">Estimativas sob revisão. Confira ração e taxa.</p>
        )}

        <div className="modal-actions">
          <button className="primary-button" type="submit">Salvar alterações</button>
        </div>
      </form>
    </ModalShell>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  )
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-handle" />
        <div className="modal-head">
          <div>
            {subtitle && <span className="eyebrow">{subtitle}</span>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {children}
      </section>
    </div>
  )
}
