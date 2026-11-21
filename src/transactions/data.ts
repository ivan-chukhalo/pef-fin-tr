import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAccounts } from '../accounts/data'
import { loadCategories, type CategoryType } from '../categories/data'
import type { OperationStatus, OperationStatusFilter } from '../lib/operations'
import { readRows } from '../lib/readRows'

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
}

const columns = 'id,account_id,category_id,type,date,status,currency,amount_original_kop::text,rate::text,amount_uah_kop::text,purchase_name,comment,created_at'

export function loadTransactions(client: SupabaseClient, signal: AbortSignal, status: OperationStatusFilter = 'confirmed'): Promise<Transaction[]> {
  return readRows<Transaction>(client, 'transactions', columns, signal, status === 'all' ? undefined : ['status', status])
}

export async function loadTransactionOptions(client: SupabaseClient, signal: AbortSignal) {
  const [accounts, categories] = await Promise.all([
    loadAccounts(client, signal),
    loadCategories(client, signal),
  ])
  return { accounts, categories }
}

export async function loadTransactionHistory(client: SupabaseClient, signal: AbortSignal) {
  const [options, transactions] = await Promise.all([
    loadTransactionOptions(client, signal),
    loadTransactions(client, signal),
  ])

  transactions.sort((first, second) =>
    second.date.localeCompare(first.date) ||
    second.created_at.localeCompare(first.created_at) ||
    second.id.localeCompare(first.id),
  )
  return { ...options, transactions }
}

export async function loadTransaction(client: SupabaseClient, id: string, signal?: AbortSignal, status: OperationStatusFilter = 'confirmed'): Promise<Transaction | null> {
  const query = client.from('transactions')
    .select(columns)
    .eq('id', id)
  if (status !== 'all') query.eq('status', status)
  if (signal) query.abortSignal(signal)
  const { data, error } = await query
    .maybeSingle()
    .overrideTypes<Transaction, { merge: false }>()
  if (error) throw error
  return data
}

export async function loadLastUsdRate(client: SupabaseClient, signal: AbortSignal): Promise<string> {
  const { data, error } = await client.from('transactions')
    .select('rate::text')
    .eq('currency', 'USD')
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle()
    .overrideTypes<{ rate: string }, { merge: false }>()
  if (error) throw error
  return data?.rate ?? ''
}

export async function saveTransaction(client: SupabaseClient, id: string, fields: TransactionFields, isNew: boolean) {
  const table = client.from('transactions')
  const query = isNew
    ? table.upsert({ id, ...fields }, { onConflict: 'id' })
    : table.update(fields).eq('id', id).eq('status', fields.status)

  const { error } = await query.select('id').single()
  if (error) throw error
}

export async function deleteTransaction(client: SupabaseClient, id: string) {
  const { error } = await client.from('transactions').delete().eq('id', id).eq('status', 'confirmed')
  if (error) throw error
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
