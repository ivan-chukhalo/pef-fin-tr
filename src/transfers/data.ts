import type { SupabaseClient } from '@supabase/supabase-js'
import type { OperationStatus, OperationStatusFilter } from '../lib/operations'
import { readRows } from '../lib/readRows'
import type { OfflineSnapshot } from '../offline/snapshot'

export type TransferFields = {
  from_account_id: string
  to_account_id: string
  date: string
  status: OperationStatus
  amount_uah_kop: string
  comment: string | null
}

export type Transfer = TransferFields & { id: string }

export type TransferReceipt = {
  transfer: Transfer
  savedEarlierWithDifferentDetails: boolean
}

const columns = 'id,from_account_id,to_account_id,date,status,amount_uah_kop::text,comment'

export function loadTransfers(client: SupabaseClient, signal: AbortSignal, status: OperationStatusFilter, snapshot?: OfflineSnapshot): Promise<Transfer[]> {
  if (snapshot) return Promise.resolve(snapshot.transfers.filter((row) => status === 'all' || row.status === status))
  return readRows<Transfer>(client, 'transfers', columns, signal, status === 'all' ? undefined : ['status', status])
}

export async function saveTransfer(client: SupabaseClient, id: string, fields: TransferFields): Promise<TransferReceipt> {
  const { data, error } = await client.from('transfers')
    .upsert({ id, ...fields }, { onConflict: 'id', ignoreDuplicates: true })
    .select(columns)
    .overrideTypes<Transfer[], { merge: false }>()
  if (error) throw error

  const inserted = data?.[0]
  if (inserted) return { transfer: inserted, savedEarlierWithDifferentDetails: false }

  const { data: previous, error: readError } = await client.from('transfers')
    .select(columns)
    .eq('id', id)
    .single()
    .overrideTypes<Transfer, { merge: false }>()
  if (readError) throw readError

  const savedEarlierWithDifferentDetails = (Object.keys(fields) as (keyof TransferFields)[])
    .some((field) => previous[field] !== fields[field])
  return { transfer: previous, savedEarlierWithDifferentDetails }
}
