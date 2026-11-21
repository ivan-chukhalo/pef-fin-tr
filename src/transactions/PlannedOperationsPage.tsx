import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, todayInKyiv } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import { loadTransfers } from '../transfers/data'
import { loadTransactionOptions, loadTransactions } from './data'
import { getTransactionLabels } from './labels'

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

  const today = todayInKyiv()
  const accounts = new Map(data.accounts.map(({ id, name }) => [id, name]))
  const categories = new Map(data.categories.map(({ id, name }) => [id, name]))
  const accountName = (id: string) => accounts.get(id) ?? 'Рахунок'
  const operations = [
    ...data.transactions.map((transaction) => {
      const { title, categoryLabel } = getTransactionLabels(transaction, categories.get(transaction.category_id) ?? 'Категорія')
      const income = transaction.type === 'income'
      return {
        key: `transaction-${transaction.id}`,
        date: transaction.date,
        title,
        categoryLabel,
        details: income ? `Дохід · ${accountName(transaction.account_id)}` : accountName(transaction.account_id),
        amount: BigInt(transaction.amount_uah_kop) * (income ? 1n : -1n),
        comment: transaction.comment,
      }
    }),
    ...data.transfers.map((transfer) => ({
      key: `transfer-${transfer.id}`,
      date: transfer.date,
      title: 'Переказ',
      categoryLabel: null,
      details: `${accountName(transfer.from_account_id)} → ${accountName(transfer.to_account_id)}`,
      amount: BigInt(transfer.amount_uah_kop),
      comment: transfer.comment,
    })),
  ].sort((first, second) => first.date.localeCompare(second.date) || first.key.localeCompare(second.key))

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link to="/transactions/new?plan=1" className={buttonClass}>Запланувати транзакцію</Link>
        <Link to="/transactions/transfer?plan=1" className={buttonClass}>Запланувати переказ</Link>
      </div>
      {operations.length ? (
        <ol aria-label="Заплановані операції" className="grid gap-3">
          {operations.map(({ key, date, title, categoryLabel, details, amount, comment }) => (
            <li key={key} className="grid min-w-0 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)] sm:p-5">
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <h2 className="font-semibold">{title}</h2>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-400">
                  {categoryLabel && <span>{categoryLabel}</span>}
                  <span>{details}</span>
                  <time dateTime={date}>{formatDate(date)}</time>
                  {date <= today && <span className="text-amber-200">Прострочено</span>}
                </div>
                {comment && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{comment}</p>}
              </div>
              <p className="min-w-0 font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-right">{formatKopecks(amount)}</p>
            </li>
          ))}
        </ol>
      ) : <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">Запланованих операцій ще немає.</p>}
    </div>
  )
}
