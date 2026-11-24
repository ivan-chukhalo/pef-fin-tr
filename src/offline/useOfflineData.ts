import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { canReachSupabase, financeChanges, getRememberedUserId, snapshotKey, supabaseConnection } from '../lib/supabase'
import { uploadQueuedTransaction, type Transaction, type TransactionFields } from '../transactions/data'
import { convertToUah } from '../transactions/exchange'
import { changeLocalFinance, downloadSnapshot, readLocalFinance, removeSnapshot } from './snapshot'

type LocalFinance = Awaited<ReturnType<typeof readLocalFinance>>
const noPendingTransactions: readonly Transaction[] = []

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
  const pendingTransactions = useMemo<readonly Transaction[]>(() => queue?.length ? queue.map((entry) => ({
    ...entry.fields,
    id: entry.id,
    created_at: entry.createdAt,
    amount_uah_kop: entry.amountUah,
    syncState: entry.delivery === 'failed' ? 'failed' : 'pending',
  })) : noPendingTransactions, [queue])

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
        const result = await uploadQueuedTransaction(client, userId, entry, AbortSignal.any([signal, AbortSignal.timeout(12_000)]))
        if (result === 'waiting') break
        current = await changeLocalFinance(key, (state) => ({
          ...state,
          queue: state.queue.map((item) => item.id === entry.id && item.delivery !== 'sent'
            ? { ...item, delivery: result } : item),
        }), signal)
        update(current)
      }
      signal.throwIfAborted()
      const sentBeforeDownload = new Set(current.queue.filter(({ delivery }) => delivery === 'sent').map(({ id }) => id))
      const snapshot = await downloadSnapshot(client, userId, AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
      signal.throwIfAborted()
      if (getRememberedUserId() !== userId) return
      const savedIds = new Set(snapshot.transactions.map(({ id }) => id))
      update(await changeLocalFinance(key, (state) => {
        if (state.snapshot && Date.parse(state.snapshot.exported_at) > Date.parse(snapshot.exported_at)) return state
        return { ...state, snapshot, queue: state.queue.filter(({ id }) => !savedIds.has(id) && !sentBeforeDownload.has(id)) }
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
        void syncAndRefresh().catch(() => {}).finally(() => {
          running = false
          if (requested) {
            requested = false
            refresh()
          }
        })
      }, 150)
    }

    void readLocalFinance(key).then(update, () => update({ snapshot: null, queue: [], revision: 0 }))
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
      return { ...current, queue: [...current.queue, { id, fields, amountUah: amountUah.toString(), createdAt: new Date().toISOString() }] }
    })
    if (getRememberedUserId() !== userId) return
    setLocal((current) => current?.key === key && current.finance.revision > next.revision ? current : { key, finance: next })
    financeChanges.dispatchEvent(new Event('change'))
  }

  async function retryTransactions() {
    if (!key || getRememberedUserId() !== userId) return
    try {
      const next = await changeLocalFinance(key, (state) => ({
        ...state,
        queue: state.queue.map((entry) => entry.delivery === 'failed' ? { ...entry, delivery: undefined } : entry),
      }))
      if (getRememberedUserId() !== userId) return
      setLocal((current) => current?.key === key && current.finance.revision > next.revision ? current : { key, finance: next })
      financeChanges.dispatchEvent(new Event('change'))
    } catch {
      // The entries stay in storage if resetting their delivery state fails.
    }
  }

  return { online, userId, snapshot: finance?.snapshot, pendingTransactions, queueTransaction, retryTransactions }
}
