import { FormEvent, useMemo, useState } from 'react'
import {
  calculateBiometry,
  calculateHistory,
  compareBiometriesForDisplay,
  cultivationDaysAtReference,
  cycleDaysAtReference,
  densityPerSquareMeter,
  preparationDays,
  round,
} from './domain/calculations'
import { reportPonds } from './data/reportData'
import type { BiometryInput, PlannedBiometry, Pond } from './types'

const STORAGE_KEY = 'viveiro-daniel:v1'

function cloneReportData() {
  return JSON.parse(JSON.stringify(reportPonds)) as Pond[]
}

function enrichWithReportMetadata(pond: Pond): Pond {
  const base = reportPonds.find((item) => item.id === pond.id)
  if (!base) return { ...pond, plannedBiometries: pond.plannedBiometries ?? [] }

  return {
    ...pond,
    reportReferenceDate: pond.reportReferenceDate ?? base.reportReferenceDate ?? null,
    plannedBiometries:
      pond.plannedBiometries && pond.plannedBiometries.length
        ? pond.plannedBiometries
        : base.plannedBiometries ?? [],
  }
}

function loadPonds() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return cloneReportData()
    return (JSON.parse(stored) as Pond[]).map(enrichWithReportMetadata)
  } catch {
    return cloneReportData()
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

function plannedAfterLatest(pond: Pond): PlannedBiometry | null {
  const planned = pond.plannedBiometries ?? []
  if (!planned.length) return null
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  if (!latest) return planned[0]
  return planned.find((item) => item.date > latest.date) ?? null
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
          <span className="device-badge">Neste aparelho</span>
        )}
      </header>

      <main>
        {selected ? (
          <PondDetail pond={selected} onAddBiometry={() => setModal('biometry')} />
        ) : (
          <Dashboard ponds={ponds} onOpen={setSelectedId} onAdd={() => setModal('pond')} />
        )}
      </main>

      <button className="fab" onClick={() => setModal(selected ? 'biometry' : 'pond')}>
        <span>＋</span> {selected ? 'Registrar biometria' : 'Novo viveiro'}
      </button>

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

      <div className="section-heading compact-heading">
        <div>
          <h2>Produção em andamento</h2>
          <p>Resumo fiel aos dados disponíveis.</p>
        </div>
        <button className="text-button" onClick={onAdd}>Adicionar</button>
      </div>

      <div className="pond-list">
        {ponds.map((pond) => (
          <PondCard pond={pond} key={pond.id} onOpen={() => onOpen(pond.id)} />
        ))}
      </div>

      <div className="storage-note">
        <strong>Dados salvos neste aparelho</strong>
        <span>Sem login e sem sincronização em nuvem nesta versão.</span>
      </div>
    </section>
  )
}

function PondCard({ pond, onOpen }: { pond: Pond; onOpen: () => void }) {
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  const cultivationDays = cultivationDaysAtReference(pond)
  const nextPlanned = plannedAfterLatest(pond)
  const previous = history.length > 1 ? history[history.length - 2] : null
  const lastChange = latest && previous ? compareBiometriesForDisplay(previous, latest) : null

  return (
    <button className="pond-card" onClick={onOpen}>
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

      {pond.reportReferenceDate && (
        <div className="report-context">
          <span>Relatório {formatDate(pond.reportReferenceDate)}</span>
          <strong>{cultivationDays === null ? '—' : cultivationDays + ' dias de cultivo'}</strong>
        </div>
      )}

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
          <strong>Ainda não há biometria realizada.</strong>
          <span>Os indicadores zootécnicos só aparecem depois de uma medição real.</span>
        </div>
      )}

      {nextPlanned && (
        <div className="planned-inline">
          Prevista no relatório de {formatDate(pond.reportReferenceDate)}: {formatDate(nextPlanned.date)} · dia {nextPlanned.cultivationDay}
        </div>
      )}
    </button>
  )
}

