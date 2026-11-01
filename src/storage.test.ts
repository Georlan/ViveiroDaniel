import { describe, expect, it } from 'vitest'
import { loadLocalPonds, loadLocalPondsLocked, saveLocalPonds, saveLocalPondsLocked, parseBackup, createBackup, STORAGE_KEY } from './storage'
import { reportPonds } from './data/reportData'

function memory(initial: Record<string,string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (key:string)=>data.get(key) ?? null, setItem:(key:string,value:string)=>{data.set(key,value)}, data }
}
const legacy = [{ ...reportPonds[0], dataVersion: undefined, plannedBiometries:[{date:'2026-11-12',cultivationDay:69}], reportReferenceDate:'2026-10-28', biometries:[{id:'real',date:'2026-10-28',currentWeightG:4.69,feedRatePercent:3.6,dailyFeedKg:152,accumulatedFeedKg:25}] }, { ...reportPonds[0], id:'v02',name:'Viveiro do operador',initialPopulation:78000,plPerGram:3.39 }]

describe('local upgrade without data loss',()=>{
  for (const version of [1,2,3]) it(`preserves all v${version} records and original bytes before migrating`,()=>{
    const raw=JSON.stringify(legacy), key=`viveiro-daniel:v${version}`
    const storage=memory({[key]:raw})
    const loaded=loadLocalPonds(storage)
    expect(loaded.blocked).toBe(false)
    expect(loaded.ponds).toEqual(legacy.map(p=>({...p,productUsages:p.productUsages??[],populationMovements:[]})))
    expect(storage.getItem(key)).toBe(raw)
    expect(storage.getItem('viveiro-daniel:before-v4')).toContain(JSON.stringify(raw))
    expect(loadLocalPonds(storage).ponds).toEqual(loaded.ponds)
  })
  it('starts empty without inserting real-looking sample data',()=>{expect(loadLocalPonds(memory()).ponds).toEqual([])})
  it('blocks corrupt current data without replacing it with a seed or stale legacy copy',()=>{
    const storage=memory({[STORAGE_KEY]:'broken','viveiro-daniel:v1':JSON.stringify(legacy)})
    expect(loadLocalPonds(storage).blocked).toBe(true)
    expect(storage.getItem(STORAGE_KEY)).toBe('broken')
  })
  it('blocks unsupported future versions and malformed nested records',()=>{
    expect(()=>parseBackup(JSON.stringify({format:'viveiro-daniel',version:99,ponds:legacy}))).toThrow()
    expect(()=>parseBackup(JSON.stringify([{...legacy[0],biometries:[null]}]))).toThrow()
  })
  it('rejects array-shaped units and transfer directions rather than silently changing their meaning',()=>{
    expect(()=>parseBackup(JSON.stringify([{...legacy[0],productUsages:[{id:'p',date:'2026-10-01',product:'x',quantity:1,unit:['kg']}]}]))).toThrow()
    expect(()=>parseBackup(JSON.stringify([{...legacy[0],populationMovements:[{transferId:'t',date:'2026-10-01',direction:['in'],animals:78000,averageWeightG:3,biomassKg:234,counterpartPondId:'other',counterpartPondName:'Other'}]}]))).toThrow()
  })
  it('does not destroy old data if backup storage is full',()=>{
    const raw=JSON.stringify(legacy), storage=memory({'viveiro-daniel:v3':raw})
    storage.setItem=()=>{throw Error('quota')}
    expect(loadLocalPonds(storage).blocked).toBe(true)
    expect(storage.getItem('viveiro-daniel:v3')).toBe(raw)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })
  it('allows recovery after a failed v4 migration write once storage is available',()=>{
    const storage=memory({'viveiro-daniel:v3':JSON.stringify(legacy)})
    const write=storage.setItem
    storage.setItem=(key,value)=>{if(key===STORAGE_KEY) throw Error('quota');write(key,value)}
    const failed=loadLocalPonds(storage)
    expect(failed.blocked).toBe(true)
    expect(failed.raw).toBeNull()
    storage.setItem=write
    expect(()=>saveLocalPonds(storage,legacy,failed.raw)).not.toThrow()
  })
  it('rejects overwriting a newer save from another tab',()=>{
    const storage=memory(), first=loadLocalPonds(storage)
    saveLocalPonds(storage,legacy,first.raw)
    expect(()=>saveLocalPonds(storage,[],first.raw)).toThrow(/outra aba/)
    expect(loadLocalPonds(storage).ponds).toHaveLength(2)
  })
  it('serializes simultaneous tab saves and rejects the stale candidate',async()=>{
    const storage=memory(), initial=loadLocalPonds(storage)
    let queue=Promise.resolve()
    const locks={request: (_name:string, action:()=>string) => {
      const result=queue.then(action)
      queue=result.then(()=>undefined,()=>undefined)
      return result
    }} as Pick<LockManager,'request'>
    const results=await Promise.allSettled([
      saveLocalPondsLocked(storage,legacy,initial.raw,locks),
      saveLocalPondsLocked(storage,[],initial.raw,locks),
    ])
    expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected'])
    expect(loadLocalPonds(storage).ponds).toHaveLength(2)
  })
  it('uses the same lock for startup migration and saving',async()=>{
    const storage=memory({'viveiro-daniel:v3':JSON.stringify(legacy)})
    const names:string[]=[]
    let queue=Promise.resolve()
    const locks={request: (name:string, action:()=>unknown) => {
      names.push(name)
      const result=queue.then(action)
      queue=result.then(()=>undefined,()=>undefined)
      return result
    }} as Pick<LockManager,'request'>
    const migrated=await loadLocalPondsLocked(storage,locks)
    const saving=saveLocalPondsLocked(storage,[...legacy,{...legacy[1],id:'new-pond'}],migrated.raw,locks)
    const reloading=loadLocalPondsLocked(storage,locks)
    await saving
    expect((await reloading).ponds).toHaveLength(3)
    expect(new Set(names)).toEqual(new Set(['viveiro-daniel:write']))
  })
  it('round-trips a portable backup and preserves old arrays',()=>{
    expect(parseBackup(createBackup(legacy))).toHaveLength(2)
    expect(parseBackup(JSON.stringify(legacy))[1].plPerGram).toBe(3.39)
  })
  it('keeps an empty newer base empty even when an older key has records',()=>{
    const storage=memory({'viveiro-daniel:v3':'[]','viveiro-daniel:v1':JSON.stringify(legacy)})
    expect(loadLocalPonds(storage).ponds).toEqual([])
    expect(storage.getItem('viveiro-daniel:before-v4')).toContain('viveiro-daniel:v1')
  })
})
