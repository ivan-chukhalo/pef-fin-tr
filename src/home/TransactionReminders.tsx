import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '../categories/data'
import { formatDate, nextCalendarDate } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { isOverdueOperation } from '../lib/operations'
import { useLoadData } from '../lib/useLoadData'
import { useKyivToday } from '../lib/useKyivToday'
import type { OfflinePageProps } from '../offline/snapshot'
import { loadTransactions } from '../transactions/data'
import { getTransactionLabels } from '../transactions/labels'

const linkClass = 'inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'

export default function TransactionReminders({ client, snapshot, transactionOverlay, categories }: Pick<OfflinePageProps, 'client' | 'snapshot' | 'transactionOverlay'> & {
  categories: ReadonlyMap<string, Category>
}) {
  const today = useKyivToday()
  const tomorrow = nextCalendarDate(today)
  const load = useCallback(
    (signal: AbortSignal) => loadTransactions(client, signal, 'planned', snapshot, transactionOverlay),
    [client, snapshot, transactionOverlay],
  )
  const { data, hasError, retry } = useLoadData(load)

  if (hasError && !data) {
    return (
      <div className="flex flex-wrap items-center gap-x-4">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити нагадування.</p>
        <button type="button" onClick={retry} className={linkClass}>Спробувати ще раз</button>
      </div>
    )
  }
  if (!data) return null

  const groups = [
    { label: 'Сьогодні', rows: data.filter(({ date }) => date === today) },
    { label: 'Завтра', rows: data.filter(({ date }) => date === tomorrow) },
    { label: 'Прострочено', rows: data.filter((transaction) => isOverdueOperation(transaction, today)) },
  ].filter(({ rows }) => rows.length > 0)
  if (!groups.length) return null

  return (
    <section aria-labelledby="home-reminders">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="home-reminders" className="text-lg font-semibold">Нагадування</h2>
        <Link to="/transactions/planned" className={linkClass}>Усі заплановані</Link>
      </header>
      <div className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900">
        {groups.map(({ label, rows }) => (
          <div key={label} className="p-4 sm:px-5">
            <h3 className={`text-sm font-semibold ${label === 'Прострочено' ? 'text-amber-200' : 'text-zinc-300'}`}>{label}</h3>
            <ul aria-label={label} className="mt-2 divide-y divide-zinc-800">
              {rows.sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id)).map((transaction) => {
                const { title, categoryLabel, typeLabel, syncLabel } = getTransactionLabels(transaction, categories.get(transaction.category_id))
                const income = transaction.type === 'income'
                const amount = BigInt(transaction.amount_uah_kop)
                return (
                  <li key={transaction.id} className="grid min-w-0 gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p className="text-sm font-medium">{title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                        {categoryLabel}
                        <span>{typeLabel}</span>
                        <time dateTime={transaction.date}>{formatDate(transaction.date)}</time>
                        {syncLabel}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 sm:justify-end">
                      <span className={`text-sm font-semibold tabular-nums ${income ? 'text-emerald-200' : ''}`}>
                        {formatKopecks(income ? amount : -amount)}
                      </span>
                      {transaction.syncState !== 'conflict' && (
                        <Link to={`/transactions/${transaction.id}/confirm?from=reminders`} className={linkClass}
                          aria-label={`Підтвердити «${title}»`}>Підтвердити</Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
