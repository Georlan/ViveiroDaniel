import { useState } from 'react'
import type { Pond } from '../types'
import { parseBackup } from '../storage'

export function LocalBackupPanel({ ponds, blocked, onExport, onRecovery, onImport }: {
  ponds: Pond[]; blocked: boolean; onExport: () => void; onRecovery: () => void;
  onImport: (ponds: Pond[]) => Promise<boolean>
}) {
  const [preview, setPreview] = useState<Pond[] | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <details className="dashboard-settings local-backup-panel">
    <summary>Backup e troca de aparelho</summary>
    <div className="sync-minimal">
      <p>Os registros ficam neste navegador. A atualização do site mantém os dados no mesmo endereço. Para outro aparelho, exporte aqui e importe o arquivo lá.</p>
      <p>Não há sincronização automática entre celulares. Limpar os dados do navegador pode apagar os registros; mantenha um backup fora dele.</p>
      <button className="secondary-button" disabled={blocked} onClick={onExport}>Exportar backup · {ponds.length} viveiros</button>
      <label className="backup-file-label">Importar arquivo de backup
        <input type="file" accept=".json,application/json" onChange={async event => {
          const file = event.target.files?.[0]
          setPreview(null); setConfirmed(false); setError('')
          if (!file) return
          try {
            if (file.size > 20_000_000) throw Error('O arquivo ultrapassa o limite de 20 MB.')
            setPreview(parseBackup(await file.text()))
          } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível ler o arquivo.') }
          event.target.value = ''
        }}/>
      </label>
      {preview && <div className="backup-preview">
        <strong>Conferir antes de importar</strong>
        <p>{preview.length} viveiros · {preview.reduce((n,p)=>n+p.biometries.length,0)} biometrias · {preview.reduce((n,p)=>n+(p.productUsages?.length??0),0)} usos de produtos.</p>
        <p>{preview.map(p=>p.name).join(', ') || 'Arquivo sem viveiros.'}</p>
        <label className="transfer-confirmation"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>Substituir os registros deste navegador pelos do arquivo. Uma cópia do estado anterior será guardada neste aparelho.</span></label>
        <button className="primary-button" disabled={!confirmed || busy} onClick={async()=>{
          setBusy(true)
          try { if (await onImport(preview)) {setPreview(null);setConfirmed(false)} } finally {setBusy(false)}
        }}>{busy?'Importando…':'Confirmar importação'}</button>
        <button className="sync-text-button" onClick={()=>setPreview(null)}>Cancelar</button>
      </div>}
      {error && <p role="alert">{error}</p>}
      <button className="sync-text-button" onClick={onRecovery}>Exportar cópias de recuperação</button>
      <small>Inclui versões antigas guardadas neste navegador, quando disponíveis. Esse arquivo serve para recuperação assistida.</small>
    </div>
  </details>
}
