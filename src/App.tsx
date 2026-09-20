import { FormEvent, useMemo, useState } from 'react'
import { calculateBiometry, calculateHistory, densityPerSquareMeter, preparationDays, round } from './domain/calculations'
import { reportPonds } from './data/reportData'
import type { BiometryInput, Pond } from './types'

const STORAGE_KEY = 'viveiro-daniel:v1'

function cloneReportData() {
  return JSON.parse(JSON.stringify(reportPonds)) as Pond[]
}

function loadPonds() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as Pond[]) : cloneReportData()
  } catch {
    return cloneReportData()
  }
}

function formatDate(value: string) {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

type Modal = 'pond' | 'biometry' | null

export default function App() {
  const [ponds, setPonds] = useState<Pond[]>(loadPonds)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>(null)

  const selected = ponds.find((pond) => pond.id === selectedId) ?? null

  function persist(next: Pond[]) {
    setPonds(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function addPond(pond: Pond) {
    persist([...ponds, pond])
    setSelectedId(pond.id)
    setModal(null)
  }

  function addBiometry(input: BiometryInput) {
    if (!selected) return
    const next = ponds.map((pond) =>
      pond.id === selected.id
        ? { ...pond, biometries: [...pond.biometries, input].sort((a, b) => a.date.localeCompare(b.date)) }
        : pond,
    )
    persist(next)
    setModal(null)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Controle zootécnico</span>
          <h1>{selected ? selected.name : 'Viveiros'}</h1>
        </div>
        {selected ? (
          <button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Voltar para viveiros">
            ←
          </button>
        ) : (
          <span className="local-badge">● Local</span>
        )}
      </header>

      <main>
        {selected ? (
          <PondDetail pond={selected} onAddBiometry={() => setModal('biometry')} />
        ) : (
          <Dashboard ponds={ponds} onOpen={setSelectedId} onAdd={() => setModal('pond')} />
        )}
      </main>

      {!selected && (
        <button className="fab" onClick={() => setModal('pond')}>
          <span>＋</span> Novo viveiro
        </button>
      )}

      {selected && (
        <button className="fab" onClick={() => setModal('biometry')}>
          <span>＋</span> Biometria
        </button>
      )}

      {modal === 'pond' && <PondForm onClose={() => setModal(null)} onSave={addPond} />}
      {modal === 'biometry' && selected && (
        <BiometryForm pond={selected} onClose={() => setModal(null)} onSave={addBiometry} />
      )}
    </div>
  )
}

function Dashboard({
  ponds,
  onOpen,
  onAdd,
}: {
  ponds: Pond[]
  onOpen: (id: string) => void
  onAdd: () => void
}) {
  return (
    <section className="page">
      <div className="hero-card">
        <div>
          <span className="eyebrow light">Visão rápida</span>
          <h2>Acompanhe o cultivo sem fazer conta.</h2>
          <p>Informe apenas os dados observáveis. O aplicativo calcula os indicadores comprovados pela tabela.</p>
        </div>
        <div className="hero-stat">
          <strong>{ponds.length}</strong>
          <span>{ponds.length === 1 ? 'viveiro' : 'viveiros'}</span>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <h2>Seus viveiros</h2>
          <p>Toque em um viveiro para ver histórico e indicadores.</p>
        </div>
        <button className="text-button" onClick={onAdd}>Adicionar</button>
      </div>

      <div className="pond-list">
        {ponds.map((pond) => {
          const history = calculateHistory(pond)
          const latest = history[history.length - 1]
          return (
            <button className="pond-card" key={pond.id} onClick={() => onOpen(pond.id)}>
              <div className="pond-card-head">
                <div>
                  <span className="pond-name">{pond.name}</span>
                  <span className="pond-meta">
                    {formatNumber(pond.areaHa, 2)} ha · {formatNumber(pond.initialPopulation)} animais
                  </span>
                </div>
                <span className={latest ? 'status ready' : 'status waiting'}>
                  {latest ? `Dia ${latest.cultivationDay}` : 'Sem biometria'}
                </span>
              </div>

              {latest ? (
                <div className="metric-grid compact">
                  <Metric label="Peso" value={`${formatNumber(latest.currentWeightG, 1)} g`} />
                  <Metric label="Biomassa" value={`${formatNumber(round(latest.biomassKg))} kg`} />
                  <Metric label="Sobrevivência" value={`${formatNumber(round(latest.survivalPercent))}%`} />
                  <Metric label="FCA" value={formatNumber(round(latest.fca, 2), 2)} />
                </div>
              ) : (
                <div className="empty-inline">Cadastre a primeira biometria para iniciar os cálculos.</div>
              )}
            </button>
          )
        })}
      </div>

      <div className="note-card">
        <strong>Sem dados inventados</strong>
        <p>Ração acumulada continua sendo informada manualmente, porque o relatório não permite deduzir sua origem com segurança.</p>
      </div>
    </section>
  )
}

function PondDetail({ pond, onAddBiometry }: { pond: Pond; onAddBiometry: () => void }) {
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]

  return (
    <section className="page detail-page">
      <div className="pond-title-card">
        <div>
          <span className="eyebrow">Informações gerais</span>
          <h2>{pond.name}</h2>
          <p>{pond.laboratory || 'Laboratório não informado'} · Ciclo {pond.cycle}</p>
        </div>
        <div className="day-orb">
          <strong>{latest ? latest.cultivationDay : '—'}</strong>
          <span>dia</span>
        </div>
      </div>

      <div className="info-strip">
        <Info label="Área" value={`${formatNumber(pond.areaHa, 2)} ha`} />
        <Info label="Densidade" value={`${formatNumber(round(densityPerSquareMeter(pond), 1), 1)}/m²`} />
        <Info label="População" value={formatNumber(pond.initialPopulation)} />
        <Info label="Preparo" value={`${preparationDays(pond)} dias`} />
      </div>

      {latest ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Última biometria</h2>
              <p>{formatDate(latest.date)} · Dia {latest.cultivationDay}</p>
            </div>
          </div>

          <div className="metric-grid">
            <Metric label="Peso atual" value={`${formatNumber(latest.currentWeightG, 1)} g`} featured />
            <Metric label="Biomassa" value={`${formatNumber(round(latest.biomassKg))} kg`} featured />
            <Metric label="Sobrevivência" value={`${formatNumber(round(latest.survivalPercent))}%`} />
            <Metric label="FCA" value={formatNumber(round(latest.fca, 2), 2)} />
            <Metric label="Ração/dia" value={`${formatNumber(latest.dailyFeedKg)} kg`} />
            <Metric label="Ração p/100%" value={`${formatNumber(round(latest.feedFor100Kg))} kg`} />
            <Metric label="Crescimento" value={`${formatNumber(round(latest.growthG, 1), 1)} g`} />
            <Metric label="Cresc. médio" value={`${formatNumber(round(latest.averageGrowthPerWeekG, 2), 2)} g/sem`} />
          </div>

          <TrendChart pond={pond} />
        </>
      ) : (
        <div className="empty-card">
          <div className="empty-icon">≈</div>
          <h2>Ainda não há biometria</h2>
          <p>Quando houver dados palpáveis do viveiro, registre peso, taxa de alimentação, ração do dia e ração acumulada.</p>
          <button className="primary-button" onClick={onAddBiometry}>Registrar primeira biometria</button>
        </div>
      )}

      <div className="section-heading">
        <div>
          <h2>Histórico</h2>
          <p>{history.length ? `${history.length} registros` : 'Nenhum registro ainda'}</p>
        </div>
      </div>

      <div className="history-list">
        {[...history].reverse().map((row) => (
          <article className="history-card" key={row.id}>
            <div className="history-date">
              <strong>Dia {row.cultivationDay}</strong>
              <span>{formatDate(row.date)}</span>
            </div>
            <div className="history-values">
              <span><small>Peso</small>{formatNumber(row.currentWeightG, 1)} g</span>
              <span><small>Biomassa</small>{formatNumber(round(row.biomassKg))} kg</span>
              <span><small>Sobrev.</small>{formatNumber(round(row.survivalPercent))}%</span>
              <span><small>FCA</small>{formatNumber(round(row.fca, 2), 2)}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="source-card">
        <span>ƒx</span>
        <div>
          <strong>Cálculos automáticos</strong>
          <p>Os resultados usam as relações matemáticas que fecham as seis linhas preenchidas do V01. Valores internos não são arredondados antes do cálculo.</p>
        </div>
      </div>
    </section>
  )
}

function TrendChart({ pond }: { pond: Pond }) {
  const history = calculateHistory(pond)
  if (history.length < 2) return null

  const width = 340
  const height = 180
  const padX = 24
  const padTop = 18
  const padBottom = 28
  const plotHeight = height - padTop - padBottom
  const maxValue = Math.max(...history.flatMap((row) => [row.biomassKg, row.accumulatedFeedKg])) * 1.08

  const point = (value: number, index: number) => {
    const x = padX + (index * (width - padX * 2)) / Math.max(1, history.length - 1)
    const y = padTop + plotHeight - (value / maxValue) * plotHeight
    return { x, y }
  }

  const biomassPoints = history.map((row, index) => point(row.biomassKg, index))
  const feedPoints = history.map((row, index) => point(row.accumulatedFeedKg, index))

  return (
    <article className="chart-card">
      <div className="section-heading chart-heading">
        <div>
          <h2>Ração × biomassa</h2>
          <p>Evolução em kg por dia de cultivo.</p>
        </div>
      </div>
      <div className="chart-legend">
        <span><i className="dot biomass" /> Biomassa</span>
        <span><i className="dot feed" /> Ração acumulada</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de biomassa e ração acumulada">
        <line x1={padX} x2={width - padX} y1={padTop + plotHeight} y2={padTop + plotHeight} className="axis-line" />
        <polyline points={biomassPoints.map((p) => `${p.x},${p.y}`).join(' ')} className="chart-line biomass-line" />
        <polyline points={feedPoints.map((p) => `${p.x},${p.y}`).join(' ')} className="chart-line feed-line" />
        {biomassPoints.map((p, index) => (
          <circle key={`b-${index}`} cx={p.x} cy={p.y} r="3.5" className="chart-point biomass-point" />
        ))}
        {feedPoints.map((p, index) => (
          <circle key={`f-${index}`} cx={p.x} cy={p.y} r="3.5" className="chart-point feed-point" />
        ))}
        {history.map((row, index) => {
          const p = point(0, index)
          return <text key={row.id} x={p.x} y={height - 8} textAnchor="middle" className="chart-label">{row.cultivationDay}</text>
        })}
      </svg>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PondForm({ onClose, onSave }: { onClose: () => void; onSave: (pond: Pond) => void }) {
  const [form, setForm] = useState({
    name: '',
    areaHa: '',
    initialPopulation: '',
    laboratory: '',
    stockingDate: '',
    cycleStartDate: '',
    cycle: '1',
    feeder: '',
    plPerGram: '',
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({
      id: id('pond'),
      name: form.name.trim(),
      areaHa: Number(form.areaHa),
      initialPopulation: Number(form.initialPopulation),
      laboratory: form.laboratory.trim(),
      stockingDate: form.stockingDate,
      cycleStartDate: form.cycleStartDate,
      cycle: Number(form.cycle),
      feeder: form.feeder.trim(),
      plPerGram: form.plPerGram ? Number(form.plPerGram) : null,
      biometries: [],
    })
  }

  return (
    <ModalShell title="Novo viveiro" subtitle="Cadastre apenas o que você conhece." onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
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
        <Field label="Raçoador"><input value={form.feeder} onChange={(e) => setForm({ ...form, feeder: e.target.value })} /></Field>
        <button className="primary-button" type="submit">Criar viveiro</button>
      </form>
    </ModalShell>
  )
}

function BiometryForm({
  pond,
  onClose,
  onSave,
}: {
  pond: Pond
  onClose: () => void
  onSave: (input: BiometryInput) => void
}) {
  const [form, setForm] = useState({
    date: '',
    currentWeightG: '',
    feedRatePercent: '',
    dailyFeedKg: '',
    accumulatedFeedKg: '',
  })

  const previousWeight = useMemo(() => calculateHistory(pond).slice(-1)[0]?.currentWeightG ?? null, [pond])
  const parsed: BiometryInput | null =
    form.date && Number(form.currentWeightG) > 0 && Number(form.feedRatePercent) > 0
      ? {
          id: 'preview',
          date: form.date,
          currentWeightG: Number(form.currentWeightG),
          feedRatePercent: Number(form.feedRatePercent),
          dailyFeedKg: Number(form.dailyFeedKg),
          accumulatedFeedKg: Number(form.accumulatedFeedKg),
        }
      : null

  const preview = parsed ? calculateBiometry(pond, parsed, previousWeight) : null

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({
      id: id('bio'),
      date: form.date,
      currentWeightG: Number(form.currentWeightG),
      feedRatePercent: Number(form.feedRatePercent),
      dailyFeedKg: Number(form.dailyFeedKg),
      accumulatedFeedKg: Number(form.accumulatedFeedKg),
    })
  }

  return (
    <ModalShell title="Nova biometria" subtitle={pond.name} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <Field label="Data da biometria" required>
          <input required type="date" min={pond.stockingDate} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Peso atual (g)" required>
          <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.currentWeightG} onChange={(e) => setForm({ ...form, currentWeightG: e.target.value })} />
        </Field>
        <div className="two-cols">
          <Field label="Taxa alimentação (%)" required>
            <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.feedRatePercent} onChange={(e) => setForm({ ...form, feedRatePercent: e.target.value })} />
          </Field>
          <Field label="Ração/dia (kg)" required>
            <input required type="number" min="0" step="0.01" inputMode="decimal" value={form.dailyFeedKg} onChange={(e) => setForm({ ...form, dailyFeedKg: e.target.value })} />
          </Field>
        </div>
        <Field label="Ração acumulada (kg)" required>
          <input required type="number" min="0" step="0.01" inputMode="decimal" value={form.accumulatedFeedKg} onChange={(e) => setForm({ ...form, accumulatedFeedKg: e.target.value })} />
          <small>Por enquanto este valor é informado: a tabela não revela uma fórmula confiável para deduzi-lo.</small>
        </Field>

        {preview && (
          <div className="preview-card">
            <span className="eyebrow">Prévia automática</span>
            <div className="preview-grid">
              <Metric label="Dia" value={String(preview.cultivationDay)} />
              <Metric label="Biomassa" value={`${formatNumber(round(preview.biomassKg))} kg`} />
              <Metric label="Sobrevivência" value={`${formatNumber(round(preview.survivalPercent))}%`} />
              <Metric label="FCA" value={formatNumber(round(preview.fca, 2), 2)} />
            </div>
          </div>
        )}

        <button className="primary-button" type="submit">Salvar biometria</button>
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
