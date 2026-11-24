import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { canReachSupabase, financeChanges, getRememberedUserId, snapshotKey, supabaseConnection } from '../lib/supabase'
import { loadTransaction, sameTransactionFields, uploadQueuedChange, uploadQueuedTransaction, type Transaction, type TransactionFields } from '../transactions/data'
import { convertToUah } from '../transactions/exchange'
import { uploadQueuedTransfer, type QueueTransfer } from '../transfers/data'
import { changeLocalFinance, downloadSnapshot, pendingTransaction, readLocalFinance, removeSnapshot, type QueuedChange, type TransactionOverlay } from './snapshot'

type LocalFinance = Awaited<ReturnType<typeof readLocalFinance>>

function subscribeToConnection(notify: () => void) {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  supabaseConnection.addEventListener('change', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
    supabaseConnection.removeEventListener('change', notify)
  }
}

function isOnline() {
  return navigator.onLine && canReachSupabase()
}

export function useOfflineData(client: SupabaseClient | null) {
  const online = useSyncExternalStore(subscribeToConnection, isOnline)
  const [sessionUser, setSessionUser] = useState<string | null | undefined>(undefined)
  const [local, setLocal] = useState<{ key: string; finance: LocalFinance } | null>(null)
  const userId = online ? sessionUser : getRememberedUserId()
  const key = userId ? snapshotKey(userId) : null
  const finance = local?.key === key ? local.finance : undefined
  const queue = finance?.queue
  const changes = finance?.changes
  const pendingTransfers = finance?.transferQueue.length ? finance.transferQueue : undefined
  const transactionOverlay = useMemo<TransactionOverlay | undefined>(() => queue?.length || changes?.length
    ? { drafts: (queue ?? []).map(pendingTransaction), changes: changes ?? [] } : undefined, [queue, changes])

  useEffect(() => {
    if (!client) return
    let previousUser = getRememberedUserId()
    let authGeneration = 0
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      authGeneration += 1
      if (event === 'SIGNED_OUT' && previousUser) {
        void removeSnapshot(snapshotKey(previousUser)).catch(() => {})
        previousUser = null
      }
      if (session) previousUser = session.user.id
      setSessionUser(session?.user.id ?? null)
    })
    const restoreSession = () => {
      const generation = ++authGeneration
      void client.auth.getSession().then(({ data }) => {
        if (generation === authGeneration) setSessionUser(data.session?.user.id ?? null)
      }).catch(() => {})
    }
    window.addEventListener('online', restoreSession)
    return () => {
      authGeneration += 1
      subscription.unsubscribe()
      window.removeEventListener('online', restoreSession)
    }
  }, [client])

  useEffect(() => {
    if (online || !client || !userId) return
    let probing = false
    const probe = () => {
      if (probing || !navigator.onLine || canReachSupabase() || document.visibilityState !== 'visible') return
      probing = true
      void client.auth.getUser().catch(() => {}).finally(() => { probing = false })
    }
    window.addEventListener('online', probe)
    window.addEventListener('focus', probe)
    const timer = setInterval(probe, 15_000)
    return () => {
      window.removeEventListener('online', probe)
      window.removeEventListener('focus', probe)
      clearInterval(timer)
    }
  }, [client, online, userId])

  useEffect(() => {
    if (!client || !userId || !key) return
    const lifetime = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = false
    let requested = false
    let hasPending = false

    const { signal } = lifetime
    const update = (finance: LocalFinance) => {
      if (signal.aborted) return
      hasPending = finance.queue.some(({ delivery }) => delivery !== 'failed')
        || finance.changes.some(({ delivery, conflict }) => delivery !== 'failed' && !conflict)
        || finance.transferQueue.some(({ delivery }) => delivery !== 'failed')
      setLocal((current) => current?.key === key && current.finance.revision >= finance.revision
        ? current : { key, finance })
    }

    const syncAndRefresh = async () => {
      let current = await readLocalFinance(key)
      update(current)
      for (const entry of current.queue) {
        if (entry.delivery) continue
        signal.throwIfAborted()
        if (getRememberedUserId() !== userId) return
        current = await changeLocalFinance(key, (state) => ({ ...state, queue: state.queue.map((item) =>
          item.id === entry.id && !item.delivery ? { ...item, attempted: true } : item) }), signal)
        const draft = current.queue.find((item) => item.id === entry.id && !item.delivery)
        if (!draft) continue
        const request = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
        const deletion = current.changes.some((change) => change.id === draft.id && !change.next)
        const result = deletion && !(await loadTransaction(client, draft.id, request, 'all'))
          ? 'sent' : await uploadQueuedTransaction(client, userId, draft, request)
        if (result === 'waiting') break
        current = await changeLocalFinance(key, (state) => ({
          ...state,
          queue: state.queue.map((item) => item.id === entry.id && item.delivery !== 'sent'
            ? { ...item, delivery: result, attempted: result === 'sent' } : item),
        }), signal)
        update(current)
      }
      current = await readLocalFinance(key)
      for (const entry of current.changes) {
        if (entry.delivery || entry.conflict || current.queue.some((draft) => draft.id === entry.id && !draft.delivery)) continue
        signal.throwIfAborted()
        if (getRememberedUserId() !== userId) return
        current = await changeLocalFinance(key, (state) => ({ ...state, changes: state.changes.map((item) =>
          item.operationId === entry.operationId && !item.delivery && !item.conflict ? { ...item, attempted: true } : item) }), signal)
        const change = current.changes.find((item) => item.operationId === entry.operationId && !item.delivery && !item.conflict)
        if (!change) continue
        update(current)
        const result = await uploadQueuedChange(client, userId, change, AbortSignal.any([signal, AbortSignal.timeout(12_000)]))
        const delivery = result.delivery
        if (delivery === 'waiting') break
        current = await changeLocalFinance(key, (state) => ({ ...state, changes: state.changes.map((item) => {
          if (item.operationId !== change.operationId) return item
          if (delivery === 'conflict') return { ...item, conflict: { remote: result.remote } }
          return { ...item, delivery, attempted: delivery === 'sent' }
        }) }), signal)
        update(current)
      }
      current = await readLocalFinance(key)
      for (const entry of current.transferQueue) {
        if (entry.delivery) continue
        signal.throwIfAborted()
        if (getRememberedUserId() !== userId) return
        const delivery = await uploadQueuedTransfer(client, userId, entry, AbortSignal.any([signal, AbortSignal.timeout(12_000)]))
        if (delivery === 'waiting') break
        current = await changeLocalFinance(key, (state) => ({
          ...state,
          transferQueue: state.transferQueue.map((item) => item.id === entry.id && item.delivery !== 'sent' ? { ...item, delivery } : item),
        }), signal)
        update(current)
      }
      signal.throwIfAborted()
      const sentBeforeDownload = new Set(current.queue.filter(({ delivery }) => delivery === 'sent').map(({ id }) => id))
      const acknowledgedChanges = new Set(current.changes.filter(({ delivery }) => delivery === 'sent').map(({ operationId }) => operationId))
      const acknowledgedDeletions = new Set(current.changes.filter(({ delivery, next }) => delivery === 'sent' && !next).map(({ id }) => id))
      const sentTransfers = new Set(current.transferQueue.filter(({ delivery }) => delivery === 'sent').map(({ id }) => id))
      const snapshot = await downloadSnapshot(client, userId, AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
      signal.throwIfAborted()
      if (getRememberedUserId() !== userId) return
      const savedIds = new Set(snapshot.transactions.map(({ id }) => id))
      const savedTransferIds = new Set(snapshot.transfers.map(({ id }) => id))
      update(await changeLocalFinance(key, (state) => {
        if (state.snapshot && Date.parse(state.snapshot.exported_at) > Date.parse(snapshot.exported_at)) return state
        const transferQueue = state.transferQueue.filter(({ id }) => !savedTransferIds.has(id) && !sentTransfers.has(id))
        return { ...state, snapshot, queue: state.queue.filter(({ id }) => !savedIds.has(id) && !sentBeforeDownload.has(id) && !acknowledgedDeletions.has(id)),
          changes: state.changes.filter(({ operationId }) => !acknowledgedChanges.has(operationId)),
          transferQueue: transferQueue.length === state.transferQueue.length ? state.transferQueue : transferQueue }
      }, signal))
    }

    const refresh = () => {
      if (signal.aborted) return
      if (running) {
        requested = true
        return
      }
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        running = true
        const task = navigator.locks ? navigator.locks.request(`pef-fin-tr:sync:${key}`, { signal }, syncAndRefresh) : syncAndRefresh()
        void task.catch(() => {}).finally(() => {
          running = false
          if (requested) {
            requested = false
            refresh()
          }
        })
      }, 150)
    }

    void readLocalFinance(key).then(update, () => update({ snapshot: null, queue: [], changes: [], transferQueue: [], revision: 0 }))
    const retryTimer = online ? setInterval(() => { if (hasPending) refresh() }, 15_000) : undefined
    if (online) {
      refresh()
      financeChanges.addEventListener('change', refresh, { signal: lifetime.signal })
      window.addEventListener('focus', refresh, { signal: lifetime.signal })
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refresh()
      }, { signal: lifetime.signal })
    }
    return () => {
      lifetime.abort()
      if (timer !== undefined) clearTimeout(timer)
      if (retryTimer !== undefined) clearInterval(retryTimer)
    }
  }, [client, userId, key, online])

  async function queueTransaction(id: string, fields: TransactionFields) {
    if (!key || getRememberedUserId() !== userId || fields.status !== 'confirmed') throw new Error('Offline save is unavailable')
    const amountUah = convertToUah(BigInt(fields.amount_original_kop), fields.rate)
    if (amountUah === null) throw new Error('Invalid amount')
    const next = await changeLocalFinance(key, (current) => {
      if (!current.snapshot || getRememberedUserId() !== userId) throw new Error('Offline save is unavailable')
      if (current.queue.some((entry) => entry.id === id) || current.snapshot.transactions.some((row) => row.id === id)) return current
      return { ...current, queue: [...current.queue, { id, fields, amountUah: amountUah.toString(), createdAt: new Date().toISOString(), attempted: false }] }
    })
    rememberLocalChange(next)
  }

  const queueTransfer: QueueTransfer = async (id, fields) => {
    if (!key || getRememberedUserId() !== userId || fields.status !== 'confirmed') throw new Error('Offline transfer is unavailable')
    const next = await changeLocalFinance(key, (current) => {
      if (!current.snapshot || getRememberedUserId() !== userId) throw new Error('Offline transfer is unavailable')
      if (current.transferQueue.some((entry) => entry.id === id) || current.snapshot.transfers.some((row) => row.id === id)) return current
      return { ...current, transferQueue: [...current.transferQueue, { id, fields }] }
    })
    rememberLocalChange(next)
  }

  async function queueTransactionChange(original: Transaction, fields: TransactionFields | null) {
    if (!key || getRememberedUserId() !== userId || original.status !== 'confirmed' || (fields && fields.status !== 'confirmed')) {
      throw new Error('Offline change is unavailable')
    }
    const amountUah = fields ? convertToUah(BigInt(fields.amount_original_kop), fields.rate) : null
    if (fields && amountUah === null) throw new Error('Invalid amount')
    if (fields && sameTransactionFields(original, fields)) return
    const next = await changeLocalFinance(key, (current) => {
      if (getRememberedUserId() !== userId) throw new Error('Session changed')
      const draft = current.queue.find(({ id }) => id === original.id)
      const prior = current.changes.find(({ id }) => id === original.id)
      if (prior?.attempted || prior?.conflict) throw new Error('A change is already syncing')
      if (draft?.attempted === false && draft.delivery !== 'sent' && !prior) {
        if (!sameTransactionFields(draft.fields, original)) throw new Error('The local transaction changed')
        return { ...current, queue: current.queue.flatMap((item) => item.id !== original.id ? [item]
          : fields ? [{ ...item, fields, amountUah: amountUah!.toString(), delivery: undefined }] : []) }
      }
      if (prior && (!prior.next || !sameTransactionFields(prior.next, original))) throw new Error('The local transaction changed')
      const entry: QueuedChange = {
        id: original.id,
        operationId: crypto.randomUUID(),
        original: prior?.original ?? original,
        base: prior ? prior.base : draft ? pendingTransaction(draft) : original,
        next: fields ? { ...original, ...fields, amount_uah_kop: amountUah!.toString() } : null,
        attempted: false,
      }
      return { ...current, changes: [...current.changes.filter(({ id }) => id !== original.id), entry] }
    })
    rememberLocalChange(next)
  }

  function rememberLocalChange(next: LocalFinance) {
    if (!key || getRememberedUserId() !== userId) return
    setLocal((current) => current?.key === key && current.finance.revision > next.revision ? current : { key, finance: next })
    financeChanges.dispatchEvent(new Event('change'))
  }

  async function resolveTransactionConflict(operationId: string, keepLocal: boolean) {
    if (!key || getRememberedUserId() !== userId) return
    const next = await changeLocalFinance(key, (state) => {
      const conflict = state.changes.find((entry) => entry.operationId === operationId && entry.conflict)
      if (!conflict?.conflict || getRememberedUserId() !== userId) return state
      const changes = state.changes.filter((entry) => entry.operationId !== operationId)
      if (keepLocal) changes.push({ ...conflict, operationId: crypto.randomUUID(), base: conflict.conflict.remote, attempted: false, conflict: undefined, delivery: undefined })
      const queue = state.queue.filter(({ id }) => id !== conflict.id)
      return { ...state, queue, changes }
    })
    rememberLocalChange(next)
  }

  async function retrySync() {
    if (!key || getRememberedUserId() !== userId) return
    try {
      const next = await changeLocalFinance(key, (state) => ({
        ...state,
        queue: state.queue.map((entry) => entry.delivery === 'failed' ? { ...entry, delivery: undefined } : entry),
        changes: state.changes.map((entry) => entry.delivery === 'failed' ? { ...entry, delivery: undefined } : entry),
        transferQueue: state.transferQueue.map((entry) => entry.delivery === 'failed' ? { ...entry, delivery: undefined } : entry),
      }))
      rememberLocalChange(next)
    } catch {
      // The entries stay in storage if resetting their delivery state fails.
    }
  }

  return { online, userId, snapshot: finance?.snapshot, transactionOverlay, pendingTransfers,
    queueTransaction, queueTransfer, queueTransactionChange, resolveTransactionConflict, retrySync }
}
