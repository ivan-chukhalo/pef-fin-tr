import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { canReachSupabase, financeChanges, getRememberedUserId, snapshotKey, supabaseConnection } from '../lib/supabase'
import { downloadSnapshot, readSnapshot, removeSnapshot, saveSnapshot, type OfflineSnapshot } from './snapshot'

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
  const [local, setLocal] = useState<{ key: string; snapshot: OfflineSnapshot | null } | null>(null)
  const userId = online ? sessionUser : getRememberedUserId()
  const key = userId ? snapshotKey(userId) : null

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
    let download: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const update = (snapshot: OfflineSnapshot | null) => {
      if (lifetime.signal.aborted) return
      setLocal((current) => current?.key === key && current.snapshot &&
        (!snapshot || Date.parse(current.snapshot.exported_at) > Date.parse(snapshot.exported_at))
        ? current : { key, snapshot })
    }

    const refresh = () => {
      download?.abort()
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        const request = new AbortController()
        download = request
        void downloadSnapshot(client, userId, request.signal).then(async (snapshot) => {
          request.signal.throwIfAborted()
          if (getRememberedUserId() !== userId) return
          await saveSnapshot(key, snapshot, request.signal)
          if (!request.signal.aborted) update(snapshot)
        }).catch(() => {})
      }, 150)
    }

    void readSnapshot(key).then(update, () => update(null))
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
      download?.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [client, userId, key, online])

  return { online, userId, snapshot: local && local.key === key ? local.snapshot : undefined }
}
