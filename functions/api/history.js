import { database, ensureSchema, readBearer, workspaceKey } from './state.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export async function onRequestGet(context) {
  const db = database(context)
  if (!db) return json({ error: 'sync_not_configured' }, 503)

  const token = readBearer(context.request)
  if (!token) return json({ error: 'unauthorized' }, 401)

  await ensureSchema(db)
  const key = await workspaceKey(token)
  const rows = await db.prepare(
    'SELECT version, updated_at AS updatedAt, payload FROM shared_state_history WHERE workspace_key = ? ORDER BY version DESC LIMIT 21',
  ).bind(key).all()

  const revisions = (rows.results ?? []).flatMap((row) => {
    try {
      const ponds = JSON.parse(row.payload)
      return Array.isArray(ponds)
        ? [{ version: Number(row.version), updatedAt: row.updatedAt, ponds }]
        : []
    } catch {
      return []
    }
  })

  // The oldest fetched snapshot is only a comparison baseline, not an event.
  // No token, workspace hash or HTTP credentials are returned.
  return json({ revisions })
}
