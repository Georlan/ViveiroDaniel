import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  accumulatedFeedFromPeriod,
  averageWeightFromSample,
  calculateBiometry,
  calculateHistory,
  compareBiometriesForDisplay,
  daysBetween,
  densityPerSquareMeter,
  normalizeBiometryInputs,
  preparationDays,
  round,
  suggestFeedRatePercent,
  technicalMetricsStatus,
} from './domain/calculations'
import { reportPonds } from './data/reportData'
import type { BiometryInput, Pond, ProductUsage } from './types'
import {
  buildShareUrl,
  clearStoredSyncToken,
  consumeInviteTokenFromUrl,
  createSyncToken,
  fetchRemoteState,
  getStoredSyncToken,
  saveRemoteState,
  storeSyncToken,
  SyncApiError,
  type RemoteState,
} from './sync'

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

function formatSigned(value: number, decimals = 0) {
  if (value === 0) return formatNumber(0, decimals)
  return (value > 0 ? '+' : '') + formatNumber(value, decimals)
}

function movementWord(value: number) {
  if (value > 0) return 'subiu'
  if (value < 0) return 'caiu'
  return 'ficou igual'
}

function movementArrow(value: number) {
  if (value > 0) return '↑'
  if (value < 0) return '↓'
  return '→'
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
              <span className="back-arrow" aria-hidden="true">←</span>
              <span>Voltar</span>
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
            onEditPond={(id) => setModal({ kind: 'pond', editId: id })}
            onProducts={() => setModal({ kind: 'products' })}
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

      <button className="fab" onClick={() => setModal(selected ? { kind: 'biometry' } : { kind: 'pond' })}>
        <span>＋</span> {selected ? 'Registrar biometria' : 'Novo viveiro'}
      </button>

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
  onEditPond,
  onProducts,
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
  onEditPond: (id: string) => void
  onProducts: () => void
  syncToken: string | null
  syncStatus: SyncStatus
  syncMessage: string
  syncUpdatedAt: string | null
  onActivateSharing: () => void
  onCopyShareLink: () => void
  onSyncNow: () => void
  onDisconnectSync: () => void
}) {
  const withBiometry = ponds.filter((pond) => pond.biometries.length > 0).length

  return (
    <section className="page">
      <div className="summary-bar">
        <div>
          <strong>{ponds.length}</strong>
          <span>viveiros</span>
        </div>
        <div>
          <strong>{withBiometry}</strong>
          <span>com biometria</span>
        </div>
        <div>
          <strong>{ponds.length - withBiometry}</strong>
          <span>aguardando</span>
        </div>
      </div>

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

      <article className="product-tracker-card">
        <div>
          <span className="eyebrow">Aplicações</span>
          <strong>Controle de uso de produtos</strong>
          <p>Registre data, produto, quantidade e unidade para acompanhar o consumo por período.</p>
        </div>
        <button className="secondary-button" onClick={onProducts}>Registrar uso</button>
      </article>

      <div className="section-heading compact-heading">
        <div>
          <h2>Produção em andamento</h2>
          <p>Resumo fiel aos dados disponíveis.</p>
        </div>
        <button className="text-button" onClick={onAdd}>Adicionar</button>
      </div>

      <div className="pond-list">
        {ponds.map((pond) => (
          <PondCard
            pond={pond}
            key={pond.id}
            onOpen={() => onOpen(pond.id)}
            onEdit={() => onEditPond(pond.id)}
          />
        ))}
      </div>

      <div className="storage-note">
        <strong>{syncToken ? 'Fonte compartilhada ativa' : 'Dados salvos neste aparelho'}</strong>
        <span>
          {syncToken
            ? 'O navegador mantém uma cópia local, mas a versão canônica fica na fonte compartilhada.'
            : 'Sem compartilhamento, cada aparelho possui sua própria cópia local.'}
        </span>
      </div>
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
      <article className="sync-card">
        <div className="sync-card-copy">
          <span className="eyebrow">Dois aparelhos</span>
          <strong>Usar a mesma fonte de dados</strong>
          <p>
            Ative o compartilhamento para o dono e o irmão abrirem o mesmo link e editarem a mesma base.
          </p>
          {message && <small className="sync-message">{message}</small>}
        </div>
        <button
          className="secondary-button sync-primary-action"
          onClick={onActivate}
          disabled={status === 'connecting' || status === 'syncing'}
        >
          {status === 'connecting' ? 'Ativando…' : 'Ativar grátis'}
        </button>
      </article>
    )
  }

  return (
    <article className={'sync-card connected ' + (status === 'error' ? 'has-error' : '')}>
      <div className="sync-card-copy">
        <div className="sync-title-row">
          <span className="eyebrow">Fonte compartilhada</span>
          <span className={'sync-dot ' + status} />
        </div>
        <strong>{syncStatusLabel(status)}</strong>
        <p>
          As alterações salvas aqui são a fonte canônica para todos os aparelhos que possuem o link.
        </p>
        {updatedAt && (
          <small>Última versão: {new Date(updatedAt).toLocaleString('pt-BR')}</small>
        )}
        {message && <small className="sync-message">{message}</small>}
      </div>
      <div className="sync-actions">
        <button className="secondary-button" onClick={onCopy}>Copiar link</button>
        <button className="sync-text-button" onClick={onRefresh}>Atualizar</button>
        <button className="sync-text-button danger" onClick={onDisconnect}>Só neste aparelho</button>
      </div>
    </article>
  )
}

