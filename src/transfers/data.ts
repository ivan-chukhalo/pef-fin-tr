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

export type Transfer = TransferFields & { id: string; syncState?: 'pending' | 'failed' }
export type QueuedTransfer = { id: string; fields: TransferFields; delivery?: 'sent' | 'failed' }
export type QueueTransfer = (id: string, fields: TransferFields) => Promise<void>

export type TransferReceipt = {
  transfer: Transfer
  savedEarlierWithDifferentDetails: boolean
}

const columns = 'id,from_account_id,to_account_id,date,status,amount_uah_kop::text,comment'

export function mergePendingTransfers<Row extends { id: string }>(saved: Row[], pending?: readonly QueuedTransfer[]): (Row | Transfer)[] {
  if (!pending?.length) return saved
  const savedIds = new Set(saved.map(({ id }) => id))
  return [...saved, ...pending.filter(({ id }) => !savedIds.has(id)).map(({ id, fields, delivery }): Transfer => ({
    id, ...fields, syncState: delivery === 'failed' ? 'failed' : 'pending',
  }))]
}

export async function loadTransfers(client: SupabaseClient, signal: AbortSignal, status: OperationStatusFilter, snapshot?: OfflineSnapshot, pending?: readonly QueuedTransfer[]): Promise<Transfer[]> {
  const saved = snapshot ? snapshot.transfers.filter((row) => status === 'all' || row.status === status)
    : await readRows<Transfer>(client, 'transfers', columns, signal, status === 'all' ? undefined : ['status', status])
  return status === 'planned' ? saved : mergePendingTransfers(saved, pending)
}

export async function saveTransfer(client: SupabaseClient, id: string, fields: TransferFields, sync?: { userId: string; signal: AbortSignal }): Promise<TransferReceipt> {
  const owner = sync ? { user_id: sync.userId } : {}
  const insert = client.from('transfers')
    .upsert({ id, ...fields, ...owner }, { onConflict: 'id', ignoreDuplicates: true })
    .select(columns)
  if (sync) insert.abortSignal(sync.signal)
  const { data, error } = await insert.overrideTypes<Transfer[], { merge: false }>()
  if (error) throw error

  const inserted = data?.[0]
  if (inserted) return { transfer: inserted, savedEarlierWithDifferentDetails: false }

  const existing = client.from('transfers')
    .select(columns)
    .eq('id', id)
  if (sync) existing.eq('user_id', sync.userId).abortSignal(sync.signal)
  const { data: previous, error: readError } = await existing
    .single()
    .overrideTypes<Transfer, { merge: false }>()
  if (readError) throw readError

  const savedEarlierWithDifferentDetails = (Object.keys(fields) as (keyof TransferFields)[])
    .some((field) => previous[field] !== fields[field])
  return { transfer: previous, savedEarlierWithDifferentDetails }
}

export async function uploadQueuedTransfer(client: SupabaseClient, userId: string, entry: QueuedTransfer, signal: AbortSignal): Promise<'sent' | 'failed' | 'waiting'> {
  try {
    await saveTransfer(client, entry.id, entry.fields, { userId, signal })
    return 'sent'
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    return typeof code === 'string' && (code.startsWith('23') || code === '22003') ? 'failed' : 'waiting'
  }
}
