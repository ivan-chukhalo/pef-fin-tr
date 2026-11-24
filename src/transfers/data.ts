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

export type Transfer = TransferFields & { id: string; updated_at?: string; syncState?: 'pending' | 'failed' }
export type QueuedTransfer = {
  id: string
  fields: TransferFields
  delivery?: 'sent' | 'failed'
  failure?: 'date' | 'other'
}
export type QueueTransfer = (id: string, fields: TransferFields) => Promise<void>
export type ResolveRejectedTransfer = (id: string, originalDate: string, date: string | null) => Promise<void>
export type QueuedTransferChange = {
  operationId: string
  original: Transfer
  next: TransferFields | null
  attempted: boolean
  delivery?: 'sent' | 'failed'
}
export type QueueTransferChange = (transfer: Transfer, fields: TransferFields | null) => Promise<void>

export type TransferReceipt = {
  transfer: Transfer
  savedEarlierWithDifferentDetails: boolean
}

const columns = 'id,from_account_id,to_account_id,date,status,amount_uah_kop::text,comment,updated_at'
const fieldNames = ['from_account_id', 'to_account_id', 'date', 'status', 'amount_uah_kop', 'comment'] as const

export function sameTransferFields(first: TransferFields, second: TransferFields): boolean {
  return fieldNames.every((field) => first[field] === second[field])
}

function projectTransfer(saved: Transfer | undefined | null, change: QueuedTransferChange): Transfer | null {
  if (change.delivery === 'failed' || saved?.status === 'confirmed') return saved ?? null
  return change.next && { ...change.original, ...change.next, syncState: 'pending' }
}

export function mergePendingTransfers<Row extends { id: string }>(saved: Row[], pending?: readonly QueuedTransfer[]): (Row | Transfer)[] {
  if (!pending?.length) return saved
  const savedIds = new Set(saved.map(({ id }) => id))
  return [...saved, ...pending.filter(({ id }) => !savedIds.has(id)).map(({ id, fields, delivery }): Transfer => ({
    id, ...fields, syncState: delivery === 'failed' ? 'failed' : 'pending',
  }))]
}

export async function loadTransfers(client: SupabaseClient, signal: AbortSignal, status: OperationStatusFilter,
  snapshot?: OfflineSnapshot, pending?: readonly QueuedTransfer[], changes?: readonly QueuedTransferChange[]): Promise<Transfer[]> {
  const saved = snapshot ? snapshot.transfers.filter((row) => status === 'all' || row.status === status)
    : await readRows<Transfer>(client, 'transfers', columns, signal, status === 'all' ? undefined : ['status', status])
  const rows = status === 'planned' ? saved : mergePendingTransfers(saved, pending)
  if (status === 'confirmed' || !changes?.length) return rows
  const merged = new Map(rows.map((row) => [row.id, row]))
  for (const change of changes) {
    const id = change.original.id
    const projected = projectTransfer(merged.get(id), change)
    if (projected) merged.set(id, projected)
    else merged.delete(id)
  }
  return [...merged.values()]
}

export async function loadTransfer(client: SupabaseClient, id: string, signal: AbortSignal,
  snapshot?: OfflineSnapshot, change?: QueuedTransferChange): Promise<Transfer | null> {
  let saved = snapshot?.transfers.find((row) => row.id === id) ?? null
  if (!snapshot) {
    const { data, error } = await client.from('transfers').select(columns).eq('id', id).abortSignal(signal)
      .maybeSingle().overrideTypes<Transfer, { merge: false }>()
    if (error) throw error
    saved = data
  }
  return change ? projectTransfer(saved, change) : saved
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

  const savedEarlierWithDifferentDetails = !sameTransferFields(previous, fields)
  return { transfer: previous, savedEarlierWithDifferentDetails }
}

export async function uploadQueuedTransferChange(client: SupabaseClient, userId: string, entry: QueuedTransferChange, signal: AbortSignal): Promise<'sent' | 'failed' | 'waiting'> {
  const { original, next } = entry
  const remote = await loadTransfer(client, original.id, signal)
  if (next ? remote && sameTransferFields(remote, next) : !remote) return 'sent'
  if (!remote?.updated_at || remote.status !== 'planned' || !sameTransferFields(remote, original)
    || (original.updated_at && original.updated_at !== remote.updated_at)) return 'failed'

  const table = client.from('transfers')
  const query = next ? table.update({
    from_account_id: next.from_account_id, to_account_id: next.to_account_id, date: next.date,
    amount_uah_kop: next.amount_uah_kop, comment: next.comment,
  }) : table.delete()
  const { data, error } = await query.eq('id', remote.id).eq('user_id', userId).eq('status', 'planned').eq('updated_at', remote.updated_at)
    .select('id').abortSignal(signal)
  if (error) return error.code?.startsWith('23') || error.code === '42501' || error.code === '22003' ? 'failed' : 'waiting'
  if (data?.length) return 'sent'
  const latest = await loadTransfer(client, original.id, signal)
  return (next ? latest && sameTransferFields(latest, next) : !latest) ? 'sent' : 'failed'
}

export async function uploadQueuedTransfer(client: SupabaseClient, userId: string, entry: QueuedTransfer, signal: AbortSignal): Promise<'sent' | 'failed' | 'date' | 'waiting'> {
  try {
    await saveTransfer(client, entry.id, entry.fields, { userId, signal })
    return 'sent'
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === '23514' && error && typeof error === 'object' && 'message' in error
      && typeof error.message === 'string' && error.message.includes('transfers_confirmed_date_not_future')) return 'date'
    return typeof code === 'string' && (code.startsWith('23') || code === '22003') ? 'failed' : 'waiting'
  }
}
