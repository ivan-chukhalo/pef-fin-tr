import { formatDate, isDateOnOrBefore, todayInKyiv } from '../lib/dates'
import { parseExchangeRate } from './exchange'

type NbuRate = { date: string; rate: string }

const cacheKey = 'pef-fin-tr:nbu-usd-rate'
const pending = new Map<string, Promise<NbuRate | null>>()
let latest: NbuRate | null = null

export function getLastNbuRate(): NbuRate | null {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey) ?? 'null')
    if (typeof value?.date === 'string' && isDateOnOrBefore(value.date)
      && typeof value.rate === 'string' && parseExchangeRate(value.rate)
      && (!latest || value.date >= latest.date)) {
      latest = { date: value.date, rate: value.rate }
    }
  } catch {
    // The latest rate is still available in memory if storage is unavailable.
  }
  return latest
}

async function requestRate(date: string): Promise<NbuRate | null> {
  const url = `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchangenew?json&valcode=USD&date=${date.replaceAll('-', '')}`
  try {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return null
    const rows: unknown = await response.json()
    if (!Array.isArray(rows)) return null
    const row = rows.find((value) => value?.cc === 'USD' && value.exchangedate === formatDate(date))
    const rate = typeof row?.rate === 'number' ? parseExchangeRate(String(row.rate)) : null
    if (!rate) return null
    return { date, rate }
  } catch {
    return null
  }
}

export async function loadNbuRate(date: string): Promise<NbuRate | null> {
  if (!isDateOnOrBefore(date, todayInKyiv())) return null
  const cached = getLastNbuRate()
  if (cached?.date === date) return cached
  const existing = pending.get(date)
  if (existing) return existing

  const task = requestRate(date).then((result) => {
    const known = getLastNbuRate()
    if (result && (!known || result.date > known.date)) {
      latest = result
      try {
        localStorage.setItem(cacheKey, JSON.stringify(result))
      } catch {
        // The rate can still be used during this session.
      }
    }
    return result
  }).finally(() => pending.delete(date))
  pending.set(date, task)
  return task
}
