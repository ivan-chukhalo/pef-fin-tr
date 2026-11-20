import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAccounts } from '../accounts/data'
import { loadCategories, type CategoryType } from '../categories/data'
import { readRows } from '../lib/readRows'

export type Currency = 'UAH' | 'USD'

export type TransactionFields = {
  account_id: string
  category_id: string
  type: CategoryType
  date: string
  currency: Currency
  amount_original_kop: string
  rate: string
  comment: string | null
}

export type Transaction = TransactionFields & {
  id: string
  amount_uah_kop: string
  created_at: string
}

const columns = 'id,account_id,category_id,type,date,currency,amount_original_kop::text,rate::text,amount_uah_kop::text,comment,created_at'

export function loadTransactions(client: SupabaseClient, signal: AbortSignal): Promise<Transaction[]> {
  return readRows<Transaction>(client, 'transactions', columns, signal)
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

export async function loadTransaction(client: SupabaseClient, id: string, signal: AbortSignal): Promise<Transaction | null> {
  const { data, error } = await client.from('transactions')
    .select(columns)
    .eq('id', id)
    .abortSignal(signal)
    .maybeSingle()
    .overrideTypes<Transaction, { merge: false }>()
  if (error) throw error
  return data
}

export async function loadLastUsdRate(client: SupabaseClient, signal: AbortSignal): Promise<string> {
  const { data, error } = await client.from('transactions')
    .select('rate::text')
    .eq('currency', 'USD')
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
    : table.update(fields).eq('id', id)

  const { error } = await query.select('id').single()
  if (error) throw error
}

export async function deleteTransaction(client: SupabaseClient, id: string) {
  const { error } = await client.from('transactions').delete().eq('id', id)
  if (error) throw error
}
