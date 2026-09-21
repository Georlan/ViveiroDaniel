import type { Pond } from './types'

const SYNC_TOKEN_KEY = 'viveiro-daniel:sync-token'
const SHARE_PARAM = 'share'

export type RemoteState = {
  ponds: Pond[]
  version: number
  updatedAt: string
}

export type SyncApiErrorCode =
  | 'not-configured'
  | 'not-found'
  | 'conflict'
  | 'network'
  | 'unauthorized'
  | 'invalid-response'
  | 'unknown'

export class SyncApiError extends Error {
  code: SyncApiErrorCode
  remote?: RemoteState

  constructor(code: SyncApiErrorCode, message: string, remote?: RemoteState) {
    super(message)
    this.name = 'SyncApiError'
    this.code = code
    this.remote = remote
  }
}

function base64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function createSyncToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

export function getStoredSyncToken() {
  return localStorage.getItem(SYNC_TOKEN_KEY)
}

export function storeSyncToken(token: string) {
  localStorage.setItem(SYNC_TOKEN_KEY, token)
}

export function clearStoredSyncToken() {
  localStorage.removeItem(SYNC_TOKEN_KEY)
}

export function consumeInviteTokenFromUrl() {
  if (!window.location.hash) return null

  const params = new URLSearchParams(window.location.hash.slice(1))
  const token = params.get(SHARE_PARAM)
  if (!token) return null

  const cleanUrl = window.location.pathname + window.location.search
  window.history.replaceState(null, '', cleanUrl)
  return token
}

export function buildShareUrl(token: string) {
  const url = new URL(window.location.href)
  url.hash = SHARE_PARAM + '=' + encodeURIComponent(token)
  return url.toString()
}

async function parseJson(response: Response) {
  try {
    return await response.json()
  } catch {
    throw new SyncApiError('invalid-response', 'A sincronização retornou uma resposta inválida.')
  }
}

async function request(token: string, init?: RequestInit) {
  try {
    return await fetch('/api/state', {
      ...init,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    })
  } catch {
    throw new SyncApiError(
      'network',
      'Não foi possível alcançar a fonte compartilhada. Confira a internet e tente novamente.',
    )
  }
}

function asRemoteState(value: unknown): RemoteState {
  const candidate = value as Partial<RemoteState> | null
  if (
    !candidate ||
    !Array.isArray(candidate.ponds) ||
    typeof candidate.version !== 'number' ||
    typeof candidate.updatedAt !== 'string'
  ) {
    throw new SyncApiError('invalid-response', 'Os dados compartilhados vieram em formato inválido.')
  }

  return candidate as RemoteState
}

export async function fetchRemoteState(token: string): Promise<RemoteState | null> {
  const response = await request(token)

  if (response.status === 404) return null

  if (response.status === 503) {
    throw new SyncApiError(
      'not-configured',
      'A sincronização gratuita ainda precisa do banco D1 vinculado ao projeto Cloudflare.',
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new SyncApiError('unauthorized', 'Este link compartilhado não é válido.')
  }

  if (!response.ok) {
    throw new SyncApiError('unknown', 'Não foi possível carregar os dados compartilhados.')
  }

  return asRemoteState(await parseJson(response))
}

export async function saveRemoteState(
  token: string,
  ponds: Pond[],
  expectedVersion: number,
): Promise<RemoteState> {
  const response = await request(token, {
    method: 'PUT',
    body: JSON.stringify({ ponds, expectedVersion }),
  })

  if (response.status === 409) {
    const body = await parseJson(response)
    const remote = asRemoteState(body)
    throw new SyncApiError(
      'conflict',
      'Os dados foram alterados em outro aparelho antes deste salvamento.',
      remote,
    )
  }

  if (response.status === 503) {
    throw new SyncApiError(
      'not-configured',
      'A sincronização gratuita ainda precisa do banco D1 vinculado ao projeto Cloudflare.',
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new SyncApiError('unauthorized', 'Este link compartilhado não é válido.')
  }

  if (!response.ok) {
    throw new SyncApiError('unknown', 'Não foi possível salvar na fonte compartilhada.')
  }

  return asRemoteState(await parseJson(response))
}