function PondDetail({ pond, onAddBiometry }: { pond: Pond; onAddBiometry: () => void }) {
  const history = calculateHistory(pond)
  const latest = history[history.length - 1]
  const cultivationDays = cultivationDaysAtReference(pond)
  const cycleDays = cycleDaysAtReference(pond)
  const nextPlanned = plannedAfterLatest(pond)

  return (
    <section className="page detail-page">
      <div className="report-summary-card">
        <div>
          <span className="eyebrow">Situação no relatório</span>
          <h2>{pond.reportReferenceDate ? formatDate(pond.reportReferenceDate) : 'Dados do viveiro'}</h2>
          <p>
            {cultivationDays === null
              ? 'Sem data de referência cadastrada.'
              : cultivationDays + ' dias de cultivo · ' + cycleDays + ' dias de ciclo'}
          </p>
        </div>
        <div className="summary-orb">
          <strong>{formatNumber(round(densityPerSquareMeter(pond), 1), 1)}</strong>
          <span>animais/m²</span>
        </div>
      </div>

      <div className="section-heading compact-heading">
        <div>
          <h2>Dados do viveiro</h2>
          <p>Informações de cadastro e do lote.</p>
        </div>
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

      {nextPlanned && (
        <div className="next-action-card">
          <div>
            <span className="eyebrow">Planejamento do relatório</span>
            <strong>{latest ? 'Biometria seguinte prevista' : 'Primeira biometria prevista'}</strong>
            <p>{formatDate(nextPlanned.date)} · dia {nextPlanned.cultivationDay}</p>
          </div>
          <button className="secondary-button" onClick={onAddBiometry}>Registrar</button>
        </div>
      )}

      {latest ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Última biometria</h2>
              <p>{formatDate(latest.date)} · dia {latest.cultivationDay}</p>
            </div>
          </div>

          <div className="metric-section-label">Informado na biometria</div>
          <div className="metric-grid">
            <Metric label="Peso atual" value={formatNumber(latest.currentWeightG, 1) + ' g'} featured />
            <Metric label="Taxa alimentação" value={formatNumber(latest.feedRatePercent, 1) + '%'} />
            <Metric label="Ração/dia" value={formatNumber(latest.dailyFeedKg) + ' kg'} />
            <Metric label="Ração acumulada" value={formatNumber(latest.accumulatedFeedKg) + ' kg'} />
          </div>

          <div className="metric-section-label calculated-label">Calculado pelo app</div>
          <div className="metric-grid">
            <Metric label="Biomassa" value={formatNumber(round(latest.biomassKg)) + ' kg'} featured />
            <Metric label="Sobrevivência est." value={formatNumber(round(latest.survivalPercent)) + '%'} />
            <Metric label="FCA" value={formatNumber(round(latest.fca, 2), 2)} />
            <Metric label="Ração p/100%" value={formatNumber(round(latest.feedFor100Kg)) + ' kg'} />
            <Metric
              label={latest.previousWeightG === null ? 'Crescimento (1ª bio)' : 'Ganho desde anterior'}
              value={formatNumber(round(latest.growthG, 1), 1) + ' g'}
            />
            <Metric label="Cresc. médio" value={formatNumber(round(latest.averageGrowthPerWeekG, 2), 2) + ' g/sem'} />
          </div>

          <ChangeSummary pond={pond} />
        </>
      ) : (
        <div className="empty-card">
          <div className="empty-icon">≈</div>
          <h2>Aguardando a primeira biometria</h2>
          <p>
            {pond.reportReferenceDate
              ? 'O relatório traz os dados gerais deste viveiro, mas ainda não registra biometria realizada. '
              : 'O viveiro tem dados gerais cadastrados, mas ainda não possui biometria realizada. '}
            Não mostramos peso, biomassa, sobrevivência ou FCA até existir medição real.
          </p>
          {nextPlanned && (
            <div className="scheduled-highlight">
              Prevista no relatório: <strong>{formatDate(nextPlanned.date)} · dia {nextPlanned.cultivationDay}</strong>
            </div>
          )}
          <button className="primary-button" onClick={onAddBiometry}>Registrar biometria realizada</button>
        </div>
      )}

      <HistorySection pond={pond} />
      <PlanningSection pond={pond} />

      <details className="calculation-details">
        <summary>Como o app calcula os indicadores?</summary>
        <p>
          Os cálculos automáticos reproduzem as relações que fecham as seis linhas preenchidas do V01.
          A ração acumulada continua sendo informada, pois o relatório não permite deduzir sua origem com segurança.
        </p>
      </details>
    </section>
  )
}

