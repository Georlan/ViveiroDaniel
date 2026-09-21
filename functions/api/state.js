const MAX_PAYLOAD_BYTES = 500_000

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function ensureSchema(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS shared_state (
        workspace_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
}

function readBearer(request) {
  const value = request.headers.get('authorization') || ''
  if (!value.startsWith('Bearer ')) return null
  const token = value.slice(7).trim()
  return /^[A-Za-z0-9_-]{20,200}$/.test(token) ? token : null
}

async function workspaceKey(token) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function readState(db, key) {
  const row = await db
    .prepare(
      'SELECT payload, version, updated_at AS updatedAt FROM shared_state WHERE workspace_key = ?',
    )
    .bind(key)
    .first()

  if (!row) return null

  try {
    return {
      ponds: JSON.parse(row.payload),
      version: Number(row.version),
      updatedAt: String(row.updatedAt),
    }
  } catch {
    return null
  }
}

function database(context) {
  return context.env && context.env.DB ? context.env.DB : null
}

export async function onRequestGet(context) {
  const db = database(context)
  if (!db) {
    return json(
      {
        error: 'sync_not_configured',
        message: 'Bind a Cloudflare D1 database to this Pages project using the variable name DB.',
      },
      503,
    )
  }

  const token = readBearer(context.request)
  if (!token) return json({ error: 'unauthorized' }, 401)

  await ensureSchema(db)
  const key = await workspaceKey(token)
  const state = await readState(db, key)

  if (!state) return json({ error: 'not_found' }, 404)
  return json(state)
}

export async function onRequestPut(context) {
  const db = database(context)
  if (!db) {
    return json(
      {
        error: 'sync_not_configured',
        message: 'Bind a Cloudflare D1 database to this Pages project using the variable name DB.',
      },
      503,
    )
  }

  const token = readBearer(context.request)
  if (!token) return json({ error: 'unauthorized' }, 401)

  let body
  try {
    body = await context.request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  if (!body || !Array.isArray(body.ponds) || !Number.isInteger(body.expectedVersion)) {
    return json({ error: 'invalid_payload' }, 400)
  }

  const payload = JSON.stringify(body.ponds)
  if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) {
    return json({ error: 'payload_too_large' }, 413)
  }

  await ensureSchema(db)

  const key = await workspaceKey(token)
  const expectedVersion = body.expectedVersion
  const now = new Date().toISOString()

  if (expectedVersion === 0) {
    const inserted = await db
      .prepare(
        'INSERT OR IGNORE INTO shared_state (workspace_key, payload, version, updated_at) VALUES (?, ?, 1, ?)',
      )
      .bind(key, payload, now)
      .run()

    if (inserted.meta && inserted.meta.changes === 1) {
      return json({ ponds: body.ponds, version: 1, updatedAt: now })
    }

    const remote = await readState(db, key)
    return json(remote || { error: 'conflict' }, 409)
  }

  const updated = await db
    .prepare(
      'UPDATE shared_state SET payload = ?, version = version + 1, updated_at = ? WHERE workspace_key = ? AND version = ?',
    )
    .bind(payload, now, key, expectedVersion)
    .run()

  if (!updated.meta || updated.meta.changes !== 1) {
    const remote = await readState(db, key)
    return json(remote || { error: 'conflict' }, 409)
  }

  return json({
    ponds: body.ponds,
    version: expectedVersion + 1,
    updatedAt: now,
  })
}
