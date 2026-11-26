import { useSyncExternalStore } from 'react'
import { todayInKyiv } from './dates'

function subscribeToDateChange(notify: () => void) {
  const timer = window.setInterval(notify, 30_000)
  window.addEventListener('focus', notify)
  document.addEventListener('visibilitychange', notify)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('focus', notify)
    document.removeEventListener('visibilitychange', notify)
  }
}

export function useKyivToday() {
  return useSyncExternalStore(subscribeToDateChange, todayInKyiv)
}
