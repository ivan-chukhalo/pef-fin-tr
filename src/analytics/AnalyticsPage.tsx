import type { OfflinePageProps } from '../offline/snapshot'
import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CategoryLabel from '../categories/CategoryLabel'
import { formatDate, formatMonth } from '../lib/dates'
import { formatKopecks } from '../lib/money'
import { useKyivToday } from '../lib/useKyivToday'
import { useLoadData } from '../lib/useLoadData'
import AnalyticsPeriodForm from './AnalyticsPeriodForm'
import CategoryExpenseGroups from './CategoryExpenseGroups'
import { getAnalyticsPeriodError, getComparisonMonths, loadAnalytics, summarizeAnalyticsPeriod } from './data'
import MonthlyComparison from './MonthlyComparison'

const periodFieldClass = 'min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30'

export default function AnalyticsPage({ client, snapshot, transactionOverlay }: OfflinePageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const today = useKyivToday()
  const load = useCallback((signal: AbortSignal) => loadAnalytics(client, signal, snapshot, transactionOverlay), [client, snapshot, transactionOverlay])
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

  const currentMonth = today.slice(0, 7)
  const requestedPeriod = searchParams.get('period')
  const mode = requestedPeriod === 'all' || requestedPeriod === 'custom' ? requestedPeriod : 'month'
  const requestedMonth = searchParams.get('month')
  const availableMonths = [...new Set([currentMonth, ...data.months.keys()])].filter((key) => key <= currentMonth)
    .sort((first, second) => second.localeCompare(first))
  const month = requestedMonth && availableMonths.includes(requestedMonth) ? requestedMonth : currentMonth
  const custom = { from: searchParams.get('from') ?? `${month}-01`, to: searchParams.get('to') ?? today }
  const customError = mode === 'custom' ? getAnalyticsPeriodError(custom, today) : ''
  const earliest = data.transactions.reduce((first, transaction) => transaction.date < first ? transaction.date : first, today)
  const period = mode === 'all' ? { from: earliest, to: today } : mode === 'custom' && !customError ? custom : null
  const report = period ? summarizeAnalyticsPeriod(data.transactions, period) : null
  const summary = mode === 'month' ? data.months.get(month) : report?.summary
  const totalExpense = summary?.expense ?? 0n
  const totalIncome = summary?.income ?? 0n
  const categories = new Map(data.categories.map((category) => [category.id, category]))
  const subcategories = new Map(data.subcategories.map((subcategory) => [subcategory.id, subcategory]))
  const expenses = [...(summary?.expensesByCategory ?? [])]
    .sort(([, first], [, second]) => first.total === second.total ? 0 : first.total > second.total ? -1 : 1)
  const comparison = report?.comparison ?? getComparisonMonths(month).map((key) => ({
    month: key,
    income: data.months.get(key)?.income ?? 0n,
    expense: data.months.get(key)?.expense ?? 0n,
  }))
  const periodKey = period ? `${period.from}/${period.to}` : month

  function changePeriod(value: string) {
    const params: Record<string, string> = value === 'custom' ? { period: 'custom', from: `${month}-01`, to: today }
      : value === 'all' ? { period: 'all' } : { month: value }
    setSearchParams(params, { replace: true })
  }

  const reports = (
    <>
      <section aria-labelledby="analytics-expenses" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <h2 id="analytics-expenses" className="text-lg font-semibold">Витрати за категоріями</h2>
        <dl className="mt-2">
          <dt className="text-sm text-zinc-400">{mode === 'month' ? 'Усього за місяць' : 'Усього за період'}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">{formatKopecks(totalExpense)}</dd>
        </dl>
        {expenses.length ? (
          <ul aria-labelledby="analytics-expenses" className="mt-4 grid gap-3">
            {expenses.map(([categoryId, { total, entries }]) => {
              const category = categories.get(categoryId)
              const name = category?.name ?? 'Категорія'
              return (
                <li key={`${periodKey}-${categoryId}`} className="min-w-0">
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
                    <CategoryExpenseGroups category={category} entries={entries} subcategories={subcategories} />
                  </details>
                </li>
              )
            })}
          </ul>
        ) : <p className="mt-4 text-sm text-zinc-400">{mode === 'month' ? 'За цей місяць витрат немає.' : 'За цей період витрат немає.'}</p>}
      </section>

      <section aria-labelledby="analytics-comparison" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <h2 id="analytics-comparison" className="text-lg font-semibold">Доходи й витрати за місяцями</h2>
        {mode === 'month' && comparison[0] && (
          <p className="mt-1 text-sm text-zinc-400 first-letter:uppercase">{formatMonth(comparison[0].month)} – {formatMonth(month)}</p>
        )}
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-zinc-400">{mode === 'month' ? 'Доходи за місяць' : 'Доходи за період'}</dt>
            <dd className="font-semibold tabular-nums">{formatKopecks(totalIncome)}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-zinc-400">{mode === 'month' ? 'Різниця за обраний місяць' : 'Різниця за обраний період'}</dt>
            <dd className="font-semibold tabular-nums">{formatKopecks(totalIncome - totalExpense)}</dd>
          </div>
        </dl>
        {comparison.some(({ income, expense }) => income > 0n || expense > 0n) ? <MonthlyComparison months={comparison} /> : (
          <p className="mt-4 text-sm text-zinc-400">За цей період доходів і витрат немає.</p>
        )}
      </section>
    </>
  )

  return (
    <div className="mt-6 space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="grid w-full max-w-64 gap-2 text-sm font-medium">
            <label htmlFor="analytics-period">Період</label>
            <select id="analytics-period" value={mode === 'month' ? month : mode} className={periodFieldClass}
              onChange={(event) => changePeriod(event.target.value)}>
              <option value="all">Увесь період</option>
              <option value="custom">Власний період</option>
              <optgroup label="Місяці">
                {availableMonths.map((key) => <option key={key} value={key}>{formatMonth(key)}</option>)}
              </optgroup>
            </select>
          </div>
          {mode !== 'custom' && (
            <Link to={`/transactions?month=${mode === 'month' ? month : ''}`} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
              {mode === 'month' ? 'Транзакції за місяць' : 'Усі транзакції'}
            </Link>
          )}
        </div>
        {mode === 'custom' && (
          <AnalyticsPeriodForm key={`${custom.from}/${custom.to}`} period={custom} today={today} fieldClass={periodFieldClass}
            onApply={({ from, to }) => setSearchParams({ period: 'custom', from, to }, { replace: true })} />
        )}
        {period && <p className="text-sm text-zinc-400">{formatDate(period.from)} – {formatDate(period.to)}</p>}
      </div>
      {!customError && reports}
    </div>
  )
}