function HistorySection({ pond }: { pond: Pond }) {
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
    </>
  )
}

function PlanningSection({ pond }: { pond: Pond }) {
  const planned = pond.plannedBiometries ?? []
  if (!planned.length) return null

  return (
    <details className="planning-card">
      <summary>
        <span>
          <strong>Planejamento de biometria</strong>
          <small>{planned.length + ' datas previstas no relatório'}</small>
        </span>
        <span>Ver datas</span>
      </summary>
      <div className="planning-list">
        {planned.map((item) => (
          <div key={item.date}>
            <strong>Dia {item.cultivationDay}</strong>
            <span>{formatDate(item.date)}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

function ChangeSummary({ pond }: { pond: Pond }) {
  const history = calculateHistory(pond)
  if (history.length < 2) return null

  const previous = history[history.length - 2]
  const latest = history[history.length - 1]
  const delta = compareBiometriesForDisplay(previous, latest)

  const changes = [
    {
      label: 'Peso médio',
      value: formatSigned(delta.weightG, 1) + ' g',
      sentence: movementWord(delta.weightG),
      arrow: movementArrow(delta.weightG),
    },
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
        Comparação feita com os mesmos valores arredondados exibidos na tabela do relatório.
        O app informa apenas a direção da mudança, sem classificar como bom ou ruim.
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
      reportReferenceDate: null,
      plannedBiometries: [],
      biometries: [],
    })
  }

  return (
    <ModalShell title="Novo viveiro" subtitle="Cadastre os dados palpáveis do lote." onClose={onClose}>
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
  const history = useMemo(() => calculateHistory(pond), [pond])
  const latest = history[history.length - 1]
  const planned = plannedAfterLatest(pond)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    date: '',
    currentWeightG: '',
    feedRatePercent: '',
    dailyFeedKg: '',
    accumulatedFeedKg: '',
  })

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

  const preview = parsed ? calculateBiometry(pond, parsed, latest?.currentWeightG ?? null) : null

  function usePlannedDate() {
    if (!planned) return
    setForm({ ...form, date: planned.date })
    setError('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (latest && form.date <= latest.date) {
      setError('A nova biometria precisa ter data posterior à última biometria realizada.')
      return
    }

    if (latest && Number(form.accumulatedFeedKg) < latest.accumulatedFeedKg) {
      setError('Ração acumulada não pode ser menor que o valor acumulado anterior.')
      return
    }

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
    <ModalShell title="Registrar biometria" subtitle={pond.name} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        {planned && (
          <button type="button" className="planned-date-button" onClick={usePlannedDate}>
            <span>Data prevista no relatório</span>
            <strong>{formatDate(planned.date)} · dia {planned.cultivationDay}</strong>
            <small>Usar esta data</small>
          </button>
        )}

        <Field label="Data realizada" required>
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
          <input required type="number" min={latest?.accumulatedFeedKg ?? 0} step="0.01" inputMode="decimal" value={form.accumulatedFeedKg} onChange={(e) => setForm({ ...form, accumulatedFeedKg: e.target.value })} />
          <small>Entrada manual: o relatório não fornece fórmula confiável para deduzir este valor.</small>
        </Field>

        {error && <div className="form-error">{error}</div>}

        {preview && (
          <div className="preview-card">
            <span className="eyebrow">Prévia automática</span>
            <div className="preview-grid">
              <Metric label="Dia da biometria" value={String(preview.cultivationDay)} />
              <Metric label="Biomassa" value={formatNumber(round(preview.biomassKg)) + ' kg'} />
              <Metric label="Sobrevivência" value={formatNumber(round(preview.survivalPercent)) + '%'} />
              <Metric label="FCA" value={formatNumber(round(preview.fca, 2), 2)} />
            </div>
          </div>
        )}

        <button className="primary-button" type="submit">Salvar biometria realizada</button>
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
