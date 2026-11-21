import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { todayInKyiv } from '../lib/dates'
import { useLoadData } from '../lib/useLoadData'
import { loadTransfers } from '../transfers/data'
import { loadTransactionOptions, loadTransactions } from './data'
import OperationList from './OperationList'

const buttonClass = 'inline-flex min-h-11 items-center rounded-xl border border-zinc-700 px-4 text-sm font-medium hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'

export default function PlannedOperationsPage({ client }: { client: SupabaseClient }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [options, transactions, transfers] = await Promise.all([
      loadTransactionOptions(client, signal),
      loadTransactions(client, signal, 'planned'),
      loadTransfers(client, signal, 'planned'),
    ])
    return { ...options, transactions, transfers }
  }, [client])
  const { data, hasError, retry } = useLoadData(load)

  if (!data) {
    return hasError ? (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити заплановані операції.</p>
        <button type="button" className={buttonClass} onClick={retry}>Спробувати ще раз</button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо заплановані операції…</p>
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link to="/transactions/new?plan=1" className={buttonClass}>Запланувати транзакцію</Link>
        <Link to="/transactions/transfer?plan=1" className={buttonClass}>Запланувати переказ</Link>
      </div>
      <OperationList {...data} today={todayInKyiv()} label="Заплановані операції" emptyMessage="Запланованих операцій ще немає." showTransactionActions />
    </div>
  )
}
