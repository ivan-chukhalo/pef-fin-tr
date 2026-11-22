import type { MonobankAccount, MonobankEntry } from '../src/monobank/types.ts'
import { defaultStatementPeriod, getStatementInterval } from '../src/monobank/period.ts'

type Environment = Record<string, string | undefined>
const bankUrl = 'https://api.monobank.ua'
const accountIdPattern = /^[a-z\d_+/=-]{1,128}$/i
const hryvniaCurrencyCode = 980

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

async function importId(ownerId: string, accountId: string, operationId: string) {
  const key = new TextEncoder().encode(JSON.stringify(['monobank', ownerId, accountId, operationId]))
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', key), 0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function readAccounts(body: unknown): MonobankAccount[] {
  if (!isRecord(body) || !Array.isArray(body.accounts)) throw new Error('Invalid bank accounts')

  return body.accounts
    .filter((item) => isRecord(item) && item.currencyCode === hryvniaCurrencyCode)
    .map((item: Record<string, unknown>) => {
      if (typeof item.id !== 'string' || !accountIdPattern.test(item.id) || !safeInteger(item.balance)) {
        throw new Error('Invalid bank account')
      }
      const maskedNumber = Array.isArray(item.maskedPan)
        ? item.maskedPan.find((value): value is string => typeof value === 'string' && /\d{4}$/.test(value))
        : undefined
      return {
        id: item.id,
        label: maskedNumber ? `Картка •${maskedNumber.slice(-4)}` : 'Гривневий рахунок',
        balanceKop: String(item.balance),
      }
    })
}

async function readStatement(body: unknown, ownerId: string, accountId: string): Promise<MonobankEntry[]> {
  if (!Array.isArray(body) || !body.every(isRecord)) throw new Error('Invalid bank statement')

  return Promise.all(body.filter((item) => item.hold !== true && item.amount !== 0).map(async (item) => {
    if (typeof item.id !== 'string' || !item.id || !safeInteger(item.time) || item.time < 0 ||
        item.time > 253402300799 || typeof item.description !== 'string' || !safeInteger(item.amount) ||
        !safeInteger(item.operationAmount) || !safeInteger(item.currencyCode) || !safeInteger(item.mcc)) {
      throw new Error('Invalid bank operation')
    }
    return {
      id: await importId(ownerId, accountId, item.id),
      time: item.time,
      description: item.description,
      amountKop: String(item.amount),
      originalAmount: String(item.operationAmount),
      currencyCode: item.currencyCode,
      mcc: item.mcc,
    }
  }))
}

export function createMonobankHandler(env: Environment) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') return json({ error: 'invalid_request' }, 405)
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

    const { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey } = env
    if (!supabaseUrl || !publishableKey) return json({ error: 'not_configured' }, 503)

    try {
      const response = await fetch(new URL('/auth/v1/user', supabaseUrl), {
        headers: { authorization, apikey: publishableKey },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      })
      if (response.status === 401 || response.status === 403) return json({ error: 'unauthorized' }, 401)
      if (!response.ok) return json({ error: 'unavailable' }, 502)

      const user: unknown = await response.json()
      if (!isRecord(user) || typeof user.id !== 'string') return json({ error: 'unauthorized' }, 401)
      const ownerId = env.MONOBANK_OWNER_ID?.trim()
      const bankToken = env.MONOBANK_TOKEN?.trim()
      if (!ownerId || !bankToken) return json({ error: 'not_configured' }, 503)
      if (user.id !== ownerId) return json({ error: 'unauthorized' }, 403)

      const query = new URL(request.url).searchParams
      const accountId = query.get('account')
      if (accountId !== null && !accountIdPattern.test(accountId)) return json({ error: 'invalid_request' }, 400)
      const period = query.has('from') || query.has('to')
        ? { from: query.get('from') ?? '', to: query.get('to') ?? '' }
        : defaultStatementPeriod()
      const interval = accountId ? getStatementInterval(period) : null
      if (accountId && !interval) return json({ error: 'invalid_period' }, 400)
      const path = accountId && interval
        ? `/personal/statement/${encodeURIComponent(accountId)}/${interval.from}/${interval.to}`
        : '/personal/client-info'
      const responseFromBank = await fetch(new URL(path, bankUrl), {
        headers: { 'X-Token': bankToken },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      })
      if (responseFromBank.status === 429) return json({ error: 'rate_limited' }, 429)
      if (responseFromBank.status === 401 || responseFromBank.status === 403) return json({ error: 'bank_access' }, 502)
      if (!responseFromBank.ok) return json({ error: 'unavailable' }, 502)

      const body: unknown = await responseFromBank.json()
      if (!accountId || !interval) return json(readAccounts(body))
      const entries = await readStatement(body, ownerId, accountId)
      return json(entries.filter(({ time }) => time >= interval.from && time <= interval.to && time < interval.endExclusive))
    } catch {
      return json({ error: 'unavailable' }, 502)
    }
  }
}

export default { fetch: createMonobankHandler(process.env) }
