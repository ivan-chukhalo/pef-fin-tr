import { useEffect, useState } from 'react'

export function useTransactionData<Data>(load: (signal: AbortSignal) => Promise<Data>) {
  const [data, setData] = useState<Data | null>(null)
  const [hasError, setHasError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setData(result)
      },
      () => {
        if (!controller.signal.aborted) setHasError(true)
        controller.abort()
      },
    )
    return () => controller.abort()
  }, [load, attempt])

  function retry() {
    setHasError(false)
    setAttempt((value) => value + 1)
  }

  return { data, setData, hasError, retry }
}