function PondCard({
  pond,
  onOpen,
  onEdit,
}: {
  pond: Pond
  onOpen: () => void
  onEdit: () => void
}) {
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  const cultivationDays = Math.max(0, daysBetween(pond.stockingDate, localToday()))
  const previous = history.length > 1 ? history[history.length - 2] : null
  const lastChange = latest && previous ? compareBiometriesForDisplay(previous, latest) : null

  return (
    <article className="pond-card actionable">
      <button className="pond-card-main" onClick={onOpen} aria-label={'Abrir ' + pond.name}>
        <div className="pond-card-head">
          <div>
            <span className="pond-name">{pond.name}</span>
            <span className="pond-meta">
              {formatNumber(pond.areaHa, 2)} ha · {formatNumber(pond.initialPopulation)} animais · {pond.laboratory}
            </span>
          </div>
          <span className={latest ? 'status ready' : 'status waiting'}>
            {latest ? 'Com biometria' : 'Sem biometria'}
          </span>
        </div>

        <div className="report-context">
          <span>Povoado em {formatDate(pond.stockingDate)}</span>
          <strong>{cultivationDays} dias de cultivo</strong>
        </div>

        {latest ? (
          <>
            <div className="latest-label">
              Última biometria: {formatDate(latest.date)} · dia {latest.cultivationDay}
            </div>
            <div className="metric-grid compact">
              <Metric label="Peso" value={formatNumber(latest.currentWeightG, 1) + ' g'} />
              <Metric label="Biomassa" value={formatNumber(round(latest.biomassKg)) + ' kg'} />
              <Metric label="Sobrevivência est." value={formatNumber(round(latest.survivalPercent)) + '%'} />
              <Metric label="FCA" value={formatNumber(round(latest.fca, 2), 2)} />
            </div>
            {lastChange && (
              <div className="card-change-summary">
                Desde a anterior: peso {formatSigned(lastChange.weightG, 1)} g · biomassa {formatSigned(lastChange.biomassKg)} kg
              </div>
            )}
          </>
        ) : (
          <div className="empty-inline">
            <strong>Primeira biometria ainda não realizada.</strong>
            <span>O acompanhamento zootécnico começa quando você registrar a primeira medição real.</span>
          </div>
        )}

        <div className="pond-card-cta">
          <span>Abrir {pond.name}</span>
          <span className="cta-arrow" aria-hidden="true">→</span>
        </div>
      </button>

      <div className="pond-card-footer">
        <button className="pond-edit-button" onClick={onEdit}>Editar dados iniciais</button>
      </div>
    </article>
  )
}

