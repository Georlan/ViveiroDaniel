import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  accumulatedFeedFromPeriod,
  averageWeightFromSample,
  biomassFromAnimals,
  calculateBiometry,
  calculateHistory,
  daysBetween,
  densityPerSquareMeter,
  hectaresFromSquareMeters,
  squareMetersFromHectares,
  normalizeBiometryInputs,
  preparationDays,
  round,
  isCompleteSimpleBiometryDraft,
  isFeedPeriodInconsistent,
  technicalMetricsStatus,
  populationAtDate,
  populationBalanceAtDate,
} from './domain/calculations'
import { demonstrationPonds } from './data/demonstration'
import { BiometryList } from './components/BiometryList'
import { BiometryEvolution } from './components/BiometryEvolution'
import { FeedSimulation } from './components/FeedSimulation'
import { FeedReferencePanel } from './components/FeedReferencePanel'
import { BiometryRecordDetails } from './components/BiometryRecordDetails'
import { formatDate, formatNumber, formatSigned } from './format'
import {
  aggregateProductUsages,
  findRegisteredProduct,
  formatProductAmount,
} from './domain/productUsage'
import type { BiometryInput, Pond, PopulationMovement, ProductUsage } from './types'
import { loadLocalPondsLocked, saveLocalPondsLocked, createBackup, createRecoveryBackup } from './storage'
import { LocalBackupPanel } from './components/LocalBackupPanel'

const browserStorage = { getItem: (key: string) => window.localStorage.getItem(key), setItem: (key: string, value: string) => window.localStorage.setItem(key, value) }


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

const DEMO_MODE = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '2'
function formatAreaSquareMeters(areaHa: number) {
  const squareMeters = round(squareMetersFromHectares(areaHa), 2)
  return formatNumber(squareMeters, Number.isInteger(squareMeters) ? 0 : 2)
}

