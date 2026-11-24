import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAccounts } from '../accounts/data'
import { loadCategories, type CategoryType } from '../categories/data'
import type { OperationStatus, OperationStatusFilter } from '../lib/operations'
import { readRows } from '../lib/readRows'
import { canApplyTransactionChange, mergePendingTransactions, projectedChange, type OfflineSnapshot, type QueuedChange, type QueuedTransaction, type TransactionOverlay } from '../offline/snapshot'
import { parseExchangeRate } from './exchange'

export type Currency = 'UAH' | 'USD'

export type TransactionFields = {
  account_id: string
  category_id: string
  type: CategoryType
  date: string
  status: OperationStatus
  currency: Currency
  amount_original_kop: string
  rate: string
  purchase_name: string | null
  comment: string | null
}

export type Transaction = TransactionFields & {
  id: string
  amount_uah_kop: string
  created_at: string
  updated_at?: string
  syncState?: 'pending' | 'failed' | 'conflict'
}

const columns = 'id,account_id,category_id,type,date,status,currency,amount_original_kop::text,rate::text,amount_uah_kop::text,purchase_name,comment,created_at,updated_at'
const fieldNames = ['account_id', 'category_id', 'type', 'date', 'status', 'currency', 'amount_original_kop', 'rate', 'purchase_name', 'comment'] as const satisfies readonly (keyof TransactionFields)[]

export async function loadTransactions(client: SupabaseClient, signal: AbortSignal, status: OperationStatusFilter = 'confirmed', snapshot?: OfflineSnapshot, overlay?: TransactionOverlay): Promise<Transaction[]> {
  const rows = snapshot ? snapshot.transactions.filter((row) => status === 'all' || row.status === status)
    : await readRows<Transaction>(client, 'transactions', columns, signal, status === 'all' ? undefined : ['status', status])
  return mergePendingTransactions(rows, overlay, status)
}

export async function loadTransactionOptions(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot) {
  const [accounts, categories] = await Promise.all([
    loadAccounts(client, signal, snapshot),
    loadCategories(client, signal, snapshot),
  ])
  return { accounts, categories }
}

export async function loadTransactionHistory(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot, overlay?: TransactionOverlay) {
  const [options, transactions] = await Promise.all([
    loadTransactionOptions(client, signal, snapshot),
    loadTransactions(client, signal, 'confirmed', snapshot, overlay),
  ])

  transactions.sort((first, second) =>
    second.date.localeCompare(first.date) ||
    second.created_at.localeCompare(first.created_at) ||
    second.id.localeCompare(first.id),
  )
  return { ...options, transactions }
}

export async function loadTransaction(client: SupabaseClient, id: string, signal?: AbortSignal, status: OperationStatusFilter = 'confirmed', snapshot?: OfflineSnapshot, overlay?: TransactionOverlay): Promise<Transaction | null> {
  const change = overlay?.changes.find((entry) => entry.id === id)
  if (change) {
    const local = projectedChange(change)
    return local && (status === 'all' || local.status === status) ? local : null
  }
  const draft = overlay?.drafts.find((entry) => entry.id === id && (status === 'all' || entry.status === status))
  if (snapshot) return snapshot.transactions.find((row) => row.id === id && (status === 'all' || row.status === status)) ?? draft ?? null
  const query = client.from('transactions')
    .select(columns)
    .eq('id', id)
  if (status !== 'all') query.eq('status', status)
  if (signal) query.abortSignal(signal)
  const { data, error } = await query
    .maybeSingle()
    .overrideTypes<Transaction, { merge: false }>()
  if (error) throw error
  return data ?? draft ?? null
}

export async function loadLastUsdRate(client: SupabaseClient, signal: AbortSignal, snapshot?: OfflineSnapshot, overlay?: TransactionOverlay): Promise<string> {
  if (snapshot || overlay) {
    const rows = await loadTransactions(client, signal, 'confirmed', snapshot, overlay)
    return latestUsd(rows)
  }
  const { data, error } = await client.from('transactions')
    .select('id,currency,created_at,rate::text')
    .eq('currency', 'USD')
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle()
    .overrideTypes<Pick<Transaction, 'id' | 'currency' | 'created_at' | 'rate'>, { merge: false }>()
  if (error) throw error
  return data?.rate ?? ''
}

