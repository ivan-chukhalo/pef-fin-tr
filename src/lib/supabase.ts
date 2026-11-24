import { createClient } from '@supabase/supabase-js'

const projectUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
const publishableKey: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const project = projectUrl?.startsWith('https://') && URL.canParse(projectUrl) ? new URL(projectUrl) : null
const storageKey = project ? `sb-${project.hostname.split('.')[0]}-auth-token` : ''

export const financeChanges = new EventTarget()
export const supabaseConnection = new EventTarget()
let reachable = true
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

const fetchWithFinanceChanges: typeof fetch = async (input, init) => {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch (error) {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (navigator.onLine && error instanceof TypeError && !signal?.aborted && getRememberedUserId()) setReachable(false)
    throw error
  }
  setReachable(true)
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  if (response.ok && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const requestUrl = new URL(input instanceof Request ? input.url : input)
    if (requestUrl.origin === project?.origin && financeWritePaths.has(requestUrl.pathname)) {
      financeChanges.dispatchEvent(new Event('change'))
    }
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