function formatProductUsageAmount(baseQuantity: number, dimension: 'mass' | 'volume') {
  const amount = formatProductAmount(baseQuantity, dimension)
  const decimals = Number.isInteger(amount.value) ? 0 : 2
  return formatNumber(amount.value, decimals) + ' ' + amount.unit
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

export default function App() {
  const [loaded] = useState(() => DEMO_MODE
    ? { ponds: demonstrationPonds(), raw: null, blocked: false, message: '' }
    : { ponds: [] as Pond[], raw: null as string | null, blocked: true, message: 'Abrindo os registros deste aparelho…' })
  const [ponds, setPonds] = useState<Pond[]>(loaded.ponds)
  const [storageBlocked, setStorageBlocked] = useState(loaded.blocked)
  const [storageMessage, setStorageMessage] = useState(loaded.message)
  const storageRawRef = useRef(loaded.raw)
  useEffect(() => {
    if (DEMO_MODE) return
    let cancelled = false
    void loadLocalPondsLocked(browserStorage, navigator.locks).then(result => {
      if (cancelled) return
      storageRawRef.current = result.raw
      setPonds(result.ponds)
      setStorageBlocked(result.blocked)
      setStorageMessage(result.message)
    }).catch(() => {
      if (!cancelled) setStorageMessage('Não foi possível acessar os registros. Recarregue a página sem limpar os dados do site.')
    })
    return () => { cancelled = true }
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [selectedId])
  const [modal, setModal] = useState<Modal>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])
  const selected = ponds.find((pond) => pond.id === selectedId) ?? null
  const editingBiometry =
    selected && modal?.kind === 'biometry' && modal.editId
      ? selected.biometries.find((item) => item.id === modal.editId) ?? null
      : null
  const editingPond =
    modal?.kind === 'pond' && modal.editId
      ? ponds.find((pond) => pond.id === modal.editId) ?? null
      : null

  async function persist(next: Pond[], restoring = false) {
    if (storageBlocked && !restoring) return false
    try {
      if (!DEMO_MODE) storageRawRef.current = await saveLocalPondsLocked(browserStorage, next, storageRawRef.current, navigator.locks)
      setPonds(next)
      setStorageBlocked(false)
      setStorageMessage('')
      return true
    } catch (error) {
      setStorageMessage(error instanceof Error && error.message.includes('outra aba')
        ? error.message : 'Não foi possível salvar neste navegador. A alteração não foi gravada. Exporte um backup e confira o espaço disponível.')
      return false
    }
  }

  function downloadBackup(recovery = false) {
    try {
      const content = recovery ? createRecoveryBackup(browserStorage) : createBackup(ponds)
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'viveiro-daniel-' + (recovery ? 'recuperacao-' : 'backup-') + localToday() + '.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setStorageMessage('Não foi possível exportar os dados deste navegador.') }
  }

  async function importBackup(next: Pond[]) {
    const saved = await persist(next, true)
    if (saved) { setSelectedId(null); setNotice('Backup importado neste aparelho.') }
    return saved
  }

  async function addPond(pond: Pond) {
    const saved = await persist([...ponds, pond])
    if (!saved) return

    setSelectedId(pond.id)
    setModal(null)
    setNotice('Viveiro cadastrado.')
  }

  async function updatePond(pond: Pond) {
    const next = ponds.map((item) => (item.id === pond.id ? pond : item))
    const saved = await persist(next)
    if (saved) { setModal(null); setNotice('Cadastro atualizado.') }
  }

  async function saveProductUsage(pondId: string, usage: ProductUsage) {
    const next = ponds.map((pond) =>
      pond.id === pondId
        ? { ...pond, productUsages: [...(pond.productUsages ?? []), usage] }
        : pond,
    )
    const saved = await persist(next)
    if (saved) { setModal(null); setNotice('Uso de produto registrado.') }
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
    if (saved) { setModal(null); setNotice('Transferência registrada.') }
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
    if (saved) { setModal(null); setNotice('Pesagem salva.') }
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
            <img src="/assets/brand.svg" width="44" height="44" alt="" />
            <div><h1>Viveiro Daniel</h1><span>Controle de viveiros</span></div>
          </div>
        )}
        <span className="device-badge">
          {DEMO_MODE ? 'Demonstração' : 'Neste aparelho'}
        </span>
      </header>

      {DEMO_MODE && <div className="demo-notice">Prévia local: V01 do relatório enviado; V02 fictício. Testes não são salvos.</div>}
      {notice && <div className="save-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
      {storageMessage && <div className="storage-message" role={storageBlocked ? "alert" : "status"}>{storageMessage}</div>}
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
            storageBlocked={storageBlocked}
            onExport={() => downloadBackup()}
            onRecovery={() => downloadBackup(true)}
            onImport={importBackup}
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

function Dashboard({ ponds, onOpen, onAdd, storageBlocked, onExport, onRecovery, onImport }: {
  ponds: Pond[]; onOpen: (id: string) => void; onAdd: () => void; storageBlocked: boolean;
  onExport: () => void; onRecovery: () => void; onImport: (ponds: Pond[]) => Promise<boolean>
}) {
  return (
    <section className="page dashboard-page">
      <div className="dashboard-intro">
        <div><h2>Seus viveiros</h2><p>Pesagens e registros do cultivo.</p></div>
        <span className="pond-count">{ponds.length} {ponds.length === 1 ? 'viveiro' : 'viveiros'}</span>
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

      <button className="add-pond-button" disabled={storageBlocked} onClick={onAdd}><UiIcon name="biometry" /> Adicionar viveiro</button>
      {!ponds.length && !storageBlocked && <p className="empty-local-state">Cadastre o primeiro viveiro ou importe um backup deste cultivo.</p>}
      {!DEMO_MODE && <LocalBackupPanel ponds={ponds} blocked={storageBlocked} onExport={onExport} onRecovery={onRecovery} onImport={onImport} />}

    </section>
  )
}

export function PondCard({
  pond,
  onOpen,
}: {
  pond: Pond
  onOpen: () => void
}) {
  const populationInControl=populationAtDate(pond,localToday())
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  const latestTechnical = latest ? technicalMetricsStatus(pond, latest) : null
  const needsReview = latest && (
    (latest.periodFeedKg != null && isFeedPeriodInconsistent(latest.dailyFeedKg, latest.periodFeedKg)) ||
    (latestTechnical?.hasCalculatedValues && !latestTechnical.isPlausible)
  )

  return (
    <article className="pond-card actionable">
      <button className="pond-card-main" onClick={onOpen} aria-label={'Abrir ' + pond.name}>
        <div className="pond-card-head">
          <div className="pond-identity">
            <img src="/assets/pond.svg" alt="" width="92" height="68" />
            <div><span className="pond-name">{pond.name}</span><span className="pond-cycle">Ciclo {pond.cycle}</span></div>
          </div>
          <span className={'pond-status' + (latest ? '' : ' pending')}>{latest ? history.length + (history.length === 1 ? ' pesagem' : ' pesagens') : 'Sem pesagens'}</span>
        </div>
        <div className="pond-density-line"><span>Animais por área</span><strong>{formatNumber(densityPerSquareMeter(pond,populationInControl),1)} <small>animais/m²</small></strong></div>
        {latest ? (
          <div className="pond-card-readings">
            <div><span>Peso médio</span><strong>{formatNumber(latest.currentWeightG, 2)} <small>g</small></strong></div>
            <div><span>Última pesagem</span><strong className="reading-date">{formatDate(latest.date).slice(0, 5)}</strong></div>
          </div>
        ) : (
          <div className="pond-card-start"><strong>Comece com a primeira amostra</strong><span>Registre a primeira amostra de camarões.</span></div>
        )}
        <div className="pond-card-bottom"><span>Acompanhar viveiro</span><UiIcon name="back" /></div>
        {needsReview && <span className="pond-card-alert"><UiIcon name="warning" /> Conferir ração e taxa</span>}
      </button>
    </article>
  )
}

export function PondDetail({
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
  const [biometryView,setBiometryView]=useState<'compare'|'list'>('compare')
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  const today = localToday()
  const cultivationDays = Math.max(0, daysBetween(pond.stockingDate, today) + 1)
  const balance = populationBalanceAtDate(pond, today)
  const populationInControl = balance.population

  return (
    <section className="page detail-page">
      <div className="pond-header-card">
        <div className="pond-hero-top"><span>Ciclo {pond.cycle}</span><span>Desde {formatDate(pond.stockingDate).slice(0, 5)}</span></div>
        <div className="pond-hero-main"><div><strong>{latest ? formatNumber(latest.currentWeightG,2) : String(cultivationDays)}<small>{latest ? ' g' : ' dias'}</small></strong><span>{latest ? 'última amostra · '+formatDate(latest.date).slice(0,5) : 'sem pesagem registrada'}</span></div><img src="/assets/pond.svg" width="112" height="76" alt="" /></div>
        <div className="pond-density-readout"><span>Animais por área</span><strong>{formatNumber(densityPerSquareMeter(pond,populationInControl),1)} <small>animais/m²</small></strong></div>
        <p className="pond-context-caption">Saldo cadastral: {formatNumber(populationInControl)} animais <span>Área: {formatAreaSquareMeters(pond.areaHa)} m²</span></p>
      </div>

      {balance.initialPopulation>0 && balance.incomingAnimals>0 && <div className="stock-review-note"><strong>Confira a composição do saldo</strong><p>{formatNumber(balance.initialPopulation)} iniciais + {formatNumber(balance.incomingAnimals)} recebidos − {formatNumber(balance.outgoingAnimals)} saídos = {formatNumber(balance.population)} animais. Se os iniciais e os recebidos forem o mesmo lote, o cadastro precisa ser corrigido.</p><button className="text-button" onClick={onEditPond}>Revisar população inicial</button></div>}

      <div className="operational-actions">
        <button className="primary-button operational-primary" onClick={onAddBiometry}>
          <UiIcon name="biometry" /> Registrar pesagem
        </button>

      </div>

      {history.length>0 && <div className="biometry-view-switch" role="group" aria-label="Visualização das biometrias"><button aria-pressed={biometryView==='compare'} onClick={()=>setBiometryView('compare')}>Comparar</button><button aria-pressed={biometryView==='list'} onClick={()=>setBiometryView('list')}>Lista completa ({history.length})</button></div>}
      {latest && biometryView==='list' ? <BiometryList pond={pond} onEdit={onEditBiometry}/> : latest ? (
        history.length>1 ? <BiometryEvolution pond={pond} onEdit={onEditBiometry}/> :
        <section className="latest-section" aria-label="Primeira biometria">
          <div className="section-heading"><div><h2>Primeira pesagem</h2><p>{formatDate(latest.date)}</p></div><button className="text-button" onClick={()=>onEditBiometry(latest.id)}>Editar</button></div>
          <div className="first-measurement"><span>Peso médio da amostra</span><strong>{formatNumber(latest.currentWeightG,2)} g</strong><p>A próxima pesagem permitirá comparar a variação. Não há crescimento calculado a partir de um único registro.</p></div>
          <BiometryRecordDetails record={latest}/><FeedSimulation pond={pond} current={latest}/>
        </section>
      ) : (
        <div className="empty-card first-weighing">
          <img src="/assets/sample.svg" width="112" height="98" alt="" />
          <div><h2>Comece pela primeira pesagem</h2><p>Pese e conte uma amostra. Depois, informe a ração para iniciar o acompanhamento.</p></div>
        </div>
      )}
      <div className="more-record-actions">        <div className="operational-secondary-grid">
          <button className="secondary-button" onClick={onTransfer}>
            <UiIcon name="transfer" /> <span>Transferir<small>Entre viveiros</small></span>
          </button>
          <button className="secondary-button" onClick={onProducts}>
            <UiIcon name="product" /> <span>Produtos<small>Registrar uso</small></span>
          </button>
        </div>
      </div>

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
        <summary>Cadastro do viveiro</summary>
        <div className="facts-grid">
          <Fact label="Densidade registrada" value={formatNumber(densityPerSquareMeter(pond, populationInControl), 1) + ' animais/m²'} />
          <Fact label="População inicial" value={formatNumber(pond.initialPopulation)} />
          <Fact label="Povoamento" value={formatDate(pond.stockingDate)} />
          <Fact label="Início do ciclo" value={formatDate(pond.cycleStartDate)} />
          <Fact label="Dias de preparo" value={preparationDays(pond) + ' dias'} />
          <Fact label="Ciclo" value={String(pond.cycle)} />
          <Fact label="Laboratório" value={pond.laboratory || '—'} />
          <Fact label="PL/g" value={pond.plPerGram === null ? '—' : formatNumber(pond.plPerGram,Number.isInteger(pond.plPerGram)?0:2)} />
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function TransferForm({
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
  const [destinationConfirmed,setDestinationConfirmed]=useState(false)
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
  const biomassKg = biomassFromAnimals(count, averageWeightG)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return
    setError('')
    if (!target) return setError('Cadastre outro viveiro antes de transferir.')
    if (date < firstEligibleDate || date > localToday()) return setError('Use uma data entre o povoamento dos dois viveiros e hoje.')
    if (!Number.isInteger(count) || count <= 0) return setError('Informe a quantidade inteira de camarões.')
    if (count > sourcePopulation) return setError('A quantidade excede a população registrada no viveiro de origem.')
    if (targetPopulation>0 && !destinationConfirmed) return setError('Confirme que estes animais são adicionais aos já cadastrados no destino.')
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
              <select value={targetId} onChange={(event) => {setTargetId(event.target.value);setDestinationConfirmed(false)}}>
                {targets.map((pond) => <option value={pond.id} key={pond.id}>{pond.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Data da transferência" required>
            <input required type="date" min={firstEligibleDate} max={localToday()} value={date} onChange={(event) => {setDate(event.target.value);setDestinationConfirmed(false)}} />
          </Field>
          <Field label="Quantidade de camarões" required>
            <input required type="number" min="1" step="1" inputMode="numeric" value={animals} onChange={(event) => {setAnimals(event.target.value);setDestinationConfirmed(false)}} />
            <small>Disponíveis: {formatNumber(sourcePopulation)}</small>
          </Field>
          <Field label="Peso médio transferido (g)" required>
            <input required type="number" min="0.01" step="any" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} />
            {latest && <small>Valor da última pesagem de {formatDate(latest.date)}. Confirme o peso atual do lote transferido.</small>}
          </Field>
          {count > 0 && target && Number.isFinite(averageWeightG) && averageWeightG > 0 && (
            <div className="transfer-preview">
              <strong>{formatNumber(biomassKg, 3)} kg de biomassa estimada</strong>
              <span>{formatNumber(sourcePopulation - count)} animais ficam em {source.name} · {formatNumber(targetPopulation + count)} passam ao controle de {target.name}</span>
              
            </div>
          )}
          {targetPopulation>0 && <div className="destination-check"><strong>O destino já tem {formatNumber(targetPopulation)} animais cadastrados.</strong><label><input type="checkbox" required checked={destinationConfirmed} onChange={event=>setDestinationConfirmed(event.target.checked)}/><span>Sim, estou adicionando outros animais a esse saldo.</span></label><p>Se são os mesmos animais já cadastrados, revise a população inicial do destino antes de transferir. Isso evita contá-los duas vezes.</p></div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Registrar transferência'}</button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}

export function PondForm({
  initial,
  onClose,
  onSave,
}: {
  initial?: Pond
  onClose: () => void
  onSave: (pond: Pond) => void
}) {
  const [stockingMode,setStockingMode]=useState<'direct'|'transfer'>(initial?.initialPopulation===0?'transfer':'direct')
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
        <fieldset className="stock-origin"><legend>Como começou a população?</legend><label><input type="radio" name="stock-origin" checked={stockingMode==='direct'} onChange={()=>setStockingMode('direct')}/><span>Povoamento direto</span></label><label><input type="radio" name="stock-origin" checked={stockingMode==='transfer'} onChange={()=>{setStockingMode('transfer');setForm({...form,initialPopulation:'0'})}}/><span>Recebidos por transferência<small>Sem povoamento inicial próprio</small></span></label></fieldset>
        <div className="two-cols">
          <Field label="Área do viveiro (m²)" required><input required type="number" min="0.01" step="any" inputMode="decimal" value={form.areaSquareMeters} onChange={(e) => setForm({ ...form, areaSquareMeters: e.target.value })} /></Field>
          <Field label="População inicial (sem transferências)" required>
            <input required type="number" min="0" step="1" inputMode="numeric" readOnly={stockingMode==='transfer'} value={form.initialPopulation} onChange={(e) => setForm({ ...form, initialPopulation: e.target.value })} />
            <small>Não some aqui os animais que já entraram por transferência. Nesse caso, a população inicial é 0 e a entrada é registrada em Transferir.</small>
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
        <Field label={stockingMode==='transfer' ? 'Laboratório (se conhecido)' : 'Laboratório'} required={stockingMode==='direct'}><input required={stockingMode==='direct'} value={form.laboratory} onChange={(e) => setForm({ ...form, laboratory: e.target.value })} /></Field>
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
    <ModalShell title="Registrar produto" subtitle={selectedPond?.name ?? ''} onClose={onClose}>
      <form onSubmit={submit} className="form-grid product-usage-form">
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

        <details className="product-consumption-details">
          <summary>Ver consumo ({products.length})</summary>
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
          
        </details>
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

  const [step, setStep] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const previousStepRef = useRef(0)
  useEffect(() => {
    if (step === previousStepRef.current) return
    previousStepRef.current = step
    formRef.current?.querySelector<HTMLElement>('[data-step-title]')?.focus()
    const sheet = formRef.current?.closest<HTMLElement>('.modal-sheet')
    if (sheet) sheet.scrollTop = 0
  }, [step])
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    date: initial?.date ?? localToday(),
    sampleTotalWeightG:
      initial?.sampleTotalWeightG != null ? String(initial.sampleTotalWeightG) : '',
    sampleCount: initial?.sampleCount != null ? String(initial.sampleCount) : '',
    dailyFeedKg: initial ? String(initial.dailyFeedKg) : '',
    periodFeedKg: initial?.periodFeedKg != null ? String(initial.periodFeedKg) : '',
    feedRatePercent: initial && initial.feedRatePercent>0 ? String(initial.feedRatePercent) : '',
  })

  const draftPrevious = [...historyWithoutInitial]
    .filter((row) => !form.date || row.date < form.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-1)[0]

  const sampleTotalWeightG = Number(form.sampleTotalWeightG)
  const sampleCount = Number(form.sampleCount)
  const currentWeightG = averageWeightFromSample(sampleTotalWeightG, sampleCount)
  const effectiveRate = form.feedRatePercent.trim()
    ? Number(form.feedRatePercent)
    : 0
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
          feedRateSource: initial && effectiveRate===initial.feedRatePercent ? initial.feedRateSource : 'manual',
          dailyFeedKg: Number(form.dailyFeedKg),
          accumulatedFeedKg,
          sampleTotalWeightG,
          sampleCount,
          periodFeedKg,
        }
      : null

  const preview = parsed
    ? calculateBiometry(pond, parsed, draftPrevious?.currentWeightG ?? null, draftPrevious?.date)
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
      setError('A ração do período não pode ser menor que a ração de um dia. Confira os valores ou use Inverter valores.')
      return
    }

    if (form.feedRatePercent.trim() && (!Number.isFinite(effectiveRate) || effectiveRate <= 0 || effectiveRate > 100)) {
      setError('Se informar uma taxa, use um percentual maior que zero e no máximo 100%.')
      return
    }

    onSave({
      ...(initial ?? {}),
      id: initial?.id ?? id('bio'),
      date: form.date,
      currentWeightG,
      feedRatePercent: effectiveRate,
      feedRateSource: initial && effectiveRate===initial.feedRatePercent ? initial.feedRateSource : 'manual',
      dailyFeedKg: Number(form.dailyFeedKg),
      accumulatedFeedKg,
      sampleTotalWeightG,
      sampleCount,
      periodFeedKg,
    })
  }

  return (
    <ModalShell
      title={initial ? 'Editar pesagem' : 'Registrar pesagem'}
      subtitle={pond.name}
      onClose={onClose}
    >
      <div className="weighing-progress" aria-label={'Etapa ' + (step + 1) + ' de 2'}>
        <span className={step === 0 ? 'current' : 'complete'}>1. Amostra</span><span className={step === 1 ? 'current' : ''}>2. Ração e revisão</span>
      </div>
      <form ref={formRef} onSubmit={(event) => {
        if (step === 0) {
          event.preventDefault()
          if (pond.biometries.some(item => item.id !== initial?.id && item.date === form.date)) {
            setError('Já existe uma pesagem nesta data. Feche este formulário para editar o registro existente.')
            return
          }
          if (!initial && latest && form.date <= latest.date) {
            setError('Use uma data posterior à última pesagem.')
            return
          }
          setError(''); setStep(1)
        } else submit(event)
      }} className="form-grid simple-biometry-form">
        {step === 0 ? <>
        <div className="form-task-intro"><img src="/assets/sample.svg" width="88" height="78" alt="" /><div><h3 data-step-title tabIndex={-1}>Como está a amostra?</h3><p>Pese os camarões juntos e conte quantos foram pesados.</p></div></div>
        <Field label="Data da pesagem" required>
          <input
            required
            type="date"
            min={pond.stockingDate}
            max={localToday()}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>


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

        </> : <>
        <div className="weighing-review"><span>Amostra de {formatDate(form.date)}</span><strong>{formatNumber(currentWeightG, 2)} g por camarão</strong><small>{formatNumber(sampleTotalWeightG)} g ÷ {formatNumber(sampleCount)} camarões</small></div>
        <div className="form-task-heading"><h3 data-step-title tabIndex={-1}>Quanto de ração foi usado?</h3><p>O total do período inclui a ração de hoje.</p></div>
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

        <details className="technical-adjustment">
          <summary><span><strong>Simulação de estoque pela ração</strong><small>Opcional • usa uma taxa assumida</small></span><b>{effectiveRate>0?formatNumber(effectiveRate,2)+'%':'Sem taxa'}</b></summary>
          <div className="technical-adjustment-body">
            <p>Sem espécie, sistema e ração confirmados, o aplicativo não aplica uma taxa automaticamente. Você pode salvar a biometria sem esta simulação.</p>
            {initial?.feedRatePercent ? <p>Taxa registrada anteriormente: {formatNumber(initial.feedRatePercent,2)}%. Confirme antes de reutilizar.</p>:null}
            <Field label="Taxa assumida de alimentação (%)"><input type="number" min="0.01" max="100" step="any" inputMode="decimal" placeholder="Informe apenas se conhecer a taxa" value={form.feedRatePercent} onChange={event=>{setForm({...form,feedRatePercent:event.target.value});setError('')}}/></Field>
            {form.feedRatePercent && <button type="button" className="inline-reset-button" onClick={()=>setForm({...form,feedRatePercent:''})}>Salvar sem taxa</button>}
            <FeedReferencePanel weightG={currentWeightG}/>
          </div>
        </details>

        </>}
        {error && <div className="form-error" role="alert">{error}</div>}

        {step === 1 && preview && previewTechnical?.hasCalculatedValues && !previewTechnical.isPlausible && (
          <p className="form-estimate-warning" role="status">
            Estimativas sob revisão. Confira ração e taxa antes de usar esses indicadores.
          </p>
        )}

        <div className="modal-actions">
          {step === 1 && <button type="button" className="secondary-button" onClick={() => { setError(''); setStep(0) }}>Voltar</button>}
          <button className="primary-button" type="submit">{step === 0 ? 'Continuar para ração' : initial ? 'Salvar alterações' : 'Salvar pesagem'}</button>
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
    feedRatePercent: initial.feedRatePercent>0 ? String(initial.feedRatePercent) : '',
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
    Number(form.feedRatePercent) >= 0 &&
    Number(form.feedRatePercent) <= 100 &&
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
    ? calculateBiometry(pond, parsed, draftPrevious?.currentWeightG ?? null, draftPrevious?.date)
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
      Number(form.feedRatePercent) < 0 ||
      Number(form.feedRatePercent) > 100 ||
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
      feedRateSource: Number(form.feedRatePercent)===initial.feedRatePercent ? initial.feedRateSource : 'manual',
      dailyFeedKg: Number(form.dailyFeedKg),
      accumulatedFeedKg: Number(form.accumulatedFeedKg),
    })
  }

  return (
    <ModalShell title="Editar pesagem" subtitle={pond.name + ' · registro histórico'} onClose={onClose}>
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
            max={localToday()}
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
          <Field label="Taxa assumida (%) — opcional">
            <input
              type="number"
              min="0.01"
              max="100"
              step="any"
              inputMode="decimal"
              placeholder="Sem taxa"
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
  const sheetRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const controls = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary') ?? []).filter(el => el.getClientRects().length > 0)
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheetRef.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={sheetRef} tabIndex={-1} className="modal-sheet" role="dialog" aria-modal="true" aria-label={title}>
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