function latestUsd(rows: readonly Pick<Transaction, 'id' | 'currency' | 'created_at' | 'rate'>[]) {
  return rows.filter(({ currency }) => currency === 'USD').sort((first, second) =>
    second.created_at.localeCompare(first.created_at) || second.id.localeCompare(first.id),
  )[0]?.rate ?? ''
}

export async function saveTransaction(client: SupabaseClient, id: string, fields: TransactionFields, isNew: boolean) {
  const table = client.from('transactions')
  const query = isNew
    ? table.upsert({ id, ...fields }, { onConflict: 'id' })
    : table.update(fields).eq('id', id).eq('status', fields.status)

  const { error } = await query.select('id').single()
  if (error) throw error
}

export async function uploadQueuedTransaction(client: SupabaseClient, userId: string, entry: QueuedTransaction, signal: AbortSignal): Promise<'sent' | 'failed' | 'waiting'> {
  const { data, error } = await client.from('transactions')
    .upsert({ ...entry.fields, id: entry.id, user_id: userId, created_at: entry.createdAt }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id').abortSignal(signal)
  if (error) return error.code?.startsWith('23') || error.code === '22003' ? 'failed' : 'waiting'
  if (data?.length) return 'sent'
  // A previous attempt may have committed before its response was lost.
  return await loadTransaction(client, entry.id, signal, 'all') ? 'sent' : 'waiting'
}

export function sameTransactionFields(first: TransactionFields, second: TransactionFields) {
  return fieldNames.every((field) => field === 'rate'
    ? parseExchangeRate(first.rate) === parseExchangeRate(second.rate) : first[field] === second[field])
}

export async function uploadQueuedChange(client: SupabaseClient, userId: string, entry: QueuedChange, signal: AbortSignal):
Promise<{ delivery: 'sent' | 'failed' | 'waiting' } | { delivery: 'conflict'; remote: Transaction | null }> {
  const remote = await loadTransaction(client, entry.id, signal, 'all')
  const { base, next } = entry
  if (!canApplyTransactionChange(next, remote)) return { delivery: 'conflict', remote }
  if (next ? remote && sameTransactionFields(next, remote) : !remote) return { delivery: 'sent' }
  const unchanged = base && remote ? (!base.updated_at || base.updated_at === remote.updated_at) && sameTransactionFields(base, remote) : !base && !remote
  if (!unchanged) return { delivery: 'conflict', remote }

  const table = client.from('transactions')
  const payload = next && Object.fromEntries(fieldNames.map((field) => [field, next[field]]))
  const getDelivery = (code?: string) => ({ delivery: code?.startsWith('23') || code === '22003' ? 'failed' : 'waiting' }) as const
  if (!remote && payload && next) {
    const { data, error } = await table.upsert({ ...payload, id: entry.id, user_id: userId, created_at: next.created_at }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id').abortSignal(signal)
    if (error) return getDelivery(error.code)
    if (data?.length) return { delivery: 'sent' }
  } else if (remote?.updated_at) {
    const query = (payload ? table.update(payload) : table.delete())
      .eq('id', entry.id).eq('user_id', userId).eq('status', remote.status).eq('updated_at', remote.updated_at)
    const { data, error } = await query.select('id').abortSignal(signal)
    if (error) return getDelivery(error.code)
    if (data?.length) return { delivery: 'sent' }
  }
  const latest = await loadTransaction(client, entry.id, signal, 'all')
  if (next ? latest && sameTransactionFields(next, latest) : !latest) return { delivery: 'sent' }
  return { delivery: 'conflict', remote: latest }
}

export async function deleteTransaction(client: SupabaseClient, id: string, status: OperationStatus = 'confirmed'): Promise<boolean> {
  const { data, error } = await client.from('transactions').delete()
    .eq('id', id).eq('status', status).select('id').maybeSingle()
  if (error) throw error
  return data !== null
}

export async function confirmTransaction(client: SupabaseClient, id: string, { date, amount_original_kop, rate }: Pick<TransactionFields, 'date' | 'amount_original_kop' | 'rate'>): Promise<string> {
  const { data, error } = await client.from('transactions')
    .update({ date, amount_original_kop, rate, status: 'confirmed' })
    .eq('id', id)
    .eq('status', 'planned')
    .select('date')
    .maybeSingle()
    .overrideTypes<{ date: string }, { merge: false }>()
  if (error) throw error
  if (data) return data.date

  const confirmed = await loadTransaction(client, id)
  if (!confirmed) throw new Error('Planned transaction not found')
  return confirmed.date
}
