import type { SupabaseClient } from '@supabase/supabase-js'
import type { Account } from '../accounts/data'
import type { Category } from '../categories/data'
import type { RecurringTemplate } from '../recurring/data'
import { isBackup, summaryKeys } from '../settings/backup'
import type { Transaction } from '../transactions/data'
import type { Transfer } from '../transfers/data'

export type OfflineSnapshot = {
  exported_at: string
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  transfers: Transfer[]
  recurring_templates: RecurringTemplate[]
  category_history: { id: string; state: 'used' | 'deleted' }[]
}

export type OfflinePageProps = { client: SupabaseClient; snapshot?: OfflineSnapshot }

export async function downloadSnapshot(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<OfflineSnapshot> {
  // The authenticated backup RPC reads every table in one database snapshot.
  const { data, error } = await client.rpc('export_backup').abortSignal(signal)
  if (error) throw error
  if (!isBackup(data) || [...summaryKeys, 'category_history' as const].some((table) =>
    data[table].some((row) => row.user_id !== userId),
  )) throw new Error('Invalid offline snapshot')
  return data as unknown as OfflineSnapshot
}

type StoredSnapshot = { key: string; snapshot: OfflineSnapshot }

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

export async function readSnapshot(key: string): Promise<OfflineSnapshot | null> {
  const row: StoredSnapshot | undefined = await withSnapshotStore('readonly', (store) => store.get(key))
  return row?.snapshot ?? null
}

export async function saveSnapshot(key: string, snapshot: OfflineSnapshot, signal: AbortSignal) {
  await withSnapshotStore('readwrite', (store) => {
    const request = store.get(key)
    request.onsuccess = () => {
      const current: StoredSnapshot | undefined = request.result
      if (!signal.aborted && (!current || Date.parse(current.snapshot.exported_at) <= Date.parse(snapshot.exported_at))) {
        store.put({ key, snapshot } satisfies StoredSnapshot)
      }
    }
    return request
  })
}

export function removeSnapshot(key: string) {
  return withSnapshotStore('readwrite', (store) => store.delete(key))
}
