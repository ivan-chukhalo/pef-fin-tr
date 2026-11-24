import type { OfflinePageProps } from '../offline/snapshot'
import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CategoryLabel from '../categories/CategoryLabel'
import { formatDate, formatMonth, todayInKyiv } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useLoadData } from '../lib/useLoadData'
import { getTransactionLabels } from '../transactions/labels'
import { getComparisonMonths, loadAnalytics } from './data'
import MonthlyComparison from './MonthlyComparison'

export default function AnalyticsPage({ client, snapshot, pendingTransactions }: OfflinePageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const load = useCallback((signal: AbortSignal) => loadAnalytics(client, signal, snapshot, pendingTransactions), [client, snapshot, pendingTransactions])
  const { data, hasError, retry } = useLoadData(load)

  if (!data) {
    return hasError ? (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-sm text-rose-300">Не вдалося завантажити аналітику.</p>
        <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-zinc-700 px-3 text-sm hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          Спробувати ще раз
        </button>
      </div>
    ) : <p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо аналітику…</p>
  }

  const currentMonth = todayInKyiv().slice(0, 7)
  const requestedMonth = searchParams.get('month')
  const month = requestedMonth && data.months.has(requestedMonth) ? requestedMonth : currentMonth
  const availableMonths = [...new Set([currentMonth, ...data.months.keys()])].sort((first, second) => second.localeCompare(first))
  const summary = data.months.get(month)
  const totalExpense = summary?.expense ?? 0n
  const categories = new Map(data.categories.map((category) => [category.id, category]))
  const expenses = [...(summary?.expensesByCategory ?? [])]
    .sort(([, first], [, second]) => first.total === second.total ? 0 : first.total > second.total ? -1 : 1)
  const comparison = getComparisonMonths(month).map((key) => ({
    month: key,
    income: data.months.get(key)?.income ?? 0n,
    expense: data.months.get(key)?.expense ?? 0n,
  }))

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="grid w-full max-w-64 gap-2 text-sm font-medium">
          <label htmlFor="analytics-month">Місяць</label>
          <select
            id="analytics-month"
            value={month}
            onChange={(event) => setSearchParams({ month: event.target.value }, { replace: true })}
            className="min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
          >
            {availableMonths.map((key) => <option key={key} value={key}>{formatMonth(key)}</option>)}
          </select>
        </div>
        <Link to={`/transactions?month=${month}`} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          Транзакції за місяць
        </Link>
      </div>

      <section aria-labelledby="analytics-expenses" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <h2 id="analytics-expenses" className="text-lg font-semibold">Витрати за категоріями</h2>
        <dl className="mt-2">
          <dt className="text-sm text-zinc-400">Усього за місяць</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">{formatKopecks(totalExpense)}</dd>
        </dl>
        {expenses.length ? (
          <ul aria-labelledby="analytics-expenses" className="mt-4 grid gap-3">
            {expenses.map(([categoryId, { total, entries }]) => {
              const category = categories.get(categoryId)
              const name = category?.name ?? 'Категорія'
              return (
                <li key={`${month}-${categoryId}`} className="min-w-0">
                  <details className="group rounded-xl border border-zinc-800 bg-zinc-950/30">
                    <summary className="block list-none cursor-pointer rounded-xl px-3 py-2.5 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-0 items-center justify-between gap-2 text-sm [overflow-wrap:anywhere]">
                        <CategoryLabel name={name} color={category?.color} />
                        <span className="ml-auto text-right font-medium tabular-nums">{formatKopecks(total)}</span>
                        <span aria-hidden="true" className="mx-1 size-2 shrink-0 -rotate-45 border-r border-b border-zinc-400 group-open:rotate-45" />
                      </span>
                      <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <span className="block h-full rounded-full bg-sky-300/80" style={{ width: `${totalExpense > 0n ? Number(total * 10000n / totalExpense) / 100 : 0}%` }} />
                      </span>
                    </summary>
                    <ol aria-label={`Транзакції в категорії «${name}»`} className="divide-y divide-zinc-800 border-t border-zinc-800">
                      {entries.map(({ transaction, amount }) => (
                        <li key={transaction.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2.5 text-sm [overflow-wrap:anywhere]">
                          <span className="min-w-0">
                            <span className="block font-medium">{getTransactionLabels(transaction, category).title}</span>
                            <time dateTime={transaction.date} className="mt-0.5 block text-xs text-zinc-400">{formatDate(transaction.date)}</time>
                          </span>
                          <span className="font-medium tabular-nums">{formatKopecks(amount)}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              )
            })}
          </ul>
        ) : <p className="mt-4 text-sm text-zinc-400">За цей місяць витрат немає.</p>}
      </section>

      <section aria-labelledby="analytics-comparison" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <h2 id="analytics-comparison" className="text-lg font-semibold">Доходи й витрати за місяцями</h2>
        <p className="mt-1 text-sm text-zinc-400 first-letter:uppercase">{formatMonth(comparison[0].month)} – {formatMonth(month)}</p>
        <dl className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm [overflow-wrap:anywhere]">
          <dt className="text-zinc-400">Різниця за обраний місяць</dt>
          <dd className="font-semibold tabular-nums">{formatKopecks((summary?.income ?? 0n) - totalExpense)}</dd>
        </dl>
        {comparison.some(({ income, expense }) => income > 0n || expense > 0n) ? <MonthlyComparison months={comparison} /> : (
          <p className="mt-4 text-sm text-zinc-400">За цей період доходів і витрат немає.</p>
        )}
      </section>
    </div>
  )
}
