import { createClient, isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js'

const projectUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
const publishableKey: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const project = projectUrl?.startsWith('https://') && URL.canParse(projectUrl) ? new URL(projectUrl) : null
const storageKey = project ? `sb-${project.hostname.split('.')[0]}-auth-token` : ''

export const financeChanges = new EventTarget()
export const supabaseConnection = new EventTarget()
let reachable = true
let sessionRecovery: { userId: string; promise: Promise<string | null> } | undefined
const endedSessionCodes = new Set(['session_expired', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found'])
const financeWritePaths = new Set([
  'accounts', 'categories', 'transactions', 'transfers', 'recurring_templates',
  'rpc/import_monobank_operation', 'rpc/restore_backup',
].map((path) => `/rest/v1/${path}`))

export function canReachSupabase() {
  return reachable
}

function setReachable(value: boolean) {
  if (value === reachable) return
  reachable = value
  supabaseConnection.dispatchEvent(new Event('change'))
}

function recoverAccessToken(userId: string, authorization: string): Promise<string | null> {
  const client = supabase
  if (!client || getRememberedUserId() !== userId) return Promise.resolve(null)
  if (sessionRecovery?.userId === userId) return sessionRecovery.promise

  const promise = (async () => {
    const { data: { session } } = await client.auth.getSession()
    if (session?.user.id !== userId) return null
    // A concurrent request or the SDK may have refreshed the session already.
    if (`Bearer ${session.access_token}` !== authorization) return session.access_token
    const { data: { session: refreshed }, error } = await client.auth.refreshSession()
    if (refreshed?.user.id === userId) return refreshed.access_token
    if (isAuthSessionMissingError(error) || (isAuthApiError(error) && error.code && endedSessionCodes.has(error.code))) {
      // The server already rejected this token, even if the device clock still treats it as valid.
      const { data: { session: current } } = await client.auth.getSession()
      if (current?.user.id !== userId || getRememberedUserId() !== userId) return null
      if (`Bearer ${current.access_token}` !== authorization) return current.access_token
      await client.auth.signOut({ scope: 'local' })
    }
    return null
  })().catch(() => null)
  sessionRecovery = { userId, promise }
  void promise.then(() => {
    if (sessionRecovery?.promise === promise) sessionRecovery = undefined
  })
  return promise
}

const fetchWithFinanceChanges: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : undefined
  const method = init?.method ?? request?.method ?? 'GET'
  const signal = init?.signal ?? request?.signal
  const requestUrl = new URL(input instanceof Request ? input.url : input)
  const ownDataApi = requestUrl.origin === project?.origin && requestUrl.pathname.startsWith('/rest/v1/')
  const userId = ownDataApi ? getRememberedUserId() : null
  const options: RequestInit | undefined = ownDataApi && method === 'GET' ? { ...init, cache: 'no-store' } : init
  let response: Response
  try {
    // Online reads must see server changes. IndexedDB holds the separate offline copy.
    const retryInput = request && userId ? request.clone() : input
    response = await fetch(input, options)
    setReachable(true)
    if (response.status === 401 && userId && !signal?.aborted) {
      const headers = new Headers(options?.headers ?? request?.headers)
      const authorization = headers.get('authorization')
      const error = await response.clone().json().catch(() => null)
      // PostgREST rejects invalid claims before running the database operation.
      if (authorization && (error?.code === 'PGRST303' || (error?.code === 'PGRST301' && /expired/i.test(error?.message ?? '')))) {
        const token = await recoverAccessToken(userId, authorization)
        if (token && `Bearer ${token}` !== authorization && !signal?.aborted && getRememberedUserId() === userId) {
          headers.set('authorization', `Bearer ${token}`)
          response = await fetch(retryInput, { ...options, headers })
          setReachable(true)
        }
      }
    }
  } catch (error) {
    if (navigator.onLine && error instanceof TypeError && !signal?.aborted && getRememberedUserId()) setReachable(false)
    throw error
  }
  if (response.ok && ownDataApi && financeWritePaths.has(requestUrl.pathname)
    && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    financeChanges.dispatchEvent(new Event('change'))
  }
  return response
}

// An expired access token can still identify an already downloaded local copy.
// Supabase alone validates and refreshes the session for server access.
export function getRememberedUserId(): string | null {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return null
    const session = JSON.parse(stored)
    return typeof session?.user?.id === 'string' && typeof session.refresh_token === 'string' ? session.user.id : null
  } catch {
    return null
  }
}

export const supabase =
  project && publishableKey?.startsWith('sb_publishable_')
    ? createClient(project.href, publishableKey, {
        auth: { persistSession: true, detectSessionInUrl: false, storageKey },
        global: { fetch: fetchWithFinanceChanges },
      })
    : null

export function snapshotKey(userId: string) {
  return `${project?.href}${userId}`
}
