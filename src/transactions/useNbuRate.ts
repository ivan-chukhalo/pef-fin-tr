import { useEffect, useState } from 'react'
import { getLastNbuRate, loadNbuRate } from './nbuRate'

export function useNbuRate(date: string | null, online: boolean) {
  const [lookup, setLookup] = useState<{ date: string; quote: Awaited<ReturnType<typeof loadNbuRate>> }>()
  const cached = getLastNbuRate()
  const requestedDate = online && cached?.date !== date ? date : null

  useEffect(() => {
    if (!requestedDate) return
    let active = true
    void loadNbuRate(requestedDate).then((quote) => {
      if (active) setLookup({ date: requestedDate, quote })
    })
    return () => { active = false }
  }, [requestedDate])

  return {
    quote: (lookup?.date === date ? lookup.quote : null) ?? cached,
    loading: requestedDate !== null && lookup?.date !== requestedDate,
  }
}
