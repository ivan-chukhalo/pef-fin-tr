import type { SupabaseClient } from '@supabase/supabase-js'
import { loadTransfers, type Transfer, type TransferFields } from '../transfers/data'
import { loadTransactionOptions, loadTransactions, type Transaction, type TransactionFields } from '../transactions/data'
import { convertToUah, parseExchangeRate } from '../transactions/exchange'
import type { StatementPeriod } from './period'
import type { MonobankAccount, MonobankEntry } from './types'

export type MonobankImport =
  | { kind: 'transaction'; fields: TransactionFields }
  | { kind: 'transfer'; fields: TransferFields }

const requestErrors: Record<string, string> = {
  unauthorized: 'Для доступу до monobank увійди в профіль власника.',
  not_configured: 'Підключення до monobank ще не налаштовано на сервері.',
  rate_limited: 'Monobank обмежив частоту запитів. Спробуй за хвилину.',
  bank_access: 'Monobank відхилив доступ. Перевір токен на сервері.',
  invalid_period: 'Вибери коректний період виписки до 31 дня.',
}

async function requestMonobank<T>(client: SupabaseClient, query: string, signal?: AbortSignal): Promise<T[]> {
  const { data, error } = await client.auth.getSession()
  if (error || !data.session) throw new Error(requestErrors.unauthorized)

  const fallback = 'Не вдалося отримати дані monobank. Спробуй ще раз.'
  const response = await fetch(`/api/monobank${query}`, {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    signal,
  }).catch(() => { throw new Error(fallback) })
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = (result as { error?: string } | null)?.error
    throw new Error((code && requestErrors[code]) || fallback)
  }
  if (!Array.isArray(result)) throw new Error(fallback)
  return result as T[]
}

export async function loadMonobankOptions(client: SupabaseClient, signal: AbortSignal) {
  const [bankAccounts, options, ledger] = await Promise.all([
    requestMonobank<MonobankAccount>(client, '', signal),
    loadTransactionOptions(client, signal),
    loadMonobankLedger(client, signal),
  ])
  return { bankAccounts, ...options, ...ledger }
}

export async function loadMonobankLedger(client: SupabaseClient, signal = new AbortController().signal) {
  const [transactions, transfers] = await Promise.all([
    loadTransactions(client, signal, 'all'),
    loadTransfers(client, signal, 'all'),
  ])
  return { transactions, transfers }
}

export function loadMonobankStatement(client: SupabaseClient, bankAccountId: string, period: StatementPeriod, signal?: AbortSignal) {
  return requestMonobank<MonobankEntry>(client, `?${new URLSearchParams({ account: bankAccountId, ...period })}`, signal)
}

export async function saveMonobankEntry(client: SupabaseClient, id: string, operation: MonobankImport) {
  const { data, error } = await client.rpc('import_monobank_operation', {
    p_id: id,
    p_kind: operation.kind,
    p_fields: operation.fields,
  })
  if (error || typeof data !== 'boolean') throw error ?? new Error('Invalid import response')
  return data
}

export function absoluteKopecks(value: string): bigint {
  const amount = BigInt(value)
  return amount < 0n ? -amount : amount
}

export function getMonobankAmounts(entry: MonobankEntry): Pick<TransactionFields, 'currency' | 'rate' | 'amount_original_kop'> {
  const amount = absoluteKopecks(entry.amountKop)
  const original = absoluteKopecks(entry.originalAmount)
  if (entry.currencyCode === 840 && original > 0n) {
    const precision = 10n ** 18n
    const scaledRate = (amount * precision + original / 2n) / original
    const fraction = (scaledRate % precision).toString().padStart(18, '0')
    const rate = parseExchangeRate(`${scaledRate / precision}.${fraction}`)
    if (rate && convertToUah(original, rate) === amount) {
      return { currency: 'USD', rate, amount_original_kop: original.toString() }
    }
  }
  return { currency: 'UAH', rate: '1', amount_original_kop: amount.toString() }
}

export function findMonobankMatches(entry: MonobankEntry, accountId: string, date: string, transactions: Transaction[], transfers: Transfer[]) {
  const amount = absoluteKopecks(entry.amountKop)
  const incoming = BigInt(entry.amountKop) > 0n
  return {
    transactions: transactions.filter((row) =>
      row.status === 'confirmed' && row.date === date && row.account_id === accountId &&
      row.type === (incoming ? 'income' : 'expense') && BigInt(row.amount_uah_kop) === amount,
    ),
    transfers: transfers.filter((row) =>
      row.status === 'confirmed' && row.date === date && BigInt(row.amount_uah_kop) === amount &&
      (incoming ? row.to_account_id : row.from_account_id) === accountId,
    ),
  }
}
