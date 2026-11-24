import type { SupabaseClient } from '@supabase/supabase-js'
import type { Account } from '../accounts/data'
import type { Category } from '../categories/data'
import type { RecurringTemplate } from '../recurring/data'
import { isBackup, summaryKeys } from '../settings/backup'
import type { Transaction, TransactionFields } from '../transactions/data'
import type { QueuedTransfer, Transfer } from '../transfers/data'

export type OfflineSnapshot = {
  exported_at: string
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  transfers: Transfer[]
  recurring_templates: RecurringTemplate[]
  category_history: { id: string; state: 'used' | 'deleted' }[]
}

export type OfflinePageProps = {
  client: SupabaseClient
  snapshot?: OfflineSnapshot
  transactionOverlay?: TransactionOverlay
  pendingTransfers?: readonly QueuedTransfer[]
}

export type QueuedTransaction = {
  id: string
  fields: TransactionFields
  createdAt: string
  amountUah: string
  attempted?: boolean
  delivery?: 'sent' | 'failed'
}

export type QueuedChange = {
  id: string
  operationId: string
  original: Transaction
  base: Transaction | null
  next: Transaction | null
  attempted: boolean
  delivery?: 'sent' | 'failed'
  conflict?: { remote: Transaction | null }
}

export type TransactionOverlay = { drafts: readonly Transaction[]; changes: readonly QueuedChange[] }

export function isRejectedConfirmation({ original, delivery }: QueuedChange): boolean {
  return original.status === 'planned' && delivery === 'failed'
}

export function pendingTransaction(entry: QueuedTransaction): Transaction {
  return { ...entry.fields, id: entry.id, created_at: entry.createdAt, amount_uah_kop: entry.amountUah,
    syncState: entry.delivery === 'failed' ? 'failed' : 'pending' }
}

export function projectedChange(change: QueuedChange): Transaction | null {
  return change.next && { ...change.next, syncState: change.conflict ? 'conflict'
    : change.delivery === 'failed' ? 'failed' : 'pending' }
}

export function mergePendingTransactions<Row extends { id: string }>(rows: Row[], overlay?: TransactionOverlay): (Row | Transaction)[] {
  if (!overlay) return rows
  const merged = new Map<string, Row | Transaction>(rows.map((row) => [row.id, row]))
  for (const draft of overlay.drafts) if (!merged.has(draft.id)) merged.set(draft.id, draft)
  for (const change of overlay.changes) {
    const local = projectedChange(change)
    if (local) merged.set(change.id, local)
    else merged.delete(change.id)
  }
  return [...merged.values()]
}

export async function downloadSnapshot(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<OfflineSnapshot> {
  // The authenticated backup RPC reads every table in one database snapshot.
  const { data, error } = await client.rpc('export_backup').abortSignal(signal)
  if (error) throw error
  if (!isBackup(data) || [...summaryKeys, 'category_history' as const].some((table) =>
    data[table].some((row) => row.user_id !== userId),
  )) throw new Error('Invalid offline snapshot')
  return data as unknown as OfflineSnapshot
}

type LocalFinance = { snapshot: OfflineSnapshot | null; queue: QueuedTransaction[]; changes: QueuedChange[]; transferQueue: QueuedTransfer[]; revision: number }
type StoredSnapshot = { key: string; snapshot: OfflineSnapshot | null }
type StoredQueue = { key: string } & Pick<LocalFinance, 'queue' | 'revision'>
type StoredChanges = { key: string; changes: QueuedChange[] }
type StoredTransfers = { key: string; transferQueue: QueuedTransfer[] }

async function withSnapshotStore<Result>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<Result>) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pef-fin-tr-offline', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise<Result>((resolve, reject) => {
      const transaction = database.transaction('snapshots', mode)
      const request = operation(transaction.objectStore('snapshots'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

async function accessLocalFinance(key: string, change?: (current: LocalFinance) => LocalFinance, signal?: AbortSignal) {
  // An older open PWA may still replace its snapshot record. Keep the queue at a separate key.
  const queueKey = `${key}:queue`
  const changesKey = `${key}:changes`
  const transfersKey = `${key}:transfers`
  let result: LocalFinance = { snapshot: null, queue: [], changes: [], transferQueue: [], revision: 0 }
  let failure: unknown
  await withSnapshotStore(change ? 'readwrite' : 'readonly', (store) => {
    const snapshotRequest = store.get(key)
    const queueRequest = store.get(queueKey)
    const changesRequest = store.get(changesKey)
    const transfersRequest = store.get(transfersKey)
    transfersRequest.onsuccess = () => {
      const storedSnapshot: StoredSnapshot | undefined = snapshotRequest.result
      const storedQueue: StoredQueue | undefined = queueRequest.result
      const storedChanges: StoredChanges | undefined = changesRequest.result
      const storedTransfers: StoredTransfers | undefined = transfersRequest.result
      const current = { snapshot: storedSnapshot?.snapshot ?? null, queue: storedQueue?.queue ?? [], changes: storedChanges?.changes ?? [],
        transferQueue: storedTransfers?.transferQueue ?? [], revision: storedQueue?.revision ?? 0 }
      result = current
      if (!change || signal?.aborted) return
      try {
        const next = change(current)
        if (next === current) return
        result = { ...next, revision: current.revision + 1 }
        if (next.snapshot !== current.snapshot) store.put({ key, snapshot: next.snapshot } satisfies StoredSnapshot)
        store.put({ key: queueKey, queue: next.queue, revision: result.revision } satisfies StoredQueue)
        if (next.changes !== current.changes) store.put({ key: changesKey, changes: next.changes } satisfies StoredChanges)
        if (next.transferQueue !== current.transferQueue) store.put({ key: transfersKey, transferQueue: next.transferQueue } satisfies StoredTransfers)
      } catch (error) {
        failure = error
        store.transaction.abort()
      }
    }
    return transfersRequest
  }).catch((error) => { throw failure ?? error })
  return result
}

export function readLocalFinance(key: string): Promise<LocalFinance> {
  return accessLocalFinance(key)
}

export function changeLocalFinance(key: string, change: (current: LocalFinance) => LocalFinance, signal?: AbortSignal) {
  return accessLocalFinance(key, change, signal)
}

export function removeSnapshot(key: string) {
  return changeLocalFinance(key, (current) => ({ ...current, snapshot: null }))
}