function PondDetail({
  pond,
  onAddBiometry,
  onEditBiometry,
  onEditPond,
  onProducts,
}: {
  pond: Pond
  onAddBiometry: () => void
  onEditBiometry: (id: string) => void
  onEditPond: () => void
  onProducts: () => void
}) {
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  const today = localToday()
  const cultivationDays = Math.max(0, daysBetween(pond.stockingDate, today))
  const cycleDays = Math.max(0, daysBetween(pond.cycleStartDate, today))
  const latestTechnical = latest ? technicalMetricsStatus(pond, latest) : null

  return (
    <section className="page detail-page">
      <div className="pond-header-card">
        <div className="pond-header-top">
          <div>
            <span className="eyebrow">Viveiro em produção</span>
            <h2>{pond.name}</h2>
          </div>
          <span className={latest ? 'status ready' : 'status waiting'}>
            {latest ? 'Com biometria' : 'Sem biometria'}
          </span>
        </div>
        <p className="pond-header-meta">
          {formatNumber(pond.areaHa, 2)} ha · {formatNumber(pond.initialPopulation)} animais · {pond.laboratory || '—'}
        </p>
        <div className="pond-header-badges">
          <span className="info-chip">{cultivationDays} dias de cultivo · {cycleDays} dias de ciclo</span>
          <span className="info-chip highlight">{formatNumber(round(densityPerSquareMeter(pond), 1), 1)} animais/m²</span>
        </div>
      </div>

      <div className="operational-actions">
        <button className="primary-button operational-primary" onClick={onAddBiometry}>
          <span className="button-icon">＋</span> Registrar biometria
        </button>
        <div className="operational-secondary-grid">
          <button className="secondary-button" onClick={onProducts}>
            <span className="button-icon">＋</span> Registrar uso de produto
          </button>
          <button className="secondary-button" onClick={onEditPond}>
            <span className="button-icon">✎</span> Editar dados
          </button>
        </div>
      </div>

      {latest ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Última biometria</h2>
              <p>{formatDate(latest.date)} · dia {latest.cultivationDay}</p>
            </div>
            <button className="text-button" onClick={() => onEditBiometry(latest.id)}>Editar</button>
          </div>

          <div className="metric-section-label">Registrado no campo</div>
          <div className="metric-grid">
            {latest.sampleTotalWeightG && latest.sampleCount ? (
              <>
                <Metric label="Peso da amostra" value={formatNumber(latest.sampleTotalWeightG) + ' g'} featured />
                <Metric label="Qtd. amostrada" value={formatNumber(latest.sampleCount) + ' animais'} />
                <Metric label="Ração/dia" value={formatNumber(latest.dailyFeedKg) + ' kg'} />
                <Metric label="Ração no período" value={formatNumber(latest.periodFeedKg ?? 0) + ' kg'} />
              </>
            ) : (
              <>
                <Metric label="Peso médio do relatório" value={formatNumber(latest.currentWeightG, 1) + ' g'} featured />
                <Metric label="Taxa alimentação" value={formatNumber(latest.feedRatePercent, 1) + '%'} />
                <Metric label="Ração/dia" value={formatNumber(latest.dailyFeedKg) + ' kg'} />
                <Metric label="Ração acumulada" value={formatNumber(latest.accumulatedFeedKg) + ' kg'} />
              </>
            )}
          </div>

          <div className="metric-section-label calculated-label">Calculado automaticamente</div>
          <div className="metric-grid">
            {latest.sampleTotalWeightG && latest.sampleCount && (
              <Metric label="Peso médio" value={formatNumber(latest.currentWeightG, 2) + ' g'} featured />
            )}
            <Metric label="Ração acumulada" value={formatNumber(latest.accumulatedFeedKg) + ' kg'} />
            {latest.previousWeightG === null ? (
              <Metric label="Comparação" value="Linha de base" />
            ) : (
              <>
                <Metric label="Ganho desde anterior" value={formatNumber(round(latest.growthG, 2), 2) + ' g'} />
                <Metric label="Cresc. médio" value={formatNumber(round(latest.averageGrowthPerWeekG, 2), 2) + ' g/sem'} />
              </>
            )}
            {latestTechnical?.isPlausible && (
              <>
                <Metric label="Biomassa" value={formatNumber(round(latestTechnical.biomassKg ?? 0)) + ' kg'} featured />
                <Metric label="Sobrevivência est." value={formatNumber(round(latestTechnical.survivalPercent ?? 0)) + '%'} />
                <Metric label="FCA" value={formatNumber(round(latestTechnical.fca ?? 0, 2), 2)} />
                <Metric label="Ração p/100%" value={formatNumber(round(latestTechnical.feedFor100Kg ?? 0)) + ' kg'} />
              </>
            )}
          </div>

          {!latestTechnical?.hasFeedRate && (
            <div className="technical-pending-note">
              <strong>Indicadores técnicos aguardando taxa de alimentação</strong>
              <span>Biomassa, sobrevivência estimada, ração p/100% e FCA ficam ocultos até você informar uma taxa real do manejo.</span>
            </div>
          )}

          {latestTechnical?.hasFeedRate && !latestTechnical.isPlausible && (
            <div className="technical-warning-note">
              <strong>Taxa incompatível com os dados desta biometria</strong>
              <span>
                Essa taxa gera biomassa ou sobrevivência acima do limite físico do viveiro. Edite a biometria e corrija ou remova a taxa.
              </span>
            </div>
          )}

          <ChangeSummary pond={pond} />
        </>
      ) : (
        <div className="empty-card">
          <div className="empty-icon">≈</div>
          <h2>Aguardando a primeira biometria</h2>
          <p>
            O viveiro tem dados gerais cadastrados, mas ainda não possui biometria realizada.
            Não mostramos peso, biomassa, sobrevivência ou FCA até existir medição real.
          </p>
          <button className="primary-button" onClick={onAddBiometry}>Registrar biometria realizada</button>
        </div>
      )}

      <div className="product-summary-card">
        <div>
          <span className="eyebrow">Controle de insumos</span>
          <strong>Uso de produtos</strong>
          <p>{(pond.productUsages ?? []).length} aplicações registradas. Cadastre cada uso para acompanhar o consumo por mês.</p>
        </div>
        <button className="secondary-button" onClick={onProducts}>Ver histórico / Cadastrar</button>
      </div>

      <div className="section-heading compact-heading">
        <div>
          <h2>Dados do viveiro</h2>
          <p>Informações de cadastro e do lote.</p>
        </div>
        <button className="text-button" onClick={onEditPond}>Editar</button>
      </div>

      <div className="facts-grid">
        <Fact label="Área" value={formatNumber(pond.areaHa, 2) + ' ha'} />
        <Fact label="População inicial" value={formatNumber(pond.initialPopulation)} />
        <Fact label="Povoamento" value={formatDate(pond.stockingDate)} />
        <Fact label="Início do ciclo" value={formatDate(pond.cycleStartDate)} />
        <Fact label="Dias de preparo" value={preparationDays(pond) + ' dias'} />
        <Fact label="Ciclo" value={String(pond.cycle)} />
        <Fact label="Laboratório" value={pond.laboratory || '—'} />
        <Fact label="PL/g" value={pond.plPerGram === null ? '—' : formatNumber(pond.plPerGram)} />
        <Fact label="Raçoador" value={pond.feeder || '—'} />
      </div>



      <HistorySection pond={pond} onEditBiometry={onEditBiometry} />
      <details className="calculation-details">
        <summary>Como o app calcula os indicadores?</summary>
        <p>
          Em cada biometria, você informa a amostra, a ração do dia e a ração fornecida no período.
          O app calcula peso médio, ração acumulada, biomassa, sobrevivência estimada, ração p/100% e FCA.
          A taxa de alimentação é informada por você e, depois que houver histórico real deste ciclo, o app pode sugerir um valor com base nas medições anteriores.
        </p>
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
  const history = calculateHistory(pond)
  if (!history.length) return null

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Biometrias realizadas</h2>
          <p>{history.length + ' registros'}</p>
        </div>
      </div>

      <div className="history-list">
        {[...history].reverse().map((row) => {
          const technical = technicalMetricsStatus(pond, row)
          return (
            <article className="history-card" key={row.id}>
              <div className="history-date">
                <strong>Dia {row.cultivationDay}</strong>
                <span>{formatDate(row.date)}</span>
              </div>
              <div className="history-values">
                <span><small>Peso</small>{formatNumber(row.currentWeightG, 1)} g</span>
                <span><small>Biomassa</small>{technical.isPlausible ? formatNumber(round(technical.biomassKg ?? 0)) + ' kg' : '—'}</span>
                <span><small>Sobrev.</small>{technical.isPlausible ? formatNumber(round(technical.survivalPercent ?? 0)) + '%' : '—'}</span>
                <span><small>FCA</small>{technical.isPlausible ? formatNumber(round(technical.fca ?? 0, 2), 2) : '—'}</span>
              </div>
              <button
                className="history-edit-button"
                onClick={() => onEditBiometry(row.id)}
                aria-label={'Editar biometria do dia ' + row.cultivationDay}
              >
                Editar
              </button>
            </article>
          )
        })}
      </div>
    </>
  )
}


