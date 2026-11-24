import { useEffect, useState } from 'react'

export type OfflineWorkerStatus = 'preparing' | 'ready' | 'failed'

export function useOfflineWorker(): OfflineWorkerStatus {
  const [status, setStatus] = useState<OfflineWorkerStatus>('preparing')

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const lifetime = new AbortController()
    const { signal } = lifetime
    const update = (status: OfflineWorkerStatus) => {
      if (!signal.aborted) setStatus(status)
    }

    const register = async () => {
      try {
        const workers = navigator.serviceWorker
        if (!workers) {
          update('failed')
          return
        }
        const registration = await workers.register(`${import.meta.env.BASE_URL}sw.js`)
        if (signal.aborted) return

        const watch = () => {
          const installing = registration.installing
          if (!installing) return
          const onStateChange = () => {
            if (installing.state === 'redundant' && !registration.active) update('failed')
          }
          installing.addEventListener('statechange', onStateChange, { signal })
          onStateChange()
        }

        registration.addEventListener('updatefound', watch, { signal })
        watch()
        void workers.ready.then(() => update('ready'))
      } catch {
        update('failed')
      }
    }

    void register()
    return () => lifetime.abort()
  }, [])

  return status
}