function ChangeSummary({ pond }: { pond: Pond }) {
  const history = calculateHistory(pond)
  if (history.length < 2) return null

  const previous = history[history.length - 2]
  const latest = history[history.length - 1]
  const delta = compareBiometriesForDisplay(previous, latest)
  const previousTechnical = technicalMetricsStatus(pond, previous)
  const latestTechnical = technicalMetricsStatus(pond, latest)

  const changes = [
    {
      label: 'Peso médio',
      value: formatSigned(delta.weightG, 1) + ' g',
      sentence: movementWord(delta.weightG),
      arrow: movementArrow(delta.weightG),
    },
    ...(previousTechnical.isPlausible && latestTechnical.isPlausible
      ? [
          {
            label: 'Biomassa estimada',
            value: formatSigned(delta.biomassKg) + ' kg',
            sentence: movementWord(delta.biomassKg),
            arrow: movementArrow(delta.biomassKg),
          },
          {
            label: 'Sobrevivência estimada',
            value: formatSigned(delta.survivalPercentagePoints) + ' p.p.',
            sentence: movementWord(delta.survivalPercentagePoints),
            arrow: movementArrow(delta.survivalPercentagePoints),
          },
          {
            label: 'FCA',
            value: formatSigned(delta.fca, 2),
            sentence: movementWord(delta.fca),
            arrow: movementArrow(delta.fca),
          },
        ]
      : []),
  ]

  return (
    <article className="change-card">
      <div className="change-card-head">
        <div>
          <span className="eyebrow">Comparação simples</span>
          <h2>O que mudou desde a biometria anterior?</h2>
          <p>
            {formatDate(previous.date)} → {formatDate(latest.date)}
          </p>
        </div>
      </div>

      <div className="change-grid">
        {changes.map((item) => (
          <div className="change-item" key={item.label}>
            <span className="change-arrow" aria-hidden="true">{item.arrow}</span>
            <div>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <span>{item.sentence}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="change-footnote">
        A comparação usa apenas indicadores disponíveis e consistentes. Se faltar taxa válida, o app compara somente o peso.
      </p>
    </article>
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
    areaHa: initial ? String(initial.areaHa) : '',
    initialPopulation: initial ? String(initial.initialPopulation) : '',
    laboratory: initial?.laboratory ?? '',
    stockingDate: initial?.stockingDate ?? '',
    cycleStartDate: initial?.cycleStartDate ?? '',
    cycle: initial ? String(initial.cycle) : '1',
    feeder: initial?.feeder ?? '',
    plPerGram: initial?.plPerGram != null ? String(initial.plPerGram) : '',
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({
      ...(initial ?? {
        id: id('pond'),
        dataVersion: 2,
        reportReferenceDate: null,
        plannedBiometries: [],
        biometries: [],
      }),
      name: form.name.trim(),
      areaHa: Number(form.areaHa),
      initialPopulation: Number(form.initialPopulation),
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
      title={initial ? 'Editar dados do viveiro' : 'Novo viveiro'}
      subtitle={initial ? 'Dados iniciais e população do lote.' : 'Cadastre os dados palpáveis do lote.'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-grid">
        {initial && (
          <div className="correction-note">
            <strong>Dados iniciais editáveis</strong>
            <span>Você pode corrigir área, população inicial, povoamento, ciclo e os demais dados cadastrados. Os indicadores serão recalculados a partir dos novos valores.</span>
          </div>
        )}
        <Field label="Nome" required><input required placeholder="Ex.: V03" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="two-cols">
          <Field label="Área (ha)" required><input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.areaHa} onChange={(e) => setForm({ ...form, areaHa: e.target.value })} /></Field>
          <Field label="População inicial" required><input required type="number" min="1" inputMode="numeric" value={form.initialPopulation} onChange={(e) => setForm({ ...form, initialPopulation: e.target.value })} /></Field>
        </div>
        <Field label="Laboratório" required><input required value={form.laboratory} onChange={(e) => setForm({ ...form, laboratory: e.target.value })} /></Field>
        <div className="two-cols">
          <Field label="Povoamento" required><input required type="date" value={form.stockingDate} onChange={(e) => setForm({ ...form, stockingDate: e.target.value })} /></Field>
          <Field label="Início do ciclo" required><input required type="date" value={form.cycleStartDate} onChange={(e) => setForm({ ...form, cycleStartDate: e.target.value })} /></Field>
        </div>
        <div className="two-cols">
          <Field label="Ciclo" required><input required type="number" min="1" inputMode="numeric" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })} /></Field>
          <Field label="PL/g"><input type="number" min="0" inputMode="numeric" value={form.plPerGram} onChange={(e) => setForm({ ...form, plPerGram: e.target.value })} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="submit">{initial ? 'Salvar dados' : 'Criar viveiro'}</button>
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
  const localToday = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  const defaultMonth = localToday.slice(0, 7)
  const [pondId, setPondId] = useState(initialPondId ?? ponds[0]?.id ?? '')
  const [form, setForm] = useState({
    date: localToday,
    product: '',
    quantity: '',
    unit: 'mL' as ProductUsage['unit'],
    note: '',
    month: defaultMonth,
  })
  const [error, setError] = useState('')

  const records = ponds
    .flatMap((pond) =>
      (pond.productUsages ?? []).map((usage) => ({ ...usage, pondName: pond.name })),
    )
    .filter((usage) => usage.date.slice(0, 7) === form.month)
    .sort((a, b) => b.date.localeCompare(a.date))

  const totals = Object.values(
    records.reduce<Record<string, { product: string; unit: string; quantity: number }>>((acc, usage) => {
      const key = usage.product.trim().toLowerCase() + '|' + usage.unit
      acc[key] ??= { product: usage.product, unit: usage.unit, quantity: 0 }
      acc[key].quantity += usage.quantity
      return acc
    }, {}),
  ).sort((a, b) => a.product.localeCompare(b.product))

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const quantity = Number(form.quantity)
    if (!pondId) {
      setError('Selecione o viveiro.')
      return
    }
    if (!form.date || !form.product.trim() || quantity <= 0) {
      setError('Informe data, produto e uma quantidade maior que zero.')
      return
    }
    onSave(pondId, {
      id: id('usage'),
      date: form.date,
      product: form.product.trim(),
      quantity,
      unit: form.unit,
      note: form.note.trim() || undefined,
    })
  }

  return (
    <ModalShell title="Uso de produtos" subtitle="Registre o que foi aplicado no viveiro." onClose={onClose}>
      <div className="form-grid">
        <div className="correction-note">
          <strong>Controle por período</strong>
          <span>Cadastre cada aplicação com a quantidade e unidade. O resumo abaixo soma apenas registros do mês escolhido, sem misturar g, kg, mL e L.</span>
        </div>

        <div className="two-cols">
          <Field label="Viveiro" required>
            <select value={pondId} onChange={(e) => setPondId(e.target.value)}>
              {ponds.map((pond) => <option key={pond.id} value={pond.id}>{pond.name}</option>)}
            </select>
          </Field>
          <Field label="Data da aplicação" required>
            <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, month: e.target.value.slice(0, 7) })} />
          </Field>
        </div>

        <Field label="Produto" required>
          <input required placeholder="Ex.: N-CONTROL, N-AQUA, TCP" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
        </Field>

        <div className="two-cols">
          <Field label="Quantidade" required>
            <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Unidade" required>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUsage['unit'] })}>
              <option value="mL">mL</option>
              <option value="L">L</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
            </select>
          </Field>
        </div>

        <Field label="Observação">
          <input placeholder="Opcional" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>

        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="submit">Cadastrar aplicação</button>
        </div>

        <div className="usage-period-head">
          <div>
            <span className="eyebrow">Consumo registrado</span>
            <strong>Resumo do mês</strong>
          </div>
          <input className="month-input" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
        </div>

        {totals.length ? (
          <div className="usage-totals">
            {totals.map((total) => (
              <div className="usage-total" key={total.product + total.unit}>
                <div>
                  <strong>{total.product}</strong>
                  <span>{total.unit}</span>
                </div>
                <b>{formatNumber(total.quantity, 2)} {total.unit}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-inline">
            <strong>Nenhuma aplicação neste período.</strong>
            <span>Cadastre a primeira acima.</span>
          </div>
        )}

        {records.length > 0 && (
          <div className="usage-history">
            {records.map((usage) => (
              <div className="usage-row" key={usage.id}>
                <div>
                  <strong>{usage.product}</strong>
                  <span>{formatDate(usage.date)} · {usage.pondName}{usage.note ? ' · ' + usage.note : ''}</span>
                </div>
                <b>{formatNumber(usage.quantity, 2)} {usage.unit}</b>
              </div>
            ))}
          </div>
        )}
      </div>
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
    feedRatePercent: initial ? String(initial.feedRatePercent) : '',
  })

  const draftPrevious = [...historyWithoutInitial]
    .filter((row) => !form.date || row.date < form.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-1)[0]

  const sampleTotalWeightG = Number(form.sampleTotalWeightG)
  const sampleCount = Number(form.sampleCount)
  const currentWeightG = averageWeightFromSample(sampleTotalWeightG, sampleCount)
  const suggestedRate = suggestFeedRatePercent(currentWeightG, pond.biometries)
  const effectiveRate = form.feedRatePercent
    ? Number(form.feedRatePercent)
    : suggestedRate ?? 0
  const periodFeedKg = Number(form.periodFeedKg)
  const accumulatedFeedKg = accumulatedFeedFromPeriod(
    draftPrevious?.accumulatedFeedKg ?? 0,
    periodFeedKg,
  )

  const parsed: BiometryInput | null =
    form.date && currentWeightG > 0 && effectiveRate > 0 && Number(form.dailyFeedKg) >= 0
      ? {
          ...(initial ?? {}),
          id: initial?.id ?? 'preview',
          date: form.date,
          currentWeightG,
          feedRatePercent: effectiveRate,
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

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

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

    if (effectiveRate <= 0) {
      setError('Informe a taxa de alimentação usada no manejo antes de salvar.')
      return
    }

    onSave({
      ...(initial ?? {}),
      id: initial?.id ?? id('bio'),
      date: form.date,
      currentWeightG,
      feedRatePercent: effectiveRate,
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
      subtitle={pond.name + ' · modo simples'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-grid simple-biometry-form">
        {initial && (
          <div className="correction-note">
            <strong>Correção de registro passado</strong>
            <span>
              Ao salvar, o app recalcula automaticamente os valores derivados das biometrias seguintes,
              como crescimento, ração acumulada e FCA quando dependerem deste registro.
            </span>
          </div>
        )}

        <div className="form-step">
          <span className="form-step-number">1</span>
          <div>
            <strong>Quando foi feita?</strong>
            <small>Use a data real da biometria.</small>
          </div>
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

        <div className="form-step">
          <span className="form-step-number">2</span>
          <div>
            <strong>Pese a amostra</strong>
            <small>Digite só o peso total e quantos camarões foram pesados.</small>
          </div>
        </div>
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

        {currentWeightG > 0 && (
          <div className="sample-result">
            <span>Peso médio calculado</span>
            <strong>{formatNumber(currentWeightG, 2)} g</strong>
            <small>
              {formatNumber(sampleTotalWeightG, 0)} g ÷ {formatNumber(sampleCount)} animais
              {draftPrevious
                ? ' · crescimento ' +
                  formatSigned(currentWeightG - draftPrevious.currentWeightG, 2) +
                  ' g'
                : ''}
            </small>
          </div>
        )}

        <div className="form-step">
          <span className="form-step-number">3</span>
          <div>
            <strong>Informe a ração</strong>
            <small>O restante do controle será calculado pelo app.</small>
          </div>
        </div>
        <Field label="Ração por dia agora (kg)" required>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.dailyFeedKg}
            onChange={(e) => setForm({ ...form, dailyFeedKg: e.target.value })}
          />
          <small>É a quantidade diária usada no momento da biometria.</small>
        </Field>
        <Field
          label={
            draftPrevious
              ? 'Ração desde a biometria anterior (kg)'
              : 'Ração fornecida até esta biometria (kg)'
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
          <small>
            O app soma este valor ao acumulado anterior e refaz a cadeia seguinte se você estiver corrigindo um registro antigo.
          </small>
        </Field>

        <details className="technical-adjustment" open={!suggestedRate}>
          <summary>
            <span>
              <strong>Taxa de alimentação</strong>
              <small>{suggestedRate ? 'Sugestão baseada no histórico real deste ciclo' : 'Obrigatória na primeira biometria'}</small>
            </span>
            <b>{effectiveRate > 0 ? formatNumber(effectiveRate, 1) + '%' : '—'}</b>
          </summary>
          <div className="technical-adjustment-body">
            <p>
              {suggestedRate
                ? 'Sugestão de ' +
                  formatNumber(suggestedRate, 1) +
                  '% baseada no peso mais próximo observado no histórico do V01. Isso é uma estimativa, não uma regra confirmada.'
                : 'Como esta é a primeira biometria do ciclo, não existe histórico real para sugerir a taxa. Informe a taxa que está sendo usada no manejo.'}
            </p>
            <Field label="Taxa usada (%)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder={suggestedRate ? formatNumber(suggestedRate, 1) : ''}
                value={form.feedRatePercent}
                onChange={(e) => setForm({ ...form, feedRatePercent: e.target.value })}
              />
            </Field>
            {form.feedRatePercent && suggestedRate && (
              <button
                className="inline-reset-button"
                type="button"
                onClick={() => setForm({ ...form, feedRatePercent: '' })}
              >
                Usar sugestão de {formatNumber(suggestedRate, 1)}%
              </button>
            )}
          </div>
        </details>

        {error && <div className="form-error">{error}</div>}

        {preview && (
          <div className="preview-card auto-preview-card">
            <span className="eyebrow">
              {initial ? 'Resultado após a correção' : 'O app calcula para você'}
            </span>
            <div className="preview-grid">
              <Metric label="Peso médio" value={formatNumber(preview.currentWeightG, 2) + ' g'} />
              <Metric label="Crescimento" value={formatSigned(preview.growthG, 2) + ' g'} />
              <Metric label="Ração acumulada" value={formatNumber(preview.accumulatedFeedKg) + ' kg'} />
              <Metric label="Biomassa" value={formatNumber(round(preview.biomassKg)) + ' kg'} />
              <Metric label="Sobrevivência est." value={formatNumber(round(preview.survivalPercent)) + '%'} />
              <Metric label="Ração p/100%" value={formatNumber(round(preview.feedFor100Kg)) + ' kg'} />
              <Metric label="FCA" value={formatNumber(round(preview.fca, 2), 2)} />
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="submit">
            {initial ? 'Salvar correção' : 'Salvar biometria'}
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
          <strong>Registro importado do relatório</strong>
          <span>
            Este registro antigo não possui peso total da amostra nem ração do período salvos.
            Por isso a correção usa os campos existentes no relatório. Os cálculos dependentes serão refeitos.
          </span>
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

        {preview && (
          <div className="preview-card auto-preview-card">
            <span className="eyebrow">Resultado após a correção</span>
            <div className="preview-grid">
              <Metric label="Crescimento" value={formatSigned(preview.growthG, 2) + ' g'} />
              <Metric label="Biomassa" value={formatNumber(round(preview.biomassKg)) + ' kg'} />
              <Metric label="Sobrevivência est." value={formatNumber(round(preview.survivalPercent)) + '%'} />
              <Metric label="Ração p/100%" value={formatNumber(round(preview.feedFor100Kg)) + ' kg'} />
              <Metric label="FCA" value={formatNumber(round(preview.fca, 2), 2)} />
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="submit">Salvar correção</button>
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
            <span className="eyebrow">{subtitle}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {children}
      </section>
    </div>
  )
}
